use anyhow::{Context, Result};
use clap::Parser;
use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
use rand_core::OsRng;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(
    name = "mind-signer",
    about = "Cryptographic Manifest Signer for Lending-Mind Protocol"
)]
struct CliArgs {
    #[arg(short, long, help = "Path to the raw input target mind json profile")]
    input: PathBuf,

    #[arg(short, long, help = "Output directory for keys and signature assets")]
    output_dir: PathBuf,

    #[arg(
        long,
        help = "Optional existing private key file path (forces reproduction run instead of gen)"
    )]
    private_key: Option<PathBuf>,
}

fn main() -> Result<()> {
    let args = CliArgs::parse();
    fs::create_dir_all(&args.output_dir).context("Failed to provision output directory target.")?;
    let signatures_dir = args.output_dir.join("signatures");
    fs::create_dir_all(&signatures_dir)?;

    // 1. Resolve or Generate the Cryptographic Identity Master Key
    let signing_key = match args.private_key {
        Some(key_path) => {
            let metadata = fs::symlink_metadata(&key_path)
                .with_context(|| format!("Could not inspect private key source: {key_path:?}"))?;
            if metadata.file_type().is_symlink() {
                anyhow::bail!("Private key source must not be a symlink: {key_path:?}");
            }
            let key_bytes =
                fs::read(&key_path).context("Could not read private key source layer.")?;
            let key_array: [u8; 32] = key_bytes
                .as_slice()
                .try_into()
                .context("Private key must be 32 bytes.")?;
            SigningKey::from_bytes(&key_array)
        }
        None => {
            println!("🔑 Generating a brand new secure Ed25519 Identity Keypair...");
            let mut csprng = OsRng;
            let key = SigningKey::generate(&mut csprng);

            // Persist private key safely inside the designated output dir
            let prv_path = args.output_dir.join("lmp_identity.priv");
            write_private_key(&prv_path, &key.to_bytes())?;
            println!("💾 Secure private key written to: {:?}", prv_path);
            key
        }
    };

    // Export the public key layer for registry trust anchorage tracking
    let verifying_key: VerifyingKey = signing_key.verifying_key();
    let pub_path = signatures_dir.join("public-key.hex");
    let pub_hex = format!("0x{}", hex_encode(verifying_key.as_bytes()));
    fs::write(&pub_path, &pub_hex)?;
    println!("🔓 Public Identity Key Layer exported to: {:?}", pub_path);
    println!("   ↳ Value: {}", pub_hex);

    // 2. Read Target Skill JSON Manifest Payload
    let manifest_bytes = fs::read(&args.input).with_context(|| {
        format!(
            "Failed to ingest target payload config file from: {:?}",
            args.input
        )
    })?;

    // 3. Generate Cryptographic Signature Over Payload Bytes
    let signature = signing_key.sign(&manifest_bytes);
    let sig_hex = format!("0x{}", hex_encode(&signature.to_bytes()));

    let sig_path = signatures_dir.join("manifest.sig");
    fs::write(&sig_path, &sig_hex)?;
    println!(
        "✍️  Detached Signature Layer generated successfully: {:?}",
        sig_path
    );
    println!("   ↳ Signature: {}", sig_hex);

    println!("\n🛡️  [SIGN COMPLETE]: Manifest package sealed cleanly and ready for decentralized sync delivery distribution!");
    Ok(())
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn write_private_key(path: &PathBuf, bytes: &[u8; 32]) -> Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(path)
        .with_context(|| format!("Refusing to overwrite private key: {path:?}"))?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}
