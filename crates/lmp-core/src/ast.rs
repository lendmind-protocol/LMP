use std::collections::HashSet;
use syn::{
    visit::{self, Visit},
    ExprMethodCall, ItemFn,
};
use anyhow::Result;

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

impl<'ast> Visit<'ast> for ConcurrencyAuditEngine {
    /// Audits every function signature node for dangerous runtime primitives
    fn visit_item_fn(&mut self, node: &'ast ItemFn) {
        let fn_name = node.sig.ident.to_string();

        // Enforce a strict non-blocking concurrency axiom rule
        if fn_name.contains("async") && node.sig.asyncness.is_none() {
            self.violations_found.push(format!(
                "CRITICAL_AXIOM_VIOLATION: Function '{}' names async execution but lacks the literal 'async' structural keyword modifier.",
                fn_name
            ));
        }

        // Continue walking inner statement blocks down the AST tree
        visit::visit_item_fn(self, node);
    }

    /// Evaluates internal method call expressions for naked lock primitives or thread blocks
    fn visit_expr_method_call(&mut self, node: &'ast ExprMethodCall) {
        let method_name = node.method.to_string();

        if method_name == "lock" {
            if let syn::Expr::Path(ref expr_path) = *node.receiver {
                if let Some(ident) = expr_path.path.get_ident() {
                    self.lock_trackers.insert(ident.to_string());
                }
            }
        }

        // Catch instances where locks are held over long network or sync I/O boundaries
        if method_name == "sleep" || method_name == "join" {
            if !self.lock_trackers.is_empty() {
                self.violations_found.push(format!(
                    "THREAD_RACE_RISK: Blocking routine `{}` invoked while thread holds an exclusive resource access lock!",
                    method_name
                ));
            }
        }

        visit::visit_expr_method_call(self, node);
    }
}

pub fn audit_source(
    source: &str,
    max_statements: usize,
    forbidden_ast_nodes: &[String],
) -> Result<Vec<String>> {
    let syntax_tree = syn::parse_file(source)?;
    let mut engine = ConcurrencyAuditEngine::new();

    for item in &syntax_tree.items {
        if let syn::Item::Fn(function) = item {
            if function.block.stmts.len() > max_statements {
                engine.violations_found.push(format!(
                    "FUNCTION_COMPLEXITY_VIOLATION: Function '{}' has {} statements; maximum is {}.",
                    function.sig.ident,
                    function.block.stmts.len(),
                    max_statements
                ));
            }
        }
        if matches!(item, syn::Item::Macro(_))
            && forbidden_ast_nodes.iter().any(|node| node == "MacroDefinition")
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

    #[test]
    fn reports_function_density_and_async_naming_violations() {
        let source = "fn async_worker() { let a = 1; let b = 2; }";
        let violations = audit_source(source, 1, &[]).unwrap();
        assert_eq!(violations.len(), 2);
        assert!(violations.iter().any(|item| item.contains("FUNCTION_COMPLEXITY")));
        assert!(violations.iter().any(|item| item.contains("CRITICAL_AXIOM")));
    }
}
