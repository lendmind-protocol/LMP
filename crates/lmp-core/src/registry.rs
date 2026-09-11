use anyhow::{Context, Result};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

/// Validated, offline profile installation. Remote transports deliberately
/// belong outside the core runtime and must be added as explicit adapters.
pub fn install(source: &Path, root: &Path) -> Result<PathBuf> {
    reject_symlink(source, "package source")?;
    let manifest = source.join("mind.json");
    let package = crate::load_package(&manifest)
        .with_context(|| format!("invalid package {}", source.display()))?;
    let destination = package_destination(root, &package.id, &package.version)?;
    install_staged(source, &destination)
}

/// Installs a legacy single-manifest profile into the immutable package layout.
pub fn install_manifest(source: &Path, root: &Path) -> Result<PathBuf> {
    reject_symlink(source, "manifest source")?;
    let package = crate::load_package(source)
        .with_context(|| format!("invalid package manifest {}", source.display()))?;
    let destination = package_destination(root, &package.id, &package.version)?;
    let staging = unique_staging_path(
        destination
            .parent()
            .context("package destination has no parent directory")?,
        &package.version,
    )?;
    let parent = destination
        .parent()
        .context("package destination has no parent directory")?;
    create_directory_without_symlinks(parent)?;
    reject_symlink(&destination, "package destination")?;
    anyhow::ensure!(
        !destination.exists(),
        "package is immutable: {}",
        destination.display()
    );
    let lock = parent.join(format!(".{}.lmp-install-lock", package.version));
    fs::create_dir(&lock)
        .with_context(|| format!("installation lock exists: {}", lock.display()))?;
    let result = (|| {
        fs::create_dir(&staging)?;
        fs::copy(source, staging.join("mind.json"))?;
        fs::rename(&staging, &destination).with_context(|| {
            format!(
                "failed to atomically publish package {}",
                destination.display()
            )
        })?;
        Ok(destination.clone())
    })();
    if staging.exists() {
        fs::remove_dir_all(&staging).ok();
    }
    fs::remove_dir(&lock).ok();
    result
}

fn package_destination(root: &Path, id: &str, version: &str) -> Result<PathBuf> {
    validate_path_component("package id", id)?;
    validate_path_component("package version", version)?;
    create_directory_without_symlinks(root)?;
    let package_root = root.join(id);
    create_directory_without_symlinks(&package_root)?;
    reject_symlink(&package_root, "package destination")?;
    Ok(package_root.join(version))
}

fn validate_path_component(label: &str, value: &str) -> Result<()> {
    anyhow::ensure!(!value.is_empty(), "{label} cannot be empty");
    anyhow::ensure!(
        value != "." && value != "..",
        "{label} cannot be a dot path"
    );
    anyhow::ensure!(
        !value.contains('/') && !value.contains('\\'),
        "{label} cannot contain path separators"
    );
    Ok(())
}

fn copy_dir(source: &Path, destination: &Path) -> Result<()> {
    reject_symlink(source, "package source")?;
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let from = entry.path();
        let to = destination.join(entry.file_name());
        if entry.file_type()?.is_symlink() {
            anyhow::bail!("symlinks are not allowed: {}", from.display());
        }
        if from.is_dir() {
            copy_dir(&from, &to)?;
        } else {
            fs::copy(from, to)?;
        }
    }
    Ok(())
}

fn reject_symlink(path: &Path, label: &str) -> Result<()> {
    match path.symlink_metadata() {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() {
                anyhow::bail!("{label} cannot be a symlink: {}", path.display());
            }
            Ok(())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn create_directory_without_symlinks(path: &Path) -> Result<()> {
    if path.exists() {
        reject_symlink(path, "registry directory")?;
        anyhow::ensure!(
            path.is_dir(),
            "registry path is not a directory: {}",
            path.display()
        );
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        create_directory_without_symlinks(parent)?;
    }
    fs::create_dir(path)
        .with_context(|| format!("failed to create directory {}", path.display()))?;
    Ok(())
}

fn unique_staging_path(parent: &Path, version: &str) -> Result<PathBuf> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("system clock is before Unix epoch")?
        .as_nanos();
    Ok(parent.join(format!(".{version}.staging-{nonce}-{}", std::process::id())))
}

fn install_staged(source: &Path, destination: &Path) -> Result<PathBuf> {
    let parent = destination
        .parent()
        .context("package destination has no parent directory")?;
    create_directory_without_symlinks(parent)?;
    reject_symlink(destination, "package destination")?;
    anyhow::ensure!(
        !destination.exists(),
        "package is immutable: {}",
        destination.display()
    );

    let destination_name = destination
        .file_name()
        .context("package destination has no file name")?
        .to_string_lossy()
        .into_owned();
    let lock = parent.join(format!(".{destination_name}.lmp-install-lock"));
    fs::create_dir(&lock).with_context(|| {
        format!(
            "another installation is in progress or lock exists: {}",
            lock.display()
        )
    })?;
    let staging = unique_staging_path(parent, &destination_name)?;
    let result = (|| {
        fs::create_dir(&staging)?;
        copy_dir(source, &staging)?;
        anyhow::ensure!(
            !destination.exists(),
            "package is immutable: {}",
            destination.display()
        );
        fs::rename(&staging, destination).with_context(|| {
            format!(
                "failed to atomically publish package {}",
                destination.display()
            )
        })?;
        Ok(destination.to_path_buf())
    })();
    if staging.exists() {
        fs::remove_dir_all(&staging).ok();
    }
    fs::remove_dir(&lock).ok();
    result
}

#[cfg(test)]
mod tests {
    use super::{install, install_manifest, validate_path_component};
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temporary_root(label: &str) -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("lmp-registry-{label}-{nonce}"));
        fs::create_dir_all(&path).expect("temporary root");
        path
    }

    #[test]
    fn rejects_path_components_that_can_escape_the_registry_root() {
        for value in ["", ".", "..", "../outside", "nested/name", "nested\\name"] {
            assert!(
                validate_path_component("component", value).is_err(),
                "{value}"
            );
        }
    }

    #[test]
    fn installs_a_safe_manifest_under_the_immutable_layout() {
        let root = temporary_root("safe");
        let manifest = root.join("mind.json");
        fs::write(&manifest, r#"{"id":"lmp:mind:test","version":"1.0.0"}"#).expect("manifest");
        let output = root.join("output");
        let destination = install_manifest(&manifest, &output).expect("install");
        assert_eq!(destination, output.join("lmp:mind:test").join("1.0.0"));
        assert!(destination.join("mind.json").is_file());
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn refuses_a_manifest_with_a_path_like_identity() {
        let root = temporary_root("unsafe");
        let manifest = root.join("mind.json");
        fs::write(&manifest, r#"{"id":"../escape","version":"1.0.0"}"#).expect("manifest");
        let error = install_manifest(&manifest, &root.join("output"))
            .expect_err("path-like identity must be rejected");
        assert!(error.to_string().contains("package id"));
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlinked_destination_parent() {
        use std::os::unix::fs::symlink;

        let root = temporary_root("destination-symlink");
        let outside = temporary_root("destination-outside");
        let output = root.join("output");
        fs::create_dir_all(&output).expect("output");
        symlink(&outside, output.join("lmp:mind:test")).expect("destination symlink");
        let manifest = root.join("mind.json");
        fs::write(&manifest, r#"{"id":"lmp:mind:test","version":"1.0.0"}"#).expect("manifest");
        assert!(install_manifest(&manifest, &output).is_err());
        assert!(!outside.join("1.0.0/mind.json").exists());
        fs::remove_dir_all(root).expect("cleanup root");
        fs::remove_dir_all(outside).expect("cleanup outside");
    }

    #[cfg(unix)]
    #[test]
    fn failed_copy_does_not_leave_a_partial_immutable_package() {
        use std::os::unix::fs::symlink;

        let root = temporary_root("partial-source");
        let source = root.join("source");
        fs::create_dir_all(&source).expect("source");
        fs::write(
            source.join("mind.json"),
            r#"{"id":"lmp:mind:test","version":"1.0.0"}"#,
        )
        .expect("manifest");
        symlink(root.join("missing"), source.join("forbidden-link")).expect("source symlink");
        let output = root.join("output");
        assert!(install(&source, &output).is_err());
        assert!(!output.join("lmp:mind:test/1.0.0").exists());
        fs::remove_dir_all(root).expect("cleanup");
    }
}
