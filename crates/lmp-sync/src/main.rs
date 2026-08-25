use anyhow::{Context, Result};
use clap::Parser;
use lmp_core::load_mind;
use std::fs;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(
    name = "lmp-sync",
    version,
    about = "Copies and validates local Lending-Mind profiles"
)]
struct Args {
    #[arg(short, long, default_value = "./registry/definitions")]
    registry: PathBuf,
    #[arg(short, long)]
    mind_id: String,
    #[arg(short, long, default_value = "./.lmp_telemetry/minds")]
    output_dir: PathBuf,
}

fn main() -> Result<()> {
    let args = Args::parse();
    let source = args.registry.join(format!("{}.json", args.mind_id));
    let mind = load_mind(&source)
        .with_context(|| format!("failed to load profile {}", source.display()))?;
    fs::create_dir_all(&args.output_dir)?;
    let destination = args.output_dir.join(source.file_name().unwrap());
    fs::copy(&source, &destination)?;
    println!(
        "✅ Synced {} ({}) to {}",
        mind.id,
        mind.version,
        destination.display()
    );
    Ok(())
}
