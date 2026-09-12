//! Embeddable CLI evaluation entry point for hosts that need a library call.

use anyhow::Result;
use lmp_core::evaluator::Evaluation;
use std::path::Path;

pub fn evaluate(
    mind: &Path,
    workspace: &Path,
    mode: &str,
    artifacts: Option<&Path>,
) -> Result<Evaluation> {
    lmp_evaluator::evaluate_workspace(mind, workspace, mode, artifacts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_evaluation_function() {
        let _ = evaluate as fn(&Path, &Path, &str, Option<&Path>) -> Result<Evaluation>;
    }
}
