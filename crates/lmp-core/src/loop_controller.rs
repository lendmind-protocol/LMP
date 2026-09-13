//! Bounded, observable evaluation/remediation state transitions.
//!
//! This controller deliberately does not execute an agent or mutate a workspace.  It
//! owns the safety decision around a host-provided implementation/evaluation cycle and
//! records why a run may continue, report, or escalate.

use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LoopState {
    Init,
    ResolveProfile,
    ResolveWorkspace,
    BuildTypedContext,
    Plan,
    PlanValidate,
    Implement,
    Evaluate,
    Remediate,
    Attest,
    Report,
    ClarifyOrEscalate,
    Escalate,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LoopPolicy {
    pub max_implementation_attempts: u32,
    pub max_repeated_finding_count: u32,
    pub max_approved_command_runs: u32,
    pub max_wall_clock_ms: u64,
}

impl Default for LoopPolicy {
    fn default() -> Self {
        Self {
            max_implementation_attempts: 3,
            max_repeated_finding_count: 2,
            max_approved_command_runs: 8,
            max_wall_clock_ms: 900_000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LoopEvent {
    pub from: LoopState,
    pub to: LoopState,
    pub reason: String,
    pub attempt: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LoopSnapshot {
    pub state: LoopState,
    pub policy: LoopPolicy,
    pub attempts: u32,
    pub command_runs: u32,
    pub elapsed_ms: u64,
    pub repeated_finding_count: u32,
    pub stop_reason: Option<String>,
    pub events: Vec<LoopEvent>,
}

impl LoopSnapshot {
    pub fn new(policy: LoopPolicy) -> Self {
        Self {
            state: LoopState::Init,
            policy,
            attempts: 0,
            command_runs: 0,
            elapsed_ms: 0,
            repeated_finding_count: 0,
            stop_reason: None,
            events: Vec::new(),
        }
    }

    pub fn transition(&mut self, next: LoopState, reason: impl Into<String>) {
        let from = self.state;
        self.state = next;
        self.events.push(LoopEvent {
            from,
            to: next,
            reason: reason.into(),
            attempt: self.attempts,
        });
    }

    pub fn begin_attempt(&mut self) -> bool {
        if self.attempts >= self.policy.max_implementation_attempts {
            self.stop("implementation attempt budget exhausted");
            return false;
        }
        self.attempts += 1;
        self.transition(LoopState::Implement, "implementation attempt authorized");
        true
    }

    pub fn record_command_run(&mut self) -> bool {
        if self.command_runs >= self.policy.max_approved_command_runs {
            self.stop("approved command budget exhausted");
            return false;
        }
        self.command_runs += 1;
        true
    }

    pub fn record_elapsed(&mut self, elapsed: Duration) -> bool {
        self.elapsed_ms = self.elapsed_ms.saturating_add(elapsed.as_millis() as u64);
        if self.elapsed_ms > self.policy.max_wall_clock_ms {
            self.stop("wall-clock budget exhausted");
            false
        } else {
            true
        }
    }

    pub fn record_finding(
        &mut self,
        fingerprint: &str,
        previous_fingerprint: Option<&str>,
    ) -> bool {
        if previous_fingerprint == Some(fingerprint) {
            self.repeated_finding_count = self.repeated_finding_count.saturating_add(1);
        } else {
            self.repeated_finding_count = 1;
        }
        if self.repeated_finding_count > self.policy.max_repeated_finding_count {
            self.stop("same finding repeated beyond remediation budget");
            false
        } else {
            true
        }
    }

    pub fn stop(&mut self, reason: impl Into<String>) {
        let reason = reason.into();
        self.stop_reason = Some(reason.clone());
        self.transition(LoopState::Escalate, reason);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bounds_attempts_and_records_transitions() {
        let mut loop_state = LoopSnapshot::new(LoopPolicy {
            max_implementation_attempts: 1,
            ..Default::default()
        });
        assert!(loop_state.begin_attempt());
        assert!(!loop_state.begin_attempt());
        assert_eq!(loop_state.state, LoopState::Escalate);
        assert_eq!(
            loop_state.stop_reason.as_deref(),
            Some("implementation attempt budget exhausted")
        );
        assert_eq!(loop_state.events.len(), 2);
    }

    #[test]
    fn stops_on_repeated_finding_command_and_time_limits() {
        let policy = LoopPolicy {
            max_repeated_finding_count: 1,
            max_approved_command_runs: 1,
            max_wall_clock_ms: 10,
            ..Default::default()
        };
        let mut loop_state = LoopSnapshot::new(policy);
        assert!(loop_state.record_finding("same", None));
        assert!(!loop_state.record_finding("same", Some("same")));
        assert!(loop_state.record_command_run());
        assert!(!loop_state.record_command_run());
        assert!(!loop_state.record_elapsed(Duration::from_millis(11)));
        assert_eq!(loop_state.state, LoopState::Escalate);
    }
}
