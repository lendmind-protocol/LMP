# LMP claim ledger

This ledger classifies product claims against the implementation and retained
evidence. `VERIFIED` means the stated, scoped claim has a passing executable
check; it does not mean universal correctness.

The latest completed hosted qualification is recorded in
[`evidence/hosted-qualification-34743414862.md`](evidence/hosted-qualification-34743414862.md)
and hosted benchmark run
[34743414862](https://github.com/lendmind-protocol/LMP/actions/runs/34743414862)
for commit `f4533033371a9ea078926a168a84e7055547db7c`.

| Claim ID | Claim | Source document | Implementation path | Test path | Evidence artifact | Status | Exact limitation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CL-001 | LMP validates supported Rust and TypeScript structures with configured rules | `README.md`, `docs/Explain.md` | `crates/lmp-core/src/ast.rs`, evaluator | Rust tests, profile fixture gate | qualification artifacts | VERIFIED | Only implemented language/rule boundaries are covered |
| CL-002 | Malformed source is returned as structured evaluation evidence | `docs/quality-checks.md` | evaluator parser error handling | malformed Rust regression test | evaluator artifact | VERIFIED | No formal proof against every parser input |
| CL-003 | Signed package tampering is rejected before evaluation | `docs/threat-model.md` | `crates/lmp-core/src/crypto.rs` | mutation, wrong-key, revocation tests | package signature files | VERIFIED | Authenticity does not establish policy wisdom |
| CL-004 | Docker qualification applies configured network, mount, capability, and resource controls | `docs/quality-checks.md` | `orchestrator/sandbox.py` | sandbox and qualification tests | qualification artifact | VERIFIED | Host/kernel/runtime limitations remain |
| CL-005 | LMP universally intercepts every agent/editor write before persistence | `docs/Concept.md` | no universal host driver exists | no valid universal test | none | UNSUPPORTED | Current watcher and pre-commit paths are post-write or commit-boundary controls |
| CL-005-B | LMP enforces writes routed through supported Git and explicitly mediated host boundaries | `docs/Explain.md` | `packages/cli/src/host-boundaries.ts`, `packages/cli/src/runtime.ts`, Git hook installer | CLI boundary tests | `docs/evidence/supported-write-boundary-verification.json` | VERIFIED | Unsupported hosts and writes that bypass the adapter remain outside this boundary |
| CL-006 | MCP server implements a bounded JSON-RPC tool surface | `README.md` | `crates/lmp-mcp/` | MCP protocol tests plus official conformance smoke scenarios | `docs/evidence/mcp-capability-verification.json` | VERIFIED | Local resources, prompts, completion, cancellation, and tool capabilities are implemented and tested; host-specific acceptance and all-host interoperability remain external |
| CL-007 | LMP eliminates token gaming and deception | `docs/Explain.md` | no such mechanism | none | none | FALSE | Gaming can be detected in selected paths, not eliminated |
| CL-008 | LMP produces reproducible paired quality evidence against an ordinary-control baseline | `README.md`, `docs/Concept.md` | benchmark comparison harness | real-world benchmark | [hosted benchmark run 34743414862](https://github.com/lendmind-protocol/LMP/actions/runs/34743414862) and [revision-bound record](evidence/hosted-qualification-34743414862.md) | VERIFIED | This verifies the measurement protocol and supplied trials; it does not prove causal improvement across models, hosts, repositories, or reviewers |
| CL-008-B | LMP executes a paired repeated technical quality study with Docker and ordinary-control evidence | `README.md` | `orchestrator/real_world_benchmark.py` | benchmark artifact gate | hosted benchmark artifact for the current revision | VERIFIED | This proves the study protocol and measured transitions for supplied inputs; it does not establish causal improvement for all model outputs |
| CL-009 | Self-hosting evaluates LMP against a signed Mind and bounded scope | `docs/operations/self-governance` | `lmp self-check`, `.lmp/` | self-hosting check | `.lmp/artifacts` | VERIFIED | Scope is explicitly limited to declared paths |
| CL-010 | Configured Pinata/IPFS provides immutable, CID-addressed Mind distribution for the published registry packages | `ROADMAP.md` | registry/sync code, Pinata publisher | registry tests, public gateway retrieval | `docs/evidence/pinata-public-verification.json` | VERIFIED | Evidence is scoped to the four recorded CIDs and the Pinata gateway retrieval observed at the artifact timestamp; OCI and perpetual availability are not claimed |
| CL-011 | Cross-platform release artifacts are built and smoke-tested | `README.md`, release workflow | `.github/workflows/release.yml`, `.github/workflows/cross-platform-qualification.yml` | hosted matrix and archive gate | qualification run 34710288767 | VERIFIED | All four targets passed native smoke tests and aggregate archive verification; this does not claim a tagged public release has been published |
| CL-012 | LMP is globally enterprise production-ready | `docs/Concept.md` | none | none | none | REMOVED | Replaced with scoped qualification decisions |
| CL-013 | Release qualification emits a bounded decision | attached directive | `lmp release verify`, `protocol/production-readiness/` | CLI and gate tests | release verification JSON | VERIFIED | Release-candidate status stays blocked without external evidence |

## Quality model

LMP evaluates a configured set of structural, behavioral, operational, and
evidence-based quality signals. The selected signals are measurable; their
relevance and thresholds are scoped to a Mind, repository, and task.

## Differentiation test

LMP overlaps with AGENTS.md, CLAUDE.md, skills packages, linters, CI, Docker,
MCP, and policy-as-code. Its implemented additional mechanism is a signed Mind
package compiled into the same bounded context/evaluation/artifact path, with
profile fixtures and fail-closed evidence. The repository does not yet contain
controlled causal evidence showing that this changes generated-code outcomes
more than a strong existing stack.

## Quality improvement evidence

> The latest hosted run ([34743414862](https://github.com/lendmind-protocol/LMP/actions/runs/34743414862)) passed the reproducible 192-paired-trial technical benchmark, 384/384 Docker gates, 384/384 ordinary compiler controls, and 15/15 provenance checks for commit `f4533033371a9ea078926a168a84e7055547db7c`. It is not a causal quality study: it uses explicitly supplied candidate inputs, does not use repository-owned lint/test/CI results as the causal outcome, and has no independent reviewer annotations. LMP therefore has not demonstrated that it improves AI-generated code quality beyond a strong combination of instructions, skills, testing, CI, static analysis, and human review.
