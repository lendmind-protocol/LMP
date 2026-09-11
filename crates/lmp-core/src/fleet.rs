//! Deterministic coordination of bounded, externally-produced role evidence.
//!
//! The protocol does not execute or impersonate agent hosts here. Hosts submit
//! signed/authorized role reports, and this module validates the declared DAG,
//! enforces aggregate budgets, records disagreements, and emits one merged
//! decision that downstream evidence gates can inspect.

use anyhow::{bail, ensure, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, VecDeque};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RoleDecision {
    Pass,
    NeedsRevision,
    Blocked,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RoleSpec {
    pub id: String,
    pub purpose: String,
    #[serde(default)]
    pub max_retries: u32,
    #[serde(default)]
    pub max_handoffs: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RoleEdge {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FleetBudgets {
    pub max_roles: usize,
    pub max_handoffs: u32,
    pub max_retries: u32,
    pub max_commands: u32,
    pub max_elapsed_ms: u64,
}

impl Default for FleetBudgets {
    fn default() -> Self {
        Self {
            max_roles: 16,
            max_handoffs: 32,
            max_retries: 32,
            max_commands: 128,
            max_elapsed_ms: 300_000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RoleGraph {
    pub version: String,
    pub roles: Vec<RoleSpec>,
    #[serde(default)]
    pub edges: Vec<RoleEdge>,
    #[serde(default)]
    pub budgets: FleetBudgets,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EvidenceItem {
    pub key: String,
    pub value: Value,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RoleReport {
    pub role_id: String,
    pub decision: RoleDecision,
    #[serde(default)]
    pub evidence: Vec<EvidenceItem>,
    #[serde(default)]
    pub retries: u32,
    #[serde(default)]
    pub handoffs: u32,
    #[serde(default)]
    pub commands: u32,
    #[serde(default)]
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Disagreement {
    pub key: String,
    pub first_role: String,
    pub first_value: Value,
    pub second_role: String,
    pub second_value: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FleetState {
    Pass,
    NeedsRevision,
    Blocked,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FleetRun {
    pub graph_version: String,
    pub state: FleetState,
    pub execution_order: Vec<String>,
    pub reports: Vec<RoleReport>,
    pub merged_evidence: Vec<EvidenceItem>,
    pub disagreements: Vec<Disagreement>,
    pub total_handoffs: u32,
    pub total_retries: u32,
    pub total_commands: u32,
    pub total_elapsed_ms: u64,
}

impl RoleGraph {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            !self.version.trim().is_empty(),
            "fleet graph version is required"
        );
        ensure!(
            !self.roles.is_empty(),
            "fleet graph must declare at least one role"
        );
        ensure!(
            self.roles.len() <= self.budgets.max_roles,
            "fleet graph exceeds max_roles budget"
        );
        ensure!(
            self.budgets.max_roles > 0,
            "max_roles budget must be positive"
        );

        let mut ids = BTreeSet::new();
        for role in &self.roles {
            ensure!(!role.id.trim().is_empty(), "role id is required");
            ensure!(
                ids.insert(role.id.clone()),
                "duplicate role id: {}",
                role.id
            );
            ensure!(
                !role.purpose.trim().is_empty(),
                "role purpose is required: {}",
                role.id
            );
        }

        let mut indegree =
            BTreeMap::from_iter(self.roles.iter().map(|role| (role.id.clone(), 0usize)));
        let mut outgoing: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for edge in &self.edges {
            ensure!(
                edge.from != edge.to,
                "self-handoff is not allowed: {}",
                edge.from
            );
            ensure!(
                ids.contains(&edge.from),
                "handoff source is unknown: {}",
                edge.from
            );
            ensure!(
                ids.contains(&edge.to),
                "handoff target is unknown: {}",
                edge.to
            );
            let targets = outgoing.entry(edge.from.clone()).or_default();
            ensure!(
                !targets.contains(&edge.to),
                "duplicate handoff: {} -> {}",
                edge.from,
                edge.to
            );
            targets.push(edge.to.clone());
            let Some(degree) = indegree.get_mut(&edge.to) else {
                bail!("handoff target disappeared during validation: {}", edge.to);
            };
            *degree += 1;
        }
        ensure!(
            self.edges.len() as u32 <= self.budgets.max_handoffs,
            "graph exceeds max_handoffs budget"
        );

        let mut queue: VecDeque<String> = indegree
            .iter()
            .filter(|(_, degree)| **degree == 0)
            .map(|(id, _)| id.clone())
            .collect();
        let mut visited = 0usize;
        while let Some(role) = queue.pop_front() {
            visited += 1;
            for target in outgoing.get(&role).into_iter().flatten() {
                let Some(degree) = indegree.get_mut(target) else {
                    bail!("handoff target disappeared during traversal: {target}");
                };
                *degree -= 1;
                if *degree == 0 {
                    queue.push_back(target.clone());
                }
            }
        }
        ensure!(visited == self.roles.len(), "fleet graph must be acyclic");
        Ok(())
    }

    pub fn execution_order(&self) -> Result<Vec<String>> {
        self.validate()?;
        let mut indegree =
            BTreeMap::from_iter(self.roles.iter().map(|role| (role.id.clone(), 0usize)));
        let mut outgoing: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for edge in &self.edges {
            let Some(degree) = indegree.get_mut(&edge.to) else {
                bail!("handoff target disappeared during ordering: {}", edge.to);
            };
            *degree += 1;
            outgoing
                .entry(edge.from.clone())
                .or_default()
                .push(edge.to.clone());
        }
        let mut queue: VecDeque<String> = indegree
            .iter()
            .filter(|(_, degree)| **degree == 0)
            .map(|(id, _)| id.clone())
            .collect();
        let mut order = Vec::with_capacity(self.roles.len());
        while let Some(role) = queue.pop_front() {
            order.push(role.clone());
            for target in outgoing.get(&role).into_iter().flatten() {
                let Some(degree) = indegree.get_mut(target) else {
                    bail!("handoff target disappeared during ordering: {target}");
                };
                *degree -= 1;
                if *degree == 0 {
                    queue.push_back(target.clone());
                }
            }
        }
        Ok(order)
    }

    pub fn merge_reports(&self, reports: Vec<RoleReport>) -> Result<FleetRun> {
        let execution_order = self.execution_order()?;
        let role_ids: BTreeSet<_> = self.roles.iter().map(|role| role.id.as_str()).collect();
        let mut seen = BTreeSet::new();
        for report in &reports {
            ensure!(
                role_ids.contains(report.role_id.as_str()),
                "report role is not in graph: {}",
                report.role_id
            );
            ensure!(
                seen.insert(report.role_id.clone()),
                "duplicate report for role: {}",
                report.role_id
            );
        }
        if reports.len() != self.roles.len() {
            bail!("fleet run is missing one or more role reports");
        }

        let total_handoffs = reports.iter().map(|report| report.handoffs).sum();
        let total_retries = reports.iter().map(|report| report.retries).sum();
        let total_commands = reports.iter().map(|report| report.commands).sum();
        let total_elapsed_ms = reports.iter().map(|report| report.elapsed_ms).sum();
        ensure!(
            total_handoffs <= self.budgets.max_handoffs,
            "fleet run exceeds handoff budget"
        );
        ensure!(
            total_retries <= self.budgets.max_retries,
            "fleet run exceeds retry budget"
        );
        ensure!(
            total_commands <= self.budgets.max_commands,
            "fleet run exceeds command budget"
        );
        ensure!(
            total_elapsed_ms <= self.budgets.max_elapsed_ms,
            "fleet run exceeds time budget"
        );
        for report in &reports {
            let Some(role) = self.roles.iter().find(|role| role.id == report.role_id) else {
                bail!("report role is not in graph: {}", report.role_id);
            };
            ensure!(
                report.retries <= role.max_retries,
                "role exceeds retry budget: {}",
                report.role_id
            );
            ensure!(
                report.handoffs <= role.max_handoffs,
                "role exceeds handoff budget: {}",
                report.role_id
            );
        }

        let mut merged: BTreeMap<String, EvidenceItem> = BTreeMap::new();
        let mut disagreements = Vec::new();
        for report in &reports {
            for evidence in &report.evidence {
                if let Some(previous) = merged.get(&evidence.key) {
                    if previous.value != evidence.value {
                        disagreements.push(Disagreement {
                            key: evidence.key.clone(),
                            first_role: previous.source.clone(),
                            first_value: previous.value.clone(),
                            second_role: evidence.source.clone(),
                            second_value: evidence.value.clone(),
                        });
                    }
                } else {
                    merged.insert(evidence.key.clone(), evidence.clone());
                }
            }
        }
        let state = if !disagreements.is_empty() {
            FleetState::NeedsRevision
        } else if reports
            .iter()
            .any(|report| report.decision == RoleDecision::Error)
        {
            FleetState::Error
        } else if reports
            .iter()
            .any(|report| report.decision == RoleDecision::Blocked)
        {
            FleetState::Blocked
        } else if reports
            .iter()
            .any(|report| report.decision == RoleDecision::NeedsRevision)
        {
            FleetState::NeedsRevision
        } else {
            FleetState::Pass
        };

        Ok(FleetRun {
            graph_version: self.version.clone(),
            state,
            execution_order,
            reports,
            merged_evidence: merged.into_values().collect(),
            disagreements,
            total_handoffs,
            total_retries,
            total_commands,
            total_elapsed_ms,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn graph() -> RoleGraph {
        RoleGraph {
            version: "1.0.0".into(),
            roles: vec![
                RoleSpec {
                    id: "architect".into(),
                    purpose: "define boundaries".into(),
                    max_retries: 1,
                    max_handoffs: 2,
                },
                RoleSpec {
                    id: "verifier".into(),
                    purpose: "check evidence".into(),
                    max_retries: 1,
                    max_handoffs: 1,
                },
            ],
            edges: vec![RoleEdge {
                from: "architect".into(),
                to: "verifier".into(),
            }],
            budgets: FleetBudgets::default(),
        }
    }

    #[test]
    fn validates_dag_and_returns_deterministic_order() {
        let graph = graph();
        assert_eq!(
            graph.execution_order().unwrap(),
            vec!["architect", "verifier"]
        );
    }

    #[test]
    fn rejects_cycles_and_unknown_handoffs() {
        let mut cyclic = graph();
        cyclic.edges.push(RoleEdge {
            from: "verifier".into(),
            to: "architect".into(),
        });
        assert!(cyclic
            .validate()
            .unwrap_err()
            .to_string()
            .contains("acyclic"));

        let mut unknown = graph();
        unknown.edges[0].to = "missing".into();
        assert!(unknown
            .validate()
            .unwrap_err()
            .to_string()
            .contains("unknown"));
    }

    #[test]
    fn merges_evidence_and_records_disagreement_without_hiding_it() {
        let graph = graph();
        let run = graph
            .merge_reports(vec![
                RoleReport {
                    role_id: "architect".into(),
                    decision: RoleDecision::Pass,
                    evidence: vec![EvidenceItem {
                        key: "complexity".into(),
                        value: json!(4),
                        source: "architect".into(),
                    }],
                    retries: 0,
                    handoffs: 1,
                    commands: 1,
                    elapsed_ms: 10,
                },
                RoleReport {
                    role_id: "verifier".into(),
                    decision: RoleDecision::Pass,
                    evidence: vec![EvidenceItem {
                        key: "complexity".into(),
                        value: json!(7),
                        source: "verifier".into(),
                    }],
                    retries: 0,
                    handoffs: 0,
                    commands: 1,
                    elapsed_ms: 10,
                },
            ])
            .unwrap();
        assert_eq!(run.state, FleetState::NeedsRevision);
        assert_eq!(run.disagreements.len(), 1);
        assert_eq!(run.merged_evidence.len(), 1);
    }

    #[test]
    fn rejects_budget_overruns_and_missing_reports() {
        let mut graph = graph();
        graph.budgets.max_commands = 1;
        let reports = vec![
            RoleReport {
                role_id: "architect".into(),
                decision: RoleDecision::Pass,
                evidence: vec![],
                retries: 0,
                handoffs: 0,
                commands: 1,
                elapsed_ms: 0,
            },
            RoleReport {
                role_id: "verifier".into(),
                decision: RoleDecision::Pass,
                evidence: vec![],
                retries: 0,
                handoffs: 0,
                commands: 1,
                elapsed_ms: 0,
            },
        ];
        assert!(graph
            .merge_reports(reports)
            .unwrap_err()
            .to_string()
            .contains("command budget"));
        assert!(graph
            .merge_reports(vec![])
            .unwrap_err()
            .to_string()
            .contains("missing"));
    }
}
