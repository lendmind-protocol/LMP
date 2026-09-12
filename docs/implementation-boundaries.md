# Implemented runtime boundaries

The Rust workspace exposes the protocol through explicit package boundaries:

- `lmp-core` owns the canonical package model, signatures, AST checks, policy evaluation, CLI, and self-hosting command policy.
- `lmp-evaluator` is the library facade for real workspace evaluation and artifact capture.
- `lmp-artifacts` validates redaction metadata and computes a content digest for an artifact value.
- `lmp-ingest` performs bounded workspace discovery and refuses symlink escapes.
- `lmp-mind-compiler` validates and compiles a signed Mind into an instruction bundle.
- `lmp-cli` exposes the evaluator as an embeddable host-facing function; the shipped `lmp` binary remains the complete command surface.

These boundaries are compiled and tested by `cargo test --workspace --locked`. The
end-to-end evidence runner also executes the shipped CLI, Docker qualification,
completion audit, release profiles, and a candidate remediation loop. A passing
unit test or package build is not a production qualification claim; the captured
report retains blocked external checks and policy findings.
