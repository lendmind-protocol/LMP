# ADR-002: Rust Core, Python Orchestration, Node Onboarding

- **Status:** Accepted
- **Date:** 2026-09-11

## Context

LMP needs deterministic local enforcement, a low-overhead daemon, compiler-grade AST analysis, cryptographic verification, safe agent integration, sandbox orchestration, analytics, and frictionless installation.

## Decision

Rust 1.75+ is the primary protocol/runtime language. Python 3.11+ is the secondary sandbox, benchmark, and analytics layer. TypeScript/Node.js ESM is limited to the front-facing `create-lmp` onboarding wrapper.

## Consequences

Rust owns `lmpd`, AST evaluation, crypto, MCP/JSON-RPC, artifact integrity, and sync. Python owns Docker lifecycle, telemetry, regression analysis, and charts. Node.js installs/configures the experience but does not define core protocol semantics.

## Rejected

TypeScript-first protocol core, Python as the enforcement authority, and requiring every user to install analytics/distribution tooling for basic local evaluation.
