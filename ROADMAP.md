# Lending-Mind Protocol Roadmap

## Product North Star

Lending-Mind Protocol is a runtime methodology and verification system for AI-built software. It compiles curated engineering principles, trade-offs, implementation patterns, repository policies, and evidence into agent guidance, typed context, tool boundaries, bounded remediation loops, and reviewable artifacts.

The central product promise is:

> LMP gives a coding agent the same engineering rules a team would apply in review, then checks the patch and explains what needs fixing.

LMP is a system, not merely Markdown. `SKILL.md`, `AGENTS.md`, Cursor rules, MCP, existing linters, compilers, tests, security tools, CI, the Rust runtime, the daemon, signing, and registries are integration surfaces inside a larger methodology and evidence system.

LMP does not claim to clone a person, reproduce private reasoning, train base-model weights, guarantee software quality, or replace human review.

## Status Legend

- Complete
- Productized
- Experimental
- Partial
- Verification Needed
- Planned
- Optional Advanced Capability

## Product Layers

```text
Profile methodology
  → prompt and context compilation
  → harness permissions and tool adapters
  → bounded remediation loop
  → deterministic and existing-tool evaluation
  → evidence artifact
  → human-reviewed profile evolution
```

## Existing Capability Inventory

This inventory must be kept synchronized with the actual repository. Existing implementations must be preserved unless a replacement is required for correctness and the migration is documented.

| Capability | Existing path/package | Current status | Evidence/tests | Required action |
|---|---|---|---|---|
| Rust workspace | `Cargo.toml`, `crates/` | Existing / verify | Rust workspace sources are present | Audit build, tests, feature boundaries, and release behavior |
| Shared Rust profile and AST validation | `crates/lmp-core/` | Existing / verify | AST and profile-related sources are present | Add regression tests and classify supported rule coverage |
| Long-running local daemon | `crates/lmpd/` | Existing / verify | Daemon source and CLI design are present | Verify lifecycle, shutdown, workspace boundaries, and one-shot compatibility |
| MCP JSON-RPC audit adapter | `crates/lmp-mcp/` | Existing / verify | MCP adapter source is present | Test protocol lifecycle, tool schemas, authorization, and error behavior |
| Local profile synchronization | `lmp-sync` or related existing modules | Existing / verify | Sync design is documented | Verify offline behavior, cache integrity, and failure handling |
| Ed25519 profile signing | `crypto` and signer sources | Existing / verify | Signing and verification implementation is documented | Add tamper, key, rotation, and trust-boundary tests |
| Python benchmark workflow | `orchestrator/` | Existing / verify | Benchmark and telemetry scripts are present | Remove simulated claims, label fixtures, and add reproducibility metadata |
| Python telemetry workflow | `orchestrator/sandbox.py`, evaluation modules | Existing / experimental | Telemetry scripts are present | Validate measurements, redaction, limitations, and optional execution |
| OCI registry transport | `lmp-sync` or registry modules | Existing / experimental | OCI architecture is documented | Replace mocks/stubs with explicit status; test digest verification and opt-in behavior |
| IPFS distribution adapter | Existing architecture references | Planned / optional | Architecture documentation exists | Keep optional; define interface, threat model, and explicit enablement requirements |
| Rust language parser | Existing Rust AST modules | Existing / verify | Rust parser sources are present | Test supported syntax and document unsupported semantics |
| TypeScript compatibility layer | Existing TypeScript product files | Productized / verify | README and packages describe local TypeScript runtime | Validate CLI, profiles, evaluator, artifacts, and fixtures |
| Filesystem registry | Existing local registry/product files | Productized / verify | README documents immutable local installation | Test resolution, version pinning, digest, and safe install behavior |
| CLI | Existing CLI package | Productized / verify | README documents `lmp` commands | Test all user-facing commands and stable exit codes |
| Profile compiler | Existing compiler or prompt injector | Existing / productize | Architecture includes prompt compilation | Implement typed context and remove hidden chain-of-thought language |
| Docker sandbox | Existing Python/Rust sandbox prototype | Experimental / optional | Sandbox scripts and architecture are present | Keep opt-in; add resource, network, image, and output safety tests |
| Generated documentation | `orchestrator/gen_docs.py` or equivalent | Existing / verify | Documentation generator exists | Make output deterministic and prevent generated docs from claiming unsupported guarantees |
| GitHub Actions CI | `.github/workflows/` | Existing / verify | CI workflow references exist | Test current paths, correct invalid configuration, and archive artifacts safely |
| Release workflow | `.github/workflows/release.yml` | Existing / verify | Release design is documented | Add stable-toolchain verification, checksums, and explicit publish gates |
| Profile definitions | `registry/definitions/`, `skills/` | Existing / verify | Baseline/example definitions exist | Normalize naming, provenance, rules, tests, and limitations |

## Milestone 0 — Core Inventory and Stability Baseline

**Goal:** Establish the actual implementation state of the existing protocol core before adding new behavior.

**Includes:**

- Rust workspace.
- Rust AST validation.
- `lmpd` daemon.
- MCP adapter.
- Local synchronization.
- Ed25519 signing.
- OCI transport and digest verification.
- Python benchmark and telemetry workflow.
- Docker sandbox prototype.
- Existing profile schemas and definitions.
- Existing CI, release, and documentation tooling.

**Acceptance criteria:**

- [ ] `docs/core-capability-inventory.md` exists and reflects actual source paths.
- [ ] Existing code is not removed merely because it is advanced or optional.
- [ ] Existing tests run or are recorded as missing.
- [ ] Mocks and simulations are explicitly labeled.
- [ ] Unsupported or incomplete behavior is documented.
- [ ] Rust, TypeScript, and Python components have clear ownership boundaries.
- [ ] Existing commands have stable documented behavior.

**Dependencies:** None.

## Milestone 1 — Local-First Product Experience

**Goal:** Make the first user experience useful without advanced infrastructure.

**Acceptance criteria:**

- [ ] `lmp init --baseline` works in an existing repository.
- [ ] `lmp evaluate` works without Docker, daemon, OCI, IPFS, signatures, network, or MCP.
- [ ] Evaluation defaults to advisory mode.
- [ ] No commands run without explicit authorization.
- [ ] No source files are modified automatically.
- [ ] No telemetry is uploaded.
- [ ] A local redacted artifact is created.
- [ ] The first run explains available tools, skipped tools, findings, and next steps.
- [ ] Onboarding does not overwrite existing configuration without `--force`.

**Dependencies:** Milestone 0.

## Milestone 2 — Profile Contracts and Policy Compilation

**Goal:** Define a profile as a versioned engineering methodology package rather than a text prompt.

**Acceptance criteria:**

- [ ] Profile schema is versioned and validated.
- [ ] Profiles include principles, trade-offs, decision rules, anti-patterns, provenance, exceptions, and limitations.
- [ ] Every enforceable rule has an ID, severity, rationale, assertion, scope, remediation, and evidence classification.
- [ ] Rules are classified as deterministic, verifiable, judgment-guided, or human-only.
- [ ] Profile references support exact semver versions and content digests.
- [ ] Invalid impersonation claims are rejected.
- [ ] Guidance and machine policy remain separate fields.
- [ ] Profile compiler produces an instruction bundle and a typed context manifest.
- [ ] Compiler output does not request private chain-of-thought.

**Dependencies:** Milestone 1.

## Milestone 3 — Deterministic Evaluation and Tool Adapters

**Goal:** Coordinate existing tools without reimplementing their ecosystems.

**Acceptance criteria:**

- [ ] Adapter interface includes detection, capabilities, planning, execution, normalization, redaction, and unavailable-tool explanation.
- [ ] TypeScript compiler and `tsconfig.json` are supported.
- [ ] Biome and ESLint are reused when configured.
- [ ] Existing test commands are detected but not run automatically.
- [ ] Dependency policy checks package manifests and lockfile changes safely.
- [ ] Semgrep, CodeQL, OPA, and Docker are optional adapters.
- [ ] Basic fallback AST checks are clearly documented as incomplete.
- [ ] Missing tools produce skipped-check records rather than silent failure or automatic installation.
- [ ] Findings use one normalized schema.
- [ ] Every finding has evidence, rationale, remediation, severity, and limitations.

**Dependencies:** Milestone 2.

## Milestone 4 — Baseline and TypeScript Minimal Profiles

**Goal:** Deliver useful initial profiles with measurable rules and low-friction adoption.

**Acceptance criteria:**

- [ ] `lmp:profile:baseline@1.0.0` exists and defaults to advisory/offline/no-command mode.
- [ ] `lmp:profile:typescript-minimal@0.3.1` exists as a community archetype, not a person simulation.
- [ ] Profiles include valid `SKILL.md` compatibility wrappers.
- [ ] Profiles include positive, negative, and exception fixtures.
- [ ] TypeScript Minimal checks strict mode, explicit `any`, `eval`, dynamic require, unsafe logs, complexity, tests, dependencies, and dependency rationale.
- [ ] Profile rules include known limitations and exception behavior.
- [ ] Profile packages validate successfully in CI.

**Dependencies:** Milestone 2 and Milestone 3.

## Milestone 5 — Bounded Agent Remediation Loops

**Goal:** Make LMP perform a first review pass and provide structured correction instead of merely rejecting output.

**Acceptance criteria:**

- [ ] Explicit state machine exists: initialize, resolve, context, plan, implement, evaluate, remediate, attest, report, escalate.
- [ ] Typed findings can be returned to the agent as remediation context.
- [ ] Retry limits are configurable.
- [ ] Repeated findings stop the loop and escalate.
- [ ] Test regression stops the loop.
- [ ] Unauthorized tool, network, or workspace-boundary attempts stop the loop.
- [ ] Loop transitions are written to artifacts.
- [ ] Human escalation is supported for ambiguous or human-only policy decisions.
- [ ] The agent cannot declare success while required checks are unresolved.
- [ ] LMP does not expose or request hidden chain-of-thought.

**Dependencies:** Milestone 3 and Milestone 4.

## Milestone 6 — Autonomy and Tool Authorization

**Goal:** Give agents useful autonomy inside explicit, risk-calibrated boundaries.

**Acceptance criteria:**

- [ ] Autonomy levels A0 through A6 are represented in the policy model.
- [ ] Each profile may define an autonomy ceiling.
- [ ] Filesystem writes are restricted to approved workspace roots.
- [ ] Command execution uses explicit allowlists, `shell: false`, timeout, redaction, and bounded output.
- [ ] Network is disabled by default.
- [ ] Package installation is disabled by default.
- [ ] Deployment, push, publication, and upload require explicit approval.
- [ ] MCP and daemon integrations respect authorization policy.
- [ ] External actions are not implemented as hidden side effects of evaluation.

**Dependencies:** Milestone 3 and Milestone 5.

## Milestone 7 — Evidence Artifacts and Pull-Request Workflow

**Goal:** Make every meaningful evaluation reviewable by humans and machines.

**Acceptance criteria:**

- [ ] Every evaluation creates a canonical local JSON artifact.
- [ ] Artifacts contain profile identity, version, digest, signature status, findings, checks, skipped checks, commands, loop transitions, and limitations.
- [ ] Workspace paths are hashed or intentionally omitted.
- [ ] Source code is excluded by default.
- [ ] Secrets and command output are redacted and truncated.
- [ ] Markdown PR summary is generated.
- [ ] GitHub Actions job summary is supported.
- [ ] Artifacts state what they cannot prove.
- [ ] No single vanity score is the primary output.
- [ ] Optional trend metrics are explainable and never the sole gate.

**Dependencies:** Milestone 3, Milestone 5, and Milestone 6.

## Milestone 8 — SKILL.md and MCP Compatibility

**Goal:** Integrate with existing coding-agent ecosystems instead of competing with them.

**Acceptance criteria:**

- [ ] Each bundled profile contains a portable `SKILL.md` wrapper.
- [ ] SKILL.md uses progressive, task-focused instructions.
- [ ] LMP instructions identify the profile evaluator and artifact workflow.
- [ ] MCP exposes profile listing, instructions, typed context, evaluation, rule explanation, artifact retrieval, and loop status.
- [ ] MCP tool inputs are validated.
- [ ] MCP cannot execute commands without explicit authorization.
- [ ] MCP cannot upload or publish in local mode.
- [ ] Integration tests cover initialization, tools/list, tools/call, errors, and authorization.
- [ ] Documentation explains the relationship between Skills, MCP, and LMP.

**Dependencies:** Milestone 2, Milestone 5, and Milestone 6.

## Milestone 9 — Profile Evidence Pipeline and Governance

**Goal:** Support high-fidelity professional and organizational profiles without unsupported claims or uncontrolled scraping.

**Acceptance criteria:**

- [ ] Source manifest supports source type, access method, rights/permission status, content digest, retention policy, and allowed use.
- [ ] Candidate claims are distinct from published rules.
- [ ] Candidate classifications include explicit statement, repeated code pattern, review pattern, inferred hypothesis, and unsupported.
- [ ] Inferred hypotheses cannot create hard rules automatically.
- [ ] Evidence tiers are represented and affect enforcement eligibility.
- [ ] Every candidate requires human or verified-author review.
- [ ] Rules require positive, negative, and exception fixtures.
- [ ] Profile releases include changelog, provenance, limitations, and reviewer data.
- [ ] Named individual or organization profiles require explicit authorization and verification.
- [ ] Community archetypes are used when authorization is unavailable.
- [ ] No uncontrolled scraping of private, restricted, leaked, or unapproved material is supported.

**Dependencies:** Milestone 2, Milestone 4, and Milestone 7.

## Milestone 10 — Human-Reviewed Profile Evolution

**Goal:** Turn artifacts into reviewable improvements without pretending to train base models.

**Acceptance criteria:**

- [ ] `PromotionProposal` schema exists.
- [ ] Artifacts can be selected as proposal evidence.
- [ ] Proposals include expected benefit, false-positive risk, fixtures, benchmark plan, and required version bump.
- [ ] Profiles are never modified automatically from telemetry.
- [ ] Proposals require human approval.
- [ ] Accepted changes create a new semvered profile release.
- [ ] Rejected and superseded proposals remain auditable.
- [ ] User-facing language says “evidence-backed profile evolution,” not “self-training” or “evolved weights.”

**Dependencies:** Milestone 7 and Milestone 9.

## Milestone 11 — Benchmark and Proof of Value

**Goal:** Prove or disprove whether LMP reduces meaningful review friction.

**Acceptance criteria:**

- [ ] Benchmark harness compares baseline workflow with LMP workflow.
- [ ] Same task, repository, agent/model, and environment can be recorded.
- [ ] Fixture-only runs are clearly labeled as simulated fixtures.
- [ ] Benchmark manifests capture tool versions, profile version, git revision, environment, and task.
- [ ] Reports measure policy findings, tests, typecheck, lint, dependency changes, complexity, remediation cycles, skipped checks, and duration.
- [ ] Reviewer annotation templates capture review time, rework, severity, confidence, and false positives.
- [ ] Reports do not claim general causation from one experiment.
- [ ] Real repository evaluations are added before broad performance claims.
- [ ] Results include setup cost and evaluation overhead.
- [ ] LMP is compared against `AGENTS.md`/Skills/rules plus existing lint/test/CI, not only against no safeguards.

**Dependencies:** Milestone 4, Milestone 5, Milestone 7, and Milestone 10.

## Milestone 12 — Protocol Core Productization

**Goal:** Make existing Rust, daemon, signing, telemetry, and synchronization features reliable advanced surfaces instead of disconnected prototypes.

**Acceptance criteria:**

- [ ] One-shot CLI and long-running daemon share tested policy and artifact contracts.
- [ ] Daemon start, stop, status, reload, crash recovery, and shutdown are tested.
- [ ] Existing AST rules have language/version coverage documentation.
- [ ] Ed25519 signing uses canonical manifests and reliable digest verification.
- [ ] Signature status is separate from policy quality status.
- [ ] Key rotation, revocation, and trust roots are documented.
- [ ] OCI behavior uses real registry protocol paths or clearly reports unsupported/stub behavior.
- [ ] Existing placeholder hashes, mock CIDs, mock manifests, and simulated upload paths are removed or explicitly isolated as fixtures.
- [ ] Telemetry is local by default.
- [ ] Advanced mode does not change local-mode safety defaults.

**Dependencies:** Milestone 0, Milestone 7, and Milestone 11.

## Milestone 13 — Optional Sandbox and Remote Distribution

**Goal:** Expose Docker, OCI, and IPFS as secure opt-in capabilities for organizations that need them.

**Acceptance criteria:**

- [ ] Docker sandbox is optional and capability-detected.
- [ ] Sandbox network policy, memory/CPU limits, filesystem mounts, image pinning, and cleanup are tested.
- [ ] Runtime measurements record environment, repetitions, warmup, median, and percentile data.
- [ ] OCI pull/push requires explicit configuration and approval.
- [ ] IPFS is an optional adapter, not a first-run requirement.
- [ ] Remote profile/artifact operations verify integrity before trust elevation.
- [ ] Upload preview shows exactly what metadata will leave the machine.
- [ ] No raw source code or secrets are uploaded by default.
- [ ] Remote failures do not corrupt local profiles or artifacts.

**Dependencies:** Milestone 12.

## Milestone 14 — Optional Fleet and Graph Orchestration

**Goal:** Support multi-agent workflows while keeping single-agent use simple.

**Acceptance criteria:**

- [ ] Role graph schema exists.
- [ ] Roles define tools, permissions, scope, inputs, outputs, handoffs, and stop conditions.
- [ ] Planner, implementation, security, test, architecture, evaluator, and evidence roles are supported.
- [ ] Independent evaluators can operate outside the implementation agent’s context.
- [ ] Agent disagreement creates an escalation record rather than silent merging.
- [ ] Fleet execution is bounded by token, time, command, and retry budgets.
- [ ] Single-agent mode remains the default.
- [ ] Fleet mode produces one merged evidence artifact with per-role provenance.

**Dependencies:** Milestone 5, Milestone 6, Milestone 7, and Milestone 11.

## Existing Change and Codebase Preservation Rules

Every future implementation milestone must begin with a repository check:

```text
1. Inspect existing files and recent changes.
2. Identify related current implementation.
3. Add regression tests before replacing behavior.
4. Preserve working components.
5. Extend or adapt existing interfaces where possible.
6. Mark obsolete code explicitly before removal.
7. Update this roadmap with the actual status.
8. Do not delete an advanced capability only because it is not required by local mode.
```

Existing features such as Rust AST validation, `lmpd`, MCP, Ed25519 signing, OCI synchronization, Python telemetry, Docker sandboxing, generated documentation, and release tooling must remain available where they are functional. They must be classified accurately and made optional where they add onboarding friction.

## Architecture Decisions to Preserve

### Local mode is the default

```text
One-shot CLI
  → local profile
  → offline evaluation
  → no command execution
  → local redacted artifact
```

### Connected mode is opt-in

```text
Optional daemon
  → optional MCP
  → optional local synchronization
  → optional signature verification
```

### Attested mode is explicit

```text
Explicit signing
  → explicit remote registry
  → explicit upload destination
  → explicit approval
  → integrity verification
```

### Profile evolution is reviewed

```text
Artifact
  → proposal
  → review
  → fixtures
  → benchmark
  → new semvered profile
```

## Non-Goals and Guardrails

- Do not replace Skills, `AGENTS.md`, Cursor rules, MCP, OPA, ESLint, Biome, TypeScript, Semgrep, CodeQL, tests, or CI.
- Do not require Docker, Rust, IPFS, OCI, MCP, signing, or a daemon for local first use.
- Do not publish uncontrolled person-specific profiles.
- Do not scrape private, restricted, leaked, or unapproved data.
- Do not claim 1:1 human imitation.
- Do not claim model-weight training from artifacts.
- Do not use a single quality score as proof of quality.
- Do not block developers with vague profile language.
- Do not upload source-derived telemetry by default.
- Do not silently execute profile-supplied commands.
- Do not let profile rules automatically mutate source code.
- Do not turn every engineering judgment into an AST rule.
- Do not claim static checks prove security or architecture correctness.
- Do not remove existing codebase capabilities without a migration and roadmap entry.

## Graduation Criteria

LMP may be described as a credible public product when:

- [ ] Local first-run onboarding is simple and safe.
- [ ] At least one profile produces both guidance and independent evidence.
- [ ] The evaluator reuses existing tools effectively.
- [ ] Findings are actionable and measurable.
- [ ] The remediation loop is bounded and observable.
- [ ] Artifacts are privacy-preserving and reviewable.
- [ ] Profile versions are reproducible and optionally signed.
- [ ] Existing advanced protocol components are accurately classified and tested.
- [ ] Benchmark results compare LMP with the existing team stack.
- [ ] False positives and review overhead are measured.
- [ ] Documentation answers why LMP is not merely `AGENTS.md` plus CI.
- [ ] No general quality or performance claim is published without reproducible evidence.
- [ ] The system demonstrates at least one meaningful repository-specific issue caught before human review.
