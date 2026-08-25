use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

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

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MindAxioms {
    pub data_locality: String,
    pub security_model: String,
    pub state_mutation: String,
    pub cognitive_biases: HashMap<String, Vec<String>>,
}

impl Default for MindAxioms {
    fn default() -> Self {
        Self {
            data_locality: String::new(),
            security_model: String::new(),
            state_mutation: String::new(),
            cognitive_biases: HashMap::new(),
        }
    }
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

fn default_version() -> String {
    "1.0.0".to_string()
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
