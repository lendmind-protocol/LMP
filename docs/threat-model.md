# Threat model

| Threat | Boundary / mitigation |
| --- | --- |
| Malicious skill package | Validate schemas, reject unsafe command policies, verify signatures before trust. |
| Prompt injection in guidance | Guidance is untrusted input; compiler emits observable checklist, never hidden reasoning requests. |
| Poisoned artifacts | Local-only by default, redacted fields, hashes, human review before promotion. |
| Compromised registry | Immutable local versions, digest checks, explicit unsupported remote adapter. |
| Arbitrary command execution | Exact allowlist, `shell:false`, opt-in `runCommands`, audit/offline refusal. |
| Secrets in logs | Minimal environment, token/private-key redaction, 8 KiB truncation, no raw source. |
| Dependency confusion | Local registry IDs/versions and no automatic install or network. |
| Key loss/rotation | Public metadata, verification status, documented replacement key/version process. |
| False confidence | Artifacts and docs state static-check limits; passing does not replace review or threat modeling. |

No automatic uploads or telemetry exist in the MVP. A signature proves key
possession, not that a policy is safe or correct.
