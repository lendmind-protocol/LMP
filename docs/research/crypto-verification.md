# Cryptographic verification research

## Question

What does a signed, digest-addressed Mind package verify?

## Primary source URL/repository

- [Ed25519 RFC 8032](https://www.rfc-editor.org/rfc/rfc8032)
- `crates/lmp-core/src/crypto.rs`

## Source version/date/commit

RFC 8032 (November 2017); repository implementation reviewed on 2026-09-12;
the package verifier is evaluated at the current working-tree revision.

## What the source proves

Ed25519 signatures can authenticate bytes against a public key; SHA-256
digests identify the bytes used by the package verifier.

## What it does not prove

Authenticity does not prove policy quality, signer trust, or safe execution.

## Implementation implication

Verify canonical package bytes, key status, rotation proof, and revocation before
installation or enforced evaluation.

## Chosen decision

Use detached Ed25519 signatures, trusted key material, rotation, and revocation.

## Rejected alternatives

Unverified mutable text and unsigned “latest” content were rejected for enforced
workflows.

## Test plan

Mutate bytes, whitespace, files, ordering, signatures, keys, and revocation data.

## Known limitation

The trust store still requires accountable key distribution and review.
