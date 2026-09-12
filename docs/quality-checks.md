# LMP Quality Checks

## Purpose

This document defines the **real demo quality checklist** for Lending-Mind Protocol (LMP). It is intended to work across repositories, languages, project sizes, agent hosts, and delivery workflows.

It does not define one universal coding style. Instead, it defines the minimum evidence LMP should collect before it claims that an AI-assisted change is ready for review, ready for merge, or suitable for a controlled benchmark.

> A passing LMP result means the configured checks and evidence requirements passed. It does not guarantee that code is defect-free, secure in every environment, or production-ready without human accountability.

---

## 1. Quality Model

LMP evaluates a change through multiple evidence dimensions:

```text
Task fit
+ Behavior correctness
+ Repository fit
+ Maintainability
+ Security and privacy
+ Reliability and operations
+ Performance and resource use
+ Delivery and change safety
+ Evidence integrity
= reviewable quality decision
```

A Mind may add domain-specific checks, but it must not weaken the baseline safety and evidence requirements defined for the workspace.

---

## 2. Universal Demo Checklist

Use this checklist for every LMP demo, regardless of whether the target is a CLI, library, backend, frontend, mobile app, data pipeline, agent system, Web3 application, or enterprise monorepo.

### A. Task and acceptance clarity

- [ ] The demo uses a real repository or an explicitly labeled controlled fixture.
- [ ] The repository is pinned to a specific branch, release, tag, or commit SHA.
- [ ] The task is written as observable acceptance criteria, not only a vague request.
- [ ] Inputs, expected outputs, errors, and important edge cases are identified.
- [ ] Non-goals are stated to prevent scope creep.
- [ ] The task identifies whether it changes public APIs, data, auth, billing, deployment, or user-visible behavior.
- [ ] The selected Mind is named, versioned, and relevant to the task.

**Required evidence:** task ID, repository revision, acceptance criteria, Mind ID/version, and scope.

---

### B. Source and Mind provenance

- [ ] The Mind identifies its author/curator and version.
- [ ] The Mind distinguishes source evidence from interpretation.
- [ ] Relevant philosophy, methodology, trade-offs, and implementation examples are linked or summarized.
- [ ] Every hard rule has a rationale and a fixture proving evaluator behavior.
- [ ] A named individual, team, or organization is not presented as endorsing a Mind unless verified evidence says so.
- [ ] The Mind includes applicability boundaries: when its advice applies and when escalation/review is required.
- [ ] The installed Mind digest/signature is recorded if signing is enabled.

**Required evidence:** provenance references, package manifest, validation result, and signature/digest status when applicable.

---

### C. Repository discovery and scope

- [ ] The agent inspects relevant project instructions, architecture docs, package manifests, tests, and existing patterns before coding.
- [ ] LMP identifies changed files and the affected dependency/package closure.
- [ ] The change respects repository-level invariants and ownership boundaries.
- [ ] For a monorepo, root policies and package-level policies are resolved deterministically.
- [ ] The demo shows why the selected files/packages are in scope.
- [ ] Unrelated files are not changed without an explicit reason.
- [ ] The evaluation reports any unresolved or ambiguous repository context.

**Required evidence:** changed-file list, affected package list, dependency closure, and applied policy/Mind resolution.

---

### D. Decision and trade-off quality

- [ ] The agent identifies at least one plausible alternative when a design decision is material.
- [ ] The selected approach is justified against the active Mind and project reality.
- [ ] The decision explains relevant trade-offs: simplicity, safety, performance, cost, operability, compatibility, and future maintenance.
- [ ] The implementation does not add an abstraction, dependency, service, or infrastructure component without a stated need.
- [ ] If a new dependency is added, the demo records why platform capability or existing dependencies were insufficient.
- [ ] If the simplest solution is rejected, the reason is documented.
- [ ] High-risk decisions are escalated to a human review gate.

**Required evidence:** decision record with selected option, rejected options, rationale, and affected constraints.

---

### E. Functional correctness

- [ ] Existing relevant tests pass.
- [ ] New or changed behavior has task-specific tests.
- [ ] Error paths and boundary conditions are tested where applicable.
- [ ] Type checks, compilation, or equivalent language-level validation pass.
- [ ] Build/package validation passes where applicable.
- [ ] Public API behavior is preserved or intentionally versioned/documented.
- [ ] Database/data migrations include forward behavior, rollback strategy, and safety checks where applicable.
- [ ] The demo distinguishes tests actually run from tests skipped or unavailable.

**Required evidence:** test command, test result, type/build result, changed behavior coverage, and skipped-check reason.

---

### F. Maintainability and code health

- [ ] Code follows existing repository conventions unless an intentional migration is documented.
- [ ] The change has a clear responsibility and does not create unnecessary coupling.
- [ ] New code avoids duplication when a safe existing abstraction already exists.
- [ ] Functions, modules, and public interfaces are understandable in context.
- [ ] Complexity, nesting, file growth, and dependency growth are measured when relevant.
- [ ] The implementation is easy to test, modify, and delete.
- [ ] Comments explain non-obvious intent, trade-offs, or constraints, not obvious syntax.
- [ ] The change improves or at least does not regress the repository’s code health.

**Required evidence:** static findings, complexity/dependency delta when configured, and explanation of deliberate exceptions.

---

### G. Security, privacy, and trust boundaries

- [ ] Inputs are validated at the correct boundary.
- [ ] Authentication and authorization are preserved or explicitly tested.
- [ ] Tenant, account, role, or permission boundaries are not bypassed.
- [ ] Secrets, tokens, credentials, and private data are not exposed in source, logs, artifacts, or prompts.
- [ ] Database queries and command execution use safe parameterization/allowlists where applicable.
- [ ] New dependencies, remote calls, permissions, or data flows are reviewed.
- [ ] Security-sensitive changes receive a human/security review when configured.
- [ ] LMP artifacts are redacted and do not contain raw secrets or unrestricted environment data.

**Required evidence:** security-check result, authorization test/result where applicable, dependency/permission diff, and artifact-redaction status.

---

### H. Reliability and operational behavior

- [ ] Failures are handled explicitly and do not leave inconsistent state.
- [ ] Retries, idempotency, timeouts, cancellation, and concurrency behavior are considered when relevant.
- [ ] Logging/telemetry is useful but does not leak sensitive data.
- [ ] The change has understandable failure modes and user/operator messages.
- [ ] External-service assumptions are bounded by timeouts, fallbacks, or documented operational expectations.
- [ ] Background jobs, queues, webhooks, and async workflows include failure-path tests where relevant.
- [ ] A rollback, feature flag, migration, or recovery strategy exists for material changes.

**Required evidence:** relevant reliability tests, failure-mode notes, and operational/rollback decision where applicable.

---

### I. Performance and resource behavior

- [ ] Performance-sensitive claims are measured, not assumed.
- [ ] The change avoids obvious unnecessary I/O, repeated expensive work, unbounded memory growth, or avoidable network calls.
- [ ] Database/query changes inspect query scope, indexes, pagination, and N+1 risks where applicable.
- [ ] Frontend changes consider bundle impact, rendering behavior, accessibility, and loading states where applicable.
- [ ] Edge/serverless changes consider cold start, dependency weight, and runtime limits where applicable.
- [ ] Performance benchmarks use a stated environment and baseline when results are claimed.
- [ ] No benchmark result is presented as universal outside its measured conditions.

**Required evidence:** benchmark/profile output when performance is a requirement; otherwise an explicit `not applicable` record.

---

### J. Agent behavior and remediation loop

- [ ] The agent receives task-scoped Mind guidance rather than an unbounded source dump.
- [ ] The agent records or returns its implementation plan before material changes.
- [ ] The agent uses project tools and tests appropriate to the task.
- [ ] LMP returns structured findings and evidence, not only a vague score.
- [ ] If checks fail, the agent revises the patch or explains why it cannot proceed.
- [ ] The demo records the number of implementation/evaluation iterations.
- [ ] The agent does not self-certify a result when required external checks did not run.
- [ ] Blocked and evaluation-error states are surfaced clearly instead of being converted into success.

**Required evidence:** plan, tool/check trace, findings, remediation steps, final decision, and unresolved limitations.

---

### K. Evidence integrity and reproducibility

- [ ] The artifact records repository revision, Mind version, evaluator version, mode, and scoped paths.
- [ ] Test/build/static-check commands and versions are recorded or reproducible.
- [ ] Output is bounded, redacted, and free of raw secrets/source by default.
- [ ] A third party can repeat the demo from the pinned repository revision and documented configuration.
- [ ] The artifact distinguishes observed results from assumptions and skipped checks.
- [ ] Negative results, failures, and limitations are retained rather than removed from the demo narrative.
- [ ] The final claim matches the available evidence.

**Required evidence:** redacted evaluation artifact, reproducibility instructions, and limitations section.

---

## 3. Workflow Profiles

The universal checklist applies to all workflows. These profiles identify which areas should receive extra attention.

| Workflow | Additional quality focus |
| --- | --- |
| Frontend/UI | Accessibility, responsive behavior, loading/error states, bundle impact, visual regression, user intent |
| Backend/API | API compatibility, authorization, input validation, idempotency, timeouts, observability, data contracts |
| Database/data migration | Backfill safety, locking, rollback, data integrity, query plans, tenant isolation, migration order |
| CLI/developer tool | Stable commands/flags, helpful errors, shell safety, backwards compatibility, installation/package behavior |
| Library/SDK | Public API design, semantic versioning, examples, tree-shaking/bundle size, error semantics, docs |
| Cloud/infra/DevOps | IaC diff safety, least privilege, rollback, state handling, secrets, deployment plan, blast radius |
| Web3/blockchain | Authorization, key safety, transaction simulation, reentrancy/access control, invariant tests, gas/cost trade-offs |
| AI/agent system | Prompt/tool boundaries, data exposure, tool permission policy, evaluation leakage, fallback behavior, human escalation |
| Mobile/desktop | Offline behavior, device/resource constraints, permission handling, compatibility, release safety |
| Enterprise monorepo | Package ownership, dependency graph, root invariants, affected-test matrix, API compatibility, incremental evaluation |
| Legacy migration | Behavior-preserving tests, compatibility layer, staged rollout, observability, rollback, deletion plan |

---

## 4. Demo Evidence Matrix

Every public LMP demo should include this matrix.

| Item | Required for a credible demo | Example evidence |
| --- | --- | --- |
| Real target | Real OSS project or clearly labeled owned fixture | upstream URL + pinned commit SHA |
| Task | Concrete and testable | acceptance criteria and non-goals |
| Mind | Versioned and relevant | `mind ID@version`, provenance summary |
| Decision | Trade-offs shown | selected/rejected options and rationale |
| Patch | Scope controlled | diff summary and affected packages |
| Behavior | Independent check | tests, build, type checks, integration result |
| Quality | Observable checks | AST/dependency/architecture findings and deltas |
| Safety | Relevant risk checks | security, privacy, sandbox, auth results |
| Iteration | Agent remediation proof | failing result -> revision -> final result |
| Reproducibility | Repeatable setup | commands, versions, pinned inputs |
| Limitations | Honest boundary | checks not run, assumptions, remaining review needs |

---

## 5. Baseline Decision Rubric

Use this rubric to label the final demo outcome.

| Decision | Meaning | Minimum condition |
| --- | --- | --- |
| `PASS` | Evidence is sufficient for configured review/merge policy | Required behavior checks pass; no unresolved hard finding; artifact is valid |
| `NEEDS_REVISION` | The change may be recoverable but evidence or quality is insufficient | Failing check, missing test, significant quality regression, or unresolved decision |
| `BLOCKED` | Safe progress is prevented by a trust, policy, permission, or environment boundary | Untrusted Mind, unavailable required evidence, forbidden command/network operation, unsafe workspace path |
| `EVALUATION_ERROR` | LMP cannot make a trustworthy evaluation statement | Evaluator/sandbox/redaction/internal failure; never treated as `PASS` |
| `HUMAN_REVIEW_REQUIRED` | Automation cannot safely decide the issue | Security, legal, product, architecture, or high-impact trade-off requires accountable review |

## 5.1 Anti-gaming controls

The evaluator treats evidence as an input to a bounded decision, not as proof
that an agent behaved honestly. Artifact validation binds results to the
repository revision, declared task, selected Mind, scoped paths, and recorded
commands. Redaction checks reject secret-bearing output, negative results are
retained, and missing external evidence stays `BLOCKED` rather than becoming a
passing score. These controls reduce evidence gaming; they do not detect every
collusion, benchmark contamination, or host-level compromise.

---

## 6. Benchmark Proof Checklist

Use this only when claiming that LMP improves AI-assisted code generation quality.

- [ ] Same real OSS repository revision is used for baseline and LMP-guided runs.
- [ ] Same task set is used for both conditions.
- [ ] Same agent host, model, tool permissions, time budget, and environment are used unless explicitly studied.
- [ ] The baseline condition is documented clearly.
- [ ] The LMP condition identifies the exact Mind and evaluation loop.
- [ ] Multiple runs account for model nondeterminism.
- [ ] Success is evaluated with independent tests, review, security checks, or later outcomes, not only LMP's internal score.
- [ ] Cost, latency, failed runs, and agent iteration count are reported.
- [ ] Negative or inconclusive results are published.
- [ ] The conclusion is limited to the measured tasks, models, repositories, and conditions.

A valid conclusion is:

> Under the documented benchmark conditions, LMP-guided runs achieved the observed outcome difference.

An invalid conclusion is:

> LMP universally makes all AI-generated code high quality.

---

## 7. Minimal Demo Artifact

```json
{
  "demoId": "oss-typescript-feature-001",
  "repository": {
    "upstream": "https://github.com/<owner>/<repo>",
    "revision": "<full-commit-sha>",
    "forkOrFixture": "<demo-branch-or-fork>"
  },
  "task": {
    "summary": "<testable task summary>",
    "acceptanceCriteria": ["<criterion>"],
    "nonGoals": ["<non-goal>"]
  },
  "mind": {
    "id": "lmp:mind:<name>",
    "version": "<version>",
    "provenance": "<reference summary>"
  },
  "decision": {
    "selected": "<approach>",
    "alternatives": [
      { "option": "<alternative>", "reasonRejected": "<trade-off>" }
    ]
  },
  "evaluation": {
    "decision": "pass",
    "checks": [
      { "id": "types", "status": "passed" },
      { "id": "tests", "status": "passed" }
    ],
    "iterations": 2,
    "limitations": ["<checks not run or known uncertainty>"]
  },
  "artifact": {
    "version": "1.0.0",
    "redacted": true
  }
}
```

---

## 8. Final Demo Standard

An LMP demo is considered **real and credible** only when it demonstrates all of the following:

1. A real task on a real project or explicitly controlled fixture.
2. A Mind that provides philosophy, methodology, trade-offs, and applicable implementation guidance.
3. An autonomous agent making an implementation decision using that context.
4. LMP collecting evidence beyond the agent's own confidence.
5. A remediation loop when evidence is insufficient.
6. A reproducible artifact that states what was checked and what was not.
7. Honest boundaries: no claim that LMP proves universal quality, security, or correctness without corresponding independent evidence.

This checklist is intentionally general. Each Mind and project workflow may add stricter, domain-specific requirements, but every LMP workflow should be able to explain: **what decision was made, why it was made, what evidence supports it, what remains uncertain, and who is accountable for final acceptance.**
