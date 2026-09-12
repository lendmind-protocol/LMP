//! Mind package compiler boundary. Compilation validates and materializes the
//! signed package instruction bundle used by evaluators and agents.

use anyhow::Result;
use lmp_core::{compiler::InstructionBundle, MindPackage};
use std::path::Path;

pub fn validate(path: &Path) -> Result<MindPackage> {
    lmp_core::validate_package_dir(path)
}

pub fn compile(path: &Path) -> Result<InstructionBundle> {
    lmp_core::compiler::compile(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compiles_canonical_registry_mind() {
        let package = compile(Path::new("../../registry/minds/lmp-protocol-core")).unwrap();
        assert!(!package.layers.is_empty());
    }
}
