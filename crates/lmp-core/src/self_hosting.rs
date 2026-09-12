//! Parsed, bounded configuration for applying LMP to its own repository.
//!
//! This module deliberately validates the contract before any evaluation is
//! started. It does not grant the configuration authority to weaken package
//! rules or global safety invariants.

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelfHostingConfig {
    pub version: u32,
    pub mind: MindPin,
    pub repository: RepositoryScope,
    pub validation: ValidationPolicy,
    pub limits: ResourceLimits,
    pub security: SecurityPolicy,
    pub global_invariants: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MindPin {
    pub id: String,
    pub version: String,
    pub digest: String,
    pub path: PathBuf,
    pub require_signature: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositoryScope {
    pub root: PathBuf,
    pub allowed_paths: Vec<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationPolicy {
    pub mode: String,
    pub rust: Vec<String>,
    pub python: Vec<String>,
    pub node: Vec<String>,
    pub max_command_duration_seconds: u64,
    pub max_output_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceLimits {
    pub max_files: u64,
    pub max_source_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityPolicy {
    pub network: String,
    pub redact_artifacts: bool,
    pub raw_source_in_artifacts: bool,
    pub absolute_paths_in_artifacts: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MindLock {
    pub version: u32,
    pub minds: std::collections::HashMap<String, LockedMind>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LockedMind {
    pub id: String,
    pub version: String,
    pub digest: String,
}

pub fn load(root: &Path) -> Result<SelfHostingConfig> {
    let path = root.join(".lmp/config.toml");
    let text = fs::read_to_string(&path)
        .with_context(|| format!("failed to read self-hosting config {}", path.display()))?;
    let config: SelfHostingConfig = toml::from_str(&text)
        .with_context(|| format!("invalid self-hosting TOML {}", path.display()))?;
    validate(&config)
}

pub fn load_lock(root: &Path) -> Result<MindLock> {
    let path = root.join(".lmp/minds.lock");
    let text = fs::read_to_string(&path)
        .with_context(|| format!("failed to read Mind lock {}", path.display()))?;
    toml::from_str(&text).with_context(|| format!("invalid Mind lock {}", path.display()))
}

pub fn validate_lock(lock: &MindLock, mind: &MindPin) -> Result<()> {
    anyhow::ensure!(
        lock.version == 1,
        "unsupported Mind lock version {}",
        lock.version
    );
    anyhow::ensure!(
        lock.minds.values().any(|entry| {
            entry.id == mind.id && entry.version == mind.version && entry.digest == mind.digest
        }),
        "self-hosting Mind pin is missing or mismatched in the lock file"
    );
    Ok(())
}

pub fn load_overrides(root: &Path) -> Result<toml::Value> {
    let path = root.join(".lmp/policy-overrides.toml");
    let text = fs::read_to_string(&path)
        .with_context(|| format!("failed to read policy overrides {}", path.display()))?;
    let value: toml::Value = toml::from_str(&text)
        .with_context(|| format!("invalid policy overrides {}", path.display()))?;
    if value.get("global_invariants").is_some() || value.get("security").is_some() {
        bail!("policy overrides cannot redefine global invariants or security policy");
    }
    Ok(value)
}

pub fn validate(config: &SelfHostingConfig) -> Result<SelfHostingConfig> {
    validate_impl(config)
}

fn validate_impl(config: &SelfHostingConfig) -> Result<SelfHostingConfig> {
    if config.version != 1 {
        bail!("unsupported self-hosting config version {}", config.version);
    }
    if !config.mind.id.starts_with("lmp:mind:") || config.mind.digest.len() < 16 {
        bail!("self-hosting Mind pin requires canonical id and digest");
    }
    if config.mind.path.is_absolute()
        || config
            .mind
            .path
            .components()
            .any(|part| part.as_os_str() == "..")
    {
        bail!("self-hosting Mind path must remain relative to repository root");
    }
    if config.validation.mode != "enforced" {
        bail!("self-hosting validation must be enforced");
    }
    if config.security.network != "disabled"
        || !config.security.redact_artifacts
        || config.security.raw_source_in_artifacts
        || config.security.absolute_paths_in_artifacts
    {
        bail!("self-hosting security policy must disable network and redact artifacts");
    }
    if config.repository.allowed_paths.is_empty() {
        bail!("self-hosting scope must contain allowed paths");
    }
    for path in &config.repository.allowed_paths {
        if path.is_absolute() || path.components().any(|part| part.as_os_str() == "..") {
            bail!("self-hosting allowed paths must remain relative to repository root");
        }
    }
    if config.validation.max_command_duration_seconds == 0
        || config.validation.max_output_bytes == 0
        || config.limits.max_files == 0
        || config.limits.max_source_bytes == 0
    {
        bail!("self-hosting resource limits must be positive");
    }
    if config.global_invariants.is_empty() {
        bail!("self-hosting must declare global invariants");
    }
    Ok(config.clone())
}

pub fn validate_scope_limits(path: &Path, limits: &ResourceLimits) -> Result<()> {
    let mut files = 0u64;
    let mut bytes = 0u64;
    validate_scope_limits_impl(path, limits, &mut files, &mut bytes)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandExecution {
    pub command: String,
    pub status: String,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub elapsed_ms: u128,
}

/// Execute only explicitly configured, shell-free commands under bounded limits.
/// The evaluator never accepts arbitrary command strings from a Mind package.
pub fn run_configured_commands(
    root: &Path,
    config: &ValidationPolicy,
) -> Result<Vec<CommandExecution>> {
    let commands = config
        .rust
        .iter()
        .chain(config.python.iter())
        .chain(config.node.iter());
    commands
        .map(|command| run_configured_command(root, command, config))
        .collect()
}

fn run_configured_command(
    root: &Path,
    command: &str,
    config: &ValidationPolicy,
) -> Result<CommandExecution> {
    let parts = command.split_whitespace().collect::<Vec<_>>();
    anyhow::ensure!(!parts.is_empty(), "configured command cannot be empty");
    anyhow::ensure!(
        matches!(parts[0], "cargo" | "python3" | "python" | "pnpm" | "node"),
        "configured command executable is not allowlisted: {}",
        parts[0]
    );
    for argument in &parts[1..] {
        let path = Path::new(argument);
        anyhow::ensure!(
            !path.is_absolute() && !path.components().any(|part| part.as_os_str() == ".."),
            "configured command argument escapes the workspace: {argument}"
        );
    }
    let toolchain_path = |tool: &str| {
        Command::new("rustup")
            .args(["which", tool, "--toolchain", "1.98.1"])
            .output()
            .ok()
            .filter(|output| output.status.success())
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|path| PathBuf::from(path.trim()))
            .filter(|path| path.is_file())
    };
    let executable = if parts[0] == "cargo" {
        toolchain_path("cargo").unwrap_or_else(|| PathBuf::from(parts[0]))
    } else {
        PathBuf::from(parts[0])
    };
    let started = Instant::now();
    let mut command_builder = Command::new(executable);
    command_builder
        .args(&parts[1..])
        .current_dir(root)
        .env_clear()
        .env("PATH", std::env::var_os("PATH").unwrap_or_default())
        .env("LMP_NETWORK", "disabled")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(rustc) = toolchain_path("rustc") {
        command_builder.env("RUSTC", rustc);
    }
    if let Some(rustdoc) = toolchain_path("rustdoc") {
        command_builder.env("RUSTDOC", rustdoc);
    }
    let mut child = command_builder
        .spawn()
        .with_context(|| format!("failed to start configured command: {command}"))?;
    let deadline = Duration::from_secs(config.max_command_duration_seconds);
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break (if status.success() {
                "pass"
            } else {
                "needs_revision"
            })
            .to_string();
        }
        if started.elapsed() >= deadline {
            child.kill()?;
            break "blocked".to_string();
        }
        thread::sleep(Duration::from_millis(25));
    };
    let output = child.wait_with_output()?;
    let limit = config.max_output_bytes as usize;
    let redact = |text: String| {
        text.lines()
            .map(|line| {
                let lower = line.to_ascii_lowercase();
                if ["password", "secret", "token", "private_key", "api_key"]
                    .iter()
                    .any(|marker| lower.contains(marker))
                {
                    "[REDACTED]".to_string()
                } else {
                    line.replace(root.to_string_lossy().as_ref(), ".")
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    };
    let truncate = |bytes: Vec<u8>| {
        let bounded = bytes.into_iter().take(limit).collect::<Vec<_>>();
        redact(String::from_utf8_lossy(&bounded).into_owned())
    };
    Ok(CommandExecution {
        command: command.to_string(),
        status,
        exit_code: output.status.code(),
        stdout: truncate(output.stdout),
        stderr: truncate(output.stderr),
        elapsed_ms: started.elapsed().as_millis(),
    })
}

fn validate_scope_limits_impl(
    path: &Path,
    limits: &ResourceLimits,
    files: &mut u64,
    bytes: &mut u64,
) -> Result<()> {
    if path.is_symlink() {
        return Ok(());
    }
    if path.is_dir() {
        for entry in fs::read_dir(path)? {
            validate_scope_limits_impl(&entry?.path(), limits, files, bytes)?;
        }
        return Ok(());
    }
    *files = files.saturating_add(1);
    *bytes = bytes.saturating_add(fs::metadata(path)?.len());
    anyhow::ensure!(
        *files <= limits.max_files,
        "self-hosting scope exceeds max_files ({})",
        limits.max_files
    );
    anyhow::ensure!(
        *bytes <= limits.max_source_bytes,
        "self-hosting scope exceeds max_source_bytes ({})",
        limits.max_source_bytes
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        load, run_configured_commands, validate, validate_lock, validate_scope_limits,
        SelfHostingConfig, ValidationPolicy,
    };
    use std::fs;
    use std::path::Path;

    #[test]
    fn loads_checked_in_configuration() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let config = load(&root).expect("checked-in self-hosting config should parse");
        assert_eq!(config.validation.mode, "enforced");
    }

    #[test]
    fn rejects_security_weakening() {
        let mut config: SelfHostingConfig =
            toml::from_str(include_str!("../../../.lmp/config.toml")).unwrap();
        config.security.network = "enabled".into();
        assert!(validate(&config).is_err());
    }

    #[test]
    fn rejects_mind_paths_that_escape_the_repository() {
        let mut config: SelfHostingConfig =
            toml::from_str(include_str!("../../../.lmp/config.toml")).unwrap();
        config.mind.path = "../outside".into();
        assert!(validate(&config).is_err());
    }

    #[test]
    fn requires_the_pinned_mind_in_the_lock() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let config = load(&root).unwrap();
        let lock = super::load_lock(&root).unwrap();
        validate_lock(&lock, &config.mind).unwrap();

        let mut pin = config.mind;
        pin.digest = "sha256:wrong".into();
        assert!(validate_lock(&lock, &pin).is_err());
    }

    #[test]
    fn enforces_scope_resource_limits() {
        let root = std::env::temp_dir().join(format!("lmp-self-hosting-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("source.rs"), "fn main() {}\n").unwrap();
        let limits = super::ResourceLimits {
            max_files: 1,
            max_source_bytes: 1024,
        };
        validate_scope_limits(&root, &limits).unwrap();
        let too_small = super::ResourceLimits {
            max_files: 0,
            max_source_bytes: 1024,
        };
        assert!(validate_scope_limits(&root, &too_small).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn configured_commands_are_allowlisted_and_timeout_bounded() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let rejected = ValidationPolicy {
            mode: "enforced".into(),
            rust: vec!["sh -c true".into()],
            python: vec![],
            node: vec![],
            max_command_duration_seconds: 1,
            max_output_bytes: 1024,
        };
        assert!(run_configured_commands(&root, &rejected).is_err());

        let escaped = ValidationPolicy {
            mode: "enforced".into(),
            rust: vec!["cargo metadata --manifest-path ../outside/Cargo.toml".into()],
            python: vec![],
            node: vec![],
            max_command_duration_seconds: 1,
            max_output_bytes: 1024,
        };
        assert!(run_configured_commands(&root, &escaped).is_err());

        let sleep_root =
            std::env::temp_dir().join(format!("lmp-command-timeout-{}", std::process::id()));
        fs::create_dir_all(&sleep_root).unwrap();
        fs::write(sleep_root.join("sleep.py"), "import time\ntime.sleep(2)\n").unwrap();
        let bounded = ValidationPolicy {
            mode: "enforced".into(),
            rust: vec![],
            python: vec!["python3 sleep.py".into()],
            node: vec![],
            max_command_duration_seconds: 1,
            max_output_bytes: 1024,
        };
        let results = run_configured_commands(&sleep_root, &bounded).unwrap();
        assert_eq!(results[0].status, "blocked");
        fs::remove_dir_all(sleep_root).unwrap();
    }
}
