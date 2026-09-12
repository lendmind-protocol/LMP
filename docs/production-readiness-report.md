# Production-readiness report

## Claims reconciled against `Explain.md` and `Concept.md`

The complete claim classification is maintained in [`claim-ledger.md`](claim-ledger.md).
The main corrections are:

- structural checks are scoped to implemented languages and rules;
- signatures authenticate package bytes, not policy quality or author intent;
- Docker flags provide configured runtime controls, not absolute isolation;
- MCP provides a bounded JSON-RPC tool surface, not universal filesystem
  interception;
- evaluation can expose selected gaming signals, not eliminate deception;
- benchmark runs do not establish causal improvement without a controlled
  baseline;
- “enterprise production-ready” is removed in favor of bounded decisions.

## Blocker resolution log

Primary-source research is recorded in [`research/`](research/): MCP lifecycle
and tools, Docker runtime controls, Kubo installation, OCI digests, Ed25519,
Rust AST parsing, benchmark methodology, and release qualification. Each record
states what the source proves, what it does not prove, the selected implementation,
tests, and unresolved limits.

## Differentiation test

LMP overlaps materially with AGENTS.md, CLAUDE.md, skills packages, static
analysis, tests, CI, Docker, MCP, and policy-as-code. The implemented additional
mechanism is a signed Mind package compiled into a shared context/evaluation/
artifact path with reproducible profile fixtures and fail-closed verification.
No controlled evidence yet demonstrates that this changes generated-code
outcomes beyond a strong ordinary engineering stack.

## Production qualification

The GitHub Pages deployment at `https://lendmind-protocol.github.io/LMP/` was
published by workflow run [34713835324](https://github.com/lendmind-protocol/LMP/actions/runs/34713835324)
and probed on 2026-09-13. The root, `/registry.json`, and a public profile
manifest each returned HTTP 200; the registry response was valid JSON. The
former Vercel target remains unavailable and is not counted as deployment
evidence. Hosted qualification run [34710288767](https://github.com/lendmind-protocol/LMP/actions/runs/34710288767)
passed all four target build/package/smoke jobs and aggregate archive verification.

The local checkout currently returns `LOCAL_QUALIFIED` from its deliberately
bounded core-runtime scope:

```bash
lmp release verify --profile local
```

The broader LMP-on-LMP reality runner is retained separately and reports
unsupported or failing scopes instead of widening this qualification silently.
Its latest machine-readable output is `lmp-test-results/lmp-on-lmp-reality.json`;
the run verifies the declared local toolchains and Docker gate, while retaining
five partial Mind evaluations because their configured scopes expose unsupported
or failing checks.
`ci` adds the Rust format and workspace-test gates. `release-candidate` remains
`BLOCKED` until immutable package retrieval and independent review evidence are
supplied. The command never emits an unbounded “production-ready” claim.

## Quality improvement evidence

> A reproducible 64-scenario technical benchmark exists and its configured execution controls passed. It is not a causal quality study: it uses fixed candidate patches, does not execute repository-owned lint/test/CI commands, and has no independent reviewer annotations. LMP therefore has not demonstrated that it improves AI-generated code quality beyond a strong combination of instructions, skills, testing, CI, static analysis, and human review.

## Final truth statement

Today LMP can validate selected source structures, package signatures, bounded
Docker settings, MCP requests, profile fixtures, self-hosting scope, and evidence
contracts. It cannot universally intercept agent writes, guarantee software
correctness, eliminate evaluation gaming, prove enterprise readiness, or prove
causal quality improvement. External deployment, long-duration host profiling,
cross-platform release execution, independent security review, and human
adoption remain required evidence gates.
