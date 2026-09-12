# Spec-Driven Development: LMP

## Rule

LMP features begin with an executable specification, not an unbounded implementation request.

## Required spec fields

- Problem, users, and scope.
- Explicit non-goals.
- Inputs, outputs, transitions, and failure modes.
- Trust, security, privacy, and execution boundaries.
- Acceptance criteria and evidence required.
- Compatibility/migration/rollback impact.
- Test plan and owner.
- ADR reference for material architectural decisions.

## Delivery loop

```text
problem -> specification -> ADR -> failing acceptance tests
-> minimal implementation -> evaluation -> artifact -> review -> release
```

## Example

**Feature:** scoped monorepo evaluation.

**Acceptance criteria:** resolve changed paths from a base revision; calculate affected package closure; apply root invariants plus package Mind rules; record scope in artifact; fall back safely when the graph cannot be resolved.

**Done means:** Rust tests, integration fixture, Python benchmark/sandbox coverage where applicable, docs, compatibility notes, and reproducible evaluation evidence are complete.

## Change control

Mind schema, evaluator semantics, artifact format, cryptography, sandbox permissions, remote sync, and agent capability changes require an ADR and review before release.
