# Lending-Mind Protocol

Lending-Mind Protocol (LMP) is a Rust-native runtime that turns versioned engineering preferences into visible agent guidance, deterministic checks, bounded enforcement, and reviewable local evidence.

Rust is the canonical implementation language. The Rust workspace owns profile semantics, compilation, evaluation, artifacts, signing, local registry operations, the daemon, CLI, and MCP. TypeScript, Python, or other tools may be invoked only as explicitly approved tools for the target repository; they are not alternative LMP runtimes.

## Core invariant

```text
One Mind Package → guidance + policy + evaluation + evidence
```

LMP does not clone a person, reproduce private reasoning, update model weights, replace human review, or claim that static checks prove software quality.

## Rust workspace

| Component | Responsibility |
| --- | --- |
| `lmp-core` | Mind Package model, compiler, AST evaluation, artifacts, signing, registry primitives |
| `lmpd` | Long-running Rust workspace watcher |
| `lmp-mcp` | Rust stdio MCP adapter over the shared core |
| `lmp-sync` | Offline validated profile synchronization |
| `orchestrator/` | Python 3.11+ sandbox, benchmark, metrics, and plotting orchestration |
| `packages/create-lmp` | TypeScript/Node.js onboarding wrapper for agent configuration files |

All adapters use the shared `lmp-core` behavior. They must not implement a second evaluator or profile interpretation.

## Quickstart

Use the pinned Rust 1.98.1 toolchain declared in `rust-toolchain.toml`:

```bash
cargo build --workspace
cargo test --workspace
cargo run --bin lmp -- init --install-baseline
cargo run --bin lmp -- instructions --mind skills/baseline
cargo run --bin lmp -- evaluate --mind skills/baseline --workspace . --mode advisory --artifact-dir .lending-mind/artifacts
```

Evaluation is advisory by default, offline, non-mutating, and does not execute commands. Enforced mode returns a non-zero status for blocking findings.

## Mind Packages

A package contains `mind.json`, guidance, policy files declared by `enforcement`, a `rules/manifest.json` contract, evidence metadata, and optional signature metadata. Guidance is advice. Only explicit policy fields become enforceable checks, and every declared policy file must have rule metadata describing its assertion, classification, scope, remediation, limitations, and evidence.

Rules should have stable IDs, severity, scope, evidence, rationale, remediation, and documented limitations. Community archetypes describe practices and cannot claim verified authorship. Individual or organizational profiles require consent, attribution, provenance, and review.

## Safety boundaries

- No network, upload, package installation, deployment, or source mutation by default.
- Commands require an exact allowlist and explicit authorization.
- Audit mode never executes commands.
- Artifacts contain hashes and redacted metadata, not raw source code or raw paths.
- Signatures prove key possession and content integrity, not policy correctness.
- Public discovery is static-first: `registry/registry.json` can be served by an edge host, while optional OCI/IPFS layers are fetched and verified locally by `lmp-sync`.

## Optional target-language tooling

For a TypeScript or JavaScript target repository, the Rust runtime may call the
repository’s existing compiler, linter, or test runner when the profile
explicitly allows it. The Node.js wrapper only performs delivery and onboarding;
it is not an alternative LMP runtime.

## Development

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo metadata --no-deps --format-version 1
cargo check --workspace
cargo test --workspace
python3 -m compileall -q orchestrator
```

See [`ARCHITECTURE.md`](ARCHITECTURE.md), [`docs/evaluation.md`](docs/evaluation.md), and [`docs/threat-model.md`](docs/threat-model.md) for the implementation boundaries and verification contract.
