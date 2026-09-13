# Release evidence inputs

These files are intentionally absent until independent evidence exists. The
release workflow fails closed when either required input is missing.

The release workflow also runs `orchestrator/evidence_boundary_gate.py`. It
requires every bounded protocol claim to have executable evidence and keeps
the universal-interception, anti-gaming, causal-quality, external-distribution,
and cross-platform claims blocked until their required evidence exists. A
claim-ledger status alone cannot satisfy this gate.

## `benchmark-review.json`

This file must contain a non-empty JSON array, or an object with an
`annotations` array. Every annotation must include:

```json
{
  "reviewer": "independent-reviewer-id",
  "reviewedRevision": "40-character-git-commit",
  "decision": "pass-with-limitations",
  "notes": "What was independently checked and what remains bounded.",
  "reviewTimeMinutes": 30,
  "reworkCount": 0,
  "severity": "low",
  "confidence": 0.8,
  "falsePositiveCount": 0
}
```

The benchmark runner rejects annotations for any revision other than the one
being measured. Review time, rework, severity, confidence, and false-positive
count are required so the evidence can measure review overhead and disagreement
instead of accepting narrative-only approval. A maintainer cannot satisfy this
gate by adding an empty array or by copying the benchmark's own output.

## `human-adoption-pilot.json`

This is the redacted report produced by an independent usability pilot. Its
required fields and thresholds are defined in `docs/release-pilot.md` and
validated by `orchestrator/release_readiness.py`. It must describe real people,
repository categories, operating systems, onboarding completion, remediation,
understanding of the pass boundary, and the absence of source code and secrets.

Do not create synthetic evidence to make the release gate pass.
