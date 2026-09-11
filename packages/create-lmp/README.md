# create-lmp

Initializes the local Lending-Mind Protocol workspace contract through a short
interactive wizard. It detects the stack, lets the developer select an agent
host and bundled Mind, verifies the bundled Ed25519 signature, installs the
active profile under `.lending-mind/mind`, writes agent-discovery guidance, and
creates a local MCP adapter manifest under `.lmp_telemetry`.

The package does not download source code, install dependencies, modify Git
hooks, or claim that a workspace is correct. It can install the matching
precompiled Rust runtime from a release archive, but only after verifying the
archive against the release `SHA256SUMS` file. Build the Rust runtime
separately when no compatible release asset is available:

```bash
cargo run --bin lmp -- evaluate --mind .lending-mind/mind --workspace . --mode advisory --changed-only --json
```

The wizard is intentionally local-first. It does not silently rewrite global
Claude or Cursor configuration, download an unknown binary, or claim that a
workspace is correct. It prefers local binaries, then supports Linux x64,
macOS arm64/x64, and Windows x64 release archives. The default release URL is
derived from the package version; `LMP_RELEASE_BASE_URL` overrides it for a
mirror or test fixture. Set `LMP_DISABLE_RUNTIME_DOWNLOAD=1` to disable this
network step. The runtime manifest reports `verified-download`,
`download-failed`, `unsupported-platform`, or `disabled` so downstream tools
can distinguish an installed runtime from a missing one.
The generated `.lmp_telemetry/agent-mcp.json` points directly at the installed
workspace `lmp-mcp` binary when one exists; otherwise it records
`available: false` and leaves the host command fallback explicit. With a
verified binary, onboarding also adds a workspace-scoped MCP entry for Claude
Code (`.mcp.json`) or Cursor (`.cursor/mcp.json`) without replacing existing
servers. Cline and Roo Code receive project-scoped entries in `.cline/mcp.json`
and `.roo/mcp.json`; global host settings are never modified. The generated
`host-integrations.json` records each project-scoped result and any conflict.

## Strategy detection

The wizard checks the workspace before writing generated state. Project
manifests, source directories, and other existing content are treated as
brownfield evidence; an empty workspace is treated as greenfield. If the
selected strategy disagrees with that evidence, interactive use requires an
explicit `continue` confirmation. Non-interactive and `--yes` runs fail closed
unless `--allow-strategy-mismatch` is supplied. This prevents an accidental
greenfield selection from silently applying new-project assumptions to an
existing repository, while still allowing an intentional exception.
