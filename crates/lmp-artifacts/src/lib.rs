//! Artifact integrity and privacy validation shared by release tooling.

use anyhow::{ensure, Result};
use serde_json::Value;
use sha2::{Digest, Sha256};

pub fn validate_redacted_artifact(artifact: &Value) -> Result<()> {
    ensure!(artifact.is_object(), "artifact must be an object");
    ensure!(
        artifact.get("mind").is_some(),
        "artifact Mind metadata is required"
    );
    ensure!(
        artifact.get("checks").is_some(),
        "artifact checks are required"
    );
    ensure!(
        artifact.get("state").and_then(Value::as_str).is_some(),
        "artifact decision is required"
    );
    let privacy = artifact
        .get("privacy")
        .and_then(Value::as_object)
        .ok_or_else(|| anyhow::anyhow!("artifact privacy metadata is required"))?;
    for key in ["sourceCodeIncluded", "rawPathsIncluded", "networkUsed"] {
        ensure!(
            privacy.get(key).and_then(Value::as_bool) == Some(false),
            "artifact privacy boundary failed: {key}"
        );
    }
    Ok(())
}

pub fn digest(artifact: &Value) -> String {
    let bytes = serde_json::to_vec(artifact).expect("JSON values are serializable");
    format!("sha256:{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid() -> Value {
        serde_json::json!({"mind": {}, "checks": [], "state": "pass", "privacy": {"sourceCodeIncluded": false, "rawPathsIncluded": false, "networkUsed": false}})
    }

    #[test]
    fn accepts_redacted_artifact_and_returns_digest() {
        let artifact = valid();
        validate_redacted_artifact(&artifact).unwrap();
        assert!(digest(&artifact).starts_with("sha256:"));
    }

    #[test]
    fn rejects_artifact_that_contains_source() {
        let mut artifact = valid();
        artifact["privacy"]["sourceCodeIncluded"] = Value::Bool(true);
        assert!(validate_redacted_artifact(&artifact).is_err());
    }
}
