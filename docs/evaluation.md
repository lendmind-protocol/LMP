# LMP Evaluation

## Purpose

LMP evaluates a candidate change against a pinned Mind, repository context, task acceptance criteria, and configured evidence requirements.

## Modes

| Mode | Commands | Outcome |
| --- | --- | --- |
| Advisory | Only policy-approved | Findings guide agent/developer iteration |
| Enforced | Only policy-approved | Hard failures block configured CI/workflows |
| Audit | Never executed | Static/read-only evidence only |

## Pipeline

```text
request validation
-> workspace path guard
-> Mind/signature/schema resolution
-> changed scope and dependency closure
-> Mind context/check compilation
-> Rust static/AST/architecture evaluation
-> optional Python/Docker behavioral/profile execution
-> evidence aggregation and redaction
-> artifact validation/signing
-> pass / needs_revision / blocked / evaluation_error
```

## Decisions

- **Pass:** required checks completed, required behavior evidence passes, and no unresolved hard finding exists.
- **Needs revision:** a correctable failure, missing evidence, or material regression exists.
- **Blocked:** a trust, path, command, sandbox, permission, or policy boundary prevents safe evaluation.
- **Evaluation error:** LMP could not produce a trustworthy result; never converted to pass.

## Artifact minimum

```json
{
  "artifactVersion": "1.0.0",
  "mind": { "id": "lmp:mind:example", "version": "1.0.0" },
  "repositoryRevision": "git:<sha>",
  "evaluatorVersion": "<version>",
  "mode": "enforced",
  "decision": "needs_revision",
  "scope": ["crates/lmp-core"],
  "checks": [],
  "findings": [],
  "redacted": true
}
```

## Evidence rule

LMP records what was checked, what was skipped, and what failed. It must not claim correctness, security, or production readiness beyond the evidence actually collected.
