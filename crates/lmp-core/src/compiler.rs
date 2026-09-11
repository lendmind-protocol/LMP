use crate::MindPackage;
use anyhow::{Context, Result};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProfileLayer {
    pub name: String,
    pub digest: String,
    pub size_bytes: usize,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct InstructionBundle {
    pub mind: MindPackage,
    pub instructions: String,
    pub guidance: Vec<String>,
    pub rules: Vec<Value>,
    pub digest: String,
    pub layers: Vec<ProfileLayer>,
}

fn manifest_path(dir: &Path) -> PathBuf {
    let mind = dir.join("mind.json");
    if mind.exists() {
        mind
    } else {
        dir.join("package.json")
    }
}

pub fn compile(dir: &Path) -> Result<InstructionBundle> {
    let path = manifest_path(dir);
    let mind = crate::validate_package_dir(dir)
        .with_context(|| format!("failed to load {}", path.display()))?;
    let guidance_text = fs::read_to_string(dir.join("guidance.md")).unwrap_or_default();
    let guidance = guidance_text
        .lines()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect::<Vec<_>>();
    let mut rules = Vec::new();
    let mut layers = vec![ProfileLayer {
        name: "guidance.md".into(),
        digest: format!(
            "sha256:{}",
            crate::crypto::MindPackageVerifier::compute_sha256(guidance_text.as_bytes())
        ),
        size_bytes: guidance_text.len(),
    }];
    for declared in mind.enforcement.values() {
        let policy_text = fs::read_to_string(dir.join(declared))?;
        let value: Value = serde_json::from_str(&policy_text)
            .with_context(|| format!("invalid policy {}", declared))?;
        rules.push(value);
        layers.push(ProfileLayer {
            name: declared.clone(),
            digest: format!(
                "sha256:{}",
                crate::crypto::MindPackageVerifier::compute_sha256(policy_text.as_bytes())
            ),
            size_bytes: policy_text.len(),
        });
    }
    let mut sections = vec![format!("# {}", mind.name.as_deref().unwrap_or(&mind.id))];
    if let Some(description) = &mind.description {
        sections.push(description.clone());
    }
    sections.extend(guidance.iter().cloned());
    sections.push("Run the relevant checks before reporting completion.".into());
    let instructions = sections.join("\n");
    let digest = source_digest(dir, &mind)?;
    Ok(InstructionBundle {
        mind,
        instructions,
        guidance,
        rules,
        digest,
        layers,
    })
}

pub fn compile_cached(dir: &Path, cache_dir: &Path) -> Result<InstructionBundle> {
    let manifest = manifest_path(dir);
    let mind = crate::validate_package_dir(dir)
        .with_context(|| format!("failed to load {}", manifest.display()))?;
    let digest = source_digest(dir, &mind)?;
    fs::create_dir_all(cache_dir)?;
    let cache_path = cache_dir.join(format!("{}.bin", digest.replace(':', "_")));
    if let Ok(bytes) = fs::read(&cache_path) {
        if let Ok(bundle) = bincode::deserialize::<InstructionBundle>(&bytes) {
            return Ok(bundle);
        }
    }
    let bundle = compile(dir)?;
    fs::write(&cache_path, bincode::serialize(&bundle)?)?;
    Ok(bundle)
}

fn source_digest(dir: &Path, mind: &MindPackage) -> Result<String> {
    let manifest = manifest_path(dir);
    let mut bytes = fs::read(manifest)?;
    bytes.extend_from_slice(&fs::read(dir.join("SKILL.md")).unwrap_or_default());
    bytes.extend_from_slice(&fs::read(dir.join("guidance.md")).unwrap_or_default());
    bytes.extend_from_slice(&fs::read(dir.join("rules/manifest.json")).unwrap_or_default());
    let mut policies = mind.enforcement.values().cloned().collect::<Vec<_>>();
    policies.sort();
    for policy in policies {
        bytes.extend_from_slice(policy.as_bytes());
        bytes.extend_from_slice(&fs::read(dir.join(&policy))?);
    }
    Ok(format!(
        "sha256:{}",
        crate::crypto::MindPackageVerifier::compute_sha256(&bytes)
    ))
}

#[cfg(test)]
mod tests {
    use super::compile_cached;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn compiles_profile_into_content_addressed_binary_cache() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let package = std::env::temp_dir().join(format!("lmp-profile-{suffix}"));
        let cache = package.join("cache");
        fs::create_dir_all(package.join("evidence")).unwrap();
        fs::write(package.join("mind.json"), r#"{"$schema":"https://lmp-six.vercel.app/schema/mind-v1.json","specVersion":"1.0","id":"lmp:mind:cache","version":"1.0.0","modeDefaults":{"validation":"advisory","network":"offline"},"author":{"kind":"community-archetype","displayName":"Test","verified":false,"website":null},"provenance":{"sources":[],"attributionRequired":false},"philosophy":{"principles":[],"tradeoffs":[],"decisionRules":[],"antiPatterns":[]},"capabilities":{"languages":["rust"],"requiredAgentTools":[]},"enforcement":{"style":"style.json"}}"#).unwrap();
        fs::write(
            package.join("SKILL.md"),
            "Run LMP evaluation before finishing.\n",
        )
        .unwrap();
        fs::write(package.join("guidance.md"), "Prefer explicit boundaries.\n").unwrap();
        fs::write(package.join("evidence/README.md"), "evidence\n").unwrap();
        fs::write(
            package.join("evidence.json"),
            r#"{"status":"verified-fixtures","tests":[{"id":"clean","kind":"positive","description":"Clean fixture","expected":"pass"},{"id":"violation","kind":"negative","description":"Violation fixture","expected":"needs_revision"},{"id":"exception","kind":"exception","description":"Exception fixture","expected":"blocked"}],"notes":"Compiler test fixture."}"#,
        )
        .unwrap();
        fs::write(
            package.join("release.json"),
            r#"{"packageId":"lmp:mind:cache","version":"1.0.0","changelog":["Initial test fixture"],"limitations":["Test-only package"],"review":{"status":"unreviewed","reviewers":[],"notes":"Fixture is not an endorsement."}}"#,
        )
        .unwrap();
        fs::create_dir_all(package.join("rules")).unwrap();
        fs::write(
            package.join("rules/manifest.json"),
            r#"{"schemaVersion":"1.0","rules":[{"id":"style.boundary","policyFile":"style.json","severity":"warning","classification":"verifiable","rationale":"Keep the fixture bounded.","assertion":"The style policy is present.","scope":["test fixture"],"remediation":"Update the style policy.","limitations":["Test-only contract."],"evidence":{"classification":"verified-fixture","sourceId":"evidence.json"}}]}"#,
        )
        .unwrap();
        fs::write(package.join("style.json"), r#"{"max":10}"#).unwrap();
        let first = compile_cached(&package, &cache).unwrap();
        let second = compile_cached(&package, &cache).unwrap();
        assert_eq!(first.digest, second.digest);
        assert_eq!(first.layers.len(), 2);
        assert!(fs::read_dir(&cache).unwrap().any(|entry| entry
            .unwrap()
            .path()
            .extension()
            .is_some_and(|ext| ext == "bin")));
        let _ = fs::remove_dir_all(package);
    }
}
