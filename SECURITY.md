# Security Policy

Report vulnerabilities privately through GitHub Security Advisories or the
maintainer contact listed in the repository. Include the affected version,
reproduction, impact, and a minimal proof of concept. Do not include secrets or
private keys. We will acknowledge, investigate, patch, and coordinate public
disclosure.

Lending-Mind is offline-first: no automatic network, upload, telemetry,
package installation, source mutation, or arbitrary command execution. Skills
are untrusted until schema and signature checks complete. Commands are exact
allowlisted scripts, `shell:false`, bounded, redacted, and opt-in. Artifacts
exclude source, raw paths, secrets, and environment values. Private keys must
never be stored in a package. See [docs/threat-model.md](docs/threat-model.md).
