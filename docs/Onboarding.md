# Lending-Mind Onboarding

## Launch-day zero-config bootstrap

`npx lmp init` is safe to run against a new or existing repository. It records detected languages, monorepo tools, and practical framework signals in `.lending-mind/config.json`; it does not upload source code or silently enable network access. The generated runtime state remains local and can be removed with:

```bash
npx lmp --uninstall .
```

The initializer preserves unrelated project guidance and existing MCP servers. Project-scoped integrations are written only for the selected host and report `runtime-unavailable` when verified Rust binaries are not present. In a Git workspace, onboarding installs the fail-closed `.git/hooks/pre-commit` boundary and records it in `.lmp_telemetry/enforcement.json`; `--install-hooks` remains available for an explicit request and non-Git workspaces report an install error rather than pretending enforcement exists. Both initializers default to advisory evaluation unless an enforced Git boundary is explicitly installed; the Rust runtime also honors an explicit `defaultMode` from workspace configuration.

When `lmp use` changes the active Mind in an enforced workspace, the generated
pre-commit hook is updated to evaluate the newly selected profile. An existing
hook without the LMP generated marker is never overwritten; the switch fails
closed instead of claiming that the new Mind is enforced.

For non-technical users, the public Mind Vault is the visual path: select a package, use its export action to download a plain-English `LMP_INSTRUCTIONS.md`, and add that file to the AI project’s knowledge/context area. This is guidance injection, not proof that the host obeyed the guidance; a local LMP evaluation is the verification boundary.

## Goal

A new user should receive value from Lending-Mind without learning the protocol internals.

The first-run experience must be:

- Local.
- Offline.
- Enforced at an available Git boundary; explicitly advisory only when no such boundary exists.
- Non-mutating.
- No Docker.
- No daemon.
- No OCI.
- No IPFS.
- No signatures.
- No MCP.
- No network.
- No uploads.
- No package installation.
- Automatic fail-closed Git hook when the target is a Git workspace.

The user should understand LMP in one sentence:

> LMP gives a coding agent the same engineering rules a team would apply in review, then checks the patch and explains what needs fixing.

## First-run workflow

### 1. Install or invoke the CLI

```bash
pnpm install
pnpm --filter @lending-mind/cli build
```

Or use the packaged initializer when available:

```bash
npx @lending-mind/create-lending-mind
```

### 2. Initialize the repository

```bash
pnpm lmp init --install-baseline
```

Expected behavior:

- Creates `.lending-mind/config.json`.
- Installs or references the baseline profile.
- Creates `.lending-mind/artifacts/`.
- Does not overwrite existing configuration without `--force`.
- Installs the fail-closed Git hook automatically in a Git workspace; a pre-existing hook requires `--force` before replacement.
- Does not modify source files.
- Does not run package scripts.
- Does not use the network.

Example output:

```text
✓ Lending-Mind initialized

Profile: baseline@1.0.0
Mode: enforced (Git boundary)
Network: disabled
Commands: disabled
Uploads: disabled

Next:
  lmp evaluate
  lmp agent instructions
```

### 3. Run the first evaluation

```bash
pnpm lmp evaluate
```

Expected behavior:

- Resolves the active profile.
- Inspects repository configuration.
- Detects available tools.
- Evaluates safe static checks.
- Records skipped checks.
- Writes a local redacted artifact.
- Prints a readable summary.

Example output:

```text
LMP Evaluation — Advisory

Profile: baseline@1.0.0
Capability mode: local
Commands: not run
Network: disabled

PASS  Repository configuration discovered
WARN  TypeScript strict mode is disabled
WARN  3 explicit any usages found in production source
WARN  Source files exist but no test files were found
INFO  Detected available checks: pnpm lint, pnpm typecheck, pnpm test

Artifact:
.lending-mind/artifacts/2026-08-25T10-08-00Z-run.json
```

### 4. Select a profile

```bash
pnpm lmp profile list
pnpm lmp profile use profiles/typescript-minimal
```

Expected output:

```text
Profile selected: typescript-minimal@0.3.1

Default mode remains: advisory

This profile will check:
- TypeScript strict mode
- Explicit any
- eval and dynamic require
- Dependency policy
- Test presence
- Complexity threshold

This profile will not:
- Modify code
- Run commands unless requested
- Upload artifacts
- Require Docker or a daemon
```

### 5. Evaluate with the selected profile

```bash
pnpm lmp evaluate --mind profiles/typescript-minimal --mode advisory
```

Expected behavior:

- Uses the selected profile.
- Runs only safe static checks.
- Does not run package scripts.
- Does not modify files.
- Writes an artifact.

### 6. Run approved checks explicitly

```bash
pnpm lmp evaluate \
  --mind profiles/typescript-minimal \
  --mode advisory \
  --run-approved-checks
```

Expected behavior:

- Runs only allowlisted package scripts.
- Uses `shell: false`.
- Uses workspace cwd.
- Applies timeout and output truncation.
- Redacts secrets and environment values.
- Records command results in the artifact.

### 7. Use enforced mode only after tuning

```bash
pnpm lmp evaluate \
  --mind profiles/typescript-minimal \
  --mode enforced \
  --run-approved-checks
```

Expected behavior:

- Error-severity findings produce a non-zero exit code.
- Warnings remain visible.
- Skipped checks remain visible.
- Artifact records blocking behavior.

## Agent onboarding

Every bundled profile includes a `SKILL.md` compatibility wrapper.

The wrapper tells the agent to:

1. Inspect existing modules, tests, and configuration.
2. Read the active profile guidance.
3. Respect approved tools and repository boundaries.
4. Run LMP evaluation before finishing.
5. Fix error-level findings or document approved exceptions.
6. Return the artifact path and validation summary.

The wrapper does not replace the profile schema or evaluator.

## MCP onboarding

The stdio server is `lending-mind-mcp`.

Example configuration with a placeholder executable path:

```json
{
  "mcpServers": {
    "lending-mind": {
      "command": "<path-to-pnpm>",
      "args": [
        "--dir",
        "<path-to-lending-mind-repository>",
        "exec",
        "lending-mind-mcp"
      ]
    }
  }
}
```

MCP behavior:

- Commands are not executed unless `runCommands: true`.
- Offline and audit paths refuse command execution.
- MCP does not publish profiles or upload artifacts in the local product workflow.
- MCP tool inputs are validated.
- MCP responses include structured data and readable text.

## Team onboarding

### Week 1: Observe only

```bash
pnpm lmp evaluate --mode audit
```

Purpose:

- Discover existing patterns.
- Measure warning volume.
- Identify noisy rules.
- Create baselines.
- Avoid blocking anyone.

### Week 2–3: Advisory mode

```bash
pnpm lmp evaluate --mode advisory
```

Purpose:

- Agents receive remediation feedback.
- Teams tune rule severity.
- Reviewers compare LMP findings with actual PR feedback.
- Exceptions and suppressions are reviewed.

### Week 4+: Enforced mode

```bash
pnpm lmp evaluate \
  --profile lmp:profile:company-platform@1.4.0 \
  --mode enforced \
  --run-approved-checks
```

Only enforce rules that are:

- Clear and measurable.
- Low false-positive.
- Well remediated.
- Covered by fixtures.
- Accepted by the owning team.

## Advanced onboarding

Advanced capabilities are opt-in.

### Connected mode

```bash
pnpm lmp daemon start --workspace .
pnpm lmp mcp serve
```

Benefits:

- Continuous local auditing.
- Dynamic profile instructions.
- Editor and agent integrations.
- Local synchronization.

Still default:

- No upload.
- No network without explicit configuration.

### Attested mode

```bash
pnpm lmp profile verify lmp:profile:company-platform@1.4.0
pnpm lmp evaluate --mode enforced --sign-artifact
```

Benefits:

- Profile signature verification.
- Artifact signing.
- Optional OCI distribution.
- Optional sandbox execution.

Remote sync requires explicit destination and approval:

```bash
pnpm lmp registry sync \
  --destination registry.example.com/lmp \
  --allow-upload
```

Before upload, LMP must show:

```text
You are about to upload:
- Profile metadata: yes
- Evaluation artifact: yes
- Raw source code: no
- Raw workspace paths: no
- Redacted command output: yes
- Destination: registry.example.com/lmp

Continue? [y/N]
```

## What onboarding must not do

Onboarding must not:

- Install Docker.
- Start a daemon.
- Require OCI or IPFS.
- Require signatures.
- Require MCP.
- Use the network.
- Upload telemetry.
- Modify source files.
- Install packages.
- Overwrite configuration.
- Install a Git hook in a non-Git workspace or overwrite an existing hook without `--force`.
- Run arbitrary profile-supplied commands.

## Success condition

A new user should be able to say:

> “LMP found the same issue my reviewer usually finds, explained it clearly, the agent fixed it, and the PR now shows exactly what was checked.”

If onboarding requires advanced infrastructure before that outcome, the product has failed its first-run test.
