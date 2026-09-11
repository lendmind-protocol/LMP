# LMP Release Pilot

This is the human validation protocol for an LMP alpha release. It measures
whether a developer can adopt the workflow in an unfamiliar repository without
maintainer intervention.

## Participant workflow

1. Install Node.js 22 and the published `create-lmp` package.
2. Run `npx create-lmp` from an existing repository.
3. Read the generated `AGENTS.md` or `CLAUDE.md` guidance.
4. Build or install the matching Rust `lmp` binary.
5. Run an advisory evaluation.
6. Inspect one finding and make a correction.
7. Re-run evaluation in enforced mode.
8. Add the command to the repository's CI without maintainer assistance.

## Required observations

Record the repository type, language, operating system, CPU/memory class,
onboarding duration, first evaluation duration, number of findings, time to
understand the first finding, remediation result, and whether the participant
can explain what a passing result does and does not prove.

Do not collect source code or private reasoning. Store only redacted timing,
counts, package digests, error categories, and participant feedback.

## Acceptance criteria

- At least 5 participants complete onboarding in separate repositories.
- At least 3 repository categories are represented.
- At least 2 operating systems are represented.
- Every participant can produce a first artifact without maintainer help.
- At least 80% can remediate one finding and obtain a changed result.
- No participant interprets a pass as universal security or production proof.
- No source code or secret appears in the collected pilot artifacts.

Any failure becomes a release issue. A pilot result is evidence for the
measured environments only; it is not a universal quality claim.

## Machine-readable report contract

Store the redacted result as JSON and pass it to
`orchestrator/release_readiness.py --human-pilot-report`. The required shape
is:

```json
{
  "status": "complete",
  "participants": 5,
  "repositoryCategories": ["web", "cli", "systems"],
  "operatingSystems": ["Linux", "macOS"],
  "completedOnboardingWithoutHelp": 5,
  "remediatedFindingParticipants": 4,
  "understoodPassBoundaryParticipants": 5,
  "privacy": {
    "sourceCodeIncluded": false,
    "secretsIncluded": false
  }
}
```

The readiness gate rejects incomplete reports rather than inferring that the
written observations satisfy the acceptance criteria.

Daemon resource evidence is validated with the same fail-closed rule. A report
must come from `orchestrator/resource_gate.py`, include numeric RSS and CPU
measurements with their numeric targets, report at least five seconds of
sampling, and stay within those targets. A status-only report is rejected.
