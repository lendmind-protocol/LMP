# Security Policy

## Supported versions

Security fixes are currently expected on the `main` branch. This project is
pre-1.0, so no older release is guaranteed to receive security updates.

## Reporting a vulnerability

Please do not disclose security vulnerabilities in a public issue. Use the
repository's [GitHub private vulnerability reporting form](https://github.com/lendmind-protocol/LMP/security/advisories/new).

Include:

- a clear description of the affected boundary or component;
- reproduction steps or a minimal proof of concept;
- the commit, release, or environment where the issue occurs; and
- the potential impact, including whether profile data, signatures, or a
  consumer workspace can be affected.

We will acknowledge a report when practical, investigate it privately, and
coordinate disclosure after a fix or mitigation is available. Do not include
private keys, credentials, or customer data in a report.

## Security boundaries

- Treat registry profiles and MCP paths as untrusted input.
- Never commit Ed25519 private keys or generated telemetry artifacts.
- Verify profile signatures before distributing signed profile packages.
- Run the daemon and MCP adapter with the minimum filesystem access required by
  the target workspace.
