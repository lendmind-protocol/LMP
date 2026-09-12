# `@lending-mind/lmp`

The unified developer-facing CLI for Lending-Mind Protocol.

```bash
npx lmp init
npx lmp use <mind>
npx lmp share <package-directory> --out ./shared-mind
```

`init` creates the local workspace configuration. `use` validates and
activates a Mind from a local registry or bundled profile. `share` signs a
package and prepares it for a pull request to the community registry.

`npx lmp init --baseline` (or the explicit
`--install-baseline` spelling) installs the bundled baseline profile from the
bundled CLI package, so it works from a project directory without a
repository checkout.

The baseline is installed under `.lending-mind/skills/baseline` and is the
profile resolved by the generated `defaultMind` setting. Re-running `init` is
additive: it repairs missing LMP-generated ignore entries for local state,
telemetry, benchmark sandboxes, and private signing material without replacing
the project's existing rules.

The CLI reports remote publication as `not-configured` until an OCI/IPFS
adapter, endpoint, and credentials are explicitly configured. It does not
invent a CID or silently upload a profile. The Rust runtime remains the source
of truth for evaluation and signature enforcement.

The standalone Rust `lmp` release binary embeds the same signed baseline at
build time. Its `lmp init --baseline` path therefore works from a clean
directory without access to the LMP source checkout.

## Testing before publication

The package is not published yet. From the repository root, build and pack it
for a separate test project:

```bash
pnpm --filter @lending-mind/sdk build
pnpm --filter @lending-mind/lmp build
pnpm --dir packages/cli pack --pack-destination /tmp/lmp-local-packages
pnpm add file:/tmp/lmp-local-packages/lending-mind-lmp-0.1.0.tgz
```

Use the exact tarball name printed by `pnpm pack`. A direct local path or
`pnpm link --global` is also suitable for rapid iteration. Prefer a tarball
when testing an unrelated project because this repository uses workspace
dependencies that are not yet registry-resolvable.
