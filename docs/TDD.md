# Test-Driven Development: LMP

## Principle

LMP makes evaluation claims; therefore its protocol behavior, Rust evaluators, Python sandbox orchestration, and Node bootstrapper must be defined by executable tests.

## Test layers

| Layer | Examples |
| --- | --- |
| Rust unit | Mind schema, AST selectors, complexity, signatures, path guards, redaction |
| Rust integration | Mind load -> compile -> evaluate -> artifact decision |
| Python sandbox | Docker lifecycle, timeout, cleanup, resource caps, no-network behavior |
| Node onboarding | workspace detection, safe templates, binary/config discovery |
| End-to-end | CLI/MCP evaluation against compliant and violating fixtures |
| Benchmark | fixed real-OSS task runs: baseline vs LMP-guided conditions |

## Required fixture discipline

Every hard rule needs a compliant fixture, a violating fixture, stable expected finding ID/severity, and regression coverage for prior bugs.

## Critical cases

- malformed/unsupported Minds;
- invalid or tampered signatures;
- path traversal and symlink escape;
- command injection and shell bypass;
- secret/artifact redaction;
- evaluator timeout/output limit;
- sandbox cleanup and privilege boundaries;
- root policy precedence in monorepos;
- repeated evaluation determinism;
- blocked/error never reported as pass.

## Red-green-refactor

1. Write a failing test for the required behavior or safety boundary.
2. Implement the smallest Rust/Python/Node change to pass.
3. Refactor with tests green.
4. Record evidence for protocol-significant behavior.

## Benchmark rule

LMP cannot prove quality improvement with its own score alone. Benchmark claims require fixed repository/task/model/tool settings, repeated runs, independent tests/review/security evaluation, cost/latency reporting, and negative-result reporting.
