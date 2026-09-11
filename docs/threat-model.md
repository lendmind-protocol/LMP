# Threat Model

This document describes the primary security boundaries, assets, threats, and mitigations for Lending-Mind Protocol (LMP).

## Security posture

LMP is designed to evaluate code and Mind packages without treating either as trusted. Default operation should be local, offline-first, and non-mutating.

## Assets to protect

- Source code and repository history.
- Environment variables, credentials, and tokens.
- Developer workstation and CI runner integrity.
- Mind package provenance and rule integrity.
- Evidence artifacts and their privacy properties.
- Trust decisions, signing keys, and release artifacts.

## Trust boundaries

```text
Untrusted Mind package     -> Mind validator and signature verifier
Untrusted workspace code   -> static evaluator and isolated sandbox
Agent request / MCP input  -> schema, path, and capability guards
Remote OCI/IPFS artifact   -> digest, signature, and explicit-install gate
Evidence output            -> redaction and artifact-schema gate
```

## Threats and mitigations

| Threat | Example | Mitigation |
| --- | --- | --- |
| Malicious Mind | Rule package attempts to trigger arbitrary commands | Mind packages are data-only; command policy uses exact allowlists |
| Path escape | Symlink accesses files outside workspace | Resolve real paths and require containment under workspace root |
| Command injection | User-controlled shell string reaches execution | Use argument arrays, `shell: false`, allowlists, timeouts, and controlled working directory |
| Secret exposure | Test logs print API tokens | Minimal inherited environment, output truncation, redaction, no env dumps in artifacts |
| Sandbox escape | Container receives host privileges or writable sensitive mounts | Run non-root, disable network by default, limit mounts, use read-only filesystem where possible, apply CPU/memory/PID limits |
| Supply-chain tampering | OCI/IPFS Mind layer replaced | Verify content digest and signature; require explicit installation/update |
| Denial of service | Huge repository, pathological AST, endless process output | File/count/size budgets, parse limits, per-check and total timeouts, output caps |
| Cross-workspace leakage | One run reads another project’s state | Per-run temp directories/containers and no shared mutable session state |
| Artifact privacy failure | Artifact stores raw code or home paths | Strict artifact schema, relative/hashed paths, redaction before write, privacy tests |
| False assurance | Passing LMP is treated as production approval | Clear documentation: LMP complements, not replaces, tests, review, security assessment, and operational monitoring |

## Default execution rules

- No network, remote fetch, package installation, upload, or source mutation by default.
- Commands run only when explicitly enabled by policy.
- Child processes use `shell: false` and an exact executable/argument allowlist.
- Execution has a workspace-scoped current working directory, timeout, output limit, and sanitized environment.
- Audit mode never runs commands.
- Remote registry updates require explicit user action and verification.

## Mind trust levels

| Level | Meaning | Typical use |
| --- | --- | --- |
| `trusted` | Verified first-party or approved organization key | Enforced CI and protected workflows |
| `community` | Signed but not formally approved | Local/advisory use; review before enforcement |
| `untrusted` | Unsigned, unknown, or invalid provenance | Inspect only; do not use for sensitive execution |

## Incident handling

1. Stop the affected evaluation or remote update.
2. Preserve minimal, redacted diagnostic evidence.
3. Revoke/disable the compromised Mind or signing key.
4. Publish a corrected signed version and migration guidance.
5. Add regression tests for the failure mode.
6. Review sandbox, path, command, and artifact boundaries before re-enabling the feature.

## Non-goals

LMP does not guarantee that generated code is free of defects or vulnerabilities. It does not replace human review, threat modeling, production monitoring, dependency auditing, or security response processes.
