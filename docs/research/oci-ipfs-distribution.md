# OCI/IPFS distribution research

## Question

What do OCI and Kubo provide for immutable, offline-capable Mind distribution?

## Primary source URL/repository

- [OCI Image Format Specification](https://github.com/opencontainers/image-spec/blob/main/spec.md)
- [OCI descriptor digest specification](https://github.com/opencontainers/image-spec/blob/main/descriptor.md)
- [Official Kubo installation guide](https://docs.ipfs.tech/install/command-line/)

## Source version/date/commit

OCI image-spec main branch and Kubo installation documentation reviewed on
2026-09-12; releases must record the exact OCI manifest digest and Kubo version
used by the evidence artifact.

## What the source proves

OCI descriptors identify content by digest, and Kubo provides an IPFS node,
gateway, and RPC/CLI surfaces for content-addressed retrieval.

## What it does not prove

Availability, pin persistence, gateway trust, or deployment ownership are not
provided merely by using OCI or IPFS.

## Implementation implication

Installation must pin digests, verify signatures, cache explicitly, and avoid
silent untrusted fallback.

## Chosen decision

Treat local registry and signed package verification as the required path;
external IPFS/OCI publication is an explicit evidence gate.

## Rejected alternatives

An unpinned `latest` download or implicit public gateway fallback was rejected.

## Test plan

Test digest mismatch, signature mismatch, cache reuse, rollback, and unavailable
remote source behavior.

## Known limitation

No public immutable deployment is claimed until its CID and retrieval evidence
are recorded.
