# Production-readiness research

## Question

What evidence supports a bounded release qualification decision?

## Primary source URL/repository

- `orchestrator/release_readiness.py`
- `protocol/production-readiness/checklist.toml`
- `protocol/production-readiness/release-gate-policy.toml`

## Source version/date/commit

Repository working tree reviewed on 2026-09-12; the release gate is versioned
by the repository revision that supplies these files and the evaluated binary.

## What the source proves

Executable gates can validate signed packages, self-hosting evaluation, format,
artifact, deployment, resource, onboarding, and human-review evidence when those
inputs are supplied.

## What it does not prove

A passing local check is not enterprise production readiness or universal safety.

## Implementation implication

Release commands must return bounded decisions and retain skipped checks,
limitations, and external blockers.

## Chosen decision

Use `LOCAL_QUALIFIED`, `CI_QUALIFIED`, `RELEASE_CANDIDATE_QUALIFIED`,
`NEEDS_REVISION`, `BLOCKED`, and `EVALUATION_ERROR`.

## Rejected alternatives

“Green light” and “production-ready” were rejected as unbounded claims.

## Test plan

Run local, CI, and release-candidate profiles with missing-evidence negative
fixtures and verify fail-closed decisions.

## Known limitation

External deployment, cross-platform execution, independent security review, and
human adoption remain separate evidence inputs.
