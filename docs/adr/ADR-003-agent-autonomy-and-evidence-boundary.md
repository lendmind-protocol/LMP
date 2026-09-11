# ADR-003: Agent Autonomy and Evidence Boundary

- **Status:** Accepted
- **Date:** 2026-09-11

## Context

Agents can autonomously plan, choose tools, inspect results, revise code, and decide their next action. LMP must improve this workflow without pretending that agent confidence alone proves correctness.

## Decision

Agents retain planning and remediation autonomy. LMP provides Mind context and an external evidence boundary that returns `pass`, `needs_revision`, `blocked`, or `evaluation_error`. Human/CI policy retains final authority for protected workflows.

## Consequences

LMP does not replace agents with a rigid controller. It provides observable checks, bounded execution, artifacts, and remediation feedback. Errors or unperformed required checks cannot become pass results.

## Rejected

Agent self-certification as sufficient proof; universal host-level control over external agents; and claims that static rules alone determine complete code quality.
