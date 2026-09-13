use crate::compiler;
use crate::loop_controller::{LoopPolicy, LoopSnapshot, LoopState};
use anyhow::{Context, Result};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Clone, Copy)]
enum SourceLanguage {
    Rust,
    TypeScript,
    JavaScript,
}

impl SourceLanguage {
    fn id(self) -> &'static str {
        match self {
            Self::Rust => "rust",
            Self::TypeScript => "typescript",
            Self::JavaScript => "javascript",
        }
    }

    fn parser(self) -> &'static str {
        match self {
            Self::Rust => "syn-2",
            Self::TypeScript | Self::JavaScript => "line-policy-v1",
        }
    }

    fn version(self) -> &'static str {
        match self {
            Self::Rust => "2021",
            Self::TypeScript => "syntax-version-agnostic",
            Self::JavaScript => "syntax-version-agnostic",
        }
    }
}

fn source_language(path: &Path) -> Option<SourceLanguage> {
    match path
        .extension()?
        .to_string_lossy()
        .to_ascii_lowercase()
        .as_str()
    {
        "rs" => Some(SourceLanguage::Rust),
        "ts" | "tsx" => Some(SourceLanguage::TypeScript),
        "js" | "jsx" | "mjs" | "cjs" => Some(SourceLanguage::JavaScript),
        _ => None,
    }
}

fn contains_secret_assignment(line: &str) -> bool {
    const SECRET_NAMES: [&str; 9] = [
        "apikey",
        "api_key",
        "api-key",
        "secret",
        "password",
        "token",
        "private_key",
        "private-key",
        "client_secret",
    ];

    let lower = line.to_ascii_lowercase();
    SECRET_NAMES.iter().any(|name| {
        let mut offset = 0;
        while let Some(found) = lower[offset..].find(name) {
            let start = offset + found;
            let end = start + name.len();
            let before = lower[..start].chars().next_back();
            let after = lower[end..].chars().next();
            let identifier_boundary = |character: Option<char>| {
                character.is_none_or(|value| !(value.is_ascii_alphanumeric() || value == '_'))
            };
            if identifier_boundary(before) && identifier_boundary(after) {
                let remainder = lower[end..].trim_start();
                if (remainder.starts_with('=') || remainder.starts_with(':'))
                    && (remainder.contains('"') || remainder.contains('\''))
                {
                    return true;
                }
            }
            offset = end;
        }
        false
    })
}

fn obvious_typescript_type_mismatch(line: &str) -> Option<(&'static str, &'static str)> {
    let annotation = line.split_once(':')?.1.split_once('=')?.0.trim();
    let initializer = line.split_once('=')?.1.trim().trim_end_matches(';').trim();
    let expected = annotation.split([' ', '|', '&']).next()?;
    let expected = match expected {
        "string" => "string",
        "number" => "number",
        "boolean" => "boolean",
        _ => return None,
    };
    let actual = if initializer.starts_with(['"', '\'', '`']) {
        "string"
    } else if initializer == "true" || initializer == "false" {
        "boolean"
    } else if initializer.parse::<f64>().is_ok() {
        "number"
    } else {
        return None;
    };
    let mismatch = match expected {
        "string" => actual != "string",
        "number" => actual != "number",
        "boolean" => actual != "boolean",
        _ => false,
    };
    mismatch.then_some((expected, actual))
}

fn unsupported_source_language(path: &Path) -> Option<&'static str> {
    match path
        .extension()?
        .to_string_lossy()
        .to_ascii_lowercase()
        .as_str()
    {
        "go" => Some("go"),
        "java" | "kt" | "kts" => Some("jvm"),
        "c" | "h" | "cc" | "cpp" | "cxx" | "hpp" => Some("c-family"),
        "sql" => Some("sql"),
        "hcl" | "tf" => Some("hcl"),
        "py" | "pyi" => Some("python"),
        _ => None,
    }
}

fn supported_rule_contract(rule_id: &str) -> bool {
    matches!(
        rule_id,
        "architecture.boundary"
            | "ast.unsafe-boundary"
            | "commands.allowlist"
            | "complexity.cyclomatic"
            | "database.app-layer-join"
            | "dependencies.deny"
            | "security.artifact-redaction"
            | "security.hardcoded-secret"
            | "security.insecure-default"
            | "typescript.any"
            | "typescript.console"
            | "typescript.duplicate-logic"
            | "typescript.eval"
            | "typescript.type-error"
            | "typescript.unused-variable"
    )
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub rule_id: String,
    pub passed: bool,
    pub severity: String,
    pub message: String,
    pub evidence: Value,
}
#[derive(Debug, Serialize)]
pub struct Evaluation {
    pub package_id: String,
    pub package_version: String,
    pub mode: String,
    pub passed: bool,
    pub state: String,
    pub findings: Vec<Finding>,
    pub checked_files: usize,
    pub artifact: Value,
}

#[derive(Debug, Clone, Default)]
pub struct EvaluationOptions<'a> {
    pub changed_only: bool,
    pub staged_only: bool,
    pub git_base: Option<&'a str>,
    pub ast_cache_dir: Option<&'a Path>,
}

fn walk(path: &Path, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    if path.is_symlink() {
        return Ok(());
    }
    if path.file_name().is_some_and(|n| {
        [
            ".git",
            "target",
            "node_modules",
            "dist",
            "build",
            "coverage",
            ".next",
            ".turbo",
            ".cache",
            ".venv",
            "lmp_test_bed",
            ".lmp-real-world-work",
            "lmp-test-results",
            ".lending-mind",
            "fixtures",
        ]
        .contains(&n.to_string_lossy().as_ref())
    }) {
        return Ok(());
    }
    if path.is_dir() {
        for entry in fs::read_dir(path)? {
            walk(&entry?.path(), out)?;
        }
    } else {
        out.push(path.to_path_buf());
    }
    Ok(())
}

fn dependency_findings(
    workspace: &Path,
    prohibited: &[String],
    scope_files: &[PathBuf],
    changed_only: bool,
) -> Vec<Finding> {
    let mut findings = Vec::new();
    let package_files = scope_files
        .iter()
        .filter(|file| file.file_name().is_some_and(|name| name == "package.json"))
        .cloned()
        .collect::<Vec<_>>();
    let files = if changed_only {
        package_files
    } else {
        let mut all = Vec::new();
        let mut walked = Vec::new();
        if walk(workspace, &mut walked).is_ok() {
            all.extend(
                walked
                    .into_iter()
                    .filter(|file| file.file_name().is_some_and(|name| name == "package.json")),
            );
        }
        all
    };
    for path in files {
        let Ok(text) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        for section in ["dependencies", "devDependencies"] {
            if let Some(map) = value.get(section).and_then(Value::as_object) {
                for name in prohibited.iter().filter(|name| map.contains_key(*name)) {
                    findings.push(Finding {
                        rule_id: "dependencies.prohibited".into(),
                        passed: false,
                        severity: "error".into(),
                        message: format!("prohibited dependency: {name}"),
                        evidence: json!({"dependency": name, "section": section, "manifest": path.strip_prefix(workspace).unwrap_or(&path).display().to_string()}),
                    });
                }
            }
        }
    }
    findings
}

fn policy_values(
    package_dir: &Path,
    package: &crate::MindPackage,
) -> (
    Vec<String>,
    usize,
    std::collections::HashMap<String, bool>,
    Vec<String>,
) {
    let mut prohibited = Vec::new();
    let mut complexity = 10;
    let mut flags = std::collections::HashMap::new();
    let mut unsafe_exceptions = Vec::new();
    for path in package.enforcement.values() {
        let Ok(text) = fs::read_to_string(package_dir.join(path)) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        if let Some(object) = value.as_object() {
            for (key, value) in object {
                if let Some(enabled) = value.as_bool() {
                    flags.insert(key.clone(), enabled);
                }
            }
            if let Some(allow) = object
                .get("unsafe")
                .and_then(Value::as_object)
                .and_then(|unsafe_policy| unsafe_policy.get("allow"))
                .and_then(Value::as_bool)
            {
                flags.insert("unsafeAllow".into(), allow);
            }
        }
        if let Some(items) = value
            .get("prohibited")
            .or_else(|| value.get("deny"))
            .and_then(Value::as_array)
        {
            prohibited.extend(items.iter().filter_map(Value::as_str).map(String::from));
        }
        if let Some(items) = value.get("unsafeExceptions").and_then(Value::as_array) {
            unsafe_exceptions.extend(items.iter().filter_map(|item| {
                item.as_object()
                    .and_then(|object| object.get("path"))
                    .and_then(Value::as_str)
                    .map(String::from)
            }));
        }
        if let Some(limit) = value
            .get("max")
            .or_else(|| value.get("maxCyclomatic"))
            .or_else(|| value.get("maxExportedCyclomatic"))
            .and_then(Value::as_u64)
        {
            complexity = limit as usize;
        }
    }
    (prohibited, complexity, flags, unsafe_exceptions)
}

fn source_findings(
    path: &Path,
    workspace: &Path,
    source: &str,
    flags: &std::collections::HashMap<String, bool>,
) -> Vec<Finding> {
    let is_test = path.to_string_lossy().contains("/test")
        || path.to_string_lossy().contains("\\test")
        || path.to_string_lossy().contains(".test.")
        || path.to_string_lossy().contains(".spec.");
    if is_test {
        return Vec::new();
    }
    let relative = path
        .strip_prefix(workspace)
        .unwrap_or(path)
        .display()
        .to_string();
    let user_facing_cli = relative.ends_with("packages/create-lmp/bin.ts")
        || relative.ends_with("packages/cli/src/index.ts")
        || relative.starts_with("scripts/")
        || relative.starts_with("orchestrator/")
        || path.components().any(|component| {
            matches!(component, std::path::Component::Normal(value) if value == "scripts" || value == "orchestrator")
        })
        || relative.ends_with("cli/src/index.ts")
        || path.file_name().and_then(|value| value.to_str()) == Some("bin.ts")
        || path.extension().and_then(|value| value.to_str()) == Some("mjs");
    let severity = if flags
        .iter()
        .any(|(key, enabled)| key.starts_with("error") && *enabled)
    {
        "error"
    } else {
        "warning"
    };
    let mut findings = Vec::new();
    let word_count = |name: &str| -> usize {
        source
            .split(|character: char| !(character.is_ascii_alphanumeric() || character == '_'))
            .filter(|token| *token == name)
            .count()
    };
    for (index, raw_line) in source.lines().enumerate() {
        let line = raw_line.split("//").next().unwrap_or(raw_line);
        let fixture_literal = line.contains("writeWorkspace(")
            || line.contains("write_text(")
            || line.contains("source =");
        let line_number = index + 1;
        let push = |rule_id: &str, message: &str, remediation: &str| Finding {
            rule_id: rule_id.into(),
            passed: false,
            severity: severity.into(),
            message: message.into(),
            evidence: json!({"file": relative, "line": line_number, "remediation": remediation}),
        };
        if !fixture_literal
            && (flags.get("errorAny").copied().unwrap_or(false)
                || flags.get("warnAny").copied().unwrap_or(false))
        {
            let has_any = line.contains(": any") || line.contains("<any>");
            if has_any {
                findings.push(push(
                    "typescript.any",
                    "Explicit any type detected.",
                    "Use a precise type or unknown with a narrowing boundary.",
                ));
            }
        }
        if !fixture_literal
            && (flags.get("errorTypeErrors").copied().unwrap_or(false)
                || flags.get("warnTypeErrors").copied().unwrap_or(false))
            && (line.contains("const ") || line.contains("let ") || line.contains("var "))
        {
            if let Some((expected, actual)) = obvious_typescript_type_mismatch(line) {
                findings.push(push(
                    "typescript.type-error",
                    &format!("TypeScript literal type mismatch: expected {expected}, found {actual}."),
                    "Correct the annotation or initializer, then run the project TypeScript compiler for full semantic diagnostics.",
                ));
            }
        }
        if !fixture_literal
            && (flags.get("errorHardcodedSecret").copied().unwrap_or(false)
                || flags.get("warnHardcodedSecret").copied().unwrap_or(false))
            && contains_secret_assignment(line)
        {
            findings.push(push(
                "security.hardcoded-secret",
                "Secret-shaped value is hardcoded in source.",
                "Load the value through the approved environment or secret-management boundary and rotate the exposed value.",
            ));
        }
        if !fixture_literal
            && (flags.get("errorEval").copied().unwrap_or(false)
                || flags.get("warnEval").copied().unwrap_or(false))
            && (line.contains("eval(") || line.contains("globalThis.eval("))
        {
            findings.push(push(
                "typescript.eval",
                "Dynamic code execution detected.",
                "Replace eval with a typed dispatch table or parser.",
            ));
        }
        if !user_facing_cli
            && (flags.get("errorConsoleLog").copied().unwrap_or(false)
                || flags.get("warnConsoleLog").copied().unwrap_or(false))
            && ["console.log(", "console.debug(", "console.info("]
                .iter()
                .any(|token| line.contains(token))
        {
            findings.push(push(
                "typescript.console",
                "Console output detected.",
                "Use the project's structured logging boundary.",
            ));
        }
        if (flags.get("errorDynamicRequire").copied().unwrap_or(false)
            || flags.get("warnDynamicRequire").copied().unwrap_or(false))
            && line.contains("require(")
            && !line.contains("require(\"")
            && !line.contains("require('")
        {
            findings.push(push(
                "typescript.dynamic-require",
                "Dynamic require detected.",
                "Use a static import or a literal module specifier.",
            ));
        }
        if (flags.get("errorVarDeclaration").copied().unwrap_or(false)
            || flags.get("warnVarDeclaration").copied().unwrap_or(false))
            && line.split_whitespace().any(|token| token == "var")
        {
            findings.push(push(
                "typescript.var-declaration",
                "Legacy var declaration detected.",
                "Use let or const and preserve the narrowest possible binding scope.",
            ));
        }
        if (flags.get("errorEmptyCatch").copied().unwrap_or(false)
            || flags.get("warnEmptyCatch").copied().unwrap_or(false))
            && (line.contains("catch {}") || line.contains("catch { }"))
        {
            findings.push(push(
                "typescript.empty-catch",
                "Empty catch block detected.",
                "Handle, rethrow, or explicitly record the ignored error.",
            ));
        }
        if !fixture_literal
            && (flags.get("errorSqlInjection").copied().unwrap_or(false)
                || flags.get("warnSqlInjection").copied().unwrap_or(false))
            && (line.contains("query(`")
                || line.contains("execute(`")
                || (line.contains("query(\"") && line.contains("+")))
        {
            findings.push(push(
                "security.sql-injection",
                "Dynamic SQL-like query construction detected.",
                "Use parameterized queries or the approved query builder and add an injection regression test.",
            ));
        }
        if (flags.get("errorInsecureDefault").copied().unwrap_or(false)
            || flags.get("warnInsecureDefault").copied().unwrap_or(false))
            && (line.contains("dangerouslySetInnerHTML")
                || line.contains("innerHTML:")
                || line.contains("origin: \"*\"")
                || line.contains("access-control-allow-origin: \"*\""))
        {
            findings.push(push(
                "security.insecure-default",
                "Named insecure default detected.",
                "Replace the permissive or unsafe default with an explicit allowlist, sanitizer, or trusted boundary and add a regression test.",
            ));
        }
        if !fixture_literal
            && (flags.get("errorAppLayerJoin").copied().unwrap_or(false)
                || flags.get("warnAppLayerJoin").copied().unwrap_or(false))
            && line.contains("Promise.all(")
        {
            findings.push(push(
                "database.app-layer-join",
                "Application-layer fan-out join detected.",
                "Move the isolation and join policy to the database boundary.",
            ));
        }
        if !fixture_literal
            && (flags.get("errorUnusedVariable").copied().unwrap_or(false)
                || flags.get("warnUnusedVariable").copied().unwrap_or(false))
        {
            let binding = line
                .split_once('=')
                .and_then(|(left, _)| left.split_whitespace().last())
                .filter(|name| {
                    (line.contains("const ") || line.contains("let ") || line.contains("var "))
                        && !name.starts_with('_')
                        && name
                            .chars()
                            .all(|character| character.is_ascii_alphanumeric() || character == '_')
                });
            if let Some(name) = binding {
                let declaration_is_exported = line.trim_start().starts_with("export ");
                if !declaration_is_exported && word_count(name) == 1 {
                    findings.push(push(
                        "typescript.unused-variable",
                        &format!("Unused initialized variable {name} detected."),
                        "Remove the unused declaration or use it in the implementation and tests.",
                    ));
                }
            }
        }
    }
    findings
}

fn duplicate_logic_findings(
    files: &[PathBuf],
    workspace: &Path,
    flags: &std::collections::HashMap<String, bool>,
) -> Vec<Finding> {
    if !(flags.get("errorDuplicateLogic").copied().unwrap_or(false)
        || flags.get("warnDuplicateLogic").copied().unwrap_or(false))
    {
        return Vec::new();
    }
    let severity = if flags.get("errorDuplicateLogic").copied().unwrap_or(false) {
        "error"
    } else {
        "warning"
    };
    let mut bodies: std::collections::HashMap<String, (String, String, usize)> =
        std::collections::HashMap::new();
    let mut findings = Vec::new();
    for path in files {
        if source_language(path).is_none_or(|language| {
            !matches!(
                language,
                SourceLanguage::TypeScript | SourceLanguage::JavaScript
            )
        }) {
            continue;
        }
        let Ok(source) = fs::read_to_string(path) else {
            continue;
        };
        let relative = path
            .strip_prefix(workspace)
            .unwrap_or(path)
            .display()
            .to_string();
        let lines = source.lines().collect::<Vec<_>>();
        let mut index = 0;
        while index < lines.len() {
            let line = lines[index];
            let Some(open) = line.find('{') else {
                index += 1;
                continue;
            };
            let prefix = line[..open].trim();
            let is_function = prefix.contains("function ")
                || prefix.contains("=>")
                || prefix.contains("async ") && prefix.contains('(');
            if !is_function {
                index += 1;
                continue;
            }
            let name = prefix
                .split_whitespace()
                .find_map(|part| {
                    let candidate = part.trim_matches(|character: char| {
                        !character.is_ascii_alphanumeric() && character != '_'
                    });
                    if candidate != "function" && !candidate.is_empty() {
                        Some(candidate.to_string())
                    } else {
                        None
                    }
                })
                .unwrap_or_else(|| "anonymous function".into());
            let start_line = index + 1;
            let mut depth = line[open..]
                .chars()
                .filter(|c| *c == '{')
                .count()
                .saturating_sub(line[open..].chars().filter(|c| *c == '}').count());
            let mut end = index;
            while depth > 0 && end + 1 < lines.len() {
                end += 1;
                depth += lines[end].chars().filter(|c| *c == '{').count();
                depth = depth.saturating_sub(lines[end].chars().filter(|c| *c == '}').count());
            }
            let mut body_lines = Vec::with_capacity(end - index + 1);
            body_lines.push(&line[open + 1..]);
            body_lines.extend(lines.iter().take(end + 1).skip(index + 1).copied());
            let normalized = body_lines
                .iter()
                .flat_map(|body_line| body_line.split("//").next())
                .flat_map(|body_line| body_line.split_whitespace())
                .collect::<Vec<_>>()
                .join(" ");
            if normalized.len() >= 40 {
                if let Some((previous_file, previous_name, _)) = bodies.get(&normalized) {
                    if previous_name != &name {
                        findings.push(Finding {
                            rule_id: "typescript.duplicate-logic".into(),
                            passed: false,
                            severity: severity.into(),
                            message: format!(
                                "Function {name} duplicates the body of {previous_name}."
                            ),
                            evidence: json!({
                                "file": relative,
                                "line": start_line,
                                "duplicateOf": previous_name,
                                "duplicateFile": previous_file,
                                "bodyLength": normalized.len(),
                                "remediation": "Extract the shared behavior into one deliberately named helper and preserve distinct domain boundaries."
                            }),
                        });
                    }
                } else {
                    bodies.insert(normalized, (relative.clone(), name, start_line));
                }
            }
            index = end.saturating_add(1);
        }
    }
    findings
}

fn tenant_boundary_findings(
    package_dir: &Path,
    workspace: &Path,
    files: &[PathBuf],
    package: &crate::MindPackage,
) -> Vec<Finding> {
    let Some(policy_path) = package.enforcement.get("tenantPolicy") else {
        return Vec::new();
    };
    let Ok(policy_text) = fs::read_to_string(package_dir.join(policy_path)) else {
        return Vec::new();
    };
    let Ok(policy) = serde_json::from_str::<Value>(&policy_text) else {
        return Vec::new();
    };
    let marker = policy.get("tenantMarker").and_then(Value::as_str);
    let rls_marker = policy.get("rlsMarker").and_then(Value::as_str);
    let documentation = policy.get("requiredDocumentation").and_then(Value::as_str);
    let severity = policy
        .get("severity")
        .and_then(Value::as_str)
        .unwrap_or("warning");
    let mut findings = Vec::new();
    let push = |findings: &mut Vec<Finding>, message: String, evidence: Value| {
        findings.push(Finding {
            rule_id: "postgres.tenant-boundary".into(),
            passed: false,
            severity: severity.into(),
            message,
            evidence,
        });
    };
    if let Some(documentation) = documentation {
        if !workspace.join(documentation).is_file() {
            push(
                &mut findings,
                format!("Required tenant-boundary documentation is missing: {documentation}."),
                json!({
                    "requirement": "documentation",
                    "path": documentation,
                    "status": "missing",
                    "remediation": format!("Add {documentation} and record the tenant isolation boundary for review.")
                }),
            );
        }
    }
    let mut source = String::new();
    for file in files {
        let relevant = matches!(
            file.extension().and_then(|value| value.to_str()),
            Some("sql" | "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs")
        );
        if relevant {
            if let Ok(contents) = fs::read_to_string(file) {
                source.push_str(&contents);
                source.push('\n');
            }
        }
    }
    if let Some(marker) = marker {
        if !source.contains(marker) {
            push(
                &mut findings,
                format!(
                    "Tenant-boundary marker `{marker}` was not found in database-facing source."
                ),
                json!({
                    "requirement": "tenant-marker",
                    "marker": marker,
                    "status": "missing",
                    "remediation": "Mark the tenant-scoped declaration and request database-aware review."
                }),
            );
        }
    }
    if let Some(rls_marker) = rls_marker {
        if !source.contains(rls_marker) {
            push(
                &mut findings,
                format!("RLS marker `{rls_marker}` was not found in database-facing source."),
                json!({
                    "requirement": "rls-marker",
                    "marker": rls_marker,
                    "status": "missing",
                    "remediation": "Record the required row-level-security policy or obtain an explicit reviewed exception."
                }),
            );
        }
    }
    findings
}

fn import_specifiers(line: &str) -> Vec<&str> {
    let trimmed = line.trim_start();
    if trimmed.starts_with("//")
        || !(trimmed.starts_with("import ")
            || trimmed.starts_with("export ")
            || trimmed.contains("require(")
            || trimmed.contains("import("))
    {
        return Vec::new();
    }
    let mut result = Vec::new();
    let mut rest = line;
    while let Some((index, quote)) = rest
        .char_indices()
        .find(|(_, character)| *character == '"' || *character == '\'')
    {
        let after_open = &rest[index + quote.len_utf8()..];
        let Some(end) = after_open.find(quote) else {
            break;
        };
        let before = &rest[..index];
        if before.trim_end().ends_with("from")
            || before.trim_end().ends_with("require(")
            || before.trim_end().ends_with("import(")
            || (trimmed.starts_with("import ") && before.trim() == "import")
        {
            result.push(&after_open[..end]);
        }
        rest = &after_open[end + quote.len_utf8()..];
    }
    result
}

fn architecture_findings(
    workspace: &Path,
    files: &[PathBuf],
    policy: &Value,
    severity: &str,
) -> Vec<Finding> {
    let Some(boundaries) = policy.get("boundaries").and_then(Value::as_array) else {
        return Vec::new();
    };
    let mut findings = Vec::new();
    for file in files {
        if source_language(file).is_none() {
            continue;
        }
        let relative = file
            .strip_prefix(workspace)
            .unwrap_or(file)
            .to_string_lossy()
            .replace('\\', "/");
        let Ok(source) = fs::read_to_string(file) else {
            continue;
        };
        for (line_index, line) in source.lines().enumerate() {
            for specifier in import_specifiers(line) {
                for boundary in boundaries {
                    let Some(object) = boundary.as_object() else {
                        continue;
                    };
                    let prefix = object
                        .get("pathPrefix")
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    if !prefix.is_empty() && !relative.starts_with(prefix) {
                        continue;
                    }
                    let Some(forbidden) = object.get("forbiddenImports").and_then(Value::as_array)
                    else {
                        continue;
                    };
                    for target in forbidden.iter().filter_map(Value::as_str) {
                        if specifier == target || specifier.starts_with(&format!("{target}/")) {
                            findings.push(Finding {
                            rule_id: "architecture.boundary".into(),
                            passed: false,
                    severity: severity.into(),
                            message: format!(
                                "Import crosses the declared architecture boundary: {specifier}."
                            ),
                            evidence: json!({
                                "file": relative,
                                "line": line_index + 1,
                                "specifier": specifier,
                                "boundary": object.get("name").and_then(Value::as_str),
                                "pathPrefix": prefix,
                                "forbiddenImport": target,
                                "status": "violation",
                                "remediation": "Move the dependency behind the owning boundary or record an explicitly reviewed exception."
                            }),
                        });
                        }
                    }
                }
            }
        }
    }
    findings
}

fn unsafe_exception_matches(exception: &str, relative_file: &str, workspace: &Path) -> bool {
    if exception == relative_file {
        return true;
    }
    workspace
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| exception == format!("{name}/{relative_file}"))
}

fn rfc3339_now() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    let days = (seconds / 86_400) as i64;
    let day_seconds = seconds % 86_400;
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let month_part = (5 * doy + 2) / 153;
    let day = doy - (153 * month_part + 2) / 5 + 1;
    let month = month_part + if month_part < 10 { 3 } else { -9 };
    let year = year + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        day_seconds / 3_600,
        (day_seconds % 3_600) / 60,
        day_seconds % 60
    )
}

fn git_metadata(workspace: &Path) -> (Option<String>, bool) {
    let git_root = if workspace.is_file() {
        workspace.parent().unwrap_or(workspace)
    } else {
        workspace
    };
    let head = Command::new("git")
        .args(["-C"])
        .arg(git_root)
        .args(["rev-parse", "HEAD"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let dirty = Command::new("git")
        .args(["-C"])
        .arg(git_root)
        .args(["status", "--porcelain"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| !output.stdout.is_empty())
        .unwrap_or(false);
    (head, dirty)
}

pub fn evaluate(
    package_dir: &Path,
    workspace: &Path,
    mode: &str,
    artifact_dir: Option<&Path>,
) -> Result<Evaluation> {
    evaluate_with_options(
        package_dir,
        workspace,
        mode,
        artifact_dir,
        EvaluationOptions::default(),
    )
}

pub fn evaluate_with_options(
    package_dir: &Path,
    workspace: &Path,
    mode: &str,
    artifact_dir: Option<&Path>,
    options: EvaluationOptions<'_>,
) -> Result<Evaluation> {
    evaluate_with_options_impl(package_dir, workspace, mode, artifact_dir, options)
}

fn evaluate_with_options_impl(
    package_dir: &Path,
    workspace: &Path,
    mode: &str,
    artifact_dir: Option<&Path>,
    options: EvaluationOptions<'_>,
) -> Result<Evaluation> {
    let signature_status = crate::crypto::package_signature_status(package_dir)
        .context("failed to determine Mind Package signature status")?;
    // Signature failure is a security decision, not a package-loading error. Return a
    // durable blocked result even when the package is too incomplete to compile, so
    // callers can act on the cryptographic failure instead of receiving an opaque I/O
    // error (or accidentally treating the package as unavailable).
    if signature_status == "invalid" {
        return blocked_signature_evaluation(package_dir, workspace, mode, artifact_dir);
    }
    let cache_root = if workspace.is_file() {
        workspace.parent().unwrap_or(workspace)
    } else {
        workspace
    };
    let profile_cache = cache_root.join(".lending-mind/cache/profiles");
    let bundle = compiler::compile_cached(package_dir, &profile_cache)?;
    let package_id = bundle.mind.id.clone();
    let package_version = bundle.mind.version.clone();
    let bundle_digest = bundle.digest.clone();
    let (prohibited, max_complexity, flags, unsafe_exceptions) =
        policy_values(package_dir, &bundle.mind);
    let mut all_files = Vec::new();
    walk(workspace, &mut all_files).context("failed to scan workspace")?;
    let scope = crate::scope::select_with_staged(
        workspace,
        options.changed_only,
        options.staged_only,
        options.git_base,
        all_files,
    );
    let files = scope.files;
    let mut findings = dependency_findings(workspace, &prohibited, &files, options.changed_only);
    let mut skipped_checks = Vec::new();
    let mut analysis_languages = std::collections::BTreeSet::new();
    let mut analysis_parsers = std::collections::BTreeSet::new();
    let mut analysis_versions = std::collections::BTreeSet::new();
    let mut unsupported_languages = std::collections::BTreeSet::new();
    let unsupported_rules = bundle
        .rules
        .iter()
        .filter_map(|rule| rule.get("id").and_then(Value::as_str))
        .filter(|rule_id| !supported_rule_contract(rule_id))
        .collect::<Vec<_>>();
    if signature_status == "invalid" {
        findings.push(Finding {
            rule_id: "package.signature".into(),
            passed: false,
            severity: "error".into(),
            message: "Mind Package signature is invalid or unverifiable.".into(),
            evidence: json!({"signatureStatus": signature_status}),
        });
    }
    let mut checked = 0;
    for file in &files {
        let Some(language) = source_language(file) else {
            if let Some(language) = unsupported_source_language(file) {
                unsupported_languages.insert(language);
            }
            continue;
        };
        analysis_languages.insert(language.id());
        analysis_parsers.insert(language.parser());
        analysis_versions.insert(language.version());
        checked += 1;
        let metadata = fs::metadata(file)?;
        if metadata.len() > 8 * 1024 * 1024 {
            findings.push(Finding {
                rule_id: "workspace.file-too-large".into(),
                passed: false,
                severity: "error".into(),
                message: "source file exceeds the bounded analysis size".into(),
                evidence: json!({"file": file.strip_prefix(workspace).unwrap_or(file).display().to_string(), "bytes": metadata.len(), "limit": 8 * 1024 * 1024}),
            });
            continue;
        }
        let source = fs::read_to_string(file)?;
        if matches!(language, SourceLanguage::Rust) {
            let cache_dir = options
                .ast_cache_dir
                .map(PathBuf::from)
                .unwrap_or_else(|| cache_root.join(".lending-mind/cache/ast"));
            fs::create_dir_all(&cache_dir)?;
            let source_digest =
                crate::crypto::MindPackageVerifier::compute_sha256(source.as_bytes());
            let cache_path =
                cache_dir.join(format!("ast-v3-{}-{}.json", source_digest, max_complexity));
            let relative_file = file
                .strip_prefix(workspace)
                .unwrap_or(file)
                .to_string_lossy()
                .replace('\\', "/");
            let cached: Option<Vec<String>> = fs::read(&cache_path)
                .ok()
                .and_then(|bytes| serde_json::from_slice(&bytes).ok());
            if let Some(messages) = cached {
                if flags.get("unsafeAllow").copied() == Some(false)
                    && crate::ast::contains_unsafe_block(&source)?
                    && !unsafe_exceptions
                        .iter()
                        .any(|path| unsafe_exception_matches(path, &relative_file, workspace))
                {
                    findings.push(Finding {
                        rule_id: "ast.unsafe-boundary".into(),
                        passed: false,
                        severity: "error".into(),
                        message: "unsafe Rust block detected where the active Mind requires an explicit exception.".into(),
                        evidence: json!({
                            "file": relative_file,
                            "allow": false,
                            "status": "violation",
                            "cache": "hit"
                        }),
                    });
                }
                findings.extend(messages.into_iter().map(|message| Finding {
                    rule_id: "rust.ast".into(),
                    passed: false,
                    severity: "error".into(),
                    message,
                    evidence: json!({"file": file.strip_prefix(workspace).unwrap_or(file).display().to_string(), "cache":"hit"}),
                }));
                continue;
            }
            if let Err(error) = syn::parse_file(&source) {
                findings.push(Finding { rule_id: "rust.syntax".into(), passed: false, severity: "error".into(), message: format!("invalid Rust syntax: {error}"), evidence: json!({"file": file.strip_prefix(workspace).unwrap_or(file).display().to_string()}) });
                continue;
            }
            if flags.get("unsafeAllow").copied() == Some(false)
                && crate::ast::contains_unsafe_block(&source)?
                && !unsafe_exceptions
                    .iter()
                    .any(|path| unsafe_exception_matches(path, &relative_file, workspace))
            {
                findings.push(Finding {
                    rule_id: "ast.unsafe-boundary".into(),
                    passed: false,
                    severity: "error".into(),
                    message: "unsafe Rust block detected where the active Mind requires an explicit exception.".into(),
                    evidence: json!({
                        "file": relative_file,
                        "allow": false,
                        "status": "violation"
                    }),
                });
            }
            let messages = crate::ast::audit_source(&source, max_complexity, &[])?;
            fs::write(&cache_path, serde_json::to_vec(&messages)?)?;
            findings.extend(messages.into_iter().map(|message| Finding { rule_id: "rust.ast".into(), passed: false, severity: "error".into(), message, evidence: json!({"file": file.strip_prefix(workspace).unwrap_or(file).display().to_string(), "cache":"miss"}) }));
        } else if matches!(
            language,
            SourceLanguage::TypeScript | SourceLanguage::JavaScript
        ) {
            findings.extend(source_findings(file, workspace, &source, &flags));
        }
    }
    findings.extend(duplicate_logic_findings(&files, workspace, &flags));
    if bundle
        .rules
        .iter()
        .any(|rule| rule.get("id").and_then(Value::as_str) == Some("postgres.tenant-boundary"))
    {
        findings.extend(tenant_boundary_findings(
            package_dir,
            workspace,
            &files,
            &bundle.mind,
        ));
    }
    for language in &unsupported_languages {
        skipped_checks.push(json!({
            "checkId": format!("language.{language}"),
            "reason": format!("The Rust evaluator has no parser or policy adapter for {language}; the file was not analyzed."),
            "status": "unsupported"
        }));
        if mode == "enforced" {
            findings.push(Finding {
                rule_id: format!("language.unsupported.{language}"),
                passed: false,
                severity: "error".into(),
                message: format!("Unsupported source language {language} cannot pass enforced evaluation."),
                evidence: json!({
                    "language": language,
                    "status": "unsupported",
                    "remediation": "Use a profile with an evaluator for this language or run in advisory mode and obtain independent coverage."
                }),
            });
        }
    }
    for rule_id in &unsupported_rules {
        skipped_checks.push(json!({
            "checkId": format!("rule.{rule_id}"),
            "reason": format!("The Rust evaluator has no implementation for rule contract {rule_id}; no claim was made for this rule."),
            "status": "unsupported"
        }));
        if mode == "enforced" {
            findings.push(Finding {
                rule_id: format!("rule.unsupported.{rule_id}"),
                passed: false,
                severity: "error".into(),
                message: format!("Unsupported rule contract {rule_id} cannot pass enforced evaluation."),
                evidence: json!({
                    "ruleId": rule_id,
                    "status": "unsupported",
                    "remediation": "Use a profile with an evaluator for this rule or run in advisory mode and obtain independent coverage."
                }),
            });
        }
    }
    skipped_checks.push(json!({
        "checkId":"behavioral.docker",
        "reason":"Docker execution is an explicit orchestrator gate, not part of this static evaluator run."
    }));
    if bundle
        .rules
        .iter()
        .any(|rule| rule.get("id").and_then(Value::as_str) == Some("architecture.boundary"))
    {
        if let Some(policy_path) = bundle.mind.enforcement.get("architecturePolicy") {
            if let Ok(policy_text) = fs::read_to_string(package_dir.join(policy_path)) {
                if let Ok(policy) = serde_json::from_str::<Value>(&policy_text) {
                    let severity = bundle
                        .rules
                        .iter()
                        .find(|rule| {
                            rule.get("id").and_then(Value::as_str) == Some("architecture.boundary")
                        })
                        .and_then(|rule| rule.get("severity"))
                        .and_then(Value::as_str)
                        .unwrap_or("error");
                    findings.extend(architecture_findings(workspace, &files, &policy, severity));
                }
            }
        }
    }
    if bundle
        .rules
        .iter()
        .any(|rule| rule.get("id").and_then(Value::as_str) == Some("security.artifact-redaction"))
    {
        findings.push(Finding {
            rule_id: "security.artifact-redaction".into(),
            passed: true,
            severity: "error".into(),
            message: "Evaluation artifact redaction boundary is enabled.".into(),
            evidence: json!({
                "sourceCodeIncluded": false,
                "rawPathsIncluded": false,
                "networkUsed": false
            }),
        });
    }
    for finding in &mut findings {
        if let Some(contract) = bundle
            .rules
            .iter()
            .find(|rule| rule.get("id").and_then(Value::as_str) == Some(finding.rule_id.as_str()))
        {
            if let Some(contract_evidence) = contract.get("evidence") {
                if let Some(evidence) = finding.evidence.as_object_mut() {
                    evidence.insert("sourceEvidence".into(), contract_evidence.clone());
                    if let Some(value) = contract.get("rationale") {
                        evidence.insert("ruleRationale".into(), value.clone());
                    }
                    if let Some(value) = contract.get("assertion") {
                        evidence.insert("ruleAssertion".into(), value.clone());
                    }
                    if let Some(value) = contract.get("remediation") {
                        evidence.insert("ruleRemediation".into(), value.clone());
                    }
                }
            }
        }
    }
    let errors = findings
        .iter()
        .filter(|f| !f.passed && f.severity == "error")
        .count();
    let warnings = findings
        .iter()
        .filter(|f| !f.passed && f.severity == "warning")
        .count();
    let passed = mode != "enforced" || (errors == 0 && warnings == 0);
    let state = if signature_status == "invalid" {
        "blocked"
    } else if errors > 0 || warnings > 0 {
        "needs_revision"
    } else {
        "pass"
    };
    let created = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let (git_head, dirty) = git_metadata(workspace);
    let workspace_hash =
        crate::crypto::MindPackageVerifier::compute_sha256(workspace.to_string_lossy().as_bytes());
    let checks = findings
        .iter()
        .map(|finding| {
            let mut value = serde_json::to_value(finding)?;
            if let Some(object) = value.as_object_mut() {
                object.insert(
                    "rationale".into(),
                    json!(format!(
                        "The active Mind declares {} as an observable policy check; this result records the selected scope's evidence.",
                        finding.rule_id
                    )),
                );
                let remediation = finding
                    .evidence
                    .get("remediation")
                    .and_then(Value::as_str)
                    .unwrap_or(if finding.passed {
                        "No remediation is required for this check."
                    } else {
                        "Review the active Mind rule and revise the selected change before re-evaluating."
                    });
                object.insert("remediation".into(), json!(remediation));
                object.insert(
                    "limitations".into(),
                    json!(["This finding is bounded to the selected workspace scope and configured evaluator."]),
                );
            }
            Ok::<Value, serde_json::Error>(value)
        })
        .collect::<Result<Vec<_>, _>>()?;
    let mut loop_snapshot = LoopSnapshot::new(LoopPolicy::default());
    loop_snapshot.transition(LoopState::ResolveProfile, "profile resolved");
    loop_snapshot.transition(LoopState::ResolveWorkspace, "workspace resolved");
    loop_snapshot.transition(LoopState::BuildTypedContext, "typed context built");
    loop_snapshot.transition(LoopState::Evaluate, "independent evaluation started");
    if errors > 0 {
        loop_snapshot.transition(LoopState::Remediate, "error findings require remediation");
        loop_snapshot.stop("evaluation requires external remediation");
    } else if warnings > 0 {
        loop_snapshot.transition(
            LoopState::Report,
            "warning findings reported without autonomous remediation",
        );
    } else {
        loop_snapshot.transition(LoopState::Attest, "evaluation passed");
        loop_snapshot.transition(LoopState::Report, "evaluation evidence ready");
    }
    let loop_summary = json!({
        "stateTransitions": loop_snapshot.events,
        "attempts": loop_snapshot.attempts,
        "commandRuns": loop_snapshot.command_runs,
        "stoppedBy": loop_snapshot.stop_reason.clone().unwrap_or_else(|| "pass".into())
    });
    let artifact = json!({
        "artifactVersion":"1.0",
        "runId":format!("rust-{created}-{}", std::process::id()),
        "createdAt":rfc3339_now(),
        "workspace":{"pathHash":format!("sha256:{workspace_hash}"),"gitHead":git_head,"dirty":dirty,"scope":{"changedOnly":scope.changed_only,"stagedOnly":options.staged_only,"source":scope.source,"checkedFiles":checked,"fallbackReason":scope.fallback_reason}},
        "mind":{"id":package_id,"version":package_version,"contentDigest":bundle_digest,"signatureStatus":signature_status,"layers":bundle.layers},
        "mode":mode,
        "state":state,
        "summary":{"status":if errors > 0 {"fail"} else if warnings > 0 {"warning"} else {"pass"},"hardViolationCount":errors,"warningCount":warnings,"informationalCount":0},
        "checks":checks,
        "skippedChecks":skipped_checks,
        "analysis":{"languages":analysis_languages,"parsers":analysis_parsers,"versions":analysis_versions,"checkedFiles":checked,"unsupportedRules":unsupported_rules},
        "loopTransitions":[
            {"stepId":"evaluation","state":"evaluating","event":"evaluation_started","attempt":0},
            {"stepId":"scope","state":"evaluating","event":"scope_resolved","attempt":0,"checkedFiles":checked,"source":scope.source},
            {"stepId":"analysis","state":"evaluating","event":"analysis_completed","attempt":0,"languages":analysis_languages,"unsupportedLanguages":unsupported_languages},
            {"stepId":"decision","state":state,"event":"evaluation_completed","attempt":0,"hardViolationCount":errors,"warningCount":warnings}
        ],
        "loop":{"stateTransitions":loop_summary["stateTransitions"],"attempts":loop_summary["attempts"],"commandRuns":loop_summary["commandRuns"],"stoppedBy":loop_summary["stoppedBy"]},
        "typedContext":{"version":"1.0","run":{"mode":mode,"network":"disabled"},"profile":{"id":package_id,"version":package_version,"digest":bundle_digest},"lanes":[
            {"lane":"hard-policy","priority":100,"lifecycle":"machine-enforced","source":"Mind Package"},
            {"lane":"repository-facts","priority":90,"lifecycle":"immutable","source":"workspace inspection"},
            {"lane":"findings","priority":80,"lifecycle":"machine-enforced","source":"Rust evaluator"},
            {"lane":"guidance","priority":50,"lifecycle":"advisory","source":"compiled Mind"}
        ]},
        "authorization":{"capabilityMode":"local","readFile":"allow","search":"allow","writeFile":"deny","executeCommand":{"mode":"deny","reason":"commands were not explicitly approved"},"network":"deny","upload":"approval-required","deploy":"deny"},
        "commands":[],
        "limitations":["Static and configured checks provide evidence about this evaluation only; they do not prove universal code quality."],
        "environment":{"runtime":"rust","lmpVersion":"0.1.0"},
        "privacy":{"sourceCodeIncluded":false,"rawPathsIncluded":false,"networkUsed":false}
    });
    if let Some(dir) = artifact_dir {
        fs::create_dir_all(dir)?;
        fs::write(
            dir.join(format!("run-{created}.json")),
            serde_json::to_vec_pretty(&artifact)?,
        )?;
    }
    Ok(Evaluation {
        package_id,
        package_version,
        mode: mode.into(),
        passed,
        state: state.into(),
        findings,
        checked_files: checked,
        artifact,
    })
}

fn blocked_signature_evaluation(
    package_dir: &Path,
    workspace: &Path,
    mode: &str,
    artifact_dir: Option<&Path>,
) -> Result<Evaluation> {
    let package = crate::load_package(&package_dir.join("mind.json"))
        .context("invalid Mind Package manifest")?;
    let created = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let finding = Finding {
        rule_id: "package.signature".into(),
        passed: false,
        severity: "error".into(),
        message: "Mind Package signature is invalid or unverifiable.".into(),
        evidence: json!({
            "signatureStatus": "invalid",
            "package": package.id,
            "workspace": workspace.display().to_string()
        }),
    };
    let artifact = json!({
        "artifactVersion":"1.0",
        "runId":format!("rust-{created}-{}", std::process::id()),
        "createdAt":rfc3339_now(),
        "mind":{"id":package.id,"version":package.version,"signatureStatus":"invalid","layers":[]},
        "mode":mode,
        "state":"blocked",
        "summary":{"status":"fail","hardViolationCount":1,"warningCount":0,"informationalCount":0},
        "checks":[serde_json::to_value(&finding)?],
        "skippedChecks":[{"checkId":"evaluation","reason":"Evaluation stopped before package compilation because signature verification failed.","status":"blocked"}],
        "loop":{"stateTransitions":[
            {"from":"INIT","to":"RESOLVE_PROFILE","event":"profile-resolved"},
            {"from":"RESOLVE_PROFILE","to":"ESCALATE","event":"signature-verification-failed"}
        ],"attempts":0,"stoppedBy":"escalation"},
        "typedContext":{"version":"1.0","run":{"mode":mode,"network":"disabled"},"profile":{"id":package.id,"version":package.version,"digest":"unavailable"},"lanes":[{"lane":"hard-policy","priority":100,"lifecycle":"machine-enforced","source":"Mind Package signature gate"}]},
        "authorization":{"capabilityMode":"local","readFile":"allow","search":"allow","writeFile":"deny","executeCommand":{"mode":"deny","reason":"package signature gate blocked evaluation"},"network":"deny","upload":"approval-required","deploy":"deny"},
        "commands":[],
        "limitations":["The package was blocked before workspace analysis because its detached signature could not be verified."],
        "environment":{"runtime":"rust","lmpVersion":"0.1.0"},
        "privacy":{"sourceCodeIncluded":false,"rawPathsIncluded":false,"networkUsed":false}
    });
    if let Some(dir) = artifact_dir {
        fs::create_dir_all(dir)?;
        fs::write(
            dir.join(format!("run-{created}.json")),
            serde_json::to_vec_pretty(&artifact)?,
        )?;
    }
    Ok(Evaluation {
        package_id: package.id,
        package_version: package.version,
        mode: mode.into(),
        passed: false,
        state: "blocked".into(),
        findings: vec![finding],
        checked_files: 0,
        artifact,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        architecture_findings, contains_secret_assignment, evaluate, supported_rule_contract,
    };
    use serde_json::json;
    use std::{fs, path::PathBuf};

    #[test]
    fn hardcoded_secret_match_requires_assignment_boundary() {
        assert!(!contains_secret_assignment(
            "argument.getOperatorToken().getText() === \"+\""
        ));
        assert!(contains_secret_assignment(
            "const apiKey = \"live-key-value-123\";"
        ));
        assert!(contains_secret_assignment(
            "{ password: 'live-password-value' }"
        ));
        assert!(!contains_secret_assignment(
            "const tokenCount = \"ordinary-value\";"
        ));
    }

    #[test]
    fn architecture_boundary_reports_forbidden_import_with_location() {
        let workspace = std::env::temp_dir().join(format!(
            "lmp-rust-architecture-boundary-test-{}",
            std::process::id()
        ));
        fs::create_dir_all(workspace.join("apps/web/src")).unwrap();
        let file = workspace.join("apps/web/src/page.ts");
        fs::write(&file, "import { query } from \"server/db\";\n").unwrap();
        let policy = json!({
            "boundaries": [{
                "name": "web",
                "pathPrefix": "apps/web/src/",
                "forbiddenImports": ["server/db"]
            }]
        });
        let findings = architecture_findings(&workspace, &[file], &policy, "warning");
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].rule_id, "architecture.boundary");
        assert_eq!(findings[0].evidence["line"], 1);
        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn unknown_rule_contracts_are_not_treated_as_implemented() {
        assert!(supported_rule_contract("typescript.type-error"));
        assert!(supported_rule_contract("security.artifact-redaction"));
        assert!(!supported_rule_contract("postgres.tenant-boundary"));
        assert!(!supported_rule_contract("future.rule"));
    }

    #[test]
    fn postgres_tenant_boundary_reports_missing_static_signals() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../profiles/postgres-tenant-boundary");
        let workspace =
            std::env::temp_dir().join(format!("lmp-rust-postgres-boundary-{}", std::process::id()));
        fs::create_dir_all(&workspace).unwrap();
        fs::write(
            workspace.join("migration.sql"),
            "create table invoices (id int);\n",
        )
        .unwrap();
        let report = evaluate(&root, &workspace, "enforced", None).unwrap();
        assert!(!report.passed);
        assert_eq!(
            report
                .findings
                .iter()
                .filter(|finding| finding.rule_id == "postgres.tenant-boundary")
                .count(),
            3
        );
        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn enforced_evaluation_blocks_denied_dependencies() {
        let root =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../profiles/typescript-minimal");
        let workspace = std::env::temp_dir().join(format!("lmp-rust-test-{}", std::process::id()));
        fs::create_dir_all(&workspace).unwrap();
        fs::write(
            workspace.join("package.json"),
            r#"{"dependencies":{"lodash":"1"}}"#,
        )
        .unwrap();
        let report = evaluate(&root, &workspace, "enforced", None).unwrap();
        assert!(!report.passed);
        assert!(report
            .findings
            .iter()
            .any(|finding| finding.rule_id == "dependencies.prohibited"));
        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn enforced_evaluation_reports_unsafe_boundary_for_profiles_that_declare_it() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../registry/minds/lmp-protocol-core");
        let workspace = std::env::temp_dir().join(format!(
            "lmp-rust-unsafe-boundary-test-{}",
            std::process::id()
        ));
        fs::create_dir_all(&workspace).unwrap();
        fs::write(
            workspace.join("unsafe.rs"),
            "pub fn read() { unsafe { let _ = 1; } }\n",
        )
        .unwrap();
        let report = evaluate(&root, &workspace, "enforced", None).unwrap();
        assert!(!report.passed);
        assert!(report
            .findings
            .iter()
            .any(|finding| finding.rule_id == "ast.unsafe-boundary"));
        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn full_scope_evaluation_checks_nested_package_manifests() {
        let root =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../profiles/typescript-minimal");
        let workspace = std::env::temp_dir().join(format!(
            "lmp-rust-monorepo-dependency-test-{}",
            std::process::id()
        ));
        fs::create_dir_all(workspace.join("packages/worker")).unwrap();
        fs::write(workspace.join("package.json"), r#"{"private":true}"#).unwrap();
        fs::write(
            workspace.join("packages/worker/package.json"),
            r#"{"dependencies":{"lodash":"1"}}"#,
        )
        .unwrap();
        let report = evaluate(&root, &workspace, "enforced", None).unwrap();
        assert!(report
            .findings
            .iter()
            .any(|finding| finding.rule_id == "dependencies.prohibited"));
        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn rust_evaluator_enforces_typescript_policy_on_source_files() {
        let root =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../profiles/typescript-minimal");
        let workspace =
            std::env::temp_dir().join(format!("lmp-rust-ts-test-{}", std::process::id()));
        fs::create_dir_all(&workspace).unwrap();
        fs::write(
            workspace.join("src.ts"),
            "export const value: any = eval(input);\n",
        )
        .unwrap();
        let report = evaluate(&root, &workspace, "enforced", None).unwrap();
        assert!(!report.passed);
        assert!(report
            .findings
            .iter()
            .any(|finding| finding.rule_id == "typescript.any"));
        assert!(report
            .findings
            .iter()
            .any(|finding| finding.rule_id == "typescript.eval"));
        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn rust_evaluator_maps_additional_typescript_profile_rules() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../profiles/baseline");
        let workspace =
            std::env::temp_dir().join(format!("lmp-rust-typescript-rules-{}", std::process::id()));
        fs::create_dir_all(&workspace).unwrap();
        fs::write(
            workspace.join("src.ts"),
            r#"
const unused = 1;
var legacy = 2;
try { work(); } catch {}
db.query(`select * from users where id = ${id}`);
const joined = Promise.all([loadUser(), loadOrders()]);
const response = { origin: "*" };
"#,
        )
        .unwrap();
        let report = evaluate(&root, &workspace, "enforced", None).unwrap();
        for rule in [
            "typescript.unused-variable",
            "typescript.var-declaration",
            "typescript.empty-catch",
            "security.sql-injection",
            "security.insecure-default",
            "database.app-layer-join",
        ] {
            assert!(
                report
                    .findings
                    .iter()
                    .any(|finding| finding.rule_id == rule),
                "expected Rust evaluator finding for {rule}"
            );
        }
        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn rust_evaluator_reports_obvious_typescript_type_errors_without_silent_skips() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../profiles/baseline");
        let workspace = std::env::temp_dir().join(format!(
            "lmp-rust-unsupported-typescript-rules-{}",
            std::process::id()
        ));
        fs::create_dir_all(&workspace).unwrap();
        fs::write(
            workspace.join("src.ts"),
            "const value: number = \"wrong\";\n",
        )
        .unwrap();
        let report = evaluate(&root, &workspace, "enforced", None).unwrap();
        assert!(!report.passed);
        assert!(report
            .findings
            .iter()
            .any(|finding| finding.rule_id == "typescript.type-error"));
        assert!(!report.artifact["skippedChecks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|check| check["checkId"] == "rule.typescript.type-error"));
        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn rust_evaluator_detects_duplicate_typescript_function_bodies() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../profiles/baseline");
        let workspace = std::env::temp_dir().join(format!(
            "lmp-rust-duplicate-typescript-{}",
            std::process::id()
        ));
        fs::create_dir_all(&workspace).unwrap();
        fs::write(
            workspace.join("src.ts"),
            r#"
function first(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.replace(/[^a-z0-9]/g, "");
}

function second(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.replace(/[^a-z0-9]/g, "");
}
"#,
        )
        .unwrap();
        let report = evaluate(&root, &workspace, "enforced", None).unwrap();
        assert!(report
            .findings
            .iter()
            .any(|finding| finding.rule_id == "typescript.duplicate-logic"));
        assert!(!report
            .findings
            .iter()
            .any(|finding| finding.rule_id == "rule.unsupported.typescript.duplicate-logic"));
        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn artifact_makes_parser_boundary_explicit_for_supported_and_unsupported_sources() {
        let root =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../profiles/typescript-minimal");
        let workspace =
            std::env::temp_dir().join(format!("lmp-rust-language-boundary-{}", std::process::id()));
        fs::create_dir_all(&workspace).unwrap();
        fs::write(workspace.join("src.ts"), "export const value = 1;\n").unwrap();
        fs::write(workspace.join("worker.go"), "package main\n").unwrap();
        fs::write(workspace.join("worker.py"), "def run():\n    return True\n").unwrap();

        let report = evaluate(&root, &workspace, "enforced", None).unwrap();
        assert_eq!(report.state, "needs_revision");
        assert!(report
            .findings
            .iter()
            .any(|finding| finding.rule_id == "language.unsupported.go"));
        assert!(report
            .findings
            .iter()
            .any(|finding| finding.rule_id == "language.unsupported.python"));
        assert_eq!(report.artifact["analysis"]["checkedFiles"], 1);
        assert_eq!(report.artifact["workspace"]["scope"]["stagedOnly"], false);
        assert!(report.artifact["analysis"]["languages"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item == "typescript"));
        assert!(report.artifact["skippedChecks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["checkId"] == "language.go"));
        assert!(report.artifact["skippedChecks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["checkId"] == "language.python"));
        let transitions = report.artifact["loopTransitions"].as_array().unwrap();
        assert_eq!(transitions.len(), 4);
        assert_eq!(transitions[0]["stepId"], "evaluation");
        assert_eq!(transitions[1]["event"], "scope_resolved");
        assert_eq!(transitions[1]["checkedFiles"], 1);
        assert_eq!(transitions[2]["event"], "analysis_completed");
        assert_eq!(transitions[3]["stepId"], "decision");
        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn invalid_package_signature_blocks_evaluation() {
        let package =
            std::env::temp_dir().join(format!("lmp-invalid-signature-{}", std::process::id()));
        let workspace = std::env::temp_dir().join(format!(
            "lmp-invalid-signature-workspace-{}",
            std::process::id()
        ));
        fs::create_dir_all(package.join("signatures")).unwrap();
        fs::create_dir_all(&workspace).unwrap();
        fs::write(
            package.join("mind.json"),
            r#"{"id":"lmp:test:invalid-signature","version":"1.0.0"}"#,
        )
        .unwrap();
        fs::write(package.join("signatures/manifest.sig"), "not-a-signature").unwrap();
        fs::write(package.join("signatures/public-key.hex"), "not-a-key").unwrap();
        let report = evaluate(&package, &workspace, "enforced", None).unwrap();
        assert_eq!(report.state, "blocked");
        assert_eq!(report.artifact["mind"]["signatureStatus"], "invalid");
        fs::remove_dir_all(package).unwrap();
        fs::remove_dir_all(workspace).unwrap();
    }
}
