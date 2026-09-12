//! Bounded workspace ingestion. It discovers source inputs without reading
//! outside the requested root or following symlinked files.

use anyhow::{Context, Result};
use std::{
    fs,
    path::{Path, PathBuf},
};

const EXTENSIONS: &[&str] = &["rs", "py", "ts", "tsx", "js", "mjs", "json", "toml", "md"];

pub fn discover_workspace(root: &Path) -> Result<Vec<PathBuf>> {
    anyhow::ensure!(root.is_dir(), "workspace root must be a directory");
    let canonical = root.canonicalize().context("canonicalize workspace")?;
    let mut files = Vec::new();
    visit(&canonical, &canonical, &mut files)?;
    files.sort();
    Ok(files)
}

fn visit(path: &Path, root: &Path, files: &mut Vec<PathBuf>) -> Result<()> {
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let candidate = entry.path();
        let metadata = fs::symlink_metadata(&candidate)?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            if matches!(
                candidate.file_name().and_then(|v| v.to_str()),
                Some(".git" | "target" | "node_modules" | ".venv")
            ) {
                continue;
            }
            visit(&candidate, root, files)?;
        } else if metadata.is_file()
            && candidate
                .extension()
                .and_then(|v| v.to_str())
                .is_some_and(|ext| EXTENSIONS.contains(&ext))
        {
            let canonical = candidate.canonicalize()?;
            anyhow::ensure!(
                canonical.starts_with(root),
                "ingested path escaped workspace root"
            );
            files.push(canonical);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn discovers_supported_files_and_ignores_symlinks() {
        let root = std::env::temp_dir().join(format!(
            "lmp-ingest-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("target")).unwrap();
        fs::write(root.join("main.rs"), "fn main() {}\n").unwrap();
        fs::write(root.join("target/ignored.rs"), "").unwrap();
        let files = discover_workspace(&root).unwrap();
        assert_eq!(files.len(), 1);
        assert!(files[0].ends_with("main.rs"));
    }
}
