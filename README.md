<div align="center">
  <img src="./public/assets/banner.png" alt="Lending-Mind Protocol — executable engineering judgment for AI-assisted development" width="800">
</div>

<div align="center">

# Lending-Mind Protocol

### Make engineering judgment executable.

LMP turns explicit engineering preferences into signed Mind Packages, bounded evaluations, and reviewable evidence for AI-assisted software development.

[Website](https://lmp-six.vercel.app/) · [Documentation](https://lmp-six.vercel.app/docs) · [GitHub](https://github.com/lendmind-protocol/LMP) · [MIT License](./LICENSE)

</div>

> [!WARNING]
> LMP is a local-first control plane, not a claim that static analysis proves software quality. Signatures establish content integrity and key possession; they do not prove authorship, correctness, or good policy. Human review remains part of the boundary.

## The short version

AI coding agents are good at producing plausible changes quickly. They are not automatically reliable at preserving a team’s engineering judgment under pressure. LMP makes that judgment explicit, versioned, scoped, evaluated, and recorded.

```text
Engineering preference
          │
          ▼
   Signed Mind Package
          │
          ▼
 Rust AST + policy evaluation
          │
          ├── advisory result
          ├── enforced rejection
          └── redacted evidence artifact
```

## Quick start

| Recommended path | What it does |
| --- | --- |
| `npx lmp init --baseline` | Installs the baseline profile through the public launcher |
| `npx lmp instructions --mind skills/baseline` | Prints visible guidance for an agent or human |
| `npx lmp evaluate --mind skills/baseline --workspace . --mode advisory` | Evaluates without executing commands or mutating source |
| `npx lmp self-govern --mind linux-kernel --workspace crates/lmp-core --install-hook` | Runs enforced self-governance and installs a local pre-commit gate |

For the Rust workspace itself:

```bash
cargo build --workspace
cargo test --workspace
cargo run --bin lmp -- init --install-baseline
cargo run --bin lmp -- evaluate \
  --mind skills/baseline \
  --workspace . \
  --mode advisory \
  --artifact-dir .lending-mind/artifacts
```

The repository pins Rust `1.98.1` in [`rust-toolchain.toml`](./rust-toolchain.toml). The Node.js launcher is delivery and onboarding glue; Rust owns profile semantics, evaluation, artifacts, signing, registry operations, the daemon, and MCP behavior.

## What is in the repository?

| Layer | Responsibility | Source |
| --- | --- | --- |
| `lmp-core` | Mind Package model, compiler, AST evaluation, evidence, signing, registry primitives | [`crates/lmp-core`](./crates/lmp-core) |
| `lmpd` | Rust workspace watcher and revalidation daemon | [`crates/lmpd`](./crates/lmpd) |
| `lmp-mcp` | Rust stdio MCP adapter over the shared core | [`crates/lmp-mcp`](./crates/lmp-mcp) |
| `lmp-sync` | Offline-validated profile synchronization | [`crates/lmp-sync`](./crates/lmp-sync) |
| `packages/lmp` | Unscoped `npx lmp` launcher | [`packages/lmp`](./packages/lmp) |
| `packages/create-lmp` | Agent-host onboarding wrapper | [`packages/create-lmp`](./packages/create-lmp) |
| `orchestrator/` | Python sandbox, qualification suite, benchmarks, and artifact gates | [`orchestrator`](./orchestrator) |
| `registry/` | Versioned Mind definitions and public registry metadata | [`registry`](./registry) |
| `apps/docs` | Landing page and canonical documentation portal | [`apps/docs`](./apps/docs) |

## How the control plane works

| Stage | Boundary | Evidence produced |
| --- | --- | --- |
| 1. Declare | Human or community profile defines guidance and explicit policy | Versioned `mind.json` and rule metadata |
| 2. Resolve | Runtime loads a local or signed package | Content digest and signature status |
| 3. Scope | Evaluation selects the workspace or changed files | Scope metadata and privacy limits |
| 4. Inspect | Rust parses supported source and applies declared checks | Findings with rule IDs and locations |
| 5. Enforce | Advisory reports; enforced mode returns a blocking result | `pass`, `warning`, `needs_revision`, `blocked`, or `error` |
| 6. Record | Runtime writes redacted, append-only evidence | Artifact with hashes, checks, limitations, and transitions |

LMP is not a shell script that pastes text into a prompt. It is also not a magical hardware-level guarantee: enforcement is only as strong as the implemented checks, the declared profile, the selected scope, and the surrounding runtime boundary.

## What LMP does—and does not—claim

| LMP does | LMP does not |
| --- | --- |
| Keep profiles versioned and content-addressed | Clone a person or reproduce private reasoning |
| Verify package signatures and detect tampering | Prove that a signer is the person named by a profile |
| Parse supported Rust syntax with compiler-grade AST tooling | Understand every language or runtime behavior automatically |
| Emit bounded, redacted evidence artifacts | Upload source code or raw paths by default |
| Support advisory and enforced evaluation modes | Replace tests, code review, threat modeling, or release approval |
| Run optional behavioral checks inside a hardened Docker gate | Claim a sandbox is effective without qualification evidence |

## Mind Packages

A Mind Package combines human-readable guidance with explicit, machine-checkable policy. Policy files require rule metadata describing the assertion, severity, scope, remediation, limitations, and evidence expectation.

Community archetypes describe practices; they do not imply verified authorship. Individual or organizational profiles require consent, attribution, provenance, review, and appropriate licensing. See [the package model](./apps/docs/content/docs/concepts/mind-packages.mdx) and [authoring guide](./apps/docs/content/docs/guides/author-a-mind.mdx).

## Skeptical FAQ

<details>
<summary><strong>Is this just a prompt-injection wrapper?</strong></summary>

No. The runtime evaluates declared policy and records evidence locally. Guidance can be ignored by an agent; an enforced evaluator can reject a result when an implemented rule is violated. That distinction still has limits: only supported checks are enforceable, and no static evaluator sees everything.
</details>

<details>
<summary><strong>Can an agent bypass it?</strong></summary>

An agent can bypass a process that is not actually connected to its write or commit boundary. LMP’s local hook, daemon, and evaluator paths narrow that gap, but the repository must install and run them correctly. A passing report is evidence of the selected run, not proof of universal interception.
</details>

<details>
<summary><strong>Do signatures make a profile trustworthy?</strong></summary>

They prove the signed bytes were produced by the corresponding key and were not altered after signing. They do not prove the profile is wise, safe, authored by the claimed person, or suitable for your project. Those require provenance and human review.
</details>

<details>
<summary><strong>Why keep related documentation on one canonical page?</strong></summary>

Because humans need continuity. Thin, machine-friendly fragments create click fatigue and hide trade-offs. LMP keeps the conceptual argument together while using headings, tables, and stable links that remain parseable by automated tools.
</details>

## Verification

Run the same checks used by the repository before making a release claim:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm verify:docs
python3 -m unittest discover -s orchestrator -p 'test_*.py'
cargo fmt --all -- --check
cargo check --workspace --all-targets
cargo test --workspace
```

The project’s evidence boundaries and known gaps are documented in the [threat model](./docs/threat-model.md), [quality checks](./docs/quality-checks.md), [governance](./docs/governance.md), and [release evidence guide](./docs/release-evidence/README.md).

## Documentation map

| Start here | Deepen the model | Operate and contribute |
| --- | --- | --- |
| [Concept](./docs/Concept.md) | [Architecture](./docs/architecture.md) | [Governance](./docs/governance.md) |
| [Onboarding](./docs/Onboarding.md) | [Evaluation contract](./docs/evaluation.md) | [Quality checks](./docs/quality-checks.md) |
| [Canonical docs overview](./apps/docs/content/docs/concepts/overview.mdx) | [AST axioms](./docs/ast-axioms.md) | [Contributing](./CONTRIBUTING.md) |
| [CLI package](./packages/cli/README.md) | [Threat model](./docs/threat-model.md) | [Security policy](./SECURITY.md) |

## Contributing

1. Read [`AGENTS.md`](./AGENTS.md) and the [contribution guide](./CONTRIBUTING.md).
2. Open an issue when a change affects the protocol contract, evidence schema, or trust boundary.
3. Add or update tests and documentation with the implementation.
4. Keep claims tied to reproducible local or CI evidence.

AI-assisted contributions are welcome. Explain the important decisions, limitations, and verification performed.

<div align="center">

Built for inspectable engineering judgment · [Documentation](https://lmp-six.vercel.app/docs) · [GitHub](https://github.com/lendmind-protocol/LMP) · [MIT License](./LICENSE)

</div>
