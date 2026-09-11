# Governance

This document defines how Lending-Mind Protocol (LMP) evolves its Mind packages, rule schemas, evaluators, and public protocol surfaces.

## Goals

- Keep Mind evolution reviewable and attributable.
- Preserve reproducible evaluation behavior.
- Prevent silent policy changes from altering protected workflows.
- Separate source evidence, policy decisions, and implementation changes.
- Make it clear who has authority to approve each class of change.

## Roles

| Role | Responsibility |
| --- | --- |
| Mind author | Proposes a Mind or Mind revision with provenance, rationale, and fixtures |
| Core maintainer | Maintains protocol schemas, evaluators, and compatibility guarantees |
| Security reviewer | Reviews trust-boundary, execution, secret-handling, and supply-chain changes |
| Release maintainer | Signs and publishes approved releases |
| Consumer | Installs a pinned Mind version and decides whether to adopt updates |

## Proposal process

All material changes use a Lending-Mind Proposal (LMP proposal):

1. State the problem and target scope.
2. Identify the affected Mind, schema, evaluator, or integration.
3. Provide source material and provenance for claimed practices.
4. Specify rule changes, tradeoffs, compatibility impact, and migration path.
5. Add compliant and violating fixtures.
6. Run the relevant evaluation and benchmark suite.
7. Obtain required review.
8. Release a versioned, signed artifact.

The local CLI enforces the evidence boundary at acceptance time. An accepted
proposal must contain at least one candidate change, non-empty test and
benchmark plans, and selected evaluation artifacts that parse against the
canonical artifact schema, match the proposed profile and version, and are not
blocked or evaluation-error results. Missing or mismatched evidence prevents
the state transition; the CLI does not silently promote a proposal.

## Change classes

| Change | Required review | Version impact |
| --- | --- | --- |
| Documentation-only clarification | Maintainer | Patch |
| New optional guidance | Mind author + maintainer | Minor |
| New soft rule | Mind author + maintainer | Minor |
| New hard rule or changed threshold | Maintainer + affected owners | Minor or major |
| Schema-breaking change | Core maintainer review | Major |
| Sandbox, command, crypto, or trust change | Security review required | Major unless clearly backward compatible |
| Remote registry/distribution change | Security and release review required | Major or minor based on compatibility |

## Mind provenance

A Mind must distinguish between:

- **Source evidence**: documents, code, talks, design notes, or reviews that informed it.
- **Evidence tier and rights basis**: each canonical source records whether it is
  primary, secondary, or derived evidence and whether its use is public
  documentation, author-provided, licensed, or unknown.
- **Interpretation**: the author’s explicit translation of source material into guidance or rules.
- **Validation**: fixtures and benchmark outcomes demonstrating evaluator behavior.
- **Signature**: proof of the publishing key, not proof that every policy claim is universally correct.

## Release policy

- Releases are immutable once published.
- Every canonical package carries a `release.json` beside its policy files. It
  records the package ID and version, a non-empty changelog, explicit
  limitations, and review metadata. The schema gate rejects missing,
  malformed, or identity-mismatched release metadata before activation.
- `review.status: "unreviewed"` is an explicit state, not a quality claim.
  Empty reviewer lists and notes that call for independent review must remain
  visible until accountable reviewers add evidence. Automated schema and
  signature checks do not promote that state to an endorsement.
- Promotion updates both `mind.json` and `release.json`, then requires the
  package to validate again. The policy signature is not silently reused for a
  changed version; promoted packages remain `requires-resigning` until a new
  signature is produced.
- Consumers should pin Mind and evaluator versions in CI.
- Deprecated Minds remain inspectable with migration guidance.
- Remote updates must never silently modify local policy.
- A promotion proposal may recommend a change but must not edit an installed Mind without explicit approval.
- `.github/CODEOWNERS` identifies the maintainer review boundary for profile,
  trust, security, and workflow changes; repository branch protection must
  enforce those ownership rules before enabling automatic merge.

## Disputes and reversions

If a rule creates incorrect findings, unacceptable friction, or security risk:

1. Mark it under review.
2. Add a regression fixture.
3. Issue a corrective version or rollback.
4. Preserve the decision record and compatibility notes.

## Conduct

LMP should represent people and organizations accurately. Attribution is opt-in where a Mind claims direct authorship or endorsement. Generic archetypes must not imply endorsement by a named individual or organization.
