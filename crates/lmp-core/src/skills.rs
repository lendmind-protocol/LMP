use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Serialize, Deserialize, Debug)]
pub struct ManifestIntercept {
    pub strip_dependencies: Vec<String>,
    pub inject_fields: serde_json::Value,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RuntimeExecutionPolicy {
    pub verify_command: String,
    pub profile_command: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PonytailSkillSchema {
    pub id: String,
    pub manifest_intercepts: HashMap<String, ManifestIntercept>,
    pub runtime_execution_policy: RuntimeExecutionPolicy,
}

pub struct SkillValidationReport {
    pub skill_id: String,
    pub manifest_checks_passed: bool,
    pub dependency_violations_found: usize,
    pub validation_logs: Vec<String>,
}

impl SkillValidationReport {
    /// Audits the agent's work workspace and prints out structural validation telemetry
    pub fn execute_workspace_audit(workspace: &Path, skill: &PonytailSkillSchema) -> Result<Self> {
        println!("🔍 Starting Lending-Mind Structural Audit: [{}]", skill.id);
        let mut logs = Vec::new();
        let mut violations = 0;
        let mut checks_passed = true;

        // Process and audit package.json for dependency bloat
        if let Some(intercept) = skill.manifest_intercepts.get("package.json") {
            let pkg_path = workspace.join("package.json");
            if pkg_path.exists() {
                let content = fs::read_to_string(&pkg_path)?;
                let json_data: serde_json::Value = serde_json::from_str(&content)?;

                if let Some(deps) = json_data.get("dependencies") {
                    if let Some(deps_map) = deps.as_object() {
                        for blacklisted in &intercept.strip_dependencies {
                            if deps_map.contains_key(blacklisted) {
                                violations += 1;
                                checks_passed = false;
                                logs.push(format!(
                                    "AXIOM VIOLATION: Bloated dependency `{}` was found in manifest file!", 
                                    blacklisted
                                ));
                            }
                        }
                    }
                }
            }
        }

        if checks_passed {
            logs.push(
                "SUCCESS: Package manifest adheres strictly to minimalism benchmarks.".to_string(),
            );
        }

        let report = Self {
            skill_id: skill.id.clone(),
            manifest_checks_passed: checks_passed,
            dependency_violations_found: violations,
            validation_logs: logs,
        };

        report.print_console_telemetry_signature();
        Ok(report)
    }

    fn print_console_telemetry_signature(&self) {
        println!("\n📊 ============ LMP AGENT VALIDATION STATUS REPORT ============");
        println!("Skill Framework Profile : {}", self.skill_id);
        println!(
            "Manifest Conformance    : {}",
            if self.manifest_checks_passed {
                "COMPLIANT ✅"
            } else {
                "NON-COMPLIANT 🚨"
            }
        );
        println!(
            "Total Axiomatic Breaches: {}",
            self.dependency_violations_found
        );
        println!("Execution Subsystem Telemetry Logs:");
        for log in &self.validation_logs {
            println!("  - {}", log);
        }
        println!("===============================================================\n");
    }
}
