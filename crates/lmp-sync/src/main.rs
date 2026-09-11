use anyhow::{Context, Result};
use clap::Parser;
use lmp_core::{
    crypto::{package_signature_status, MindPackageVerifier},
    registry, validate_package_dir,
};
use serde::Deserialize;
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Parser, Debug)]
#[command(
    name = "lmp-sync",
    version,
    about = "Fetches, verifies, and installs local or static LMP Mind profiles"
)]
struct Args {
    /// A checked-out local registry directory.
    #[arg(short, long, default_value = "./registry/definitions")]
    registry: String,
    /// A static JSON registry index served by an edge host.
    #[arg(long, conflicts_with = "registry")]
    registry_url: Option<String>,
    #[arg(short, long)]
    mind_id: String,
    #[arg(short, long, default_value = "./.lending-mind/registry")]
    output_dir: PathBuf,
    /// IPFS gateway template used when an index entry has an ipfsCid. Repeat
    /// the flag to configure ordered fallback gateways.
    #[arg(
        long,
        value_name = "URL",
        default_value = "https://ipfs.io/ipfs/{cid}",
        action = clap::ArgAction::Append
    )]
    ipfs_gateway: Vec<String>,
    /// Out-of-band Ed25519 trust anchor for the static registry entry.
    #[arg(long)]
    trusted_public_key: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistryIndex {
    schema_version: String,
    entries: Vec<RegistryEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistryEntry {
    id: String,
    version: String,
    manifest_url: Option<String>,
    ipfs_cid: Option<String>,
    digest: Option<String>,
    signature: Option<String>,
    public_key: Option<String>,
    /// Optional complete package file descriptors. When present, static sync
    /// installs the validated package instead of the legacy manifest-only form.
    package_files: Option<Vec<PackageFile>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackageFile {
    path: String,
    url: String,
    digest: String,
}

fn main() -> Result<()> {
    let args = Args::parse();
    if let Some(index_url) = args.registry_url.as_deref() {
        sync_static(index_url, &args)
    } else {
        sync_local(Path::new(&args.registry), &args.mind_id, &args.output_dir)
    }
}

fn sync_local(registry_root: &Path, mind_id: &str, output_dir: &Path) -> Result<()> {
    validate_selector(mind_id)?;
    let source_dir = registry_root.join(mind_id);
    let package_profile = PathBuf::from(format!("./packages/create-lmp/profiles/{mind_id}"));
    let source = if source_dir.join("mind.json").is_file() {
        source_dir
    } else if registry_root.join(format!("{mind_id}.json")).is_file() {
        registry_root.join(format!("{mind_id}.json"))
    } else if package_profile.join("mind.json").is_file() {
        package_profile
    } else {
        anyhow::bail!(
            "mind profile '{mind_id}' was not found in {} or bundled onboarding profiles",
            registry_root.display()
        );
    };
    let mind = validate_package_dir(&source)
        .with_context(|| format!("failed to load profile {}", source.display()))?;
    anyhow::ensure!(
        selector_matches_package(mind_id, &mind.id),
        "selected mind '{}' does not match package identity '{}'",
        mind_id,
        mind.id
    );
    let destination = if source.is_dir() {
        anyhow::ensure!(
            package_signature_status(&source)? != "invalid",
            "refusing to synchronize a package with an invalid signature"
        );
        registry::install(&source, output_dir)?
    } else {
        registry::install_manifest(&source, output_dir)?
    };
    println!(
        "✅ Synced {} ({}) to {}",
        mind.id,
        mind.version,
        destination.display()
    );
    Ok(())
}

fn sync_static(index_url: &str, args: &Args) -> Result<()> {
    anyhow::ensure!(
        allowed_transport_url(index_url),
        "static registry URL must use HTTPS (loopback HTTP is allowed only for local tests)"
    );
    let client = ureq::AgentBuilder::new().user_agent("lmp-sync/0.1").build();
    let index: RegistryIndex = client
        .get(index_url)
        .call()
        .with_context(|| format!("failed to fetch static registry index {index_url}"))?
        .into_json()
        .context("static registry index is not valid JSON")?;
    anyhow::ensure!(
        index.schema_version == "1",
        "unsupported static registry schema version {}",
        index.schema_version
    );

    let entry = index
        .entries
        .into_iter()
        .find(|entry| entry.id == args.mind_id || entry.id.ends_with(&format!(":{}", args.mind_id)))
        .with_context(|| {
            format!(
                "mind profile '{}' was not found in {index_url}",
                args.mind_id
            )
        })?;
    let expected_digest = entry
        .digest
        .as_deref()
        .context("static registry entries must provide an immutable digest")?;
    let signature = entry
        .signature
        .as_deref()
        .context("static registry entries must provide an Ed25519 signature")?;
    let public_key = entry
        .public_key
        .as_deref()
        .context("static registry entries must provide an Ed25519 public key")?;
    let trusted_public_key = args
        .trusted_public_key
        .as_deref()
        .context("static sync requires an out-of-band --trusted-public-key trust anchor")?;
    anyhow::ensure!(
        public_key.eq_ignore_ascii_case(trusted_public_key),
        "static registry public key does not match the configured trust anchor"
    );
    let (payload, payload_url) = fetch_verified_payload(
        &client,
        &entry,
        &args.ipfs_gateway,
        expected_digest,
        signature,
        public_key,
    )?;

    let temporary = temporary_manifest_dir(&entry.id, &entry.version)?;
    let result = (|| {
        fs::write(temporary.join("mind.json"), &payload)
            .context("failed to stage static profile manifest")?;
        if let Some(files) = entry.package_files.as_deref() {
            fetch_package_files(&client, files, &temporary)?;
        }
        let package = lmp_core::load_package(&temporary.join("mind.json"))
            .context("static profile failed schema validation")?;
        anyhow::ensure!(
            package.id == entry.id && package.version == entry.version,
            "static profile identity does not match the selected registry entry"
        );
        if entry.package_files.is_some() {
            anyhow::ensure!(
                package_signature_status(&temporary)? != "invalid",
                "static profile package has an invalid signature"
            );
            registry::install(&temporary, &args.output_dir)
        } else {
            // Compatibility path for the original static index contract. It
            // installs only a validated manifest and cannot activate a full
            // enforcement package without package_files.
            registry::install_manifest(&temporary.join("mind.json"), &args.output_dir)
        }
    })();
    fs::remove_dir_all(&temporary).ok();
    let destination = result?;
    println!(
        "✅ Synced {} ({}) from {} to {}",
        entry.id,
        entry.version,
        payload_url,
        destination.display()
    );
    Ok(())
}

fn fetch_package_files(
    client: &ureq::Agent,
    files: &[PackageFile],
    destination: &Path,
) -> Result<()> {
    anyhow::ensure!(!files.is_empty(), "package_files must not be empty");
    let mut paths = std::collections::HashSet::new();
    for file in files {
        validate_package_relative_path(&file.path)?;
        anyhow::ensure!(
            paths.insert(file.path.clone()),
            "duplicate package file path: {}",
            file.path
        );
        anyhow::ensure!(
            allowed_transport_url(&file.url),
            "package file URL must use HTTPS (loopback HTTP is allowed only for local tests): {}",
            file.url
        );
        let response = client
            .get(&file.url)
            .call()
            .with_context(|| format!("failed to fetch package file {}", file.path))?;
        let mut payload = Vec::new();
        response
            .into_reader()
            .read_to_end(&mut payload)
            .with_context(|| format!("failed to read package file {}", file.path))?;
        let actual = format!("sha256:{}", MindPackageVerifier::compute_sha256(&payload));
        anyhow::ensure!(
            is_sha256_digest(&file.digest),
            "package file digest is not a SHA-256 digest: {}",
            file.path
        );
        anyhow::ensure!(
            digest_matches(&file.digest, &actual),
            "package file digest mismatch: {}",
            file.path
        );
        let output = destination.join(&file.path);
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(output, payload)?;
    }
    Ok(())
}

fn validate_package_relative_path(value: &str) -> Result<()> {
    let path = Path::new(value);
    anyhow::ensure!(
        !value.is_empty()
            && !path.is_absolute()
            && !path.components().any(|component| {
                matches!(
                    component,
                    std::path::Component::ParentDir | std::path::Component::RootDir
                )
            }),
        "package file path is unsafe: {value}"
    );
    anyhow::ensure!(
        value != "mind.json",
        "package_files must not replace the signed manifest"
    );
    Ok(())
}

fn digest_matches(expected: &str, actual: &str) -> bool {
    expected
        .strip_prefix("sha256:")
        .unwrap_or(expected)
        .eq_ignore_ascii_case(actual.strip_prefix("sha256:").unwrap_or(actual))
}

fn is_sha256_digest(value: &str) -> bool {
    let value = value.strip_prefix("sha256:").unwrap_or(value);
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn validate_selector(selector: &str) -> Result<()> {
    anyhow::ensure!(!selector.is_empty(), "mind selector cannot be empty");
    anyhow::ensure!(
        selector != "." && selector != ".." && !selector.contains('/') && !selector.contains('\\'),
        "mind selector cannot contain path separators or dot paths"
    );
    Ok(())
}

fn selector_matches_package(selector: &str, package_id: &str) -> bool {
    package_id == selector || package_id.ends_with(&format!(":{selector}"))
}

fn validate_path_component(label: &str, value: &str) -> Result<()> {
    anyhow::ensure!(!value.is_empty(), "{label} cannot be empty");
    anyhow::ensure!(
        value != "." && value != ".." && !value.contains('/') && !value.contains('\\'),
        "{label} cannot contain path separators or dot paths"
    );
    Ok(())
}

fn fetch_verified_payload(
    client: &ureq::Agent,
    entry: &RegistryEntry,
    ipfs_gateways: &[String],
    expected_digest: &str,
    signature: &str,
    public_key: &str,
) -> Result<(Vec<u8>, String)> {
    let mut candidates = Vec::new();
    let mut failures = Vec::new();
    if let Some(url) = entry.manifest_url.as_deref() {
        candidates.push(url.to_string());
    }
    if let Some(cid) = entry.ipfs_cid.as_deref() {
        for gateway in ipfs_gateways {
            if let Err(error) = validate_ipfs_gateway(gateway) {
                failures.push(format!("{gateway}: {error}"));
                continue;
            }
            candidates.push(gateway.replace("{cid}", cid));
        }
    }
    if candidates.is_empty() && failures.is_empty() {
        anyhow::bail!("registry entry has neither manifestUrl nor ipfsCid");
    }
    for payload_url in candidates {
        if !allowed_transport_url(&payload_url) {
            failures.push(format!("{payload_url}: insecure transport rejected"));
            continue;
        }
        let response = match client.get(&payload_url).call() {
            Ok(response) => response,
            Err(error) => {
                failures.push(format!("{payload_url}: fetch failed: {error}"));
                continue;
            }
        };
        let mut payload = Vec::new();
        if let Err(error) = response.into_reader().read_to_end(&mut payload) {
            failures.push(format!("{payload_url}: read failed: {error}"));
            continue;
        }
        let actual_digest = MindPackageVerifier::compute_sha256(&payload);
        if actual_digest != expected_digest {
            failures.push(format!(
                "{payload_url}: digest mismatch (expected {expected_digest}, received {actual_digest})"
            ));
            continue;
        }
        if let Err(error) =
            MindPackageVerifier::verify_package_signature(&payload, signature, public_key)
        {
            failures.push(format!(
                "{payload_url}: signature verification failed: {error}"
            ));
            continue;
        }
        return Ok((payload, payload_url));
    }
    anyhow::bail!(
        "all static profile sources failed verification: {}",
        failures.join("; ")
    )
}

fn allowed_transport_url(value: &str) -> bool {
    if value.starts_with("https://") {
        return true;
    }
    let Some(authority) = value
        .strip_prefix("http://")
        .and_then(|rest| rest.split('/').next())
    else {
        return false;
    };
    authority.starts_with("127.0.0.1:")
        || authority.starts_with("localhost:")
        || authority.starts_with("[::1]:")
}

fn validate_ipfs_gateway(value: &str) -> Result<()> {
    anyhow::ensure!(
        value.contains("{cid}"),
        "IPFS gateway must contain a {{cid}} placeholder"
    );
    anyhow::ensure!(
        allowed_transport_url(value),
        "IPFS gateway must use HTTPS (loopback HTTP is allowed only for local tests)"
    );
    Ok(())
}

fn temporary_manifest_dir(id: &str, version: &str) -> Result<PathBuf> {
    validate_path_component("registry entry id", id)?;
    validate_path_component("registry entry version", version)?;
    let safe_id = id.replace(':', "-");
    for attempt in 0..8 {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .context("system clock is before Unix epoch")?
            .as_nanos();
        let directory =
            std::env::temp_dir().join(format!("lmp-sync-{safe_id}-{version}-{nonce}-{attempt}"));
        match fs::create_dir(&directory) {
            Ok(()) => return Ok(directory),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(error).context("failed to create temporary manifest directory")
            }
        }
    }
    anyhow::bail!("failed to allocate a unique temporary manifest directory")
}

#[cfg(test)]
mod tests {
    use super::{
        allowed_transport_url, digest_matches, is_sha256_digest, selector_matches_package,
        validate_ipfs_gateway, validate_package_relative_path, validate_selector,
    };

    #[test]
    fn rejects_path_like_local_selectors() {
        for selector in ["", ".", "..", "../outside", "nested/name", "nested\\name"] {
            assert!(validate_selector(selector).is_err(), "{selector}");
        }
        assert!(validate_selector("tj-ponytail").is_ok());
        assert!(validate_selector("lmp:mind:tj-ponytail").is_ok());
    }

    #[test]
    fn binds_local_selector_to_the_loaded_package_identity() {
        assert!(selector_matches_package(
            "tj-ponytail",
            "lmp:mind:tj-ponytail"
        ));
        assert!(selector_matches_package(
            "lmp:mind:tj-ponytail",
            "lmp:mind:tj-ponytail"
        ));
        assert!(!selector_matches_package("tj-ponytail", "lmp:mind:other"));
    }

    #[test]
    fn rejects_insecure_remote_registry_transports_but_allows_loopback_tests() {
        assert!(allowed_transport_url(
            "https://registry.example/registry.json"
        ));
        assert!(allowed_transport_url(
            "http://127.0.0.1:18765/registry.json"
        ));
        assert!(allowed_transport_url(
            "http://localhost:18765/registry.json"
        ));
        assert!(!allowed_transport_url(
            "http://registry.example/registry.json"
        ));
        assert!(!allowed_transport_url("file:///tmp/registry.json"));
    }

    #[test]
    fn validates_ordered_ipfs_gateway_templates() {
        assert!(validate_ipfs_gateway("https://ipfs.example/ipfs/{cid}").is_ok());
        assert!(validate_ipfs_gateway("http://127.0.0.1:18765/ipfs/{cid}").is_ok());
        assert!(validate_ipfs_gateway("https://ipfs.example/ipfs/cid").is_err());
        assert!(validate_ipfs_gateway("http://registry.example/ipfs/{cid}").is_err());
    }

    #[test]
    fn accepts_prefixed_or_unprefixed_sha256_file_digests() {
        let digest = "a".repeat(64);
        assert!(digest_matches(&digest, &format!("sha256:{digest}")));
        assert!(digest_matches(
            &format!("sha256:{}", digest.to_uppercase()),
            &digest
        ));
        assert!(!digest_matches(&"b".repeat(64), &digest));
        assert!(is_sha256_digest(&digest));
        assert!(is_sha256_digest(&format!("sha256:{digest}")));
        assert!(!is_sha256_digest("abc"));
    }

    #[test]
    fn rejects_package_paths_that_can_replace_or_escape_the_manifest() {
        for path in [
            "",
            "mind.json",
            "../guidance.md",
            "/tmp/guidance.md",
            "rules/../x",
        ] {
            assert!(validate_package_relative_path(path).is_err(), "{path}");
        }
        validate_package_relative_path("rules/complexity.json").expect("safe package path");
    }
}
