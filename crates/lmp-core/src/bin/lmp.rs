use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use lmp_core::{
    compiler,
    crypto::{package_signature_status_with_revocation, verify_package_signature_with_revocation},
    evaluator::{self, EvaluationOptions},
    fleet::{FleetRun, RoleGraph, RoleReport},
    validate_package_dir,
};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command as ProcessCommand,
};

#[derive(Parser)]
#[command(
    name = "lmp",
    version,
    about = "Rust-native Lending-Mind Protocol runtime"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}
#[derive(Subcommand)]
enum Command {
    Init {
        #[arg(long)]
        force: bool,
        #[arg(long)]
        install_baseline: bool,
        #[arg(long, help = "Alias for --install-baseline")]
        baseline: bool,
    },
    Evaluate {
        #[arg(long)]
        mind: Option<PathBuf>,
        #[arg(long, default_value = ".")]
        workspace: PathBuf,
        #[arg(
            long,
            help = "Evaluation mode; defaults to the workspace configuration"
        )]
        mode: Option<String>,
        #[arg(long)]
        artifact_dir: Option<PathBuf>,
        #[arg(long)]
        json: bool,
        #[arg(long, help = "Evaluate only files changed from Git HEAD or --base")]
        changed_only: bool,
        #[arg(long, help = "Git revision used as the delta comparison base")]
        base: Option<String>,
        #[arg(
            long,
            value_delimiter = ',',
            help = "Comma-separated relative scope paths"
        )]
        scope: Vec<PathBuf>,
        #[arg(long, help = "Write the final artifact to this exact file")]
        artifact_out: Option<PathBuf>,
    },
    Mind {
        #[command(subcommand)]
        command: MindCommand,
    },
    Registry {
        #[command(subcommand)]
        command: RegistryCommand,
    },
    Status {
        #[arg(long, default_value = ".")]
        workspace: PathBuf,
        #[arg(long)]
        json: bool,
    },
    Instructions {
        #[arg(long)]
        mind: PathBuf,
    },
    Validate {
        path: PathBuf,
    },
    SelfCheck {
        #[arg(long, default_value = ".")]
        workspace: PathBuf,
        #[arg(long)]
        json: bool,
    },
    Release {
        #[command(subcommand)]
        command: ReleaseCommand,
    },
    Audit {
        #[command(subcommand)]
        command: AuditCommand,
    },
    Verify {
        path: PathBuf,
        #[arg(long)]
        public_key: Option<PathBuf>,
        #[arg(long, help = "Newline-delimited revoked public keys")]
        revocation_list: Option<PathBuf>,
    },
    FleetValidate {
        #[arg(long)]
        graph: PathBuf,
    },
    FleetMerge {
        #[arg(long)]
        graph: PathBuf,
        #[arg(long)]
        reports: PathBuf,
    },
}

#[derive(Subcommand)]
enum ReleaseCommand {
    Verify {
        #[arg(long, value_parser = ["local", "ci", "release-candidate"])]
        profile: String,
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand)]
enum AuditCommand {
    Completion {
        #[arg(long, default_value = ".")]
        workspace: PathBuf,
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand)]
enum MindCommand {
    Validate {
        path: PathBuf,
    },
    List {
        #[arg(long, default_value = "public-web-vault/registry.json")]
        registry: PathBuf,
        #[arg(long)]
        json: bool,
    },
    Resolve {
        #[arg(long)]
        mind: String,
        #[arg(long, default_value = "public-web-vault/registry.json")]
        registry: PathBuf,
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand)]
enum RegistryCommand {
    Validate {
        #[arg(long, default_value = "public-web-vault/registry.json")]
        path: PathBuf,
        #[arg(long)]
        json: bool,
    },
}

fn read_vault(path: &Path) -> Result<serde_json::Value> {
    let value: serde_json::Value = serde_json::from_str(&fs::read_to_string(path)?)?;
    anyhow::ensure!(
        value
            .get("schemaVersion")
            .and_then(serde_json::Value::as_str)
            == Some("1"),
        "unsupported Mind Vault schema"
    );
    anyhow::ensure!(
        value
            .get("production")
            .and_then(serde_json::Value::as_array)
            .is_some(),
        "Mind Vault production array is missing"
    );
    anyhow::ensure!(
        value
            .get("draftMinds")
            .and_then(serde_json::Value::as_array)
            .is_some(),
        "Mind Vault draftMinds array is missing"
    );
    Ok(value)
}

fn vault_entries(value: &serde_json::Value) -> Vec<&serde_json::Value> {
    value
        .get("production")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .collect()
}

fn validate_vault(path: &Path) -> Result<serde_json::Value> {
    let value = read_vault(path)?;
    let production = value
        .get("production")
        .and_then(serde_json::Value::as_array)
        .unwrap();
    let drafts = value
        .get("draftMinds")
        .and_then(serde_json::Value::as_array)
        .unwrap();
    anyhow::ensure!(
        production.len() + drafts.len() >= 50,
        "Mind Vault must contain at least 50 entries"
    );
    let mut keys = std::collections::HashSet::new();
    for entry in production {
        let key = entry
            .get("mindKey")
            .and_then(serde_json::Value::as_str)
            .context("production entry is missing mindKey")?;
        anyhow::ensure!(keys.insert(key), "duplicate Mind Vault key: {key}");
        anyhow::ensure!(
            entry
                .get("packagePath")
                .and_then(serde_json::Value::as_str)
                .is_some(),
            "production entry {key} is missing packagePath"
        );
        let package_path = PathBuf::from(
            entry
                .get("packagePath")
                .and_then(serde_json::Value::as_str)
                .unwrap(),
        );
        let package_path = if package_path.exists() {
            package_path
        } else {
            path.parent().unwrap_or(Path::new(".")).join(package_path)
        };
        for required in [
            "mind.json",
            "SKILL.md",
            "guidance.md",
            "sources.json",
            "interpretation.json",
            "limitations.md",
            "evidence/README.md",
            "rules/manifest.json",
            "fixtures/compliant",
            "fixtures/violating",
            "signatures/manifest.sig",
            "signatures/mind.json.sig",
            "signatures/public-key.hex",
        ] {
            anyhow::ensure!(
                package_path.join(required).exists(),
                "Mind Vault entry {key} is missing required package asset: {required}"
            );
        }
        validate_package_dir(&package_path.join("mind.json"))
            .with_context(|| format!("invalid package for Mind Vault entry {key}"))?;
        anyhow::ensure!(
            package_signature_status_with_revocation(&package_path, None)? == "verified",
            "Mind Vault entry {key} does not have a verified signature"
        );
    }
    for entry in drafts {
        let key = entry
            .get("mindKey")
            .and_then(serde_json::Value::as_str)
            .context("draft entry is missing mindKey")?;
        anyhow::ensure!(keys.insert(key), "duplicate Mind Vault key: {key}");
        anyhow::ensure!(
            matches!(
                entry.get("status").and_then(serde_json::Value::as_str),
                Some("DRAFT") | Some("PENDING_PACKAGING")
            ),
            "draft Mind {key} has an invalid status"
        );
    }
    Ok(
        serde_json::json!({"status": "verified", "production": production.len(), "drafts": drafts.len(), "total": production.len() + drafts.len(), "path": path}),
    )
}

const EMBEDDED_BASELINE: &[(&str, &[u8])] = &[
    (
        "SKILL.md",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../profiles/baseline/SKILL.md"
        )),
    ),
    (
        "evidence.json",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../profiles/baseline/evidence.json"
        )),
    ),
    (
        "evidence/README.md",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../profiles/baseline/evidence/README.md"
        )),
    ),
    (
        "guidance.md",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../profiles/baseline/guidance.md"
        )),
    ),
    (
        "mind.json",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../profiles/baseline/mind.json"
        )),
    ),
    (
        "release.json",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../profiles/baseline/release.json"
        )),
    ),
    (
        "rules/commands.json",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../profiles/baseline/rules/commands.json"
        )),
    ),
    (
        "rules/complexity.json",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../profiles/baseline/rules/complexity.json"
        )),
    ),
    (
        "rules/dependencies.json",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../profiles/baseline/rules/dependencies.json"
        )),
    ),
    (
        "rules/manifest.json",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../profiles/baseline/rules/manifest.json"
        )),
    ),
    (
        "rules/typescript.json",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../profiles/baseline/rules/typescript.json"
        )),
    ),
    (
        "signature.txt",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../profiles/baseline/signature.txt"
        )),
    ),
    (
        "signatures/manifest.sig",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../profiles/baseline/signatures/manifest.sig"
        )),
    ),
    (
        "signatures/public-key.hex",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../profiles/baseline/signatures/public-key.hex"
        )),
    ),
];

fn write_embedded_baseline(destination: &Path) -> Result<()> {
    for (relative_path, contents) in EMBEDDED_BASELINE {
        let path = destination.join(relative_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, contents)?;
    }
    Ok(())
}

fn configured_mind() -> PathBuf {
    let config = Path::new(".lending-mind/config.json");
    fs::read_to_string(config)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|value| {
            value
                .get("defaultMind")
                .and_then(serde_json::Value::as_str)
                .map(PathBuf::from)
        })
        .unwrap_or_else(|| PathBuf::from("./profiles/baseline"))
}

fn configured_mode() -> String {
    let config = Path::new(".lending-mind/config.json");
    fs::read_to_string(config)
        .ok()
        .and_then(|text| configured_mode_from_text(&text))
        .unwrap_or_else(|| "advisory".into())
}

fn configured_mode_from_text(text: &str) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(text)
        .ok()
        .and_then(|value| {
            value
                .get("defaultMode")
                .and_then(serde_json::Value::as_str)
                .filter(|mode| ["advisory", "enforced", "audit"].contains(mode))
                .map(str::to_owned)
        })
}

fn resolve_mind_path(input: PathBuf) -> PathBuf {
    if input.exists() {
        return input;
    }
    let value = input.to_string_lossy();
    let alias = value.strip_prefix("lmp:mind:").unwrap_or(&value);
    for candidate in [
        PathBuf::from("registry/minds").join(alias),
        PathBuf::from("registry/definitions").join(alias),
        PathBuf::from("profiles").join(alias),
        PathBuf::from("packages/create-lmp/profiles").join(alias),
    ] {
        if candidate.exists() {
            return candidate;
        }
    }
    input
}

fn completion_audit(root: &Path) -> Result<serde_json::Value> {
    fn visit(path: &Path, root: &Path, findings: &mut Vec<serde_json::Value>) -> Result<()> {
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if [
            ".git",
            "target",
            "node_modules",
            ".venv",
            ".lmp",
            ".next",
            ".claude",
            ".lending-mind",
        ]
        .contains(&name)
        {
            return Ok(());
        }
        if path.is_dir() {
            for entry in fs::read_dir(path)? {
                visit(&entry?.path(), root, findings)?;
            }
            return Ok(());
        }
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if ![
            "rs", "py", "ts", "tsx", "js", "mjs", "md", "toml", "json", "yml", "yaml",
        ]
        .contains(&extension)
        {
            return Ok(());
        }
        let text = fs::read_to_string(path).unwrap_or_default();
        // Keep the detector vocabulary assembled so this audit does not report
        // its own implementation as an unresolved marker.
        let markers = [
            (format!("unimplemented!{}", "()"), "unimplemented macro"),
            (
                format!("panic!{}", "(\"not implemented"),
                "not implemented panic",
            ),
            (format!("hardcoded {}", "passing"), "hardcoded pass claim"),
        ];
        for (marker, category) in markers {
            if text.contains(&marker) {
                findings.push(serde_json::json!({
                    "id": format!("completion:{}:{}", category.replace(' ', "-"), path.strip_prefix(root).unwrap_or(path).display()),
                    "category": category,
                    "path": path.strip_prefix(root).unwrap_or(path),
                    "evidence": marker,
                    "status": "needs_revision"
                }));
            }
        }
        for line in text.lines() {
            let trimmed = line.trim_start();
            if (trimmed.starts_with("//")
                || trimmed.starts_with('#')
                || trimmed.starts_with("/*")
                || trimmed.starts_with('*'))
                && trimmed.contains("TODO")
            {
                findings.push(serde_json::json!({
                    "id": format!("completion:TODO-marker:{}", path.strip_prefix(root).unwrap_or(path).display()),
                    "category": "TODO marker",
                    "path": path.strip_prefix(root).unwrap_or(path),
                    "evidence": "TODO",
                    "status": "needs_revision"
                }));
                break;
            }
        }
        Ok(())
    }

    let mut findings = Vec::new();
    for required in [
        "crates/lmp-core",
        "crates/lmp-evaluator",
        "crates/lmp-artifacts",
        "crates/lmp-ingest",
        "crates/lmp-mind-compiler",
        "crates/lmp-cli",
        "crates/lmpd",
        "crates/lmp-mcp",
        "crates/lmp-sync",
        "orchestrator",
        "packages/create-lmp",
        "registry/minds",
        "public-web-vault",
        "public-web-vault/registry.json",
        "docs/mind-vault.md",
    ] {
        if !root.join(required).exists() {
            findings.push(serde_json::json!({"id": format!("completion:missing:{required}"), "category": "missing required path", "path": required, "status": "needs_revision"}));
        }
    }
    for entry in fs::read_dir(root.join("registry/minds"))? {
        let path = entry?.path();
        if !path.is_dir()
            || path
                .file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|name| name.starts_with('.'))
        {
            continue;
        }
        for required in [
            "mind.json",
            "guidance.md",
            "sources.json",
            "interpretation.json",
            "limitations.md",
            "rules",
            "fixtures/compliant",
            "fixtures/violating",
            "signatures",
        ] {
            if !path.join(required).exists() {
                findings.push(serde_json::json!({"id": format!("completion:mind-asset:{}:{}", path.display(), required), "category": "missing Mind asset", "path": path.join(required), "status": "needs_revision"}));
            }
        }
    }
    for required_root in [
        "crates",
        "orchestrator",
        "packages",
        "scripts",
        "registry/minds",
        "public-web-vault",
        "docs",
        ".github",
    ] {
        let path = root.join(required_root);
        if path.exists() {
            visit(&path, root, &mut findings)?;
        }
    }
    Ok(serde_json::json!({
        "schema": "lmp-completion-audit-v1",
        "workspace": ".",
        "state": if findings.is_empty() { "pass" } else { "needs_revision" },
        "findings": findings,
        "claims": ["This audit detects repository completion hazards; it does not certify correctness or production readiness."],
    }))
}

fn cargo_command() -> ProcessCommand {
    let cargo = rustup_tool_path("cargo").unwrap_or_else(|| "cargo".to_owned());
    let mut command = ProcessCommand::new(cargo);
    if let Some(rustc) = rustup_tool_path("rustc") {
        command.env("RUSTC", rustc);
    }
    if let Some(rustdoc) = rustup_tool_path("rustdoc") {
        command.env("RUSTDOC", rustdoc);
    }
    command
}

fn rustup_tool_path(tool: &str) -> Option<String> {
    ProcessCommand::new("rustup")
        .args(["which", tool])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        .filter(|path| !path.is_empty())
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Init {
            force,
            install_baseline,
            baseline,
        } => {
            let dir = PathBuf::from(".lending-mind");
            std::fs::create_dir_all(&dir)?;
            let config = dir.join("config.json");
            if config.exists() && !force {
                anyhow::bail!("configuration exists; use --force")
            }
            let install_baseline = install_baseline || baseline;
            let default_mind = if install_baseline {
                let destination = dir.join("skills/baseline");
                if destination.exists() && !force {
                    anyhow::bail!("baseline profile exists; use --force to replace it")
                }
                if destination.exists() {
                    fs::remove_dir_all(&destination)?;
                }
                write_embedded_baseline(&destination)?;
                ".lending-mind/skills/baseline"
            } else {
                "profiles/baseline"
            };
            fs::create_dir_all(dir.join("artifacts"))?;
            fs::write(
                &config,
                format!(
                    "{{\n  \"version\": 1,\n  \"defaultMind\": \"{default_mind}\",\n  \"defaultMode\": \"advisory\",\n  \"network\": \"offline\",\n  \"commands\": \"disabled\"\n}}\n"
                ),
            )?;
            if install_baseline {
                println!(
                    "installed baseline profile at {}",
                    dir.join("skills/baseline").display()
                );
            }
            println!("initialized {}", config.display());
        }
        Command::Evaluate {
            mind,
            workspace,
            mode,
            artifact_dir,
            json,
            changed_only,
            base,
            scope,
            artifact_out,
        } => {
            let mode = mode.unwrap_or_else(configured_mode);
            anyhow::ensure!(
                ["advisory", "enforced", "audit"].contains(&mode.as_str()),
                "invalid mode: {mode}"
            );
            let mind = resolve_mind_path(mind.unwrap_or_else(configured_mind));
            let scopes = if scope.is_empty() {
                vec![workspace.clone()]
            } else {
                scope.iter().map(|path| workspace.join(path)).collect()
            };
            let mut reports = Vec::with_capacity(scopes.len());
            for selected_scope in scopes {
                reports.push(evaluator::evaluate_with_options(
                    &mind,
                    &selected_scope,
                    &mode,
                    artifact_dir.as_deref(),
                    EvaluationOptions {
                        changed_only,
                        git_base: base.as_deref(),
                        ast_cache_dir: None,
                    },
                )?);
            }
            let report = reports
                .into_iter()
                .reduce(|mut aggregate, current| {
                    aggregate.passed &= current.passed;
                    aggregate.checked_files += current.checked_files;
                    aggregate.findings.extend(current.findings);
                    aggregate.state = if aggregate.passed {
                        "pass".into()
                    } else {
                        "needs_revision".into()
                    };
                    let mut scope_artifacts = aggregate
                        .artifact
                        .get("scopes")
                        .and_then(serde_json::Value::as_array)
                        .cloned()
                        .unwrap_or_else(|| vec![aggregate.artifact.clone()]);
                    scope_artifacts.push(current.artifact);
                    aggregate.artifact = serde_json::json!({
                        "artifactVersion": "1.0",
                        "state": aggregate.state,
                        "mind": {"id": aggregate.package_id, "version": aggregate.package_version},
                        "scopes": scope_artifacts,
                        "limitations": ["Aggregated scope evidence; each scope was evaluated independently."]
                    });
                    aggregate
                })
                .expect("at least one evaluation scope");
            if let Some(path) = artifact_out {
                if let Some(parent) = path.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::write(&path, serde_json::to_vec_pretty(&report.artifact)?)?;
            }
            if json {
                println!("{}", serde_json::to_string_pretty(&report.artifact)?);
            } else {
                println!(
                    "{}: {} source file(s), {} finding(s)",
                    report.state,
                    report.checked_files,
                    report.findings.len()
                );
                if !report.findings.is_empty() {
                    println!("\n🚨 ============ LMP COMPILER-GRADE PROFILER TRACE ============");
                    println!(
                        "Active Mind Profile : {}@{}",
                        report.package_id, report.package_version
                    );
                    println!("Validation Status   : NON_COMPLIANT_REJECTED ❌");
                    println!("\n[AXIOMATIC EVALUATION BREACHES DETECTED]");
                    for finding in &report.findings {
                        let file = finding
                            .evidence
                            .get("file")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or("workspace");
                        let line = finding
                            .evidence
                            .get("line")
                            .and_then(serde_json::Value::as_u64)
                            .map(|value| format!(":{value}"))
                            .unwrap_or_default();
                        let remediation = finding
                            .evidence
                            .get("remediation")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or("Inspect the active Mind rule and revise the changed code.");
                        println!(" ├── ⚠️ [{}] {}{}", finding.rule_id, file, line);
                        println!(" │   {}", finding.message);
                        println!(" │   Fix: {}", remediation);
                    }
                    println!("\n================ [ RESOLUTION ACTION PLAN ] ================");
                    println!("The Rust evaluator rejected this result. Refactor the changed code, then run the evaluation again.");
                    println!("=============================================================\n");
                }
            }
            if !report.passed {
                std::process::exit(1);
            }
        }
        Command::Instructions { mind } => println!(
            "{}",
            compiler::compile(&resolve_mind_path(mind))?.instructions
        ),
        Command::Validate { path } => {
            let manifest = if path.is_dir() {
                path.join("mind.json")
            } else {
                path
            };
            validate_package_dir(&manifest)
                .map_err(|e| anyhow::anyhow!("invalid mind package: {e}"))?;
            println!("valid");
        }
        Command::Mind { command } => match command {
            MindCommand::Validate { path } => {
                let path = resolve_mind_path(path);
                let manifest = if path.is_dir() {
                    path.join("mind.json")
                } else {
                    path
                };
                validate_package_dir(&manifest)
                    .map_err(|e| anyhow::anyhow!("invalid mind package: {e}"))?;
                println!("valid");
            }
            MindCommand::List { registry, json } => {
                let value = read_vault(&registry)?;
                let entries = vault_entries(&value);
                if json {
                    println!("{}", serde_json::to_string_pretty(&entries)?);
                } else {
                    for entry in entries {
                        println!(
                            "{}\t{}\t{}",
                            entry
                                .get("mindKey")
                                .and_then(serde_json::Value::as_str)
                                .unwrap_or("unknown"),
                            entry
                                .get("version")
                                .and_then(serde_json::Value::as_str)
                                .unwrap_or("unknown"),
                            entry
                                .get("category")
                                .and_then(serde_json::Value::as_str)
                                .unwrap_or("unknown")
                        );
                    }
                }
            }
            MindCommand::Resolve {
                mind,
                registry,
                json,
            } => {
                let value = read_vault(&registry)?;
                let entry = vault_entries(&value)
                    .into_iter()
                    .find(|entry| {
                        entry.get("mindKey").and_then(serde_json::Value::as_str)
                            == Some(mind.as_str())
                    })
                    .context("Mind is not present as a production package")?;
                if json {
                    println!("{}", serde_json::to_string_pretty(entry)?);
                } else {
                    println!("{}", serde_json::to_string(entry)?);
                }
            }
        },
        Command::Registry { command } => match command {
            RegistryCommand::Validate { path, json } => {
                let result = validate_vault(&path)?;
                if json {
                    println!("{}", serde_json::to_string_pretty(&result)?);
                } else {
                    println!(
                        "Mind Vault verified: {} production, {} drafts",
                        result["production"], result["drafts"]
                    );
                }
            }
        },
        Command::Status { workspace, json } => {
            let root = workspace.canonicalize()?;
            let config = root.join(".lmp/config.toml");
            let lock = root.join(".lmp/minds.lock");
            let result = serde_json::json!({
                "workspace": ".",
                "configuration": if config.exists() { "present" } else { "missing" },
                "mindLock": if lock.exists() { "present" } else { "missing" },
                "network": "disabled-by-default",
                "claims": ["Status reports local configuration state; it does not prove workspace correctness."]
            });
            if json {
                println!("{}", serde_json::to_string_pretty(&result)?);
            } else {
                println!("{}", result);
            }
        }
        Command::SelfCheck { workspace, json } => {
            let root = workspace.canonicalize()?;
            let config = lmp_core::self_hosting::load(&root)?;
            let lock = lmp_core::self_hosting::load_lock(&root)?;
            lmp_core::self_hosting::validate_lock(&lock, &config.mind)?;
            let _overrides = lmp_core::self_hosting::load_overrides(&root)?;
            let mind_path = root.join(&config.mind.path);
            let bundle = compiler::compile(&mind_path)?;
            anyhow::ensure!(
                bundle.mind.id == config.mind.id && bundle.mind.version == config.mind.version,
                "configured Mind pin does not match the loaded package"
            );
            anyhow::ensure!(
                bundle.digest == config.mind.digest,
                "configured Mind digest does not match the loaded package: expected {}, got {}",
                config.mind.digest,
                bundle.digest
            );
            let signature = lmp_core::crypto::package_signature_status(&mind_path)?;
            if config.mind.require_signature {
                anyhow::ensure!(
                    signature == "verified",
                    "self-hosting Mind signature status is {signature}"
                );
            }
            anyhow::ensure!(
                config.repository.root.as_path() == Path::new("."),
                "self-hosting repository root must be relative '.'"
            );
            let mut scopes = Vec::with_capacity(config.repository.allowed_paths.len());
            let mut all_passed = true;
            for relative_scope in &config.repository.allowed_paths {
                let source = root.join(relative_scope);
                anyhow::ensure!(
                    source.is_dir(),
                    "self-hosting allowed path does not exist or is not a directory: {}",
                    relative_scope.display()
                );
                lmp_core::self_hosting::validate_scope_limits(&source, &config.limits)?;
                let report = evaluator::evaluate_with_options(
                    &mind_path,
                    &source,
                    &config.validation.mode,
                    Some(&root.join(".lmp/artifacts")),
                    EvaluationOptions::default(),
                )?;
                all_passed &= report.passed;
                scopes.push(serde_json::json!({
                    "path": relative_scope,
                    "state": report.state,
                    "artifact": report.artifact,
                }));
            }
            let commands =
                lmp_core::self_hosting::run_configured_commands(&root, &config.validation)?;
            all_passed &= commands.iter().all(|command| command.status == "pass");
            let result = serde_json::json!({
                "configVersion": config.version,
                "mind": {"id": bundle.mind.id, "version": bundle.mind.version, "digest": bundle.digest, "signatureStatus": signature},
                "scopes": scopes,
                "commands": commands,
                "limitations": ["This is bounded self-hosting evidence; it does not prove universal correctness or production readiness."],
            });
            if json {
                println!("{}", serde_json::to_string_pretty(&result)?);
            } else {
                println!(
                    "self-check: {} scope(s) evaluated",
                    config.repository.allowed_paths.len()
                );
            }
            if !all_passed {
                std::process::exit(1);
            }
        }
        Command::Audit { command } => match command {
            AuditCommand::Completion { workspace, json } => {
                let root = workspace.canonicalize()?;
                let report = completion_audit(&root)?;
                if json {
                    println!("{}", serde_json::to_string_pretty(&report)?);
                } else {
                    println!("{}", report["state"].as_str().unwrap_or("evaluation_error"));
                }
                if report["state"] != "pass" {
                    std::process::exit(2);
                }
            }
        },
        Command::Release { command } => match command {
            ReleaseCommand::Verify { profile, json } => {
                let root = std::env::current_dir()?.canonicalize()?;
                let mut checks = Vec::new();
                let mind = root.join("registry/minds/lmp-protocol-core");
                let profile_status = validate_package_dir(&mind)
                    .map(|_| package_signature_status_with_revocation(&mind, None))
                    .and_then(|status| status)
                    .map(|status| {
                        if status == "verified" {
                            "pass"
                        } else {
                            "blocked"
                        }
                    });
                checks.push(serde_json::json!({
                    "id": "signed-self-hosting-mind",
                    "status": profile_status.as_ref().map(|value| *value).unwrap_or("blocked"),
                    "path": "registry/minds/lmp-protocol-core",
                }));

                let self_check = ProcessCommand::new(std::env::current_exe()?)
                    .args(["self-check", "--workspace", ".", "--json"])
                    .current_dir(&root)
                    .output();
                let self_check_status = match &self_check {
                    Ok(output) if output.status.success() => "pass",
                    Ok(output) => {
                        let report =
                            serde_json::from_slice::<serde_json::Value>(&output.stdout).ok();
                        if report
                            .as_ref()
                            .and_then(|value| value.get("scopes"))
                            .and_then(serde_json::Value::as_array)
                            .is_some_and(|scopes| {
                                scopes
                                    .iter()
                                    .any(|scope| scope["state"] == "needs_revision")
                            })
                        {
                            "needs_revision"
                        } else {
                            "blocked"
                        }
                    }
                    Err(_) => "error",
                };
                checks.push(serde_json::json!({
                    "id": "self-hosting-evaluation",
                    "status": self_check_status,
                    "exitCode": self_check.as_ref().ok().and_then(|output| output.status.code()),
                }));

                if profile == "ci" || profile == "release-candidate" {
                    let fmt = cargo_command()
                        .args(["fmt", "--all", "--", "--check"])
                        .current_dir(&root)
                        .output();
                    checks.push(serde_json::json!({
                        "id": "rust-format",
                        "status": match &fmt {
                            Ok(output) if output.status.success() => "pass",
                            Ok(_) => "needs_revision",
                            Err(_) => "error",
                        },
                        "exitCode": fmt.as_ref().ok().and_then(|output| output.status.code()),
                    }));

                    let tests = cargo_command()
                        .args(["test", "--workspace", "--locked"])
                        .current_dir(&root)
                        .output();
                    checks.push(serde_json::json!({
                        "id": "workspace-tests",
                        "status": match &tests {
                            Ok(output) if output.status.success() => "pass",
                            Ok(_) => "needs_revision",
                            Err(_) => "error",
                        },
                        "exitCode": tests.as_ref().ok().and_then(|output| output.status.code()),
                    }));
                }

                if profile == "release-candidate" {
                    for id in [
                        "cross-platform-artifacts",
                        "deployment",
                        "independent-review",
                    ] {
                        checks.push(serde_json::json!({
                            "id": id,
                            "status": "blocked",
                            "reason": "Required external evidence is not present in this checkout"
                        }));
                    }
                }

                let decision = if checks
                    .iter()
                    .any(|check| check["status"] == "needs_revision")
                {
                    "NEEDS_REVISION"
                } else if checks.iter().any(|check| check["status"] == "error") {
                    "EVALUATION_ERROR"
                } else if checks.iter().any(|check| check["status"] == "blocked") {
                    "BLOCKED"
                } else if profile == "local" {
                    "LOCAL_QUALIFIED"
                } else if profile == "ci" {
                    "CI_QUALIFIED"
                } else if profile == "release-candidate" {
                    "RELEASE_CANDIDATE_QUALIFIED"
                } else {
                    "BLOCKED"
                };
                let result = serde_json::json!({
                    "decision": decision,
                    "profile": profile,
                    "checks": checks,
                    "limitations": [
                        "Qualification is scoped to this profile and checkout.",
                        "Release-candidate status remains blocked until external deployment, cross-platform artifacts, and independent review evidence are supplied."
                    ]
                });
                if json {
                    println!("{}", serde_json::to_string_pretty(&result)?);
                } else {
                    println!("{decision}");
                }
                if decision == "NEEDS_REVISION"
                    || decision == "BLOCKED"
                    || decision == "EVALUATION_ERROR"
                {
                    std::process::exit(2);
                }
            }
        },
        Command::Verify {
            path,
            public_key,
            revocation_list,
        } => {
            let manifest = if path.is_dir() {
                path.join("mind.json")
            } else {
                path
            };
            validate_package_dir(&manifest)
                .map_err(|e| anyhow::anyhow!("invalid mind package: {e}"))?;
            let package_dir = manifest.parent().unwrap_or(std::path::Path::new("."));
            if public_key.is_none() {
                println!(
                    "{{\"signatureStatus\":\"{}\"}}",
                    package_signature_status_with_revocation(
                        package_dir,
                        revocation_list.as_deref()
                    )?
                );
                return Ok(());
            }
            if let Some(key_path) = public_key {
                let signature_path = package_dir.join("signatures/manifest.sig");
                if !signature_path.exists() || !key_path.exists() {
                    println!("{{\"signatureStatus\":\"unsigned\"}}");
                } else {
                    let payload = std::fs::read(&manifest)?;
                    let signature = std::fs::read_to_string(signature_path)?;
                    let key = std::fs::read_to_string(key_path)?;
                    verify_package_signature_with_revocation(
                        &payload,
                        signature.trim(),
                        key.trim(),
                        revocation_list.as_deref(),
                    )
                    .map_err(|e| anyhow::anyhow!("signature verification failed: {e}"))?;
                    println!("{{\"signatureStatus\":\"verified\"}}");
                }
            }
        }
        Command::FleetValidate { graph } => {
            let graph: RoleGraph = serde_json::from_str(&std::fs::read_to_string(graph)?)?;
            let order = graph.execution_order()?;
            println!(
                "{}",
                serde_json::to_string_pretty(&serde_json::json!({
                    "status": "valid",
                    "version": graph.version,
                    "executionOrder": order,
                }))?
            );
        }
        Command::FleetMerge { graph, reports } => {
            let graph: RoleGraph = serde_json::from_str(&std::fs::read_to_string(graph)?)?;
            let reports: Vec<RoleReport> =
                serde_json::from_str(&std::fs::read_to_string(reports)?)?;
            let run: FleetRun = graph.merge_reports(reports)?;
            println!("{}", serde_json::to_string_pretty(&run)?);
            if !matches!(run.state, lmp_core::fleet::FleetState::Pass) {
                std::process::exit(1);
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::configured_mode_from_text;

    #[test]
    fn configured_mode_accepts_only_known_modes() {
        assert_eq!(
            configured_mode_from_text(r#"{"defaultMode":"enforced"}"#).as_deref(),
            Some("enforced")
        );
        assert_eq!(
            configured_mode_from_text(r#"{"defaultMode":"unsafe"}"#),
            None
        );
        assert_eq!(configured_mode_from_text("not json"), None);
    }
}
