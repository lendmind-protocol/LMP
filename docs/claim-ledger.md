# LMP claim ledger

This ledger classifies product claims against the implementation and retained
evidence. `VERIFIED` means the stated, scoped claim has a passing executable
check; it does not mean universal correctness.

The latest completed hosted qualification is recorded in
[`docs/evidence/hosted-qualification-34729695684.md`](evidence/hosted-qualification-34729695684.md).

| Claim ID | Claim | Source document | Implementation path | Test path | Evidence artifact | Status | Exact limitation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CL-001 | LMP validates supported Rust and TypeScript structures with configured rules | `README.md`, `docs/Explain.md` | `crates/lmp-core/src/ast.rs`, evaluator | Rust tests, profile fixture gate | qualification artifacts | VERIFIED | Only implemented language/rule boundaries are covered |
| CL-002 | Malformed source is returned as structured evaluation evidence | `docs/quality-checks.md` | evaluator parser error handling | malformed Rust regression test | evaluator artifact | VERIFIED | No formal proof against every parser input |
| CL-003 | Signed package tampering is rejected before evaluation | `docs/threat-model.md` | `crates/lmp-core/src/crypto.rs` | mutation, wrong-key, revocation tests | package signature files | VERIFIED | Authenticity does not establish policy wisdom |
| CL-004 | Docker qualification applies configured network, mount, capability, and resource controls | `docs/quality-checks.md` | `orchestrator/sandbox.py` | sandbox and qualification tests | qualification artifact | VERIFIED | Host/kernel/runtime limitations remain |
| CL-005 | LMP universally intercepts every agent/editor write before persistence | `docs/Concept.md` | no universal host driver exists | no valid universal test | none | UNSUPPORTED | Current watcher and pre-commit paths are post-write or commit-boundary controls |
| CL-006 | MCP server implements a bounded JSON-RPC tool surface | `README.md` | `crates/lmp-mcp/` | MCP protocol tests plus official conformance smoke scenarios | MCP test output and CI conformance job | PARTIAL | Official conformance covers the selected initialize, ping, and tools/list scenarios; optional capability suites and all-host interoperability remain unproven |
| CL-007 | LMP eliminates token gaming and deception | `docs/Explain.md` | no such mechanism | none | none | FALSE | Gaming can be detected in selected paths, not eliminated |
| CL-008 | LMP improves code quality beyond a strong instructions/CI/test baseline | `README.md`, `docs/Concept.md` | benchmark comparison harness | real-world benchmark | [hosted benchmark run 34729695684](https://github.com/lendmind-protocol/LMP/actions/runs/34729695684) | PARTIAL | No controlled model/host baseline proves causal improvement |
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

> The latest hosted run ([34729695684](https://github.com/lendmind-protocol/LMP/actions/runs/34729695684)) passed the reproducible 64-scenario technical benchmark, 128/128 Docker gates, 128/128 ordinary compiler controls, and 15/15 provenance checks for commit `a1347056df686b9580f283026747d33343a26329`. It is not a causal quality study: it uses fixed candidate patches, does not execute repository-owned lint/test/CI commands, and has no independent reviewer annotations. LMP therefore has not demonstrated that it improves AI-generated code quality beyond a strong combination of instructions, skills, testing, CI, static analysis, and human review.
