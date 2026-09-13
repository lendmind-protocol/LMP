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

When the workspace already has an LMP-generated enforced Git boundary, `use`
updates that generated hook to the selected Mind. It refuses to replace an
unrecognized project hook, so switching policy cannot silently misrepresent the
repository’s enforcement boundary.

The standalone Rust `lmp` release binary embeds the same signed baseline at
build time. Its `lmp init --baseline` path therefore works from a clean
directory without access to the LMP source checkout.

## Pre-persistence agent writes

An agent host that owns its write path can use the exported
`createEvaluatedMediatedWriteAdapter` from `@lending-mind/lmp`. Each proposed
write is copied into a disposable workspace snapshot and sent through the
Rust evaluator. Only a `pass` result permits the adapter's atomic commit; a
failed or unavailable evaluator denies the write. This is a real enforcement
boundary for that explicit adapter integration, not a filesystem-wide hook.

```ts
import { createEvaluatedMediatedWriteAdapter, loadMind } from "@lending-mind/lmp";

const mind = await loadMind("./.lending-mind/skills/baseline");
const writes = createEvaluatedMediatedWriteAdapter({
  workspaceRoot: process.cwd(),
  mind,
  mindPath: "./.lending-mind/skills/baseline",
});

await writes.write({ path: "src/change.ts", content: proposedSource });
```

Hosts that write directly to the filesystem remain outside this boundary and
must use the Git hook or a later `lmp evaluate`/`lmpd` check.

For integrations that prefer a process boundary, the equivalent CLI command
requires the proposed contents explicitly and refuses the write unless the
configured evaluator passes:

```bash
lmp agent write src/change.ts \
  --mind ./.lending-mind/skills/baseline \
  --workspace . \
  --content 'export const approved = true;'
```

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
