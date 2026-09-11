use crate::compiler;
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

fn unsupported_source_language(path: &Path) -> Option<&'static str> {
    match path
        .extension()?
        .to_string_lossy()
        .to_ascii_lowercase()
        .as_str()
    {
        "go" => Some("go"),
        "py" | "pyi" => Some("python"),
        "java" | "kt" | "kts" => Some("jvm"),
        "c" | "h" | "cc" | "cpp" | "cxx" | "hpp" => Some("c-family"),
        "sql" => Some("sql"),
        "hcl" | "tf" => Some("hcl"),
        _ => None,
    }
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
            ".lending-mind",
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
    let path = workspace.join("package.json");
    if changed_only && !scope_files.iter().any(|file| file == &path) {
        return Vec::new();
    }
    let Ok(text) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&text) else {
        return Vec::new();
    };
    let mut findings = Vec::new();
    for section in ["dependencies", "devDependencies"] {
        if let Some(map) = value.get(section).and_then(Value::as_object) {
            for name in prohibited.iter().filter(|name| map.contains_key(*name)) {
                findings.push(Finding {
                    rule_id: "dependencies.prohibited".into(),
                    passed: false,
                    severity: "error".into(),
                    message: format!("prohibited dependency: {name}"),
                    evidence: json!({"dependency": name, "section": section}),
                });
            }
        }
    }
    findings
}

fn policy_values(
    package_dir: &Path,
    package: &crate::MindPackage,
) -> (Vec<String>, usize, std::collections::HashMap<String, bool>) {
    let mut prohibited = Vec::new();
    let mut complexity = 10;
    let mut flags = std::collections::HashMap::new();
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
        }
        if let Some(items) = value
            .get("prohibited")
            .or_else(|| value.get("deny"))
            .and_then(Value::as_array)
        {
            prohibited.extend(items.iter().filter_map(Value::as_str).map(String::from));
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
    (prohibited, complexity, flags)
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
    let severity = if flags.get("errorAny").copied().unwrap_or(false)
        || flags.get("errorEval").copied().unwrap_or(false)
        || flags.get("errorConsoleLog").copied().unwrap_or(false)
        || flags.get("errorDynamicRequire").copied().unwrap_or(false)
    {
        "error"
    } else {
        "warning"
    };
    let mut findings = Vec::new();
    for (index, raw_line) in source.lines().enumerate() {
        let line = raw_line.split("//").next().unwrap_or(raw_line);
        let line_number = index + 1;
        let push = |rule_id: &str, message: &str, remediation: &str| Finding {
            rule_id: rule_id.into(),
            passed: false,
            severity: severity.into(),
            message: message.into(),
            evidence: json!({"file": relative, "line": line_number, "remediation": remediation}),
        };
        if flags.get("errorAny").copied().unwrap_or(false)
            || flags.get("warnAny").copied().unwrap_or(false)
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
        if (flags.get("errorEval").copied().unwrap_or(false)
            || flags.get("warnEval").copied().unwrap_or(false))
            && (line.contains("eval(") || line.contains("globalThis.eval("))
        {
            findings.push(push(
                "typescript.eval",
                "Dynamic code execution detected.",
                "Replace eval with a typed dispatch table or parser.",
            ));
        }
        if (flags.get("errorConsoleLog").copied().unwrap_or(false)
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
    }
    findings
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
    let head = Command::new("git")
        .args(["-C"])
        .arg(workspace)
        .args(["rev-parse", "HEAD"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let dirty = Command::new("git")
        .args(["-C"])
        .arg(workspace)
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
    let profile_cache = workspace.join(".lending-mind/cache/profiles");
    let bundle = compiler::compile_cached(package_dir, &profile_cache)?;
    let signature_status = crate::crypto::package_signature_status(package_dir)
        .context("failed to determine Mind Package signature status")?;
    let package_id = bundle.mind.id.clone();
    let package_version = bundle.mind.version.clone();
    let bundle_digest = bundle.digest.clone();
    let (prohibited, max_complexity, flags) = policy_values(package_dir, &bundle.mind);
    let mut all_files = Vec::new();
    walk(workspace, &mut all_files).context("failed to scan workspace")?;
    let scope = crate::scope::select(workspace, options.changed_only, options.git_base, all_files);
    let files = scope.files;
    let mut findings = dependency_findings(workspace, &prohibited, &files, options.changed_only);
    let mut skipped_checks = Vec::new();
    let mut analysis_languages = std::collections::BTreeSet::new();
    let mut analysis_parsers = std::collections::BTreeSet::new();
    let mut analysis_versions = std::collections::BTreeSet::new();
    let mut unsupported_languages = std::collections::BTreeSet::new();
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
                .unwrap_or_else(|| workspace.join(".lending-mind/cache/ast"));
            fs::create_dir_all(&cache_dir)?;
            let source_digest =
                crate::crypto::MindPackageVerifier::compute_sha256(source.as_bytes());
            let cache_path = cache_dir.join(format!("{}-{}.json", source_digest, max_complexity));
            let cached: Option<Vec<String>> = fs::read(&cache_path)
                .ok()
                .and_then(|bytes| serde_json::from_slice(&bytes).ok());
            if let Some(messages) = cached {
                findings.extend(messages.into_iter().map(|message| Finding {
                    rule_id: "rust.ast".into(),
                    passed: false,
                    severity: "warning".into(),
                    message,
                    evidence: json!({"file": file.strip_prefix(workspace).unwrap_or(file).display().to_string(), "cache":"hit"}),
                }));
                continue;
            }
            if let Err(error) = syn::parse_file(&source) {
                findings.push(Finding { rule_id: "rust.syntax".into(), passed: false, severity: "error".into(), message: format!("invalid Rust syntax: {error}"), evidence: json!({"file": file.strip_prefix(workspace).unwrap_or(file).display().to_string()}) });
                continue;
            }
            let messages = crate::ast::audit_source(&source, max_complexity, &[])?;
            fs::write(&cache_path, serde_json::to_vec(&messages)?)?;
            findings.extend(messages.into_iter().map(|message| Finding { rule_id: "rust.ast".into(), passed: false, severity: "warning".into(), message, evidence: json!({"file": file.strip_prefix(workspace).unwrap_or(file).display().to_string(), "cache":"miss"}) }));
        } else {
            findings.extend(source_findings(file, workspace, &source, &flags));
        }
    }
    for language in unsupported_languages {
        skipped_checks.push(json!({
            "checkId": format!("language.{language}"),
            "reason": format!("The Rust evaluator has no parser or policy adapter for {language}; the file was not analyzed."),
            "status": "unsupported"
        }));
    }
    skipped_checks.push(json!({
        "checkId":"behavioral.docker",
        "reason":"Docker execution is an explicit orchestrator gate, not part of this static evaluator run."
    }));
    let errors = findings
        .iter()
        .filter(|f| !f.passed && f.severity == "error")
        .count();
    let warnings = findings
        .iter()
        .filter(|f| !f.passed && f.severity == "warning")
        .count();
    let passed = mode != "enforced" || errors == 0;
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
    let artifact = json!({
        "artifactVersion":"1.0",
        "runId":format!("rust-{created}-{}", std::process::id()),
        "createdAt":rfc3339_now(),
        "workspace":{"pathHash":format!("sha256:{workspace_hash}"),"gitHead":git_head,"dirty":dirty,"scope":{"changedOnly":scope.changed_only,"source":scope.source,"checkedFiles":checked,"fallbackReason":scope.fallback_reason}},
        "mind":{"id":package_id,"version":package_version,"contentDigest":bundle_digest,"signatureStatus":signature_status,"layers":bundle.layers},
        "mode":mode,
        "state":state,
        "summary":{"status":if errors > 0 {"fail"} else if warnings > 0 {"warning"} else {"pass"},"hardViolationCount":errors,"warningCount":warnings,"informationalCount":0},
        "checks":checks,
        "skippedChecks":skipped_checks,
        "analysis":{"languages":analysis_languages,"parsers":analysis_parsers,"versions":analysis_versions,"checkedFiles":checked},
        "loopTransitions":[
            {"state":"evaluating","event":"evaluation_started","attempt":0},
            {"state":state,"event":"evaluation_completed","attempt":0}
        ],
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

#[cfg(test)]
mod tests {
    use super::evaluate;
    use std::{fs, path::PathBuf};

    #[test]
    fn enforced_evaluation_blocks_denied_dependencies() {
        let root =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../skills/typescript-minimal");
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
    fn rust_evaluator_enforces_typescript_policy_on_source_files() {
        let root =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../skills/typescript-minimal");
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
    fn artifact_makes_parser_boundary_explicit_for_supported_and_unsupported_sources() {
        let root =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../skills/typescript-minimal");
        let workspace =
            std::env::temp_dir().join(format!("lmp-rust-language-boundary-{}", std::process::id()));
        fs::create_dir_all(&workspace).unwrap();
        fs::write(workspace.join("src.ts"), "export const value = 1;\n").unwrap();
        fs::write(workspace.join("worker.go"), "package main\n").unwrap();

        let report = evaluate(&root, &workspace, "enforced", None).unwrap();
        assert_eq!(report.state, "pass");
        assert_eq!(report.artifact["analysis"]["checkedFiles"], 1);
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
