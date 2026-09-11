use anyhow::{Context, Result};
use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Debug, Clone)]
pub struct ScopeSelection {
    pub files: Vec<PathBuf>,
    pub changed_only: bool,
    pub source: &'static str,
    pub fallback_reason: Option<String>,
}

fn git(workspace: &Path, args: &[&str]) -> Result<std::process::Output> {
    Command::new("git")
        .arg("-C")
        .arg(workspace)
        .args(args)
        .output()
        .with_context(|| format!("failed to invoke git in {}", workspace.display()))
}

fn git_paths(workspace: &Path, base: Option<&str>) -> Result<Vec<PathBuf>> {
    let diff_args = if let Some(base) = base {
        vec!["diff", "--name-only", "--diff-filter=ACMRTUXB", base, "--"]
    } else {
        vec![
            "diff",
            "--name-only",
            "--diff-filter=ACMRTUXB",
            "HEAD",
            "--",
        ]
    };
    let diff = git(workspace, &diff_args)?;
    if !diff.status.success() {
        anyhow::bail!(
            "git diff failed: {}",
            String::from_utf8_lossy(&diff.stderr).trim()
        );
    }
    let untracked = git(workspace, &["ls-files", "--others", "--exclude-standard"])?;
    if !untracked.status.success() {
        anyhow::bail!(
            "git ls-files failed: {}",
            String::from_utf8_lossy(&untracked.stderr).trim()
        );
    }
    let mut paths = BTreeSet::new();
    for bytes in [diff.stdout, untracked.stdout] {
        for relative in String::from_utf8_lossy(&bytes)
            .lines()
            .filter(|line| !line.is_empty())
        {
            let candidate = workspace.join(relative);
            if candidate.is_file() {
                paths.insert(candidate);
            }
        }
    }
    Ok(paths.into_iter().collect())
}

pub fn select(
    workspace: &Path,
    changed_only: bool,
    base: Option<&str>,
    all_files: Vec<PathBuf>,
) -> ScopeSelection {
    if !changed_only {
        return ScopeSelection {
            files: all_files,
            changed_only: false,
            source: "workspace",
            fallback_reason: None,
        };
    }
    match git_paths(workspace, base) {
        Ok(files) => ScopeSelection {
            files,
            changed_only: true,
            source: "git-diff",
            fallback_reason: None,
        },
        Err(error) => ScopeSelection {
            files: all_files,
            changed_only: false,
            source: "workspace-fallback",
            fallback_reason: Some(error.to_string()),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::select;
    use std::{fs, path::PathBuf, process::Command};

    fn temp_repo(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("lmp-scope-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        Command::new("git")
            .args(["init", "-q"])
            .current_dir(&path)
            .status()
            .unwrap();
        Command::new("git")
            .args(["config", "user.email", "lmp@test.invalid"])
            .current_dir(&path)
            .status()
            .unwrap();
        Command::new("git")
            .args(["config", "user.name", "LMP Test"])
            .current_dir(&path)
            .status()
            .unwrap();
        path
    }

    #[test]
    fn selects_modified_and_untracked_files_from_git() {
        let repo = temp_repo("delta");
        fs::write(repo.join("stable.rs"), "fn stable() {}\n").unwrap();
        Command::new("git")
            .args(["add", "."])
            .current_dir(&repo)
            .status()
            .unwrap();
        Command::new("git")
            .args(["commit", "-qm", "initial"])
            .current_dir(&repo)
            .status()
            .unwrap();
        fs::write(repo.join("stable.rs"), "fn changed() {}\n").unwrap();
        fs::write(repo.join("new.rs"), "fn new_file() {}\n").unwrap();
        let all = vec![repo.join("stable.rs"), repo.join("new.rs")];
        let selection = select(&repo, true, None, all);
        assert_eq!(selection.source, "git-diff");
        assert!(selection.files.contains(&repo.join("stable.rs")));
        assert!(selection.files.contains(&repo.join("new.rs")));
        let _ = fs::remove_dir_all(repo);
    }

    #[test]
    fn falls_back_to_full_scope_when_workspace_is_not_git() {
        let root = std::env::temp_dir().join(format!("lmp-scope-fallback-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let file = root.join("file.rs");
        fs::write(&file, "fn main() {}\n").unwrap();
        let selection = select(&root, true, None, vec![file.clone()]);
        assert_eq!(selection.source, "workspace-fallback");
        assert_eq!(selection.files, vec![file]);
        let _ = fs::remove_dir_all(root);
    }
}
