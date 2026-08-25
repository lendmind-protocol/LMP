# Architecture

Lending-Mind is an offline-first pipeline:

```text
Mind Package -> Schema -> Compiler -> Evaluator -> Artifact Store
       \-> Local Registry                         \-> CLI / MCP
```

`@lending-mind/core` owns canonical JSON, hashing, Ed25519, redaction, config,
and shared types. `skill-schema` validates package manifests and rule references.
The compiler creates deterministic visible instructions. The evaluator reads a
workspace, performs metadata and AST checks, optionally runs exact allowlisted
scripts, and writes a redacted artifact. The registry copies immutable local
versions. The CLI and stdio MCP server are adapters over these services.

The trust boundary treats packages as untrusted until schema validation and
signature verification. Signatures prove possession of a key, not correctness.
The OCI adapter is a deliberate `not configured in MVP` failure and performs no
network operation. The preserved Rust crates are legacy and are not imported or
executed by the TypeScript graph.
