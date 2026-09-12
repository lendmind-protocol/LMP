# Benchmark methodology research

## Question

What evidence is needed to claim LMP improves outcomes over existing controls?

## Primary source URL/repository

- Repository benchmark harness: `orchestrator/real_world_benchmark.py`
- Repository artifact gate: `orchestrator/benchmark_artifact_gate.py`

## Source version/date/commit

Repository working tree reviewed on 2026-09-12; external benchmark guidance is
not treated as a fixed version until a pinned study commit is recorded.

## What the source proves

The harness can execute declared scenarios, compare transitions, record privacy
metadata, and preserve reviewer annotations.

## What it does not prove

Scenario success does not establish causal improvement across models, hosts,
repositories, or production populations.

## Implementation implication

Baseline and LMP runs must share task, model, host, repository, and acceptance
criteria, with independent review and clean revision binding.

## Chosen decision

Classify current differentiation as PARTIAL until a controlled comparison exists.

## Rejected alternatives

Using only LMP pass counts as a quality score was rejected.

## Test plan

Require complete scenario counts, clean revisions, reviewer annotations, and
artifact privacy checks.

## Known limitation

No current artifact proves that LMP causes better generated code than a strong
ordinary engineering control stack.
