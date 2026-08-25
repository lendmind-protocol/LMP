<div align="center">
  <img src="./public/assets/banner.png" alt="Lending-Mind Protocol — Deterministic guardrails for AI-built software" width="800" />
</div>

<h1 align="center">LMP</h1>

<p align="center"><strong>Deterministic guardrails for AI-built software.</strong></p>

<p align="center">
  <em>Lending-Mind is a runtime protocol, not Markdown.</em>
</p>

Lending-Mind aligns AI coding agents with versioned engineering methodologies: their principles, trade-offs, implementation patterns, repository conventions, and review expectations. It compiles those profiles into agent guidance, typed context, tool boundaries, verification plans, bounded remediation loops, and reviewable evidence artifacts.

> **Product promise:** LMP gives a coding agent the same engineering rules a team would apply in review, then checks the patch and explains what needs fixing.

> **MVP status:** The repository includes a local TypeScript runtime, filesystem registry, CLI, and stdio MCP server. Node 22+ is required. The Rust workspace, daemon, signing, synchronization, and telemetry components are preserved as protocol-core and advanced integration surfaces; they are not required for the local first-run workflow.

## What it is

LMP is a methodology and verification runtime for AI-built software. A profile contains human-readable principles and trade-offs alongside machine-readable policies, provenance, tests, exceptions, and version metadata.

The runtime compiles a selected profile into:

- A task-scoped instruction bundle for compatible coding agents.
- A typed context manifest separating hard constraints, repository facts, guidance, findings, and historical evidence.
- A tool authorization and command-execution plan.
- A deterministic and existing-tool evaluation plan.
- A bounded remediation loop with retry limits and escalation.
- A redacted evidence artifact and optional pull-request summary.

It is designed to turn repository and team tribal knowledge into repeatable checks before human review.

## What it is not

LMP is not:

- A person or team identity clone.
- A claim to reproduce anyone's private reasoning or complete expertise.
- A base-model training or model-weight update system.
- A replacement for human review, security review, threat modeling, tests, CI, or production validation.
- A generic replacement for TypeScript, Biome, ESLint, Semgrep, CodeQL, OPA, or test runners.
- An automatic code mutator.
- An automatic telemetry uploader.
- A required Docker, daemon, OCI, or IPFS installation.

Community profiles are generic archetypes. Individual or organization profiles require explicit authorization, provenance, review, and optional signing.

## How it works

```text
Versioned methodology profile
        ↓
Profile compiler
        ├── Agent instruction bundle
        ├── Typed task context
        ├── Tool authorization matrix
        ├── Evaluation plan
        └── Loop policy
        ↓
AI coding agent changes the repository
        ↓
LMP evaluates the change using existing tools and profile rules
        ↓
Agent receives concrete remediation findings
        ↓
Bounded correction loop or human escalation
        ↓
Redacted local evidence artifact
        ↓
Optional PR summary and human-reviewed profile proposal
```

The key invariant is:

```text
One profile → guidance + verification + evidence
```

## Quickstart

The default workflow is local, offline, advisory, and non-mutating.

```bash
pnpm install
pnpm --filter @lending-mind/cli build
pnpm lmp init --install-baseline
pnpm lmp evaluate
```

The first evaluation does not run package scripts, use the network, install packages, modify source files, start Docker, or upload artifacts.

Select a profile:

```bash
pnpm lmp profile use skills/typescript-minimal
pnpm lmp evaluate --mode advisory
```

Run explicitly approved repository checks:

```bash
pnpm lmp evaluate --run-approved-checks
```

Use enforced mode only after the profile has been tuned for the repository:

```bash
pnpm lmp evaluate \
  --mind skills/typescript-minimal \
  --workspace examples/noncompliant-service \
  --mode enforced \
  --run-approved-checks
```

## Evaluation output

```text
LMP Evaluation — Advisory

Profile: typescript-minimal@0.3.1
Capability mode: local
Commands: not run
Network: disabled

PASS  TypeScript configuration discovered
PASS  Dependency policy evaluated
WARN  3 explicit any usages found in production source
WARN  One denied dependency is present
INFO  Test command detected but not executed

Artifact:
.lending-mind/artifacts/2026-08-25T10-08-00Z-run.json
```

Every finding includes a rule ID, severity, evidence, rationale, remediation, and blocking behavior for the current mode.

## Profiles

Bundled profiles include:

```text
lmp:profile:baseline@1.0.0
lmp:profile:typescript-minimal@0.3.1
```

A profile may contain:

- Principles and beliefs.
- Technical trade-offs.
- Decision rules.
- Preferred and rejected patterns.
- Repository and tool policies.
- Source provenance and evidence tiers.
- Exceptions and suppressions.
- Positive, negative, and exception fixtures.
- Version history and changelog.
- Optional Ed25519 signature metadata.

Guidance expresses methodology. Rules express observable behavior. Rules may be deterministic, verifiable, judgment-guided, or human-only. LMP does not pretend that every architectural judgment can be proven by AST analysis.

Profile references are semvered and may be pinned by exact version and digest:

```text
lmp:profile:company-platform@1.4.0
```

## Agent integration

Every bundled profile includes a short `SKILL.md` compatibility wrapper for compatible agent clients. It provides portable discovery and a visible completion checklist; it does not replace LMP's evaluator or profile schema.

The wrapper tells the agent to:

1. Inspect existing modules, tests, and configuration.
2. Read the active profile guidance.
3. Respect approved tools and repository boundaries.
4. Run LMP evaluation before finishing.
5. Fix error-level findings or document approved exceptions.
6. Return the artifact path and validation summary.

LMP also exposes compiled instructions through the CLI:

```bash
pnpm lmp agent instructions --mind skills/typescript-minimal --format markdown
```

## MCP integration

The stdio server is `lending-mind-mcp`. It exposes profile listing, instruction compilation, workspace evaluation, rule explanation, and artifact retrieval.

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

MCP commands are not executed unless `runCommands: true`. Offline and audit paths refuse command execution. MCP does not publish profiles or upload artifacts in the local product workflow.

## Existing tool integration

LMP coordinates existing tools instead of reimplementing the entire developer-tool ecosystem.

Supported or planned adapters include:

- TypeScript compiler and `tsconfig.json`.
- Biome.
- ESLint.
- Test commands.
- Dependency audits.
- Semgrep where installed and explicitly enabled.
- OPA/Rego where an organization already uses it.
- Git metadata.
- Existing Rust AST validation.
- Optional Docker sandbox.

If an optional tool is unavailable, LMP records a skipped check and explains why. It never silently installs a missing tool.

## Evidence artifacts

Every evaluation writes a local artifact:

```text
.lending-mind/artifacts/<timestamp>-<run-id>.json
```

The artifact records:

- Profile ID, version, digest, and signature status.
- Evaluation mode and capability mode.
- Findings and remediation.
- Tool availability and skipped checks.
- Approved command results, if any.
- Loop state transitions and retry count.
- Git revision and anonymized workspace identity.
- Privacy and redaction metadata.
- Explicit limitations.

A PR summary can be generated:

```bash
pnpm lmp artifact pr-summary <artifact-path>
```

Example summary:

```text
Profile: company-platform@1.4.0
Hard violations: 0
Warnings: 3
Typecheck: passed
Tests: passed
Dependency diff: reviewed
Skipped: Semgrep unavailable
Artifact: .lending-mind/artifacts/<run-id>.json
```

A passing artifact is evidence of performed checks, not proof that the system is safe or correct.

## Autonomy and remediation

LMP treats prompts as guidance, not enforcement. Critical requirements are represented in multiple forms:

```text
Agent guidance
  + typed policy
  + tool authorization
  + independent evaluator
  + bounded remediation loop
  + evidence artifact
```

The loop is bounded by profile and task policy. It can stop when:

- The same finding repeats.
- A test regression occurs.
- A security error appears.
- The agent attempts an unauthorized command or network action.
- The retry budget is exhausted.
- Human judgment is required.

External actions such as upload, deployment, push, or publication require explicit approval and are not part of the default local workflow.

## Profile authoring and evolution

A profile can be authored from a team's existing architecture docs, runbooks, CI files, lint configuration, review guidance, and approved code examples.

The Profile Evidence Pipeline produces candidates, not automatic truth:

```text
Permitted source
  → evidence manifest
  → candidate claim
  → cross-source validation
  → human review
  → measurable rule
  → fixtures and benchmark
  → semvered profile release
```

Artifacts can create a human-reviewable promotion proposal, but they never automatically modify an active profile or train a base model:

```bash
pnpm lmp proposal create \
  --profile lmp:profile:typescript-minimal@0.3.1 \
  --artifacts <artifact-paths>
```

## Security defaults

- No network, uploads, package installation, telemetry, or source mutation by default.
- Child processes use exact argument lists, `shell: false`, workspace cwd, timeouts, truncation, and redaction.
- Artifacts hash workspace paths and exclude source, secrets, environments, and raw paths.
- Profile packages are schema-validated before use.
- Signatures prove possession of a signing key and package integrity, not policy correctness.
- Remote OCI and IPFS distribution are opt-in advanced capabilities.
- Passing validation never replaces code review, security review, tests, threat modeling, or human judgment.

## Repository map

| Directory | Purpose |
| --- | --- |
| `packages/` | Core, schema, compiler, evaluator, registry, CLI, MCP, and initializer |
| `skills/` | Bundled baseline and TypeScript Minimal profiles |
| `examples/` / `test-fixtures/` | Reproducible compliant and violating workspaces |
| `docs/` | Architecture, format, evaluation, governance, security, and profile evidence |
| `crates/` | Preserved Rust protocol prototype and advanced runtime surfaces |
| `orchestrator/` | Existing benchmark, sandbox, evaluation, and telemetry tooling |
| `registry/` | Existing profile schema and definitions |

## Development

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:skills
```

For the preserved Rust core:

```bash
cargo fmt --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

The supported TypeScript runtime is Node 22+ and pnpm. Advanced Rust, Docker, OCI, IPFS, and external-agent checks may be optional depending on the local environment.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for milestone-based delivery. Existing protocol components are preserved and classified by implementation status rather than removed. The local TypeScript workflow is the default product path; daemon, signing, sandbox, OCI, IPFS, and fleet capabilities are advanced opt-in surfaces.

## Contributing and governance

Read:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [docs/governance.md](docs/governance.md)
- [docs/profile-authoring.md](docs/profile-authoring.md)
- [SECURITY.md](SECURITY.md)

## License

Released under the [MIT License](LICENSE). See [NOTICE.md](NOTICE.md) for attribution and third-party notices.
