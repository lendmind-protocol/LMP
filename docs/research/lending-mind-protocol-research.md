# Lending-Mind Protocol: Making Engineering Judgment Executable

## Abstract

AI coding agents produce software changes quickly. Speed does not ensure fit with a project’s architecture, security rules, or maintenance standards. The Lending-Mind Protocol, or LMP, addresses this gap with versioned Mind Packages, scoped evaluation, advisory or enforced decisions, and redacted evidence artifacts.

This paper reviews LMP as a local-first control plane for AI-assisted software development. It maps the protocol to established risk-management and application-security guidance. It also defines an evaluation design for testing whether LMP improves code quality and reviewability compared with ordinary engineering controls. The review finds a coherent architecture and a disciplined evidence boundary. It does not find evidence for a broad claim of improved software outcomes across models, repositories, or production environments. The next research step is a controlled benchmark with matched tasks, pinned revisions, independent review, and complete artifacts.

Keywords: AI-assisted development, software governance, engineering judgment, policy evaluation, signed packages, evidence artifacts, MCP, secure software development

## 1. Introduction

AI agents reduce the time needed to edit code. They also create a governance problem. A prompt, system instruction, or local convention might express a team’s preferences, yet those preferences often lack versioning, scope, testable rules, and durable evidence.

LMP treats engineering judgment as an executable control. A human or community curator defines a Mind Package. The package contains visible guidance and machine-checkable rules. LMP resolves the package, limits evaluation to an explicit scope, applies supported checks, and records the result.

The central research question is:

> Does an explicit, signed, and evidence-producing control plane improve the quality and reviewability of AI-assisted software changes compared with ordinary project controls?

This paper makes a narrower claim. LMP provides a structure for expressing and evaluating engineering preferences. The repository does not yet establish causal improvement in generated code.

## 2. Background

### 2.1 Risk management

The NIST AI Risk Management Framework describes a voluntary, use-case-agnostic approach for organizations designing, deploying, or using AI systems. It emphasizes practical risk management across the system lifecycle [1]. LMP supplies an implementation pattern for one part of this problem: turning selected engineering expectations into scoped checks and reviewable records.

LMP does not replace an organization’s risk process. It does not decide which risks matter, establish accountability, or prove policy sound. Those decisions require human ownership and project context.

### 2.2 Application security

OWASP identifies prompt injection, insecure output handling, supply chain risk, and other risks in applications built with large language models [2]. These risks matter when an agent has access to source code, tools, credentials, or a delivery workflow.

LMP narrows some process risks through package validation, signature checks, path guards, command allowlists, redacted artifacts, and explicit blocked states. These controls do not stop every attack. They also do not turn an agent host into a security boundary.

### 2.3 Tool and host boundaries

The Model Context Protocol defines a standard way for servers to expose tools to language-model clients [3]. Its tool interface does not establish a universal host-level hook for intercepting every filesystem write. LMP therefore treats MCP as an adapter surface. Daemon and Git-hook paths provide separate enforcement points where the host supports them.

## 3. Protocol Model

LMP uses the following pipeline:

```text
Engineering preference
        -> Mind Package
        -> schema and signature validation
        -> scoped context resolution
        -> static, AST, and optional behavioral checks
        -> redaction and artifact validation
        -> advisory or enforced decision
```

### 3.1 Mind Packages

A Mind Package combines human-readable guidance with explicit policy. Each rule records its assertion, severity, scope, remediation, limitations, and evidence expectation. The package model separates four concerns:

| Concern | LMP mechanism | Review question |
| --- | --- | --- |
| Guidance | Visible instructions | Is the advice understandable and relevant? |
| Policy | Versioned rule metadata | Is the rule precise and testable? |
| Integrity | Digest and Ed25519 signature | Did the evaluated bytes change? |
| Evidence | Append-only, redacted artifact | What did the run check and skip? |

Signatures establish key possession and content integrity. They do not establish author identity, policy quality, or endorsement.

### 3.2 Evaluation decisions

LMP separates evaluation results from universal quality claims.

| Decision | Meaning |
| --- | --- |
| pass | Required checks completed with no unresolved hard finding |
| needs_revision | A correctable failure, missing evidence, or material regression exists |
| blocked | A trust, path, command, permission, sandbox, or policy boundary prevents safe evaluation |
| evaluation_error | LMP failed to produce a trustworthy result |

An evaluation artifact records the Mind identity and version, repository revision, evaluator version, mode, scope, checks, findings, and redaction status. It also records skipped checks and limitations.

### 3.3 Trust boundaries

The protocol uses a layered trust model:

1. Treat an incoming package as untrusted.
2. Validate its schema and referenced rules.
3. Verify its digest and signature.
4. Resolve the workspace and changed-file scope.
5. Run only approved checks.
6. Preserve evidence without exposing raw secrets or unrestricted paths.
7. Require human review for claims beyond the measured scope.

This model makes the source of a decision easier to inspect. It does not prove the selected policy covers every failure mode.

## 4. Research Method

This review used two evidence groups.

First, it examined repository documentation and implementation boundaries, including the architecture, evaluation contract, quality checks, threat model, benchmark methodology, and existing research notes. Second, it compared LMP’s stated boundaries with NIST AI RMF, OWASP GenAI security guidance, the MCP specification, Ed25519, and OCI content-addressing documentation.

The review evaluated each control against three questions:

- What input or property does the control verify?
- What claim does the control fail to support?
- What evidence would support a stronger claim?

The review did not treat repository documentation as independent validation. It also did not measure human review time, defect rates, or agent behavior in a controlled comparison.

## 5. Findings

### 5.1 Strengths

LMP has five useful design properties.

1. It separates guidance from enforceable policy. An instruction remains advisory unless an implemented evaluator checks it.
2. It makes package identity explicit through versioning, digests, and signatures.
3. It narrows evaluation through workspace and changed-file scope.
4. It distinguishes pass, revision, blocked, and error states.
5. It records evidence and limitations instead of returning only a quality score.

These properties align with the need for traceable and context-specific AI risk controls [1]. They also address process weaknesses associated with insecure agent integration and supply-chain exposure [2].

### 5.2 Evidence boundary

The strongest supported claim is:

> LMP records whether selected, implemented checks passed for a named package, evaluator version, repository revision, mode, and scope.

The following claims require more evidence:

| Claim | Current status | Required evidence |
| --- | --- | --- |
| A package was not altered after signing | Supported by digest and signature verification | Mutation and verification tests |
| A selected Rust structural rule passed | Supported for the implemented parser and visitor | Positive, negative, malformed, and unsupported-syntax fixtures |
| An agent followed a preference | Partially supported | Agent trace tied to a resulting evaluation artifact |
| LMP improves code quality | Not established | Matched controlled benchmark with independent review |
| LMP prevents all agent bypasses | Not established | Host-specific interception and adversarial testing |
| LMP provides a secure sandbox | Not established | Runtime qualification on each supported environment |

### 5.3 Main limitation

LMP evaluates declared rules. A poorly chosen rule yields a poorly governed result. An unsupported language feature, untested host integration, or unobserved workflow boundary leaves a gap. A passing artifact therefore supports a bounded statement about one run. It does not support a general statement about software quality or safety.

## 6. Proposed Evaluation Design

The repository should test LMP with a controlled comparison rather than pass counts alone.

### 6.1 Study arms

Use at least three arms:

1. Ordinary agent workflow with repository instructions and tests.
2. LMP advisory mode with the same task, model, host, repository, and acceptance criteria.
3. LMP enforced mode with the same inputs and blocking rules.

Randomize task order where practical. Pin the model version, tool configuration, repository revision, and runtime environment.

### 6.2 Measures

Measure outcomes across several dimensions:

- Functional correctness, through task tests and hidden acceptance tests.
- Repository fit, through architecture and integration review.
- Maintainability, through complexity, duplication, and reviewer ratings.
- Security, through targeted vulnerability fixtures and security review.
- Reviewability, through time to identify material defects and agreement between reviewers.
- Process integrity, through artifact completeness, scope accuracy, and skipped-check reporting.

Report raw counts, denominators, confidence intervals where sample size supports them, and the full study conditions. Separate automated findings from independent human judgments.

### 6.3 Hypotheses

H1: LMP reduces violations of explicitly declared project rules.

H2: LMP improves reviewer ability to identify why a change passed, failed, or remained unverified.

H3: LMP enforcement increases revision frequency for changes with known policy violations.

H4: LMP does not by itself establish a meaningful improvement in general functional correctness.

H4 is important. A control designed for explicit engineering preferences should not receive credit for outcomes outside its measured scope.

## 7. Practical Recommendations

For adopters:

1. Start with a small baseline package and rules with clear fixtures.
2. Run advisory mode before enabling enforcement.
3. Record repository revisions and evaluator versions in every artifact.
4. Keep source provenance separate from curator interpretation.
5. Treat signatures as integrity controls, not identity proof.
6. Connect enforcement to a real write or commit boundary.
7. Keep tests, code review, threat modeling, and release approval in the workflow.
8. Publish unsupported checks and skipped evidence beside the decision.

For LMP research:

1. Complete the matched benchmark described above.
2. Add independent review of benchmark outputs.
3. Measure false positives, false negatives, remediation cost, and reviewer effort.
4. Test host-specific bypasses for CLI, Git hooks, daemon, and MCP integrations.
5. Record runtime versions for sandbox and resource controls.
6. Avoid external distribution claims until immutable publication and retrieval evidence exist.

## 8. Conclusion

LMP offers a clear approach for making selected engineering preferences versioned, scoped, executable, and reviewable. Its architecture addresses a real weakness in AI-assisted development: teams often express judgment in prose but lack a durable mechanism for checking and recording its application.

The current evidence supports a bounded protocol claim. LMP verifies selected rules for a named run and preserves the result with integrity and privacy metadata. It does not yet support a broad claim of better software, universal agent control, or production safety. A controlled benchmark with independent review is the required next step.

## References

[1] E. Tabassi, “Artificial Intelligence Risk Management Framework (AI RMF 1.0),” NIST AI 100-1, National Institute of Standards and Technology, Jan. 2023. https://doi.org/10.6028/NIST.AI.100-1

[2] OWASP Foundation, “OWASP GenAI Security Project and Top 10 for LLM Applications,” 2026. https://genai.owasp.org/llm-top-10/

[3] Model Context Protocol, “Tools,” specification version 2025-03-26. https://modelcontextprotocol.io/specification/2025-03-26/server/tools

[4] S. Josefsson and I. Liusvaara, “Edwards-Curve Digital Signature Algorithm (EdDSA),” RFC 8032, Internet Engineering Task Force, Nov. 2017. https://www.rfc-editor.org/rfc/rfc8032

[5] Open Container Initiative, “Image Format Specification,” current specification. https://github.com/opencontainers/image-spec/blob/main/spec.md

## Appendix A. Repository Evidence Reviewed

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
