# Technical Specification Document — Lending-Mind Protocol

## 1. Scope

LMP is a local-first system that loads a versioned Mind, compiles it into agent guidance and executable evaluation plans, evaluates repository changes, emits redacted evidence artifacts, and supports governed Mind calibration.

## 2. Secondary TypeScript components

TypeScript is an integration surface, not the protocol runtime. Rust owns the
canonical schemas, compiler, evaluator, artifact contract, and MCP behavior.
Node.js adapters may consume Rust JSON-RPC or CLI outputs for agent ecosystems
that require JavaScript, but they must not reinterpret Mind policy.

| Component | Responsibility |
| --- | --- |
| Mind loader | Loads package files, validates schema, verifies manifest/signature where required |
| Mind compiler | Produces task-scoped guidance, decision heuristics, and evaluator configuration |
| Scope resolver | Resolves workspace root, changed files, package boundaries, dependency closure, and Mind precedence |
| Evaluator | Coordinates static, behavioral, architectural, and sandbox checks |
| Sandbox runner | Executes policy-approved commands under bounded resource/security settings |
| Artifact service | Redacts, hashes, validates, writes, and retrieves evidence artifacts |
| Registry adapter | Resolves local filesystem packages and optional remote OCI/IPFS releases |
| Agent adapter | Exposes LMP through CLI, MCP, hooks, or host-specific integrations |
| Calibration service | Aggregates approved evidence into reviewable Mind-update proposals |

## 3. Core data contracts

```ts
type EvaluationMode = "advisory" | "enforced" | "audit";
type Decision = "pass" | "needs_revision" | "blocked" | "evaluation_error";

interface MindRef {
  id: string;
  version: string;
  digest?: string;
}

interface EvaluationRequest {
  workspace: string;
  mind: MindRef;
  mode: EvaluationMode;
  baseRevision?: string;
  changedPaths?: string[];
  runCommands?: boolean;
}

interface Finding {
  id: string;
  severity: "hard" | "soft" | "info";
  category: "behavior" | "security" | "architecture" | "maintainability" | "runtime";
  path?: string;
  message: string;
  remediation?: string;
}

interface EvaluationArtifact {
  artifactVersion: string;
  runId: string;
  mind: MindRef;
  repositoryRevision?: string;
  scope: string[];
  mode: EvaluationMode;
  decision: Decision;
  checks: Array<{ id: string; status: "passed" | "failed" | "skipped" | "error" }>;
  findings: Finding[];
  redacted: true;
}
```

## 4. Mind resolution and precedence

```text
1. Resolve repository root configuration.
2. Resolve package-level configuration for the affected package.
3. Apply root global invariants.
4. Apply package Mind additions.
5. Reject package policies that weaken non-overridable root constraints.
6. Pin the final Mind references and evaluator versions in the artifact.
```

## 5. Evaluation pipeline

```text
validate request
-> guard workspace path
-> resolve scope and Mind
-> validate package/schema/signature
-> compile context and checks
-> run static checks
-> run behavior checks
-> run sandbox checks only if policy/mode permits
-> redact + validate artifact
-> return decision and evidence
```

## 6. Execution safety

- Workspace paths must be resolved and contained under an approved root.
- Commands use argument arrays with `shell: false`.
- Command policy must define executable, arguments, timeout, working directory, and output cap.
- Environment is allowlisted/minimized.
- Audit mode cannot execute commands.
- Sandboxes are ephemeral; network is disabled unless explicitly approved.
- Failures in redaction, signature verification, or sandbox initialization result in `blocked` or `evaluation_error`, never `pass`.

## 7. Local and remote storage

| Store | Contents | Default |
| --- | --- | --- |
| Local registry | Mind packages and pinned versions | Enabled |
| Local artifact store | Redacted evaluation artifacts | Enabled |
| OCI registry | Signed, immutable Mind releases | Optional |
| IPFS | Content-addressed distribution/cache | Optional |
| Calibration store | Approved aggregate outcomes/proposals | Optional and governed |

## 8. Observability

LMP records bounded operational metrics: evaluation duration, parser/tool versions, scope size, check status, sandbox status, and artifact ID. It must not emit source, secrets, raw environment variables, or unrestricted logs by default.

## 9. Compatibility

- Mind and artifact schemas use semantic versions.
- The evaluator rejects unsupported major schema versions.
- CLI/MCP responses include machine-stable IDs and can add optional fields only in backward-compatible releases.
- Remote updates require explicit installation; no background policy mutation.
