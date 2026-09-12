use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

pub mod ast;
pub mod compiler;
pub mod crypto;
pub mod evaluator;
pub mod fleet;
pub mod registry;
pub mod scope;
pub mod self_hosting;
pub mod skills;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub enum VerificationStatus {
    Verified,
    Unverified,
    Tampered,
    SignatureMismatch,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TelemetryMetrics {
    pub max_cyclomatic_complexity: usize,
    pub forbidden_ast_nodes: Vec<String>,
}

impl Default for TelemetryMetrics {
    fn default() -> Self {
        Self {
            max_cyclomatic_complexity: 10,
            forbidden_ast_nodes: Vec::new(),
        }
    }
}

fn validate_rule_evidence_boundary(
    rule: &serde_json::Value,
    evidence: &serde_json::Map<String, serde_json::Value>,
) -> anyhow::Result<()> {
    let evidence_classification = evidence
        .get("classification")
        .and_then(serde_json::Value::as_str)
        .context("rule contract evidence classification is required")?;
    let rule_classification = rule
        .get("classification")
        .and_then(serde_json::Value::as_str)
        .context("rule contract classification is required")?;
    let severity = rule
        .get("severity")
        .and_then(serde_json::Value::as_str)
        .context("rule contract severity is required")?;
    anyhow::ensure!(
        evidence_classification != "unsupported",
        "unsupported evidence cannot define an enforcement rule"
    );
    anyhow::ensure!(
        !(evidence_classification == "inferred-hypothesis"
            && (severity == "error"
                || matches!(rule_classification, "deterministic" | "verifiable"))),
        "inferred hypothesis cannot become an enforced hard rule without reviewed evidence"
    );
    Ok(())
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct MindAxioms {
    pub data_locality: String,
    pub security_model: String,
    pub state_mutation: String,
    pub cognitive_biases: HashMap<String, Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MindSchema {
    pub id: String,
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default)]
    pub axioms: MindAxioms,
    #[serde(default)]
    pub telemetry_metrics: TelemetryMetrics,
    #[serde(default)]
    pub verification_status: Option<VerificationStatus>,
}

/// Canonical Rust runtime representation of a Mind Package.
/// Unknown fields are retained so profiles can evolve without requiring a
/// runtime release for every additive metadata field.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct MindPackage {
    #[serde(rename = "$schema", default)]
    pub schema: Option<String>,
    #[serde(default)]
    pub spec_version: Option<String>,
    pub id: String,
    pub version: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub mode_defaults: Option<ModeDefaults>,
    #[serde(default)]
    pub author: Option<Author>,
    #[serde(default)]
    pub provenance: Option<serde_json::Value>,
    #[serde(default)]
    pub philosophy: Option<Philosophy>,
    #[serde(default)]
    pub capabilities: Option<serde_json::Value>,
    #[serde(default)]
    pub enforcement: HashMap<String, String>,
    #[serde(default)]
    pub metadata: serde_json::Value,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModeDefaults {
    pub validation: String,
    pub network: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Author {
    pub kind: String,
    pub display_name: String,
    pub verified: bool,
    pub website: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Philosophy {
    #[serde(default)]
    pub principles: Vec<String>,
    #[serde(default)]
    pub tradeoffs: Vec<String>,
    #[serde(default)]
    pub decision_rules: Vec<String>,
    #[serde(default)]
    pub anti_patterns: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EvaluationState {
    Pass,
    NeedsRevision,
    Blocked,
    EvaluationError,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuleResult {
    pub rule_id: String,
    pub passed: bool,
    pub severity: String,
    pub message: String,
    #[serde(default)]
    pub evidence: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remediation: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationArtifact {
    pub artifact_version: String,
    pub run_id: String,
    pub created_at: String,
    pub workspace: serde_json::Value,
    pub mind: serde_json::Value,
    pub mode: String,
    pub state: EvaluationState,
    pub summary: serde_json::Value,
    pub checks: Vec<RuleResult>,
    pub skipped_checks: Vec<serde_json::Value>,
    pub loop_transitions: Vec<serde_json::Value>,
    pub commands: Vec<serde_json::Value>,
    pub limitations: Vec<String>,
    pub environment: serde_json::Value,
    pub privacy: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artifact_path: Option<String>,
}

fn default_version() -> String {
    "1.0.0".to_string()
}

fn canonical_semver(value: &str) -> bool {
    let core = value.split(['-', '+']).next().unwrap_or_default();
    let parts = core.split('.').collect::<Vec<_>>();
    parts.len() == 3
        && parts.iter().all(|part| {
            let part = *part;
            let normalized = part.trim_start_matches('0');
            !part.is_empty()
                && part.chars().all(|character| character.is_ascii_digit())
                && (part == normalized || part == "0")
        })
}

fn canonical_id(value: &str) -> bool {
    let suffix = value.strip_prefix("lmp:mind:").unwrap_or_default();
    !suffix.is_empty()
        && suffix.split('-').all(|part| {
            !part.is_empty()
                && part
                    .chars()
                    .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit())
        })
}

fn reject_unknown_fields(
    object: &serde_json::Map<String, serde_json::Value>,
    allowed: &[&str],
    context: &str,
) -> anyhow::Result<()> {
    for field in object.keys() {
        anyhow::ensure!(
            allowed.contains(&field.as_str()),
            "{context} contains unknown field: {field}"
        );
    }
    Ok(())
}

impl MindSchema {
    pub fn new(
        id: &str,
        version: &str,
        data_locality: &str,
        security_model: &str,
        state_mutation: &str,
    ) -> Self {
        Self {
            id: id.to_string(),
            version: version.to_string(),
            axioms: MindAxioms {
                data_locality: data_locality.to_string(),
                security_model: security_model.to_string(),
                state_mutation: state_mutation.to_string(),
                cognitive_biases: HashMap::new(),
            },
            telemetry_metrics: TelemetryMetrics {
                max_cyclomatic_complexity: 10,
                forbidden_ast_nodes: Vec::new(),
            },
            verification_status: Some(VerificationStatus::Unverified),
        }
    }

    pub fn validate_bounds(&self) -> bool {
        !self.id.is_empty()
            && !self.version.is_empty()
            && self.telemetry_metrics.max_cyclomatic_complexity > 0
    }
}

pub fn load_mind(path: &Path) -> anyhow::Result<MindSchema> {
    let mind: MindSchema = serde_json::from_str(&fs::read_to_string(path)?)?;
    anyhow::ensure!(mind.validate_bounds(), "invalid mind profile: {:?}", path);
    Ok(mind)
}

pub fn load_package(path: &Path) -> anyhow::Result<MindPackage> {
    let package: MindPackage = serde_json::from_str(&fs::read_to_string(path)?)?;
    anyhow::ensure!(
        !package.id.is_empty() && !package.version.is_empty(),
        "mind package requires id and version"
    );
    if let Some(author) = &package.author {
        anyhow::ensure!(
            !(author.kind == "community-archetype" && author.verified),
            "community archetypes cannot claim verified authorship"
        );
    }
    Ok(package)
}

pub fn validate_package_dir(dir: &Path) -> anyhow::Result<MindPackage> {
    validate_package_dir_impl(dir)
}

fn validate_package_dir_impl(dir: &Path) -> anyhow::Result<MindPackage> {
    let manifest = if dir.is_dir() {
        let mind = dir.join("mind.json");
        if mind.exists() {
            mind
        } else {
            dir.join("package.json")
        }
    } else {
        dir.to_path_buf()
    };
    let package = load_package(&manifest)?;
    let root = manifest.parent().unwrap_or(Path::new("."));
    if package.schema.is_some() && manifest.file_name().is_some_and(|name| name == "mind.json") {
        anyhow::ensure!(
            package.schema.as_deref().is_some_and(
                |schema| schema.starts_with("http://") || schema.starts_with("https://")
            ),
            "canonical package $schema must be an absolute URL"
        );
        anyhow::ensure!(
            package.spec_version.as_deref() == Some("1.0"),
            "canonical package specVersion must be 1.0"
        );
        anyhow::ensure!(
            canonical_id(&package.id),
            "canonical mind package IDs must use the lmp:mind:<kebab-case> form"
        );
        anyhow::ensure!(
            canonical_semver(&package.version),
            "canonical mind package versions must use semantic versioning (x.y.z)"
        );
        let mode_defaults = package
            .mode_defaults
            .as_ref()
            .context("canonical package modeDefaults is required")?;
        anyhow::ensure!(
            matches!(mode_defaults.validation.as_str(), "advisory" | "enforced" | "audit")
                && mode_defaults.network == "offline",
            "canonical package modeDefaults must use a supported validation mode and offline network"
        );
        anyhow::ensure!(
            package.author.is_some()
                && package
                    .provenance
                    .as_ref()
                    .is_some_and(serde_json::Value::is_object)
                && package.philosophy.is_some()
                && package
                    .capabilities
                    .as_ref()
                    .is_some_and(serde_json::Value::is_object),
            "canonical package requires author, provenance, philosophy, and capabilities"
        );
        if let Some(author) = &package.author {
            anyhow::ensure!(
                !(author.verified && author.kind != "official-maintainer"),
                "verified authorship requires the official-maintainer author kind"
            );
        }
        anyhow::ensure!(
            root.join("guidance.md").is_file(),
            "canonical package file is missing: guidance.md"
        );
        anyhow::ensure!(
            root.join("SKILL.md").is_file(),
            "canonical package file is missing: SKILL.md"
        );
        anyhow::ensure!(
            root.join("evidence/README.md").is_file(),
            "canonical package file is missing: evidence/README.md"
        );
        let release_path = root.join("release.json");
        anyhow::ensure!(
            release_path.is_file(),
            "canonical package file is missing: release.json"
        );
        let release: serde_json::Value = serde_json::from_str(&fs::read_to_string(&release_path)?)
            .context("canonical package release metadata is not valid JSON")?;
        anyhow::ensure!(
            release.get("packageId").and_then(serde_json::Value::as_str)
                == Some(package.id.as_str()),
            "canonical package release metadata packageId does not match manifest"
        );
        anyhow::ensure!(
            release.get("version").and_then(serde_json::Value::as_str)
                == Some(package.version.as_str()),
            "canonical package release metadata version does not match manifest"
        );
        anyhow::ensure!(
            release
                .get("changelog")
                .and_then(serde_json::Value::as_array)
                .is_some_and(|items| !items.is_empty())
                && release
                    .get("limitations")
                    .and_then(serde_json::Value::as_array)
                    .is_some_and(|items| !items.is_empty())
                && release
                    .get("review")
                    .and_then(serde_json::Value::as_object)
                    .is_some(),
            "canonical package release metadata requires changelog, limitations, and review"
        );
        let contracts_path = root.join("rules/manifest.json");
        anyhow::ensure!(
            contracts_path.is_file(),
            "canonical package file is missing: rules/manifest.json"
        );
        let contracts: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&contracts_path)?)
                .context("canonical package rule contract manifest is not valid JSON")?;
        anyhow::ensure!(
            contracts
                .get("schemaVersion")
                .and_then(serde_json::Value::as_str)
                == Some("1.0"),
            "canonical package rule contract manifest requires schemaVersion 1.0"
        );
        let contracts_object = contracts
            .as_object()
            .context("canonical package rule contract manifest must be an object")?;
        let source_backed = package
            .metadata
            .get("sourceRuleContractVersion")
            .and_then(serde_json::Value::as_str)
            == Some("1");
        reject_unknown_fields(
            contracts_object,
            &["schemaVersion", "rules"],
            "rule contract manifest",
        )?;
        let rules = contracts
            .get("rules")
            .and_then(serde_json::Value::as_array)
            .filter(|rules| !rules.is_empty())
            .context("canonical package rule contract manifest requires rules")?;
        let policy_files: std::collections::HashSet<&str> =
            package.enforcement.values().map(String::as_str).collect();
        for policy_file in policy_files {
            anyhow::ensure!(
                rules.iter().any(|rule| {
                    rule.get("policyFile").and_then(serde_json::Value::as_str) == Some(policy_file)
                }),
                "rule contract manifest does not cover {policy_file}"
            );
        }
        let mut rule_ids = std::collections::HashSet::new();
        for rule in rules {
            let rule_object = rule
                .as_object()
                .context("rule contract entries must be objects")?;
            reject_unknown_fields(
                rule_object,
                &[
                    "id",
                    "policyFile",
                    "severity",
                    "classification",
                    "rationale",
                    "assertion",
                    "scope",
                    "remediation",
                    "limitations",
                    "evidence",
                ],
                "rule contract",
            )?;
            for field in [
                "id",
                "policyFile",
                "severity",
                "classification",
                "rationale",
                "assertion",
                "scope",
                "remediation",
                "limitations",
                "evidence",
            ] {
                anyhow::ensure!(
                    rule.get(field).is_some(),
                    "rule contract is missing required field: {field}"
                );
            }
            for field in [
                "id",
                "policyFile",
                "severity",
                "classification",
                "rationale",
                "assertion",
                "remediation",
            ] {
                anyhow::ensure!(
                    rule.get(field)
                        .and_then(serde_json::Value::as_str)
                        .is_some_and(|value| !value.trim().is_empty()),
                    "rule contract field must be a non-empty string: {field}"
                );
            }
            anyhow::ensure!(
                matches!(
                    rule.get("severity").and_then(serde_json::Value::as_str),
                    Some("info" | "warning" | "error")
                ),
                "rule contract severity is invalid"
            );
            anyhow::ensure!(
                matches!(
                    rule.get("classification")
                        .and_then(serde_json::Value::as_str),
                    Some("deterministic" | "verifiable" | "judgment-guided" | "human-only")
                ),
                "rule contract classification is invalid"
            );
            anyhow::ensure!(
                rule.get("scope")
                    .and_then(serde_json::Value::as_array)
                    .is_some_and(|items| {
                        !items.is_empty()
                            && items.iter().all(|item| {
                                item.as_str().is_some_and(|value| !value.trim().is_empty())
                            })
                    })
                    && rule
                        .get("limitations")
                        .and_then(serde_json::Value::as_array)
                        .is_some_and(|items| {
                            !items.is_empty()
                                && items.iter().all(|item| {
                                    item.as_str().is_some_and(|value| !value.trim().is_empty())
                                })
                        }),
                "rule contract scope and limitations must be non-empty"
            );
            let evidence = rule
                .get("evidence")
                .and_then(serde_json::Value::as_object)
                .context("rule contract evidence must be an object")?;
            reject_unknown_fields(
                evidence,
                &[
                    "classification",
                    "sourceId",
                    "sourceClaim",
                    "sourceLocator",
                    "implementation",
                    "fixture",
                ],
                "rule contract evidence",
            )?;
            anyhow::ensure!(
                evidence
                    .get("sourceId")
                    .and_then(serde_json::Value::as_str)
                    .is_some_and(|value| !value.trim().is_empty()),
                "rule contract evidence requires sourceId"
            );
            anyhow::ensure!(
                matches!(
                    evidence
                        .get("classification")
                        .and_then(serde_json::Value::as_str),
                    Some(
                        "explicit-statement"
                            | "repeated-code-pattern"
                            | "review-pattern"
                            | "inferred-hypothesis"
                            | "unsupported"
                            | "verified-fixture"
                    )
                ),
                "rule contract evidence classification is invalid"
            );
            validate_rule_evidence_boundary(rule, evidence)?;
            if source_backed {
                for field in ["sourceClaim", "sourceLocator", "implementation", "fixture"] {
                    anyhow::ensure!(
                        evidence
                            .get(field)
                            .and_then(serde_json::Value::as_str)
                            .is_some_and(|value| !value.trim().is_empty()),
                        "source-backed rule evidence requires {field}"
                    );
                }
                anyhow::ensure!(
                    evidence
                        .get("sourceLocator")
                        .and_then(serde_json::Value::as_str)
                        .is_some_and(
                            |value| value.starts_with("http://") || value.starts_with("https://")
                        ),
                    "source-backed rule evidence sourceLocator must be an absolute URL"
                );
            }
            anyhow::ensure!(
                rule_ids.insert(
                    rule.get("id")
                        .and_then(serde_json::Value::as_str)
                        .context("rule contract requires id")?
                        .to_string()
                ),
                "duplicate rule contract id"
            );
        }
        let evidence: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(root.join("evidence.json"))?)
                .context("canonical package evidence manifest is not valid JSON")?;
        let evidence_object = evidence
            .as_object()
            .context("canonical package evidence manifest must be an object")?;
        reject_unknown_fields(
            evidence_object,
            &["status", "tests", "notes"],
            "evidence manifest",
        )?;
        anyhow::ensure!(
            evidence.get("status").and_then(serde_json::Value::as_str) == Some("verified-fixtures")
                && evidence
                    .get("notes")
                    .and_then(serde_json::Value::as_str)
                    .is_some_and(|value| !value.trim().is_empty()),
            "evidence manifest requires verified-fixtures status and notes"
        );
        let fixtures = evidence
            .get("tests")
            .and_then(serde_json::Value::as_array)
            .filter(|items| items.len() >= 3)
            .context("evidence manifest requires at least three fixtures")?;
        let mut fixture_ids = std::collections::HashSet::new();
        for fixture in fixtures {
            let fixture_object = fixture
                .as_object()
                .context("evidence fixtures must be objects")?;
            reject_unknown_fields(
                fixture_object,
                &["id", "kind", "description", "expected"],
                "evidence fixture",
            )?;
            let id = fixture
                .get("id")
                .and_then(serde_json::Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .context("evidence fixture requires id")?;
            anyhow::ensure!(
                fixture_ids.insert(id.to_string()),
                "duplicate evidence fixture id"
            );
            anyhow::ensure!(
                fixture
                    .get("description")
                    .and_then(serde_json::Value::as_str)
                    .is_some_and(|value| !value.trim().is_empty())
                    && matches!(
                        fixture.get("kind").and_then(serde_json::Value::as_str),
                        Some("positive" | "negative" | "exception")
                    )
                    && matches!(
                        fixture.get("expected").and_then(serde_json::Value::as_str),
                        Some("pass" | "needs_revision" | "blocked")
                    ),
                "evidence fixture fields are invalid"
            );
        }
        for kind in ["positive", "negative", "exception"] {
            anyhow::ensure!(
                fixtures.iter().any(|fixture| {
                    fixture.get("kind").and_then(serde_json::Value::as_str) == Some(kind)
                }),
                "evidence manifest is missing {kind} fixture"
            );
        }
    }
    for declared in package.enforcement.values() {
        anyhow::ensure!(
            root.join(declared).is_file(),
            "declared policy file is missing: {declared}"
        );
    }
    Ok(package)
}

#[cfg(test)]
mod tests {
    use super::{validate_package_dir, validate_rule_evidence_boundary};
    use serde_json::json;
    use std::path::PathBuf;

    #[test]
    fn loads_the_canonical_camel_case_manifest() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../profiles/baseline");
        let package = validate_package_dir(&root).expect("baseline mind package should validate");
        assert_eq!(package.spec_version.as_deref(), Some("1.0"));
        assert_eq!(
            package.mode_defaults.expect("mode defaults").validation,
            "advisory"
        );
        assert_eq!(package.enforcement.len(), 4);
    }

    #[test]
    fn keeps_inferred_and_unsupported_evidence_out_of_hard_rules() {
        let hard_rule = json!({"classification":"verifiable","severity":"error"});
        let inferred = json!({"classification":"inferred-hypothesis"});
        assert!(
            validate_rule_evidence_boundary(&hard_rule, inferred.as_object().unwrap()).is_err()
        );

        let judgment_rule = json!({"classification":"judgment-guided","severity":"warning"});
        assert!(
            validate_rule_evidence_boundary(&judgment_rule, inferred.as_object().unwrap()).is_ok()
        );

        let unsupported = json!({"classification":"unsupported"});
        assert!(
            validate_rule_evidence_boundary(&judgment_rule, unsupported.as_object().unwrap())
                .is_err()
        );
    }
}
