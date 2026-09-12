# LMP Qualification Gate

Publishing is blocked until LMP demonstrates predictable behavior through the
real Rust binaries. The gate is intentionally broader than unit tests and
must run against the CLI, daemon, MCP server, and Python sandbox mount layer.

## Required commands

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo build --release --workspace
docker build -t lmp-sandbox:local orchestrator
python3 orchestrator/qualification_suite.py --lmp target/release/lmp --lmpd target/release/lmpd --mcp target/release/lmp-mcp --output lmp-test-results/qualification-result.json
idle_workspace="$(mktemp -d)"
trap 'find "$idle_workspace" -mindepth 1 -delete; rmdir "$idle_workspace"' EXIT
python3 orchestrator/resource_gate.py --lmpd target/release/lmpd --mind profiles/baseline/mind.json --workspace "$idle_workspace" --output lmp-test-results/resource-gate.json
python3 -m unittest discover -s orchestrator -p 'test_*.py'
```

The qualification artifact is authoritative for this gate. It must contain
`status: "complete"`, `scenarioCount: 38`, `expectedScenarioCount: 38`, and
`dockerRequired: true`. Missing Rust binaries, a stopped Docker daemon, or a
missing `lmp-sandbox:local` image produce `status: "blocked"`; a run with
failed or missing checks produces `status: "incomplete"`. Neither state is a
release result.

## Required behavior

- Mind packages compile into deterministic, content-addressed binary cache
  entries with independently hashed guidance and enforcement layers.
- Ed25519 signature failures are blocked and never treated as unsigned or
  successful.
- Git delta mode evaluates changed and untracked files while excluding
  unchanged committed files; non-Git workspaces disclose a full-scan fallback.
- AST parsing is incremental by source digest and bounded by a maximum source
  file size.
- Symlinks and workspace escapes are rejected or excluded at the evaluation and
  sandbox boundaries.
- Artifacts include scope, profile digest/layers, state, findings, and privacy
  metadata without source contents.
- MCP rejects malformed JSON-RPC and exposes the declared tool surface.
- `lmpd` observes changes and evaluates the affected workspace.
- `resource_gate.py` measures the actual idle daemon RSS and CPU on the current
  Linux runner. Non-Linux hosts are explicitly reported as environment-
  qualified rather than silently treated as passing.
- The Docker sandbox can mount only explicitly selected changed paths.

The current qualification suite contains 38 executable scenarios, including
bounded fleet graph validation, report merging, and disagreement blocking; a
5,000-file, approximately million-line brownfield scan and a 32-profile
matrix. Passing it is necessary but not sufficient for release: the separate
real-OSS matrix must also report a complete result with all 64 scenarios and
128 paired Docker sandbox gates, and real-user brownfield pilots,
cross-platform release builds, and independent package-install tests remain
required before publication.
