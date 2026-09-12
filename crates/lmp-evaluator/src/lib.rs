//! Public evaluator boundary. The CLI and integrations use this facade so
//! evaluation remains a real library capability, not a command-only side effect.

use anyhow::Result;
use lmp_core::evaluator::{Evaluation, EvaluationOptions};
use std::path::Path;

pub fn evaluate_workspace(
    mind: &Path,
    workspace: &Path,
    mode: &str,
    artifact_dir: Option<&Path>,
) -> Result<Evaluation> {
    lmp_core::evaluator::evaluate(mind, workspace, mode, artifact_dir)
}

pub fn evaluate_workspace_with_options<'a>(
    mind: &Path,
    workspace: &Path,
    mode: &str,
    artifact_dir: Option<&Path>,
    options: EvaluationOptions<'a>,
) -> Result<Evaluation> {
    lmp_core::evaluator::evaluate_with_options(mind, workspace, mode, artifact_dir, options)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn facade_exposes_real_evaluator_result_type() {
        let _evaluate: fn(&Path, &Path, &str, Option<&Path>) -> Result<Evaluation> =
            evaluate_workspace;
    }
}
