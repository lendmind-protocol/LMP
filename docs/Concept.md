# Lending-Mind Protocol concept

This is the canonical boundary summary for LMP. Product behavior and release
status live in the documentation portal; this page exists so older links do
not preserve speculative architecture as if it were shipped behavior.

## The product

LMP packages a team's engineering stance into a versioned Mind Package:

- human-readable guidance and source provenance;
- machine-readable rules and explicit rule-to-evaluator contracts;
- signed package and manifest metadata;
- bounded workspace evaluation;
- redacted, content-addressed evidence; and
- advisory, audit, or enforced outcomes.

Guidance helps an agent reason about trade-offs. It is not proof that the
agent followed the guidance. The enforceable part is the configured evaluator
and the host boundary that actually invokes it.

## The real runtime loop

```text
verified Mind
    -> bounded workspace scope
    -> supported static/configured checks
    -> explicit unsupported/skipped results
    -> redacted evidence artifact
    -> advisory feedback or enforced rejection
```

Hosts that explicitly use the mediated-write adapter are checked before the
proposed bytes are atomically committed. The Git integration checks the staged
commit boundary. The standalone `lmpd` watcher detects filesystem changes
after persistence and reports them. LMP does not universally intercept every
editor or agent write, and it does not claim that a passing report proves
general software quality or production readiness.

## Canonical documentation

- [Product overview](../apps/docs/content/docs/concepts/overview.mdx)
- [Enforcement model](../apps/docs/content/docs/concepts/enforcement.mdx)
- [Capability inventory](../apps/docs/content/docs/operations/capability-inventory.mdx)
- [Roadmap and release status](../apps/docs/content/docs/operations/roadmap.mdx)
- [Claim ledger](./claim-ledger.md)
- [Production-readiness report](./production-readiness-report.md)

When this page conflicts with an older example or diagram, the linked
canonical pages and executable evidence take precedence.
