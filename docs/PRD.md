# Product Requirements Document: LMP

## Vision

LMP is Rust-core infrastructure that gives AI coding agents access to versioned engineering Minds and evidence-backed feedback loops. It aims to improve the quality of agent-generated software by operationalizing documented engineering philosophy, methods, tradeoffs, implementation patterns, and verified outcomes.

## Problem

Agents can produce code quickly but can drift from repository context, make weak tradeoffs, repeat failures, and overstate confidence. Plain instruction files may help, but they do not by themselves provide reproducible Mind packaging, deterministic evaluation, evidence artifacts, calibration governance, or independent quality measurement.

## Users

- Developers using coding agents in personal or OSS repositories.
- Teams requiring consistent AI-assisted delivery standards.
- Mind authors curating engineering practices and evidence.
- Maintainers of large/enterprise monorepos.
- Agent/tool vendors integrating LMP runtime capabilities.

## Goals

- Package Minds with guidance, provenance, executable checks, fixtures, and signatures.
- Compile task-scoped Mind context for agents.
- Evaluate candidate repository changes using static, behavioral, and runtime evidence.
- Support an agent remediation loop and human/CI decision gates.
- Preserve privacy-safe artifacts and governed Mind calibration.
- Support real OSS demonstrations and independent benchmark studies.

## Non-goals

- Literal identity cloning of engineers.
- Guaranteed production correctness/security.
- Silent source upload, automatic policy mutation, or automatic external-model weight updates.
- Replacing human review or existing engineering accountability.

## Core journey

```text
install -> pin Mind -> agent receives task-scoped guidance -> agent plans and changes code
-> LMP evaluates -> agent revises from evidence -> CI/human decides -> artifact retained
-> approved calibration may release a new Mind version
```

## Success measures

- Reproducible Mind resolution and evaluation artifacts.
- Useful findings on real repository tasks.
- Real OSS benchmark protocol comparing baseline and LMP-guided runs with identical task/model/tool conditions.
- Independent outcomes: tests, review acceptance, rework, regressions, security findings, cost, and latency.
