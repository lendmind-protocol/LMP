# Contributing

Rust is the canonical implementation language. Protocol behavior belongs in
`crates/lmp-core`; `lmpd`, `lmp-mcp`, and `lmp-sync` remain thin adapters.

The repository pins Rust 1.98.1 in `rust-toolchain.toml`. Use a rustup-managed
toolchain (or prepend that toolchain's `bin` directory to `PATH`) before
running the checks below:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo metadata --no-deps --format-version 1
cargo check --workspace
cargo test --workspace
python3 -m compileall -q orchestrator
```

Add focused Rust regression tests for policy, trust-boundary, evaluator, or
adapter behavior. Python changes belong in sandbox, benchmark, metrics, or
dashboard tooling. TypeScript changes belong in `create-lmp` onboarding and
Node.js delivery integrations. Neither secondary layer may define competing
Mind semantics.
