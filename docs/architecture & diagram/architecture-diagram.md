# LMP Architecture Diagrams

## System context

```mermaid
flowchart TB
  author[Mind Author or Organization] --> source[Docs, Blogs, Code, Reviews, Outcomes]
  source --> mind[Reviewed Mind Package]
  mind --> registry[Signed Registry\nLocal / OCI / IPFS]

  user[Developer or Team] --> setup[Node.js create-lmp]
  setup --> repo[Target Repository]
  setup --> daemon[Rust lmpd]
  registry --> daemon

  agent[AI Coding Agent] <--> daemon
  daemon --> eval[Rust Evaluator]
  eval --> sandbox[Python + Docker Sandbox]
  eval --> artifact[Redacted Evidence Artifact]
  sandbox --> artifact
  artifact --> gate[CI / Human Review]
  gate --> calibration[Reviewed Calibration Proposal]
  calibration --> mind
```

## Runtime flow

```mermaid
sequenceDiagram
  participant U as Developer
  participant A as Agent
  participant L as lmpd (Rust)
  participant E as Evaluator (Rust)
  participant S as Sandbox (Python/Docker)
  participant C as CI/Human

  U->>A: Request feature or fix
  A->>L: Resolve Mind and workspace scope
  L-->>A: Task-scoped philosophy, tradeoffs, checks
  A->>A: Inspect, plan, choose tools and approach
  A->>L: Submit candidate diff for evaluation
  L->>E: Run static, architecture, and policy checks
  E->>S: Run permitted build/test/profile checks
  S-->>E: Bounded execution evidence
  E-->>L: Findings and decision
  L-->>A: Evidence and remediation priorities
  alt Needs revision
    A->>A: Revise and re-evaluate
  else Evidence sufficient
    L->>C: Emit artifact and review result
  end
```

## Mind lifecycle

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Validated: schema and fixtures pass
  Validated --> Reviewed: provenance and policy review
  Reviewed --> Signed: authorized signature
  Signed --> Published: explicit release
  Published --> Installed: explicit consumer install
  Installed --> Active: selected by workspace
  Active --> CalibrationCandidate: approved outcome evidence
  CalibrationCandidate --> Draft: next version proposal
  Published --> Deprecated: superseded or revoked
```

## Enterprise monorepo evaluation

```mermaid
flowchart LR
  root[Root Policy] --> resolve[Scope Resolver]
  diff[Changed Files] --> resolve
  graph[Package / Dependency Graph] --> resolve
  resolve --> affected[Affected Package Closure]
  affected --> fast[Fast Static Checks]
  affected --> matrix[Package Build/Test Matrix]
  root --> global[Global Security/API Invariants]
  fast --> artifact[Unified Artifact]
  matrix --> artifact
  global --> artifact
```

## Calibration boundary

```mermaid
flowchart LR
  local[Verified Local Artifacts] --> redact[Redact + Aggregate]
  redact --> analysis[Analyze Outcomes]
  analysis --> proposal[Calibration Proposal]
  proposal --> review[Human/Maintainer Review]
  review --> release[New Signed Mind Version]
  release --> registry[Registry]
```

Artifacts influence future Minds only through governed review and explicit version release. They never silently change workspace policy or third-party model weights.
