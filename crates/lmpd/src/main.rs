use anyhow::{Context, Result};
use clap::Parser;
use lmp_core::{ast::audit_source, load_mind, MindSchema};
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::channel;

#[derive(Parser, Debug)]
#[command(
    name = "lmpd",
    version,
    about = "Lending-Mind workspace validation daemon"
)]
struct Args {
    #[arg(
        short,
        long,
        default_value = "./.lmp_telemetry/minds/local-baseline.json"
    )]
    mind: PathBuf,
    #[arg(short, long)]
    workspace: PathBuf,
    #[arg(long = "mind-select")]
    mind_select: Option<String>,
}

fn resolve_mind(args: &Args) -> PathBuf {
    args.mind_select
        .as_ref()
        .map(|alias| PathBuf::from(format!("./registry/definitions/{alias}.json")))
        .filter(|path| path.exists())
        .unwrap_or_else(|| args.mind.clone())
}

fn validate_file(path: &Path, mind: &MindSchema) -> Result<()> {
    let source = fs::read_to_string(path)
        .with_context(|| format!("failed to read changed Rust file: {}", path.display()))?;
    let violations = audit_source(
        &source,
        mind.telemetry_metrics.max_cyclomatic_complexity,
        &mind.telemetry_metrics.forbidden_ast_nodes,
    )?;

    if violations.is_empty() {
        println!("✅ {} aligned with {}", path.display(), mind.id);
    } else {
        eprintln!("🚨 {}\n - {}", path.display(), violations.join("\n - "));
    }
    Ok(())
}

fn handle_event(event: Event, mind: &MindSchema) {
    if !matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
        return;
    }
    for path in event
        .paths
        .into_iter()
        .filter(|path| path.extension().is_some_and(|ext| ext == "rs"))
    {
        if let Err(error) = validate_file(&path, mind) {
            eprintln!("❌ {}: {error:#}", path.display());
        }
    }
}

fn main() -> Result<()> {
    let args = Args::parse();
    let mind_path = resolve_mind(&args);
    let mind = load_mind(&mind_path)
        .with_context(|| format!("failed to load mind profile: {}", mind_path.display()))?;
    let (sender, receiver) = channel();
    let mut watcher = RecommendedWatcher::new(sender, Config::default())?;
    watcher.watch(&args.workspace, RecursiveMode::Recursive)?;

    println!(
        "🛡️  lmpd watching {} with {}",
        args.workspace.display(),
        mind.id
    );
    for result in receiver {
        match result {
            Ok(event) => handle_event(event, &mind),
            Err(error) => eprintln!("❌ watcher error: {error}"),
        }
    }
    Ok(())
}
