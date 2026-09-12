# `@lending-mind/sdk`

The TypeScript SDK provides Mind package hashing, Ed25519 signing and
verification, redaction, workspace metadata, and shared protocol types.

The Rust runtime remains authoritative for evaluation and enforcement.

## What can you build with it?

Use the SDK inside:

- AI coding platforms and agent orchestrators that load and verify Mind packages.
- CI/CD gates that sign packages and publish redacted evaluation evidence.
- Private enterprise registries and developer portals showing provenance and release state.
- IDE extensions that display the active Mind and integrity status.
- Security, compliance, and benchmarking systems that need stable hashes, signatures, and reproducible metadata.
- Publishing tools that create keys, sign packages, rotate signers, and prepare promotion records.

The SDK is the Node.js integration layer. It does not replace the Rust
evaluator, `lmpd` daemon, or MCP server.
