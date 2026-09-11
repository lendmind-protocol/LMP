# Architecture

LMP is a Rust-canonical, offline-first pipeline:

```text
Mind Package → lmp-core compiler → shared evaluator → artifact store
                    ↓                    ↑
                 lmp CLI              lmpd / MCP
                    ↓                    ↑
              lmp-sync registry     target workspace
```

## Ownership

`lmp-core` owns the canonical Mind Package model, validation, visible instruction
compilation, deterministic Rust AST checks, policy loading, artifact format,
redaction, hashing, signing, and local registry primitives. `lmpd`, `lmp-mcp`,
and `lmp-sync` are thin Rust adapters.

Python is the secondary orchestration, sandboxing, metrics, and visualization
layer. TypeScript/Node.js is a supporting delivery wrapper for `create-lmp`,
agent-facing onboarding, and target-project interoperability. Neither language
defines a competing protocol runtime.

## Evaluation contract

The evaluator scans workspace files inside an explicit workspace boundary,
ignores generated/dependency directories, parses Rust with `syn`, applies the
selected package policies, and emits findings with IDs, severity, messages, and
evidence. It never includes source code in artifacts.

Modes are distinct:

| Mode | Findings | Commands | Failure |
| --- | --- | --- | --- |
| advisory | report | disabled by default | never for policy findings |
| audit | evidence only | never | never for findings |
| enforced | report and block configured errors | explicit allowlist only | non-zero on blocking findings |

## Trust boundaries

Profiles, workspace paths, source files, and command output are untrusted.
Profiles must validate before compilation; signatures verify integrity and key
possession but not policy quality. Remote registries are not part of the MVP.
Commands must be exact allowlist entries, use no shell, receive a minimal
environment, and have bounded time/output when that adapter is enabled.

## Extension rule

New protocol behavior belongs in Rust first. A non-Rust implementation is
justified only when Rust lacks the required ecosystem integration; it must be a
thin, documented adapter with no duplicated policy or evaluator semantics.
