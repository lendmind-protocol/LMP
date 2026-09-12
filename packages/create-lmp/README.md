# create-lmp

Initializes the local Lending-Mind Protocol workspace contract through a short
interactive wizard. It detects the stack, lets the developer select an agent
host and bundled Mind, verifies the bundled Ed25519 signature, installs the
active profile under `.lending-mind/mind`, writes agent-discovery guidance, and
creates a local MCP adapter manifest under `.lmp_telemetry`.

The package does not download source code, install dependencies, or claim that
a workspace is correct. Git hooks are never installed implicitly; pass
`--install-hooks` to explicitly create a fail-closed project-local
`.git/hooks/pre-commit` gate. It can install the matching
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
When `--install-hooks` is used, the matching Rust `lmp` CLI is also required
and installed from the same checksum-verified archive, so the commit gate does
not depend on an unrelated global installation.

To request the commit-boundary gate during onboarding:

```bash
npx @lending-mind/create-lending-mind --yes --install-hooks /path/to/project
```

The gate invokes `lmp self-govern` in enforced mode and exits nonzero when the
active Mind reports a finding. If no verified CLI runtime is available, it
fails closed with an actionable error; `.lmp_telemetry/enforcement.json`
records the boundary and installation status. This is a Git commit control,
not a universal filesystem pre-write interceptor.

## Strategy detection

The wizard checks the workspace before writing generated state. Project
manifests, source directories, and other existing content are treated as
brownfield evidence; an empty workspace is treated as greenfield. If the
selected strategy disagrees with that evidence, interactive use requires an
explicit `continue` confirmation. Non-interactive and `--yes` runs fail closed
unless `--allow-strategy-mismatch` is supplied. This prevents an accidental
greenfield selection from silently applying new-project assumptions to an
existing repository, while still allowing an intentional exception.
