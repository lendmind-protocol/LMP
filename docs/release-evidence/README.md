# Release evidence inputs

These files are intentionally absent until independent evidence exists. The
release workflow fails closed when either required input is missing.

## `benchmark-review.json`

This file must contain a non-empty JSON array, or an object with an
`annotations` array. Every annotation must include:

```json
{
  "reviewer": "independent-reviewer-id",
  "reviewedRevision": "40-character-git-commit",
  "decision": "pass-with-limitations",
  "notes": "What was independently checked and what remains bounded."
}
```

The benchmark runner rejects annotations for any revision other than the one
being measured. A maintainer cannot satisfy this gate by adding an empty array
or by copying the benchmark's own output.

## `human-adoption-pilot.json`

This is the redacted report produced by an independent usability pilot. Its
required fields and thresholds are defined in `docs/release-pilot.md` and
validated by `orchestrator/release_readiness.py`. It must describe real people,
repository categories, operating systems, onboarding completion, remediation,
understanding of the pass boundary, and the absence of source code and secrets.

Do not create synthetic evidence to make the release gate pass.
