# Lending-Mind Protocol QA and Product-Truth Audit

Audit scope: `/home/justine/Downloads/lend-mind-protocol`

Audit date: September 12, 2026

Audit basis: repository source, documentation, workflows, tests, generated artifacts, and current local test runs.

## 1. Executive Verdict

Protocol-layer enforcement system: yes. LMP is not an AI agent, AI generation platform, or RAG system. The repository contains a deterministic policy, package, evaluator, registry, MCP, daemon, and evidence system for use beside an external agent host.

Thin AI wrapper: no. There is no LLM wrapper to audit.

Prompt-replicable value: 65 percent.

Real system value: 35 percent.

Overall honesty score: 8 out of 10.

Differentiation score: 4 out of 10.

Production-readiness score: 3 out of 10.

These are audit judgments based on implementation evidence. The high honesty score comes from unusually clear documentation of limits. The low production score comes from missing AI-host execution, service infrastructure, authentication, persistence, monitoring, and external deployment proof.

The blunt answer:

LMP is a real local developer-control system with a useful evidence model. It is not yet a complete AI development platform. It is not a multi-agent product, deployment platform, monitoring platform, memory system, or production security boundary.

## 2. Claims Table

| Claim | Status | Evidence | Enforced? | Misleading? | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Signed Mind Packages provide integrity | Real and enforced | `crates/lmp-core/src/crypto.rs`, package signature tests, registry validation | Yes, at package verification boundaries | No, docs state signatures do not prove authorship or policy quality | Keep the claim bounded to signed bytes and key possession |
| LMP evaluates source against declared rules | Real but partial | `crates/lmp-core/src/evaluator.rs`, `packages/evaluator/src/index.ts` | Yes for implemented rules and selected scope | Slightly, if readers assume semantic analysis | Publish a rule and language coverage matrix |
| LMP uses AST-quality analysis across languages | Misleading if read broadly | Rust uses `syn` in `crates/lmp-core/src/ast.rs`. TypeScript, JavaScript, and Python paths use line and `ts-morph` checks in separate packages | Partial | Yes for the broad “AST” impression | State parser type per language in every artifact |
| LMP provides advisory and enforced modes | Real and enforced | CLI runtime, evaluator state transitions, Rust evaluator tests | Yes | No | Add host-level write-boundary tests |
| LMP creates reviewable evidence | Real but partial | `crates/lmp-core/src/evaluator.rs`, `crates/lmp-artifacts/src/lib.rs`, orchestrator gates | Yes for local artifacts | No | Add artifact lineage across multi-step runs |
| LMP is self-governing | Real but narrow | `.lmp/config.toml`, `crates/lmp-core/src/self_hosting.rs`, `orchestrator/self_audit.py` | Yes for declared paths and commands | Risk of overreading repository-wide coverage | Show the exact excluded paths in every self-audit summary |
| LMP universally intercepts agent writes | Unsupported | No universal host driver. `crates/lmpd/src/main.rs` watches changes after they occur. Git hooks operate at commit boundaries | No | Yes | Remove this claim from product copy |
| MCP provides enforcement | Real but narrow | `crates/lmp-mcp/src/main.rs`, `packages/mcp-server/src/index.ts` | Only for MCP requests and server state | Yes if described as a filesystem firewall | Call MCP an adapter and keep hooks or host extensions separate |
| LMP is an AI coding agent | False product classification | LMP has no model SDK, prompt runner, generation loop, or agent scheduler | No | Yes | Describe LMP only as protocol-layer enforcement for external agent hosts |
| LMP is multi-agent orchestration | Real but narrow | `crates/lmp-core/src/fleet.rs` validates role DAGs, budgets, reports, and disagreements | Yes for submitted reports | Yes if readers expect agents to be launched or coordinated | Rename to bounded role-evidence aggregation until host execution exists |
| LMP improves code quality | Not established | `orchestrator/real_world_benchmark.py` creates fixed guided and unguided fixtures. It does not run model-generated patches | No | Yes if stated as an outcome | Run a matched model and human-review study |
| LMP provides a secure sandbox | Present but fragile | `orchestrator/sandbox.py`, Docker qualification workflow | Only when Docker and the required image are present | Yes if absolute isolation is implied | Use “bounded Docker execution” and record runtime qualification |
| LMP provides IPFS or OCI distribution | Real but partial | `crates/lmp-sync`, `packages/registry`, Pinata script, registry gates | Local digest and signature checks are enforced. Public pinning is release-gated | No in current docs, but old concept text overreaches | Delete or quarantine aspirational sync-fabric text |
| LMP is production-ready | Removed from current bounded docs | `docs/claim-ledger.md`, `docs/production-readiness-report.md` | Release gate emits bounded decisions | Older concept material still creates confusion | Make the bounded wording canonical across all surfaces |

## 3. Architecture and Boundaries

### Current flow

The implemented flow is:

```text
CLI or MCP client
    -> Rust core
        -> Mind package validation and compilation
        -> scope selection
        -> static and AST checks
        -> optional command or Docker gates outside the core
        -> redacted artifact
```

The repository does not implement the flow implied by the broader product language:

```text
frontend -> API gateway -> AI orchestrator -> capability services -> database
```

There is no API gateway, hosted orchestrator, service network, database layer, or user application in this repository. `apps/docs` is a documentation portal. `apps/playground` is a local experiment directory.

### Findings

1. The Rust core is the strongest boundary. Package loading, signing, scope selection, evaluation, and artifact generation share one implementation path.

2. The TypeScript evaluator duplicates meaningful evaluator behavior. `packages/evaluator/src/index.ts` contains a separate evaluator with `ts-morph`, while `crates/lmp-core/src/evaluator.rs` contains a Rust evaluator with different coverage and semantics. The two paths risk divergent results for the same Mind.

3. The Python orchestrator owns sandboxing, benchmark construction, release checks, and evidence gates. This is useful tooling, but it is not a product orchestration service. Its commands are batch processes, not durable run workers.

4. `crates/lmp-core/src/fleet.rs` validates externally produced role reports. It does not launch agents, assign tools, persist a run, or recover a live workflow. The name “fleet” is ahead of the runtime.

5. The daemon watches workspace mutations and revalidates paths. This is post-write detection. It does not prevent an editor or agent from persisting an invalid file.

### Required boundary

Make `packages/core` or the Rust core the single semantic contract for package, finding, decision, artifact, and authorization types. Treat TypeScript and Python as adapters and test harnesses. Do not maintain two independent evaluators without a parity suite.

## 4. Data and State

### What exists

State is local and file-based:

- Mind packages under `profiles/`, `registry/`, and package fixtures.
- Installed packages under `.lending-mind/` at runtime.
- Artifacts under `.lending-mind/artifacts` or `lmp-test-results`.
- Self-hosting configuration under `.lmp/config.toml` and `.lmp/mind.lock`.
- Registry metadata under `registry/registry.json` and `apps/docs/public/registry.json`.

There is no Supabase schema, Postgres migration, vector database, EigenDA integration, trace blob schema, memory service, or durable hosted run store.

### Findings

1. The local registry has a clear immutable layout and rejects path traversal and symlink destinations in `crates/lmp-core/src/registry.rs`.

2. The registry has two truth surfaces, `registry/registry.json` and `apps/docs/public/registry.json`. CI checks byte parity. This is acceptable as generated output, but it becomes unsafe if contributors edit both manually.

3. The evaluator artifact records a content digest for the compiled Mind bundle, but the signature verifier in `crates/lmp-core/src/crypto.rs` verifies the detached signature over `mind.json`. The repository must document whether signatures cover the manifest only or the full package. Readers will assume package-wide integrity unless the scope is explicit.

4. `crates/lmp-core/src/scope.rs` falls back from changed-file scope to full workspace scope when Git selection fails. The artifact records the fallback. The behavior is transparent, but a caller requesting changed-only evaluation receives broader evaluation and possible unrelated findings.

5. `crates/lmp-core/src/evaluator.rs` reads only the workspace root `package.json` for prohibited dependency checks. In a monorepo, package-level manifests require explicit traversal or a documented limitation.

### Storage policy

Keep local files as the source of truth for the current product. Add a run store only after a hosted workflow exists. Define one immutable record for each run with:

- run ID
- repository revision
- Mind ID, version, digest, and signature status
- parent run ID
- step ID and attempt
- artifact digest
- scope digest
- decision
- limitation list

Do not add IPFS, EigenDA, or a database as decorative infrastructure. Add each only when a user workflow requires remote retrieval, retention, or collaboration.

## 5. Auth, Secrets, and Permissions

### Current state

There is no user authentication system. There are no JWTs, workspaces tied to user identities, BYOK storage, roles, billing permissions, or hosted authorization service.

The HTTP MCP listener uses an optional static bearer token and origin allowlist in `crates/lmp-mcp/src/main.rs`. Non-local binding requires both settings. The listener speaks plain HTTP and expects a TLS proxy for transport protection.

### Findings

1. The local stdio MCP path is appropriate for a local process. It is not a tenant boundary.

2. The static bearer token is process configuration, not identity or delegated authorization. It does not distinguish users, workspaces, or capabilities.

3. The MCP authorization check compares the full `Authorization` value to `Bearer <configured-token>`. This is simple and testable, but it has no token rotation protocol, expiry, audience, issuer, or audit identity.

4. The authorization model in `packages/evaluator` and `orchestrator/evaluator_integration_evidence.ts` is a capability policy matrix. It gates actions in the evaluator. It does not protect an external service because no external service exists.

5. No raw API keys, JWTs, or BYOK secrets appeared in the inspected application source. The absence of secret storage is safer than an incomplete secret system, but it also confirms the product has no hosted user security model yet.

### Required action

Keep the current capability matrix local and explicit. If LMP becomes hosted, add a shared auth package with issuer, audience, subject, workspace, capability, expiry, and audit context. Do not extend the static bearer token into a pretend multi-tenant system.

## 6. Agent Pipeline and Orchestration

### Reality

The repository does not implement the advertised end-to-end sequence of specification, design, code generation, audit, simulation, deployment, and monitoring.

What exists:

- deterministic package compilation
- source inspection
- bounded command execution
- Docker sandbox qualification
- role-graph validation and report merging
- onboarding integration
- benchmark fixture execution
- release evidence gates

What does not exist:

- model invocation
- prompt state
- tool assignment to an active agent
- durable run and step state
- retries for a live AI workflow
- deployment service
- contract or application simulation service
- post-deploy monitor
- crash recovery for a user run

`crates/lmp-core/src/fleet.rs` is a validator for submitted evidence, not a multi-agent runtime. `orchestrator/real_world_benchmark.py` is a deterministic scenario runner, not an agent benchmark.

### Required design

If the product expands, define one shared run model before adding services:

```text
Run
  -> Step
      -> Attempt
          -> Input digest
          -> Tool events
          -> Output artifact
          -> Decision
```

Every step needs an idempotency key, timeout, cancellation state, retry budget, parent run, artifact digest, and failure reason. No frontend component should own this state machine.

## 7. SDK Integrations and Internal Toolkits

### Actual external dependencies

| Dependency area | Evidence path | Assessment | Boundary recommendation |
| --- | --- | --- | --- |
| Rust parser | `crates/lmp-core/Cargo.toml`, `crates/lmp-core/src/ast.rs` | Real Rust AST use through `syn` | Keep behind a core parser interface |
| Rust signatures | `crates/lmp-core/src/crypto.rs` | Real Ed25519 verification and key rotation | Expose only package verification APIs |
| HTTP sync | `crates/lmp-sync/Cargo.toml`, `crates/lmp-sync/src/main.rs` | Real `ureq` client with digest checks | Keep remote transport out of policy semantics |
| TypeScript source analysis | `packages/evaluator` | Real `ts-morph` analysis, separate from Rust semantics | Define parity tests or select one evaluator |
| Schema validation | `packages/skill-schema` | Real Zod validation | Make schema the single package contract |
| CLI | `packages/cli` | Real Commander-based onboarding and evaluation commands | Keep CLI as adapter over core services |
| Documentation UI | `apps/docs` | Real Next and Fumadocs portal | Do not present portal as the product runtime |
| Docker | `orchestrator/sandbox.py`, workflow files | Real optional sandbox qualification | Gate only scenarios requiring Docker |

There are no OpenAI, Anthropic, LangChain, Supabase, Tenderly, EigenDA, Pinata SDK, wallet, payment, or monitoring SDK integrations in the core application graph. The Pinata script is a release utility, not a remote product service.

### Main duplication risk

The Rust evaluator and TypeScript evaluator are separate implementations. Consolidate policy semantics. If both remain, add a fixture suite where both emit normalized findings for the same package and source.

## 8. Frontend and AI UI

The frontend audit is short because the claimed frontend does not exist in this repository.

`apps/docs` contains the documentation portal, landing components, diagrams, search, and reference pages. It does not contain a chat UI, run detail view, authentication flow, agent activity view, deployment view, or browser-side AI SDK integration.

There are no scattered browser `fetch` calls for a product API because there is no product API. There are no browser calls to model providers, wallets, deployment services, or storage backends.

### Verdict

The documentation UI is real. The AI product UI is absent. Product copy must label the portal as documentation and demo surface until a real user workflow exists.

## 9. Testing, Observability, and Reliability

### Verified local evidence

- JavaScript workspace tests: 13 tasks passed.
- Python orchestration tests: 124 tests passed.
- Rust workspace tests with pinned Rust 1.98.1: all tests passed, including 30 `lmp-core` tests, MCP protocol tests, registry tests, sync tests, daemon tests, and artifact tests.
- Documentation quality gate: passed with 30 pages and 30 routes.

The first Rust command with system Cargo 1.75 failed before compilation because the lockfile requires newer tooling. The pinned toolchain path passed. CI should ensure the pinned toolchain is first on `PATH`, not only declared in `rust-toolchain.toml`.

### Gaps

1. No production telemetry exists. Logs are process-level errors and test output, not distributed traces.
2. No hosted health or readiness endpoints exist because no hosted service exists.
3. No per-run metrics cover evaluation latency, finding rates, retries, artifact size, or scope fallback frequency in a durable store.
4. The official MCP conformance harness now covers selected initialization,
   ping, and tool-discovery scenarios in CI; optional capability suites and
   cross-host acceptance remain unverified.
5. The benchmark does not test generated agent behavior. It writes a fixed unsafe candidate and a fixed safe candidate.
6. The ordinary-controls baseline runs the TypeScript compiler only. Repository lint, tests, and CI commands are discovered but not executed in that lane, as documented in `orchestrator/real_world_benchmark.py`.
7. The benchmark includes a `reviewerAnnotations` contract, but current evidence remains incomplete until an independent reviewer supplies non-empty annotations.

### Required observability

Add structured local events first. Each event should carry `runId`, `stepId`, `attempt`, `mindDigest`, `repositoryRevision`, `scopeDigest`, and `artifactDigest`. Add OpenTelemetry or a hosted metrics backend only when the service boundary exists.

## 10. Duplication, Stubs, and Truncation

### Critical gaps

- AI generation is absent. The repository cannot prove an agent received a Mind or followed one.
- Hosted run state is absent. A process crash loses active workflow state.
- Deployment, simulation, monitoring, and memory are absent.
- There is no browser-to-runtime product path.

### Duplication

- Rust and TypeScript evaluator semantics overlap.
- Registry metadata exists in both source and generated public locations.
- Multiple onboarding adapters exist for host configuration. The tests cover them, but a shared host configuration writer would reduce drift.
- Release, benchmark, and qualification scripts each maintain related evidence logic. Normalized artifact schemas help, but a shared schema library would reduce divergence.

### Aspirational or misleading material

The former `docs/Concept.md` contained a much broader system narrative than the current implementation, including decentralized telemetry, dynamic weight optimization, an LMSF sync fabric, and remote artifact layers. That material has now been removed and replaced with an evidence-bounded concept page. The claim ledger and production-readiness report remain the authoritative status sources.

This is not a cosmetic documentation issue. Old concept text is a product claim surface. Investors, users, and contributors will read it as a roadmap or capability statement.

### Required cleanup

Keep `docs/Concept.md` aligned with shipped behavior. Do not reintroduce code-shaped pseudocode for unavailable remote systems; keep future work in `ROADMAP.md` with explicit status and external gates.

## 11. Long-Term Evolution and Happy Path

### Honest 12 to 18 month target

1. A user installs LMP in an existing repository.
2. The user selects a signed Mind Package.
3. An external agent host reads scoped guidance through MCP or a local adapter.
4. The agent edits the workspace.
5. LMP evaluates changed files and configured commands.
6. The user reviews findings and redacted evidence.
7. A Git or CI gate blocks a commit when required checks fail.
8. The team stores artifacts with the commit and package digest.
9. A separate deployment system handles release approval and post-deploy monitoring.

This path fits the current product. It does not require LMP to become a full agent, chain, database, or monitoring platform.

### Future pain if scope expands

- Two evaluator implementations will drift.
- A static bearer token will fail as soon as multiple users or workspaces exist.
- Local JSON artifacts will not support concurrent hosted runs.
- The daemon will be mistaken for prevention because it detects changes after persistence.
- OCI and IPFS will create operational obligations for retention, revocation, gateway choice, and recovery.
- Fleet graphs will not replace a real scheduler, lease system, queue, and crash-recovery model.
- The docs portal will create false confidence if its visual diagrams imply services absent from the repository.

## 12. Thin-Wrapper Findings

The following areas are replicable with a strong prompt and lightweight scripts:

- human-readable engineering guidance
- static rule files
- generated instruction bundles
- basic lint heuristics
- fixed benchmark fixtures
- documentation diagrams
- CLI onboarding glue
- release checklist generation

The following areas are not mere prompt output:

- detached signature verification
- immutable local package installation
- path and symlink rejection
- changed-file scope selection
- redacted artifact validation
- bounded command authorization
- deterministic fleet DAG and budget validation
- MCP protocol state handling
- registry digest and signature checks

The product’s actual value sits in the protocol enforcement and evidence layer. LMP does not own, perform, or replace AI generation, retrieval, or agent execution.

## 13. Differentiation Table

| Area | Real? | User-visible? | Hard to replicate? | Strategic value |
| --- | --- | --- | --- | --- |
| Signed Mind Package | Yes | Yes through CLI and artifacts | Moderate | Useful trust and versioning primitive |
| Bounded evaluator | Yes | Yes through findings | Moderate | Core product value |
| Redacted evidence | Yes | Yes through JSON artifacts | Moderate | Strong for review and CI workflows |
| Workspace-aware scope | Yes | Partly | Low to moderate | Prevents broad accidental evaluation |
| MCP adapter | Yes | Yes to supported hosts | Low to moderate | Integration value, not a moat alone |
| Fleet role graph | Yes as validator | Limited | Low without live execution | Future foundation, weak present moat |
| AI generation | No | No | None | No product value yet |
| Persistent memory | No | No | None | Roadmap only |
| Simulation and deployment | No | No | None | Roadmap only |
| IPFS or OCI public network | Partial | Release metadata only | Moderate operationally | Not a moat without usage and retention |
| Proprietary evaluation data | No | No | None | No compounding data advantage |

## 14. Risk Findings

1. Production-ready language is corrected in the current concept page; future edits must preserve its bounded claims.

2. Audit language is safe only when tied to selected checks and artifacts. A user could still read “audit” as a security audit. Use “policy evaluation” for the default CLI surface.

3. Secure sandbox language must stay bounded to configured Docker conditions. The release workflow’s qualification is useful, but it does not establish host isolation.

4. Autonomous agent language is unsupported. The repository has no model execution or agent scheduler.

5. Multi-agent language is partial. The fleet module merges externally supplied evidence. It does not control agents.

6. Decentralized and IPFS language is partial. Local static sync exists. Public pinning, availability, retention, and retrieval recovery require external evidence.

7. Monitoring language is unsupported. There is no post-deploy monitor.

8. Memory language is unsupported. There is no persistent preference or episodic memory service.

## 15. Root Recommendations

### Stop claiming

- AI generation
- autonomous agents
- universal pre-write enforcement
- production deployment
- monitoring
- persistent memory
- general code-quality improvement
- secure sandbox isolation
- decentralized distribution as a shipped public service

### Rename honestly

- “AI development platform” to “local-first policy and evidence control plane for AI coding hosts”
- “audit” to “scoped policy evaluation” where security audit is not intended
- “multi-agent orchestration” to “bounded role-evidence coordination”
- “secure sandbox” to “qualified Docker execution boundary”
- “production-ready” to a named release decision such as `LOCAL_QUALIFIED` or `RELEASE_CANDIDATE_QUALIFIED`

### Build next

1. One canonical evaluator contract across Rust and TypeScript.
2. A real external-agent integration test using one supported host.
3. A durable run and step artifact schema.
4. A controlled benchmark with model-generated changes and independent human review.
5. Host-specific enforcement tests for write, commit, and MCP boundaries.

### Make deterministic

- package verification
- rule resolution
- language and parser declaration
- scope calculation
- finding normalization
- authorization decisions
- artifact lineage
- release qualification state

### Gate before production wording

- clean pinned revision
- complete artifact
- required checks passed
- external deployment verification
- cross-platform binary evidence
- independent security review
- independent benchmark review
- human pilot evidence

## 16. Prioritized Action List

| Priority | Action | Scope | Why it matters | Effort |
| --- | --- | --- | --- | --- |
| 1 | Make one evaluator canonical | `crates/lmp-core`, `packages/evaluator`, shared fixtures | Prevents contradictory pass and fail decisions | L |
| 2 | Preserve bounded concept claims | `docs/Concept.md`, `README.md`, docs portal | Stops users from mistaking roadmap text for shipped behavior | S |
| 3 | Add real agent-host integration | `crates/lmp-mcp`, `packages/mcp-server`, one supported host | Proves LMP receives actual agent traffic and reaches a real boundary | M |
| 4 | Add run, step, and attempt lineage | artifact schemas, CLI, orchestrator | Makes failures and retries reviewable | M |
| 5 | Replace benchmark fixtures with model-generated trials | `orchestrator/real_world_benchmark.py` | Tests the product claim rather than the evaluator’s hand-built examples | L |
| 6 | Add monorepo dependency traversal | `crates/lmp-core/src/evaluator.rs`, evaluator tests | Current root-only checks miss package-level manifests | M |
| 7 | Add evaluator parity fixtures | Rust and TypeScript evaluator tests | Detects semantic drift between runtime paths | M |
| 8 | Formalize MCP HTTP security contract | `crates/lmp-mcp/src/main.rs`, docs, tests | Static bearer tokens are not hosted identity or tenant authorization | M |
| 9 | Instrument scope fallback and artifact metrics | evaluator, daemon, CLI | Finds silent coverage loss and operational cost | M |
| 10 | Keep remote distribution behind explicit gates | `crates/lmp-sync`, Pinata scripts, release workflow | Prevents IPFS or OCI branding from outrunning operational proof | S |

## 17. Final Judgment

What is truly real:

LMP has a functioning local control plane. Signed package verification, schema validation, bounded evaluation, scope selection, redacted artifacts, registry safety, MCP request handling, onboarding, and release evidence gates are implemented and tested.

What is wrapper-like:

Guidance compilation, documentation, fixed benchmark scenarios, and host onboarding glue are easy to recreate with prompts and ordinary scripts. The repository adds value when those pieces connect to deterministic verification and durable evidence.

The real moat today:

The best potential moat is the normalized evidence contract across Mind Packages, evaluation, package integrity, scope, and release gates. The moat is not established yet because no external agent workflow or proprietary evaluation dataset compounds from usage.

The fake moat:

Autonomous agents, decentralized telemetry, persistent memory, simulation-first deployment, monitoring, and public IPFS distribution are not shipped product capabilities in the inspected repository.

What to fix first:

Unify the evaluator, rewrite the broad concept claims, and prove one real agent-host path. Then run a controlled benchmark with model-generated changes and independent review.

Honest positioning today:

LMP is a local-first protocol-layer enforcement and evidence system for external AI coding hosts. It verifies selected engineering rules, package integrity, workspace scope, and bounded execution conditions. It records what a run checked and what it did not check. It does not generate software, retrieve knowledge, act as an agent, or prove production quality.
