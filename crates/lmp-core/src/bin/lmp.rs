use anyhow::Result;
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
        #[arg(long, default_value = "advisory")]
        mode: String,
        #[arg(long)]
        artifact_dir: Option<PathBuf>,
        #[arg(long)]
        json: bool,
        #[arg(long, help = "Evaluate only files changed from Git HEAD or --base")]
        changed_only: bool,
        #[arg(long, help = "Git revision used as the delta comparison base")]
        base: Option<String>,
    },
    Instructions {
        #[arg(long)]
        mind: PathBuf,
    },
    Validate {
        path: PathBuf,
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

const EMBEDDED_BASELINE: &[(&str, &[u8])] = &[
    (
        "SKILL.md",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../skills/baseline/SKILL.md"
        )),
    ),
    (
        "evidence.json",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../skills/baseline/evidence.json"
        )),
    ),
    (
        "evidence/README.md",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../skills/baseline/evidence/README.md"
        )),
    ),
    (
        "guidance.md",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../skills/baseline/guidance.md"
        )),
    ),
    (
        "mind.json",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../skills/baseline/mind.json"
        )),
    ),
    (
        "release.json",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../skills/baseline/release.json"
        )),
    ),
    (
        "rules/commands.json",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../skills/baseline/rules/commands.json"
        )),
    ),
    (
        "rules/complexity.json",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../skills/baseline/rules/complexity.json"
        )),
    ),
    (
        "rules/dependencies.json",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../skills/baseline/rules/dependencies.json"
        )),
    ),
    (
        "rules/manifest.json",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../skills/baseline/rules/manifest.json"
        )),
    ),
    (
        "rules/typescript.json",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../skills/baseline/rules/typescript.json"
        )),
    ),
    (
        "signature.txt",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../skills/baseline/signature.txt"
        )),
    ),
    (
        "signatures/manifest.sig",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../skills/baseline/signatures/manifest.sig"
        )),
    ),
    (
        "signatures/public-key.hex",
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../skills/baseline/signatures/public-key.hex"
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
        .unwrap_or_else(|| PathBuf::from("./skills/baseline"))
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
                "skills/baseline"
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
        } => {
            anyhow::ensure!(
                ["advisory", "enforced", "audit"].contains(&mode.as_str()),
                "invalid mode: {mode}"
            );
            let mind = mind.unwrap_or_else(configured_mind);
            let report = evaluator::evaluate_with_options(
                &mind,
                &workspace,
                &mode,
                artifact_dir.as_deref(),
                EvaluationOptions {
                    changed_only,
                    git_base: base.as_deref(),
                    ast_cache_dir: None,
                },
            )?;
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
        Command::Instructions { mind } => println!("{}", compiler::compile(&mind)?.instructions),
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
