---
name: lending-mind-protocol
description: Uses Lending-Mind Protocol to onboard a repository, activate a verified engineering Mind, load its guidance, evaluate scoped changes, remediate findings, and report machine-readable evidence. Use when users request LMP setup, profile selection, agent guardrails, code evaluation, quality verification, or governed AI-assisted development.
---

# Lending-Mind Protocol

Use LMP as a reviewable engineering control loop around an AI-assisted change.
The skill coordinates setup, profile selection, guidance loading, evaluation,
remediation, and evidence. It does not claim that a passing run proves the
code is correct, secure, maintainable, or human-authored.

## Core Workflow

1. **Inspect the repository**: Identify the project root, language, package manager, existing tests, working-tree state, and any existing `.lending-mind/` configuration. Do not overwrite project guidance or unrelated configuration.
2. **Choose the operating path**: Use packaged `create-lmp`/`lmp` when available. Use a local tarball or direct repository path for unpublished LMP packages. Use the Rust checkout commands only when the LMP repository itself is being developed.
3. **Onboard once**: Run `create-lmp` with an explicit agent host, stack, strategy, and Mind. Brownfield repositories must use `--strategy brownfield` unless an intentional exception is documented.
4. **Load the active Mind**: Read `.lending-mind/config.json`, the installed `mind.json`, `SKILL.md`, `guidance.md`, and the active rules before proposing or editing code. Treat profile guidance as an explicit engineering contract, not hidden model context.
5. **Evaluate the smallest useful scope**: Prefer `--changed-only` for a brownfield change. Use an explicit `--base` when the comparison revision matters. Save JSON evidence under an ignored run directory.
6. **Remediate findings**: Fix error-level findings in the source, then rerun the same profile and scope. Do not weaken or replace the profile merely to make a result pass. If a finding is a false positive or intentional exception, record the rationale and required human approval.
7. **Verify and report**: Run the project’s tests and relevant typecheck/lint/build checks. Report the profile identity and digest, selected files, findings, skipped checks, remediation state, test results, artifact path, and limitations.

## Setup

### Existing project

Run from the project root:

```bash
npx create-lmp --yes \
  --agent claudecode \
  --stack typescript-node \
  --strategy brownfield \
  --mind baseline .
```

Supported host values currently include `claudecode`, `claudedesktop`,
`cursor`, and `cline`. Select the stack that describes the repository rather
than the language the next file happens to use. For a new empty repository,
use `--strategy greenfield`.

Onboarding verifies the bundled profile signature before copying it and writes
project-scoped state such as:

- `.lending-mind/config.json` and `.lending-mind/mind/`;
- `.lmp_telemetry/runtime.json`, adapter, and host-integration records;
- project-scoped MCP configuration when a verified sidecar is available;
- additive ignore rules for generated state, telemetry, benchmark output, and
  private signing material.

Read `.lmp_telemetry/host-integrations.json` before saying that MCP is
connected. A fallback entry with `available: false` is not a connected MCP
integration.

### Unpublished local packages

When LMP packages are not published, use a package boundary from the LMP
checkout. A tarball is the most realistic external-project test:

```bash
mkdir -p /tmp/lmp-local-packages
pnpm --filter @lending-mind/sdk build
pnpm --filter @lending-mind/lmp build
pnpm --dir packages/core pack --pack-destination /tmp/lmp-local-packages
pnpm --dir packages/cli pack --pack-destination /tmp/lmp-local-packages
pnpm add file:/tmp/lmp-local-packages/lending-mind-lmp-0.1.0.tgz
```

Use the exact filename printed by `pnpm pack`. Direct local paths are useful
for rapid iteration; linking is useful for repeated rebuilds but is less like
a production install. Never describe a local package test as a public release.

### LMP repository checkout

Only when developing LMP itself:

```bash
./install.sh --check-only
cargo build --workspace
cargo test --workspace
```

Do not make a project user build the Rust workspace if onboarding already
installed a verified runtime release.

## Load and inspect the Mind

After onboarding or activation:

```bash
npx lmp use baseline
npx lmp instructions --mind ./.lending-mind/mind
npx lmp validate ./.lending-mind/mind/mind.json
```

For a locally available profile, use its stable key, for example
`tj-ponytail`, `supabase-core`, or `linux-kernel`. Confirm that the selected
profile’s language, dependency, complexity, command, and enforcement rules
actually apply to the repository. A profile name is not proof of authorship or
external endorsement.

Before implementation, summarize the loaded contract in visible terms:

```text
Active Mind: <lmp:mind:key>@<version>
Scope: <repository and changed-file boundary>
Hard checks: <rules that can block or fail the run>
Advisory checks: <rules that produce warnings or evidence>
Skipped checks: <unsupported language/tool checks and why>
Human decisions required: <exceptions, approval, deployment, or publication>
```

## Evaluate and remediate

Use the smallest scope that answers the user’s question:

```bash
npx lmp evaluate \
  --workspace . \
  --mind ./.lending-mind/mind \
  --changed-only \
  --artifact-dir ./.lending-mind/artifacts \
  --json
```

For a known comparison:

```bash
npx lmp evaluate \
  --workspace . \
  --mind ./.lending-mind/mind \
  --base origin/main \
  --artifact-dir ./.lending-mind/artifacts \
  --json
```

Interpret results in this order:

1. Confirm the profile identity, version, signature status, and selected file
   list.
2. Separate hard findings, advisory findings, skipped checks, and evaluator
   errors. A skipped parser is not a pass.
3. Fix source findings while preserving behavior and tests.
4. Rerun with the same profile and scope.
5. Run native project checks independently; LMP does not replace them.

An empty changed-only scope is valid evidence that no changed files were
selected. It is not evidence that the complete repository is defect-free.

## Agent-host usage

The installed `SKILL.md` and `guidance.md` are the visible context for an
agent host. The MCP adapter is an optional host integration, not the evaluator
itself. When available, it gives the host a project-scoped protocol surface;
the Rust evaluator remains authoritative for supported AST checks, signatures,
scope, and evidence generation.

If a host proposes a command, dependency installation, network action, or
deployment, check the configured autonomy authorization before allowing it.
Do not silently install tools or grant a broader workspace boundary. Record a
denial as a denial, not as a successful no-op.

## Profile contribution and evolution

Do not edit an installed profile to make a failing project pass. For a custom
Mind, provide a complete package with:

- `mind.json`, `SKILL.md`, `guidance.md`, and `evidence/README.md`;
- explicit rules and `rules/manifest.json`;
- positive, negative, and exception fixtures where the rule needs them;
- source provenance, limitations, and allowed-use metadata;
- detached signature material and release metadata.

Validate and sign the package before sharing it:

```bash
npx lmp validate ./path/to/mind/mind.json
npx lmp share ./path/to/mind --out ./shared-mind
```

Profile evolution uses proposal review and a new semantic version. Approval is
not the same as publication, and a local signature is not an immutable IPFS or
OCI release.

## Best Practices

- Keep LMP state and artifacts project-scoped and ignored; never commit private
  keys or disposable benchmark output.
- Keep one canonical profile and one canonical evidence artifact per run.
- Prefer changed-only evaluation for daily brownfield work and full evaluation
  for release or architecture decisions.
- Preserve skipped checks and limitations in every report.
- Use tests, typechecks, linters, security tools, and human review alongside
  LMP. LMP narrows and records risk; it cannot establish universal correctness.
- Treat `latest` as a moving selector. Pin an exact profile version when an
  evidence result must be reproducible.
- Do not claim hosted deployment, public package availability, IPFS/OCI
  publication, independent review, or human adoption without fresh evidence.

## Output Checklist

Every completed LMP-assisted task should include:

- [ ] Repository strategy and evaluated scope are explicit.
- [ ] Active Mind ID, version, signature status, and relevant rules are named.
- [ ] Guidance was loaded before implementation.
- [ ] Evaluation JSON and artifact path are recorded.
- [ ] Hard findings were fixed, or exceptions have rationale and approval.
- [ ] Skipped checks and evaluator limitations are reported.
- [ ] Native tests, typecheck, lint, and build checks were run when applicable.
- [ ] The final statement distinguishes local evidence from external claims.
