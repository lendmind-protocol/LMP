use anyhow::Result;
use std::collections::HashSet;
use syn::{
    visit::{self, Visit},
    BinOp, ExprBinary, ExprForLoop, ExprIf, ExprLoop, ExprMatch, ExprMethodCall, ExprWhile, ItemFn,
    Local,
};

pub struct ConcurrencyAuditEngine {
    pub violations_found: Vec<String>,
    lock_trackers: HashSet<String>,
}

impl ConcurrencyAuditEngine {
    pub fn new() -> Self {
        Self {
            violations_found: Vec::new(),
            lock_trackers: HashSet::new(),
        }
    }
}

impl Default for ConcurrencyAuditEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl<'ast> Visit<'ast> for ConcurrencyAuditEngine {
    /// Audits every function signature node for dangerous runtime primitives
    fn visit_item_fn(&mut self, node: &'ast ItemFn) {
        // Continue walking inner statement blocks down the AST tree
        visit::visit_item_fn(self, node);
    }

    fn visit_local(&mut self, node: &'ast Local) {
        if let (syn::Pat::Ident(binding), Some(init)) = (&node.pat, &node.init) {
            let mut expression = &*init.expr;
            loop {
                match expression {
                    syn::Expr::MethodCall(call) if call.method == "lock" => {
                        self.lock_trackers.insert(binding.ident.to_string());
                        break;
                    }
                    syn::Expr::MethodCall(call) => expression = &call.receiver,
                    _ => break,
                }
            }
        }
        visit::visit_local(self, node);
    }

    /// Evaluates internal method call expressions for naked lock primitives or thread blocks
    fn visit_expr_method_call(&mut self, node: &'ast ExprMethodCall) {
        let method_name = node.method.to_string();

        // A method named `join` is only a lock-related finding when it is
        // invoked on the value returned by a tracked lock acquisition. A
        // thread handle can legitimately be joined while another lock exists
        // elsewhere in the function.
        let joins_tracked_lock = method_name == "join"
            && matches!(&*node.receiver, syn::Expr::Path(path) if path.path.get_ident().is_some_and(|ident| self.lock_trackers.contains(&ident.to_string())));
        if joins_tracked_lock {
            self.violations_found.push(format!(
                "THREAD_RACE_RISK: Blocking routine `{}` invoked on a value holding an exclusive resource access lock!",
                method_name
            ));
        }

        visit::visit_expr_method_call(self, node);
    }
}

struct ComplexityVisitor {
    complexity: usize,
}

impl ComplexityVisitor {
    fn new() -> Self {
        Self { complexity: 1 }
    }

    fn branch(&mut self) {
        self.complexity += 1;
    }
}

impl<'ast> Visit<'ast> for ComplexityVisitor {
    fn visit_expr_if(&mut self, node: &'ast ExprIf) {
        self.branch();
        visit::visit_expr_if(self, node);
    }

    fn visit_expr_match(&mut self, node: &'ast ExprMatch) {
        self.complexity += node.arms.len();
        visit::visit_expr_match(self, node);
    }

    fn visit_expr_for_loop(&mut self, node: &'ast ExprForLoop) {
        self.branch();
        visit::visit_expr_for_loop(self, node);
    }

    fn visit_expr_while(&mut self, node: &'ast ExprWhile) {
        self.branch();
        visit::visit_expr_while(self, node);
    }

    fn visit_expr_loop(&mut self, node: &'ast ExprLoop) {
        self.branch();
        visit::visit_expr_loop(self, node);
    }

    fn visit_expr_binary(&mut self, node: &'ast ExprBinary) {
        if matches!(node.op, BinOp::And(_) | BinOp::Or(_)) {
            self.branch();
        }
        visit::visit_expr_binary(self, node);
    }
}

pub fn audit_source(
    source: &str,
    max_complexity: usize,
    forbidden_ast_nodes: &[String],
) -> Result<Vec<String>> {
    audit_source_impl(source, max_complexity, forbidden_ast_nodes)
}

fn audit_source_impl(
    source: &str,
    max_complexity: usize,
    forbidden_ast_nodes: &[String],
) -> Result<Vec<String>> {
    let syntax_tree = syn::parse_file(source)?;
    let mut engine = ConcurrencyAuditEngine::new();

    for item in &syntax_tree.items {
        if let syn::Item::Fn(function) = item {
            if matches!(function.vis, syn::Visibility::Public(_)) {
                let mut complexity = ComplexityVisitor::new();
                complexity.visit_block(&function.block);
                if complexity.complexity > max_complexity {
                    engine.violations_found.push(format!(
                        "FUNCTION_COMPLEXITY_VIOLATION: Exported function '{}' has cyclomatic complexity {}; maximum is {}.",
                        function.sig.ident, complexity.complexity, max_complexity
                    ));
                }
            }
        }
        if matches!(item, syn::Item::Macro(_))
            && forbidden_ast_nodes
                .iter()
                .any(|node| node == "MacroDefinition")
        {
            engine
                .violations_found
                .push("FORBIDDEN_AST_VIOLATION: Macro definition is not allowed.".to_string());
        }
    }

    engine.visit_file(&syntax_tree);
    Ok(engine.violations_found)
}

#[cfg(test)]
mod tests {
    use super::audit_source;
    use std::panic::{catch_unwind, AssertUnwindSafe};

    #[test]
    fn reports_exported_cyclomatic_complexity() {
        let source =
            "pub fn evaluate(value: bool) { if value { for _ in 0..1 { if value { return; } } } }";
        let violations = audit_source(source, 2, &[]).unwrap();
        assert_eq!(violations.len(), 1);
        assert!(violations[0].contains("FUNCTION_COMPLEXITY"));
        assert!(violations[0].contains("cyclomatic complexity 4"));
    }

    #[test]
    fn malformed_rust_returns_a_structured_error_without_panicking() {
        for source in ["fn broken(", "fn broken() { let = ; }"] {
            let result = catch_unwind(AssertUnwindSafe(|| audit_source(source, 10, &[])));
            assert!(
                result.is_ok(),
                "parser panicked for malformed source: {source}"
            );

            let error = result.unwrap().expect_err("malformed source was accepted");
            assert!(
                error.downcast_ref::<syn::Error>().is_some(),
                "expected a syn::Error, got: {error:#}"
            );
        }
    }

    #[test]
    fn joining_a_thread_is_not_reported_because_an_unrelated_lock_exists() {
        let source = r#"
            fn run(lock: &std::sync::Mutex<()>, worker: std::thread::JoinHandle<()>) {
                let _guard = lock.lock().unwrap();
                worker.join().unwrap();
            }
        "#;
        let violations = audit_source(source, 10, &[]).unwrap();
        assert!(violations
            .iter()
            .all(|violation| !violation.contains("THREAD_RACE_RISK")));
    }

    #[test]
    fn joining_the_tracked_lock_value_remains_a_finding() {
        let source = r#"
            fn run(lock: &std::sync::Mutex<()>) {
                let guard = lock.lock().unwrap();
                guard.join().unwrap();
            }
        "#;
        let violations = audit_source(source, 10, &[]).unwrap();
        assert!(violations
            .iter()
            .any(|violation| violation.contains("THREAD_RACE_RISK")));
    }
}
