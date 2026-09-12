# Lending-Mind Protocol concept

This page is the concise, evidence-bounded explanation of the product. It
replaces an earlier speculative design draft that described unavailable
systems—such as universal write interception, adaptive telemetry weights, and
fully deployed OCI/IPFS distribution—as if they were implemented.

## The problem

AI coding agents are good at producing locally plausible changes, but they do
not reliably preserve a team’s architectural preferences, security posture,
operational limits, or review standards. Prompt files, skills, hooks, linters,
tests, and MCP integrations each address part of that problem, but their
configuration and evidence are often distributed across a project.

LMP provides a versioned place to express a team’s engineering stance and a
repeatable path to evaluate a bounded workspace against it.

## What a Mind is

A Mind Package is a signed, versioned package containing:

- human-readable guidance and interpretation;
- source references with captured digests and explicit provenance;
- machine-readable rule policies;
- rule-to-evaluator contracts;
- fixtures and limitations; and
- release and signature metadata.

Guidance helps an agent reason about trade-offs. It is not itself a proof that
the agent followed the guidance. Mechanical rules, configured commands, and
review evidence provide the enforceable part of the contract.

## The actual runtime loop

```text
select a verified Mind
        |
        v
resolve a bounded workspace scope
        |
        v
run supported static checks and configured gates
        |
        v
emit a redacted, content-addressed evaluation artifact
        |
        v
advisory feedback or enforced rejection
```

The Rust runtime verifies package integrity before evaluation. The TypeScript
evaluator supplies additional supported-language checks. The Python
orchestrator owns Docker qualification and bounded command execution. The
MCP server exposes the evaluator through a constrained tool surface.

## What “enforced” means

In enforced mode, a configured hard finding makes the evaluation fail and can
block a Git pre-commit boundary. A local `lmpd` process can re-evaluate a
workspace after filesystem events and fail its own process on a violation.
Those are real boundaries, but they are not a universal operating-system
firewall: the current daemon observes filesystem changes after persistence, and
MCP does not define a universal host-level pre-write hook.

Use the host integration that is actually installed—Git hooks, a supported
MCP adapter, CI, or an explicit CLI invocation—and retain the resulting
artifact. A passing artifact proves only the named package, evaluator version,
scope, checks, and run.

## What Docker contributes

Docker is an optional qualification boundary for commands that a Mind or
benchmark explicitly configures. The orchestrator records controls such as
network isolation, read-only mounts, dropped capabilities, process limits,
CPU, memory, exit status, and timing. Docker evidence is not silently folded
into a static source evaluation, and it does not prove that arbitrary host
execution is safe.

## Distribution and trust

Local package validation checks schema, paths, signatures, source digests, and
package identity. The registry release gate requires immutable external pins
before a package is presented as externally distributed. The repository’s
current release evidence records one verified IPFS package, while other
external pins remain explicitly pending; no public OCI deployment is claimed
until it can be pulled and verified independently.

## What LMP does not claim

LMP does not claim to:

- control every agent, editor, shell, network socket, or filesystem write;
- eliminate hallucinations, token gaming, deception, or human review;
- guarantee high-quality software from static rules alone;
- infer an author’s endorsement from a cited blog, video, or repository;
- turn a source citation into a complete executable philosophy; or
- prove causal improvement over a strong existing engineering workflow from
  the current fixed-fixture benchmark.

These limits are product requirements, not footnotes. They are tracked in the
[claim ledger](./claim-ledger.md), [implementation boundaries](./implementation-boundaries.md),
and [production-readiness report](./production-readiness-report.md).

## Product direction

The remaining vision work is explicit: expand source-backed Minds through
reviewed packages, add evaluator coverage only where a real parser or
reproducible gate exists, qualify host-specific integrations, publish and
independently pull immutable artifacts, and run a matched model-generated
quality study with independent reviewers. Until those steps have evidence,
the release remains a scoped protocol implementation rather than a universal
AI-control or quality guarantee.

For the current implementation, start with the [product overview](../apps/docs/content/docs/concepts/overview.mdx),
[capability inventory](../apps/docs/content/docs/operations/capability-inventory.mdx),
and [roadmap](../apps/docs/content/docs/operations/roadmap.mdx).
