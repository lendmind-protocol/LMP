# Source ingestion research

## Question

How should external source material become a Mind without treating attribution
or interpretation as proof of a person's identity or endorsement?

## Primary source URL/repository

- [Git repository documentation](https://git-scm.com/docs/git-commit)
- Repository-owned provenance schemas under `registry/provenance/`.

## Source version/date/commit

Git documentation reviewed on 2026-09-12; provenance behavior is tied to the
repository revision and the immutable source references recorded in each
profile package.

## What the source proves

Git records content changes and authorship metadata for a repository revision.

## What it does not prove

It does not prove that a source author endorses a generated profile or that an
interpretation is complete.

## Implementation implication

Profiles must store source URLs, curator interpretation, scope, and
non-endorsement language as reviewable metadata.

## Chosen decision

Use curator-authored, signed packages and retain provenance records.

## Rejected alternatives

Automatic personality extraction was rejected because repository text cannot
establish identity, intent, or endorsement.

## Test plan

Validate provenance shape, signature, and package digest before installation.

## Known limitation

Human attribution and interpretation review remain external evidence.
