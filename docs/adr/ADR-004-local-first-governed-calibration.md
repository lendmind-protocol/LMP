# ADR-004: Local-First Operation and Governed Calibration

- **Status:** Accepted
- **Date:** 2026-09-11

## Context

LMP needs artifact-based learning and optional OCI/IPFS distribution without forcing users to store corpora, upload source, or allow automatic policy/model updates.

## Decision

Keep evaluation local-first. Store compact Mind packages and redacted artifacts locally. Permit remote OCI/IPFS publication only through explicit, signed, digest-verified actions. Artifacts become calibration candidates only after aggregation and human/maintainer review.

## Consequences

Normal LMP use requires no remote service. Artifacts can inform updated Minds, approved retrieval, benchmarks, and separately governed data export; they do not silently mutate Minds or retrain external model weights.

## Rejected

Always-on telemetry, automatic online learning from all agent output, full source-corpus distribution to users, and silent remote policy updates.
