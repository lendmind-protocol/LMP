# Python orchestration layer

Build the local sandbox image before running isolated workloads:

```bash
docker build -t lmp-sandbox:local orchestrator
```

`DockerSandbox` always disables networking, mounts the workspace read-only,
drops Linux capabilities, limits processes/CPU/memory, and bounds output and
runtime. Some rootless Docker hosts cannot execute the Python base image with
`no-new-privileges`; enable that hardening explicitly with
`LMP_SANDBOX_NO_NEW_PRIVILEGES=1` when the host supports it.

## Pre-release qualification

Do not publish LMP packages or binaries until the real Rust CLI, daemon, MCP
binaries, and Docker sandbox pass the qualification matrix. Docker is a hard
prerequisite, not an optional enhancement:

```bash
cargo build --workspace
python3 orchestrator/qualification_suite.py
python3 -m unittest discover -s orchestrator -p 'test_*.py'
```

Build the required image before the gate:

```bash
docker build -t lmp-sandbox:local orchestrator
```

The matrix covers 38 required end-to-end scenarios, including profile compilation and
binary caching, deterministic content digests, signature failures, Git delta
scope, untracked files, non-Git fallback, AST/source limits, symlink handling,
artifacts, MCP JSON-RPC, daemon watching, and an OSS fixture. It is a
qualification gate, not a claim of universal correctness or a substitute for
human pilots on real brownfield repositories.

The evaluator's local proof path is also executable and fail-closed:

```bash
pnpm verify:evaluator-integration
for artifact in lmp-test-results/evaluator-integration/*.json; do
  python3 orchestrator/evaluator_artifact_gate.py "$artifact"
done
```

This runs a real failing TypeScript candidate through a bounded remediation
cycle, records a passing re-evaluation, and checks the A0-A6 deployment
authorization boundary. It is local deterministic evidence for the bundled
profile, not independent human or production evidence.

To produce the reviewable Markdown form of any validated artifact:

```bash
python3 orchestrator/render_evaluation_summary.py \
  lmp-test-results/evaluator-integration/<artifact>.json \
  --output lmp-test-results/evaluator-summary.md
```

The renderer includes decision, profile identity, findings, skipped checks, and
limitations while excluding source code and raw workspace hashes.

## Release readiness report

Use the composite gate to make the release decision explicit instead of
collecting separate green-looking outputs by hand:

```bash
python3 orchestrator/release_readiness.py \
  --qualification lmp-test-results/qualification-result.json \
  --benchmark lmp-test-results/real-world-clean-current/real-world-benchmark.json \
  --registry registry/registry.json \
  --deployment https://your-deployed-host.example \
  --expected-registry registry/registry.json \
  --check-manifests --verify-cids \
  --release-artifacts ./release-artifacts \
  --resource-report lmp-test-results/resource-gate.json \
  --onboarding lmp-test-results/onboarding-current.json \
  --human-pilot-report lmp-test-results/human-adoption-pilot.json \
  --require-clean
```

For a release candidate, run the benchmark with an independently authored
review file for the exact measured revision:

```bash
python3 orchestrator/real_world_benchmark.py \
  --lmp target/release/lmp \
  --output lmp-test-results/real-world \
  --reviewer-annotations docs/release-evidence/benchmark-review.json
```

The review input must be non-empty and revision-matched. The release workflow
also requires the redacted human pilot at
`docs/release-evidence/human-adoption-pilot.json` before publishing archives.

The report is fail-closed. A dirty checkout, missing deployment, IPFS, archive,
resource, or human-pilot evidence is recorded as `blocked`; it is never
inferred from a local test pass. Each blocked check identifies its `local`,
`external`, or `human` boundary. A `ready` result is the only result that
supports a release readiness claim.

## Evidence harvesting

Use `mind_compiler.py` to convert explicitly supplied public evidence into a
reviewable, deterministic proposal. It delegates to the canonical
`mind_crawler.py` engine, so discovery and compilation cannot drift into two
different profile interpreters. It separates textual, implementation, and
critique layers, supports bounded RSS/Atom, YouTube timed-text, and GitHub
repository/profile discovery, records content digests and usage rights, detects
contradictions, and refuses automatic promotion. GitHub implementation
observations include public language summaries and bounded root dependency
manifest names, with `codeExecuted: false`; repositories are never cloned,
installed, imported, or executed. It is intentionally offline by default:

```bash
python3 orchestrator/mind_compiler.py \
  --entity example-style \
  --input orchestrator/fixtures/mind-harvester/contradictory-footprint.json \
  --output lmp-test-results/mind-harvester/example-style.json
python3 orchestrator/mind_harvest_artifact_gate.py \
  lmp-test-results/mind-harvester/example-style.json
```

See [`docs/mind-harvesting.md`](../docs/mind-harvesting.md) for the source
contract, privacy boundary, numeric-evidence rule, and review path.
