# ADR-001: Mind Package and Evidence Model

- **Status:** Accepted
- **Date:** 2026-09-11

## Context

LMP must represent philosophy, methodology, tradeoffs, source provenance, implementation examples, deterministic rules, and outcomes without reducing them to an unversioned prompt.

## Decision

Use versioned Mind Packages containing manifest, guidance, sources, rules, fixtures, and optional signatures. Rust creates/evaluates stable evidence artifacts for every material evaluation.

## Consequences

Minds are reproducible, attributable, testable, and explicitly versioned. Guidance shapes agent decision-making; rules/fixtures provide mechanical checks; artifacts record observed evidence. A pass remains bounded to configured evidence.

## Rejected

Plain instruction files alone; opaque model-only tuning; and one universal quality score.
