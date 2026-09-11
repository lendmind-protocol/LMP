# Mind Package Format

A Mind Package is the versioned LMP unit that packages engineering cognition for an agent and evaluator.

## Layout

```text
registry/minds/<name>/
├── mind.json
├── guidance.md
├── sources.json
├── rules/
│   ├── manifest.json
│   ├── ast.json
│   ├── dependencies.json
│   ├── architecture.json
│   ├── security.json
│   └── commands.json
├── fixtures/
│   ├── compliant/
│   └── violating/
└── signatures/
    └── manifest.ed25519
```

## Meaning

| Asset | Purpose |
| --- | --- |
| `mind.json` | ID, version, capabilities, scope, policy references, and metadata |
| `guidance.md` | Philosophy, methodology, beliefs, tradeoffs, decision heuristics, and examples |
| `sources.json` | Blogs, docs, code, reviews, and outcome provenance; separates evidence from curator interpretation |
| `rules/` | Deterministic Rust-evaluator inputs |
| `rules/manifest.json` | Machine-checkable contract for every enforceable rule: classification, assertion, scope, remediation, limitations, and evidence reference |
| `fixtures/` | Compliant/violating examples proving rule behavior |
| `signatures/` | Canonical manifest integrity and signer identity |

## Minimal manifest

```json
{
  "$schema": "https://lmp-six.vercel.app/schema/mind-v1.json",
  "id": "lmp:mind:minimal-systems",
  "version": "1.0.0",
  "capabilities": ["rust", "typescript", "dependencies", "architecture"],
  "principles": ["Prefer the smallest safe solution."],
  "tradeoffs": ["Prefer explicit local code over a dependency when platform capability is sufficient."],
  "guidance": "guidance.md",
  "sources": "sources.json",
  "rules": ["rules/ast.json", "rules/dependencies.json"],
  "fixtures": "fixtures/"
}
```

## Validation requirements

- Schema and version compatibility pass.
- Rule files are parseable and supported by the Rust evaluator.
- Every hard rule has fixtures and rationale.
- `rules/manifest.json` covers every file declared by `enforcement` and gives each rule a
  classification (`deterministic`, `verifiable`, `judgment-guided`, or `human-only`).
- Rule contracts must state their assertion, scope, remediation, limitations, and evidence
  classification; missing or malformed contracts fail canonical package validation in both
  the TypeScript package validator and the Rust runtime.
- Sources/provenance are present for claimed expert/team practices.
- Signature validation is required where workspace policy requires trusted Minds.

A signature proves key possession for the package manifest; it does not prove universal quality, safety, or endorsement by named sources.
