# Making Engineering Judgment Executable in AI-Assisted Software Development

## An IEEE-Style Whitepaper on the Lending-Mind Protocol

Lending-Mind Protocol Working Group

Version 1.0, September 2026

## Abstract

AI coding agents produce software changes at high speed, yet speed does not ensure architectural fit, security, maintainability, or reviewability. This whitepaper presents the Lending-Mind Protocol, or LMP, a local-first control plane for applying explicit engineering preferences to AI-assisted software development. LMP packages guidance and machine-checkable rules into versioned Mind Packages. The protocol validates package structure and signatures, resolves repository scope, runs supported static and behavioral checks, and records redacted evidence artifacts. The design separates advisory feedback from enforced rejection and distinguishes incomplete evidence from a passing result. This paper defines the protocol model, trust boundaries, evaluation workflow, evidence contract, and proposed study design. The review finds a coherent mechanism for recording selected engineering controls. Current repository evidence does not establish causal improvement in general software quality, universal agent interception, or production safety. A matched benchmark with independent review is required before broader claims are made.

Index Terms: AI-assisted software development, software engineering governance, policy evaluation, signed packages, evidence artifacts, secure development, Model Context Protocol

## I. Introduction

AI coding agents reduce the time required to edit software. They also create a governance problem. Teams often express engineering judgment through prompts, project instructions, or informal review habits. Those forms of guidance lack stable versioning, precise scope, testable rules, and durable records.

The Lending-Mind Protocol addresses this problem by treating selected engineering judgment as an executable control. A human or community curator defines a Mind Package. The package combines readable guidance with machine-checkable policy. LMP resolves the package, limits evaluation to an explicit workspace scope, applies supported checks, and records the outcome.

This paper asks:

> Does an explicit, signed, and evidence-producing control plane improve the quality and reviewability of AI-assisted software changes compared with ordinary project controls?

This paper makes a bounded claim. LMP provides a structure for expressing and evaluating engineering preferences. Current evidence does not establish broad causal improvement across models, repositories, or production environments.

## II. Background and Related Work

### A. AI Risk Management

The NIST AI Risk Management Framework provides a voluntary and use-case-agnostic approach for managing risks across the AI lifecycle [1]. LMP offers a concrete implementation pattern for one part of this work. It turns selected engineering expectations into scoped checks and reviewable records.

LMP does not select an organization’s risk priorities. It does not establish accountability or prove policy quality. Those decisions require human ownership and project context.

### B. Generative AI Application Security

OWASP identifies prompt injection, insecure output handling, supply chain risk, sensitive information disclosure, and related risks in large language model applications [2]. Such risks increase when an agent receives access to source files, tools, credentials, or delivery systems.

LMP reduces selected process risks through package validation, signature checks, path guards, command allowlists, redacted artifacts, and explicit blocked states. These controls do not stop every attack. They also do not establish a universal security boundary around an agent host.

### C. Tool Integration

The Model Context Protocol defines a standard interface for servers to expose tools to language-model clients [3]. The tool specification does not define a universal host-level hook for intercepting every filesystem write. LMP therefore treats MCP as an adapter surface. Daemon and Git-hook paths provide separate enforcement points where the host supports them.

## III. Protocol Architecture

The LMP pipeline is:

```text
Engineering preference
        -> Mind Package
        -> schema and signature validation
        -> scope resolution
        -> static, AST, and optional behavioral checks
        -> redaction and artifact validation
        -> advisory or enforced decision
```

The Rust core owns package semantics, evaluation, signing, evidence, and registry primitives. Node.js packages support onboarding and delivery. The Python orchestrator supplies sandboxed behavioral checks, qualification suites, and benchmark tooling. CLI, daemon, and MCP components expose the shared control plane.

### A. Mind Package Model

A Mind Package contains human-readable guidance and explicit policy. Each rule records an assertion, severity, scope, remediation, limitation, and evidence expectation.

TABLE I

MIND PACKAGE CONTROL SURFACES

| Surface | Protocol mechanism | Review question |
| --- | --- | --- |
| Guidance | Visible instructions | Is the advice clear and relevant? |
| Policy | Versioned rule metadata | Is the rule precise and testable? |
| Integrity | Digest and Ed25519 signature | Did the evaluated bytes change? |
| Evidence | Redacted append-only artifact | What did the run check or skip? |

Signatures establish key possession and content integrity. They do not establish author identity, policy quality, or endorsement [4].

### B. Evaluation Modes

LMP supports three modes.

1. Advisory mode reports findings for agent or developer revision.
2. Enforced mode returns a blocking result for configured hard failures.
3. Audit mode performs read-only evaluation without command execution.

The separation supports gradual adoption. Teams first observe findings. They then enable blocking rules after checking false positives, scope, and remediation cost.

### C. Evaluation Decisions

TABLE II

EVALUATION DECISIONS

| Decision | Definition |
| --- | --- |
| pass | Required checks completed with no unresolved hard finding |
| needs_revision | A correctable failure, missing evidence, or material regression exists |
| blocked | A trust, path, command, permission, sandbox, or policy boundary prevents safe evaluation |
| evaluation_error | LMP failed to produce a trustworthy result |

An evaluation artifact records the Mind identity and version, repository revision, evaluator version, mode, scope, checks, findings, redaction status, skipped checks, and limitations.

## IV. Trust and Evidence Model

LMP uses a layered trust model:

1. Treat an incoming package as untrusted.
2. Validate the package schema and referenced rules.
3. Verify the package digest and signature.
4. Resolve the workspace and changed-file scope.
5. Run only approved checks.
6. Redact secrets and unrestricted environment data.
7. Require human review for claims beyond the measured scope.

The evidence contract follows the principle:

\[
\text{Claim strength} \leq \text{Evidence scope}
\]

A passing artifact supports a bounded statement about one package, evaluator version, repository revision, mode, scope, and run. It does not support a universal statement about software quality or safety.

### A. Integrity Controls

LMP uses content digests and detached Ed25519 signatures. A digest identifies the bytes used during verification. A signature links those bytes to a public key. Mutation tests should cover content, ordering, whitespace, referenced files, signatures, key status, rotation, and revocation.

### B. Artifact Privacy

Artifacts should contain enough metadata for review while excluding secrets, raw source, unrestricted environment data, and sensitive absolute paths. The artifact should state whether redaction ran and which checks were skipped.

### C. Sandbox Boundaries

Optional behavioral checks use bounded command execution and Docker controls such as disabled networking, restricted mounts, dropped capabilities, no-new-privileges, resource limits, timeouts, and output limits [5]. Runtime flags establish configured conditions. They do not prove absolute isolation from host kernel defects, daemon policy, rootless limitations, or misconfiguration.

## V. Research Method

This whitepaper uses a design and evidence review. The review examined repository architecture, evaluation, quality checks, threat model, benchmark methodology, cryptographic verification, MCP host capabilities, and Docker boundary notes. It compared those materials with NIST AI RMF, OWASP GenAI guidance, MCP, Ed25519, and OCI specifications.

Each control was evaluated with three questions:

1. What input or property does the control verify?
2. What claim does the control fail to support?
3. What evidence would support a stronger claim?

Repository documentation was treated as design evidence, not independent validation. The review did not measure defect rates, reviewer effort, remediation time, or agent behavior under randomized conditions.

## VI. Findings

### A. Supported Properties

The repository supports five design properties.

1. Guidance is separate from enforceable policy.
2. Package identity is explicit through versioning, digests, and signatures.
3. Evaluation scope is limited to named workspaces and files.
4. Decisions distinguish pass, revision, blocked, and error states.
5. Evidence includes checks, findings, skipped work, and limitations.

These properties align with traceable and context-specific AI risk controls [1]. They also address process weaknesses associated with insecure agent integration and supply-chain exposure [2].

### B. Claim Ledger

TABLE III

CURRENT EVIDENCE STATUS

| Claim | Status | Evidence needed for stronger support |
| --- | --- | --- |
| A signed package was not altered | Supported within the verifier boundary | Mutation and verification tests |
| A selected Rust structural rule passed | Supported for implemented parser and visitor behavior | Positive, negative, malformed, and unsupported-syntax fixtures |
| An agent followed a stated preference | Partially supported | Agent trace linked to an evaluation artifact |
| LMP improves general code quality | Not established | Matched benchmark with independent review |
| LMP prevents all agent bypasses | Not established | Host-specific interception and adversarial tests |
| LMP provides a secure sandbox | Not established | Runtime qualification for each supported environment |

### C. Principal Limitation

LMP evaluates declared rules. A weak rule produces a weak control. Unsupported language features, untested host integrations, and unobserved workflow boundaries create gaps. Evaluation therefore supports a bounded run-level statement.

## VII. Proposed Controlled Evaluation

The next study should test LMP against ordinary project controls.

### A. Study Arms

Use three study arms:

1. Ordinary agent workflow with repository instructions and tests.
2. LMP advisory mode with the same task, model, host, repository, and acceptance criteria.
3. LMP enforced mode with the same inputs and blocking rules.

Randomize task order where practical. Pin the model version, tool configuration, repository revision, operating environment, and acceptance criteria.

### B. Measures

Measure the following outcomes:

- Functional correctness through visible and hidden acceptance tests.
- Repository fit through architecture and integration review.
- Maintainability through complexity, duplication, and reviewer ratings.
- Security through targeted vulnerability fixtures and security review.
- Reviewability through time to identify material defects and reviewer agreement.
- Process integrity through artifact completeness, scope accuracy, and skipped-check reporting.

Report raw counts, denominators, confidence intervals when sample size supports them, and full study conditions. Separate automated findings from independent human judgments.

### C. Hypotheses

H1: LMP reduces violations of explicitly declared project rules.

H2: LMP improves reviewer ability to identify why a change passed, failed, or remained unverified.

H3: LMP enforcement increases revision frequency for changes with known policy violations.

H4: LMP alone does not establish a meaningful improvement in general functional correctness.

H4 limits overclaiming. A control designed for explicit engineering preferences should not receive credit for outcomes outside its measured scope.

## VIII. Operational Recommendations

For adoption:

1. Start with a small baseline package and rules supported by fixtures.
2. Run advisory mode before enabling enforcement.
3. Record repository revisions and evaluator versions in every artifact.
4. Keep source provenance separate from curator interpretation.
5. Treat signatures as integrity controls, not identity proof.
6. Connect enforcement to a real write or commit boundary.
7. Keep tests, code review, threat modeling, and release approval in the workflow.
8. Publish unsupported checks and skipped evidence beside every decision.

For further research:

1. Run the matched benchmark described in Section VII.
2. Add independent review of benchmark outputs.
3. Measure false positives, false negatives, remediation cost, and reviewer effort.
4. Test CLI, Git-hook, daemon, and MCP bypass paths.
5. Record runtime versions for sandbox and resource controls.
6. Require immutable publication and retrieval evidence before external distribution claims.

## IX. Conclusion

The Lending-Mind Protocol provides a structured approach for making selected engineering preferences versioned, scoped, executable, and reviewable. The approach addresses a recurring weakness in AI-assisted development. Teams often express judgment in prose but lack a durable mechanism for checking and recording its application.

Current evidence supports a bounded protocol claim. LMP verifies selected rules for a named run and preserves the result with integrity and privacy metadata. Current evidence does not support claims of better software in general, universal agent control, or production safety. A controlled benchmark with independent review is the next required step.

## References

[1] E. Tabassi, “Artificial Intelligence Risk Management Framework (AI RMF 1.0),” NIST AI 100-1, National Institute of Standards and Technology, Gaithersburg, MD, USA, Jan. 2023, doi: 10.6028/NIST.AI.100-1.

[2] OWASP Foundation, “OWASP GenAI Security Project and Top 10 for LLM Applications,” 2026. [Online]. Available: https://genai.owasp.org/llm-top-10/

[3] Model Context Protocol, “Tools,” specification version 2025-03-26. [Online]. Available: https://modelcontextprotocol.io/specification/2025-03-26/server/tools

[4] S. Josefsson and I. Liusvaara, “Edwards-Curve Digital Signature Algorithm (EdDSA),” RFC 8032, Internet Engineering Task Force, Nov. 2017. [Online]. Available: https://www.rfc-editor.org/rfc/rfc8032

[5] Docker, “Docker container run reference,” 2026. [Online]. Available: https://docs.docker.com/reference/cli/docker/container/run/

[6] Open Container Initiative, “Image Format Specification,” 2026. [Online]. Available: https://github.com/opencontainers/image-spec/blob/main/spec.md

## Appendix A. Repository Materials Reviewed

- `docs/architecture.md`
- `docs/evaluation.md`
- `docs/quality-checks.md`
- `docs/threat-model.md`
- `docs/research/benchmark-methodology.md`
- `docs/research/crypto-verification.md`
- `docs/research/mcp-host-capabilities.md`
- `docs/research/docker-sandbox-boundaries.md`
- `orchestrator/real_world_benchmark.py`
- `orchestrator/benchmark_artifact_gate.py`
