use anyhow::{Context, Result};
use clap::Parser;
use lmp_core::evaluator::{self, EvaluationOptions};
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde_json::json;
use std::fs::{self, OpenOptions};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc::{channel, RecvTimeoutError},
};
use std::time::Duration;

static SHUTDOWN_REQUESTED: AtomicBool = AtomicBool::new(false);
static RELOAD_REQUESTED: AtomicBool = AtomicBool::new(false);

#[cfg(unix)]
extern "C" fn handle_signal(_: libc::c_int) {
    SHUTDOWN_REQUESTED.store(true, Ordering::SeqCst);
}

#[cfg(unix)]
extern "C" fn handle_reload(_: libc::c_int) {
    RELOAD_REQUESTED.store(true, Ordering::SeqCst);
}

#[derive(Parser, Debug)]
#[command(
    name = "lmpd",
    version,
    about = "Lending-Mind workspace validation daemon"
)]
struct Args {
    #[arg(short, long, default_value = "./profiles/baseline/mind.json")]
    mind: PathBuf,
    #[arg(short, long)]
    workspace: Option<PathBuf>,
    #[arg(long = "mind-select")]
    mind_select: Option<String>,
    #[arg(long, default_value = "enforced", value_parser = ["advisory", "enforced", "audit"])]
    mode: String,
    /// Evaluate the workspace once and exit instead of starting the watcher.
    #[arg(long)]
    once: bool,
    /// Store the running process ID at this path so lifecycle commands can address it.
    #[arg(long)]
    pid_file: Option<PathBuf>,
    /// Report whether the process named by --pid-file is running.
    #[arg(long, conflicts_with_all = ["stop", "reload"])]
    status: bool,
    /// Send SIGTERM to the process named by --pid-file.
    #[arg(long, conflicts_with_all = ["status", "reload"])]
    stop: bool,
    /// Send SIGHUP to the process named by --pid-file and request re-evaluation.
    #[arg(long, conflicts_with_all = ["status", "stop"])]
    reload: bool,
}

#[cfg(unix)]
type ProcessId = libc::pid_t;

#[cfg(windows)]
type ProcessId = u32;

fn read_pid(path: &Path) -> Result<ProcessId> {
    let value = fs::read_to_string(path)
        .with_context(|| format!("failed to read PID file {}", path.display()))?;
    let pid: ProcessId = value
        .trim()
        .parse()
        .with_context(|| format!("PID file {} does not contain a valid PID", path.display()))?;
    anyhow::ensure!(
        pid > 0,
        "PID file {} contains a non-positive PID",
        path.display()
    );
    Ok(pid)
}

#[cfg(unix)]
fn process_is_alive(pid: ProcessId) -> bool {
    let result = unsafe { libc::kill(pid, 0) };
    result == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

#[cfg(windows)]
fn process_is_alive(pid: ProcessId) -> bool {
    std::process::Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH"])
        .output()
        .map(|output| {
            output.status.success()
                && String::from_utf8_lossy(&output.stdout).contains(&pid.to_string())
        })
        .unwrap_or(false)
}

#[cfg(windows)]
fn stop_process(pid: ProcessId) -> Result<()> {
    let status = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .status()
        .context("failed to invoke taskkill")?;
    anyhow::ensure!(status.success(), "taskkill failed for process {pid}");
    Ok(())
}

fn lifecycle_command(args: &Args) -> Result<()> {
    let pid_file = args
        .pid_file
        .as_deref()
        .context("--pid-file is required for --status, --stop, or --reload")?;
    let pid = match read_pid(pid_file) {
        Ok(pid) => pid,
        Err(error)
            if error
                .downcast_ref::<std::io::Error>()
                .is_some_and(|e| e.kind() == ErrorKind::NotFound) =>
        {
            if args.status {
                println!("{}", json!({"status": "stopped", "pidFile": pid_file}));
                return Ok(());
            }
            return Err(error);
        }
        Err(error) => return Err(error),
    };
    let alive = process_is_alive(pid);
    if args.status {
        println!(
            "{}",
            json!({"status": if alive { "running" } else { "stale" }, "pid": pid, "pidFile": pid_file})
        );
        return Ok(());
    }
    if !alive {
        anyhow::bail!(
            "PID file {} refers to stopped process {}; remove the stale file",
            pid_file.display(),
            pid
        );
    }
    #[cfg(unix)]
    {
        let signal = if args.stop {
            libc::SIGTERM
        } else {
            libc::SIGHUP
        };
        anyhow::ensure!(
            unsafe { libc::kill(pid, signal) } == 0,
            "failed to signal process {pid}: {}",
            std::io::Error::last_os_error()
        );
    }
    #[cfg(windows)]
    {
        anyhow::ensure!(!args.reload, "--reload is not supported on Windows");
        stop_process(pid)?;
    }
    println!(
        "{}",
        json!({"status": "signal-sent", "signal": if args.stop { "SIGTERM" } else { "SIGHUP" }, "pid": pid, "pidFile": pid_file})
    );
    Ok(())
}

struct PidFileGuard(Option<PathBuf>);

impl Drop for PidFileGuard {
    fn drop(&mut self) {
        if let Some(path) = self.0.take() {
            let _ = fs::remove_file(path);
        }
    }
}

fn create_pid_file(path: &Path) -> Result<PidFileGuard> {
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create PID directory {}", parent.display()))?;
    }
    match OpenOptions::new().write(true).create_new(true).open(path) {
        Ok(file) => {
            let pid = std::process::id();
            use std::io::Write;
            let mut file = file;
            writeln!(file, "{pid}")?;
            Ok(PidFileGuard(Some(path.to_path_buf())))
        }
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {
            if let Ok(pid) = read_pid(path) {
                if process_is_alive(pid) {
                    anyhow::bail!("another lmpd process is already running with PID {pid}");
                }
            }
            fs::remove_file(path)
                .with_context(|| format!("failed to remove stale PID file {}", path.display()))?;
            create_pid_file(path)
        }
        Err(error) => {
            Err(error).with_context(|| format!("failed to create PID file {}", path.display()))
        }
    }
}

fn resolve_mind(args: &Args) -> Result<PathBuf> {
    let Some(alias) = args.mind_select.as_ref() else {
        return Ok(args.mind.clone());
    };
    [
        PathBuf::from(format!("./registry/definitions/{alias}")),
        PathBuf::from(format!("./packages/create-lmp/profiles/{alias}")),
        PathBuf::from(format!("./registry/definitions/{alias}.json")),
    ]
    .into_iter()
    .find(|path| path.is_file() || path.join("mind.json").is_file())
    .ok_or_else(|| anyhow::anyhow!("mind profile alias '{alias}' was not found"))
}

fn validate_workspace(mind_dir: &Path, workspace: &Path, mode: &str) -> Result<()> {
    let report = evaluator::evaluate_with_options(
        mind_dir,
        workspace,
        mode,
        None,
        EvaluationOptions {
            changed_only: true,
            git_base: None,
            ast_cache_dir: None,
        },
    )?;
    if report.findings.is_empty() {
        println!(
            "✅ {} aligned with {}",
            workspace.display(),
            report.package_id
        );
    } else {
        eprintln!(
            "🚨 {}: {} finding(s)",
            workspace.display(),
            report.findings.len()
        );
        for finding in report.findings {
            eprintln!(" - [{}] {}", finding.rule_id, finding.message);
        }
        if mode == "enforced" {
            anyhow::bail!("enforced workspace evaluation rejected the workspace");
        }
    }
    Ok(())
}

fn is_relevant_event(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
    )
}

fn handle_event(event: Event, mind_dir: &Path, workspace: &Path, mode: &str) -> Result<()> {
    if !is_relevant_event(&event.kind) {
        return Ok(());
    }
    validate_workspace(mind_dir, workspace, mode)
}

fn handle_reload_error(error: anyhow::Error, mode: &str) -> Result<()> {
    eprintln!("❌ reload evaluation failed: {error:#}");
    if mode == "enforced" {
        return Err(error);
    }
    Ok(())
}

fn handle_watcher_error(error: notify::Error, mode: &str) -> Result<()> {
    eprintln!("❌ filesystem watcher failed: {error:#}");
    if mode == "enforced" {
        return Err(anyhow::anyhow!("filesystem watcher failed: {error:#}"));
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn release_startup_memory() {
    // The initial evaluation allocates transient parser and report buffers.
    // Return free glibc heap pages before measuring or entering the idle loop.
    #[cfg(unix)]
    unsafe {
        libc::malloc_trim(0);
    }
}

#[cfg(not(target_os = "linux"))]
fn release_startup_memory() {}

fn main() -> Result<()> {
    let args = Args::parse();
    if args.status || args.stop || args.reload {
        return lifecycle_command(&args);
    }
    let workspace = args
        .workspace
        .as_deref()
        .context("--workspace is required when running the daemon")?;
    let mind_path = resolve_mind(&args)?;
    let mind_manifest = if mind_path.is_dir() {
        mind_path.join("mind.json")
    } else {
        mind_path.clone()
    };
    lmp_core::validate_package_dir(&mind_manifest)
        .with_context(|| format!("failed to load mind profile: {}", mind_path.display()))?;

    validate_workspace(
        mind_manifest.parent().unwrap_or(Path::new(".")),
        workspace,
        &args.mode,
    )?;
    if args.once {
        return Ok(());
    }

    let _pid_file = args.pid_file.as_deref().map(create_pid_file).transpose()?;

    release_startup_memory();

    #[cfg(unix)]
    unsafe {
        anyhow::ensure!(
            libc::signal(
                libc::SIGINT,
                handle_signal as *const () as libc::sighandler_t,
            ) != libc::SIG_ERR,
            "failed to install SIGINT handler"
        );
        anyhow::ensure!(
            libc::signal(
                libc::SIGTERM,
                handle_signal as *const () as libc::sighandler_t,
            ) != libc::SIG_ERR,
            "failed to install SIGTERM handler"
        );
        anyhow::ensure!(
            libc::signal(
                libc::SIGHUP,
                handle_reload as *const () as libc::sighandler_t,
            ) != libc::SIG_ERR,
            "failed to install SIGHUP handler"
        );
    }
    let (sender, receiver) = channel();
    let mut watcher = RecommendedWatcher::new(sender, Config::default())?;
    watcher.watch(workspace, RecursiveMode::Recursive)?;

    println!(
        "🛡️  lmpd watching {} using Mind Package {}",
        workspace.display(),
        mind_manifest.display()
    );
    while !SHUTDOWN_REQUESTED.load(Ordering::SeqCst) {
        if RELOAD_REQUESTED.swap(false, Ordering::SeqCst) {
            if let Err(error) = validate_workspace(
                mind_manifest.parent().unwrap_or(Path::new(".")),
                workspace,
                &args.mode,
            ) {
                handle_reload_error(error, &args.mode)?;
            } else {
                println!("🔄 lmpd reloaded and re-evaluated {}", workspace.display());
            }
        }
        match receiver.recv_timeout(Duration::from_millis(250)) {
            Ok(result) => match result {
                Ok(event) => {
                    if let Err(error) = handle_event(
                        event,
                        mind_manifest.parent().unwrap_or(Path::new(".")),
                        workspace,
                        &args.mode,
                    ) {
                        eprintln!("❌ workspace evaluation failed: {error:#}");
                        if args.mode == "enforced" {
                            return Err(error);
                        }
                    }
                }
                Err(error) => handle_watcher_error(error, &args.mode)?,
            },
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
    println!("🛑 lmpd stopped cleanly");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{CreateKind, ModifyKind, RemoveKind};

    #[test]
    fn revalidates_created_modified_and_removed_paths() {
        assert!(is_relevant_event(&EventKind::Create(CreateKind::File)));
        assert!(is_relevant_event(&EventKind::Modify(ModifyKind::Any)));
        assert!(is_relevant_event(&EventKind::Remove(RemoveKind::File)));
    }

    #[test]
    fn ignores_non_workspace_mutation_events() {
        assert!(!is_relevant_event(&EventKind::Access(
            notify::event::AccessKind::Any
        )));
    }

    #[test]
    fn enforced_reload_errors_stop_the_daemon() {
        let error = anyhow::anyhow!("reload finding");
        assert!(handle_reload_error(error, "enforced").is_err());
    }

    #[test]
    fn advisory_reload_errors_are_logged_without_stopping() {
        let error = anyhow::anyhow!("reload finding");
        assert!(handle_reload_error(error, "advisory").is_ok());
    }

    #[test]
    fn enforced_watcher_errors_stop_the_daemon() {
        let error = notify::Error::generic("watch backend failed");
        assert!(handle_watcher_error(error, "enforced").is_err());
    }

    #[test]
    fn advisory_watcher_errors_do_not_stop_the_daemon() {
        let error = notify::Error::generic("watch backend failed");
        assert!(handle_watcher_error(error, "advisory").is_ok());
    }
}
