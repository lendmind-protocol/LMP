# Docker sandbox boundary research

## Question

Which Docker controls can be asserted by LMP, and what do they actually prove?

## Primary source URL/repository

- [Docker `run` reference](https://docs.docker.com/reference/cli/docker/container/run/)
- [Docker running containers guide](https://docs.docker.com/engine/containers/run/)

## Source version/date/commit

Docker documentation current at review time (2026-09-12); the exact daemon and
container runtime versions must be recorded by each qualification artifact.

## What the source proves

Docker exposes network, memory, CPU, PID, read-only filesystem, capability, and
security-option controls.

## What it does not prove

Flags do not establish absolute isolation from host kernel bugs, daemon policy,
rootless limitations, or an incorrectly configured runtime.

## Implementation implication

LMP asserts configured flags and records runtime qualification separately from
static policy inspection.

## Chosen decision

Use `--network=none`, restricted mounts, dropped capabilities, no-new-privileges,
resource limits, timeouts, and output limits where supported.

## Rejected alternatives

A universal “secure sandbox” claim was rejected.

## Test plan

Run network, mount, resource, timeout, process, and cleanup fixtures.

## Known limitation

Long-duration and host-specific resource evidence must be run on the target
environment.
