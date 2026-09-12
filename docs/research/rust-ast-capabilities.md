# Rust AST capability research

## Question

What can the selected Rust parser prove about source structure?

## Primary source URL/repository

- [syn repository](https://github.com/dtolnay/syn)
- [Rust compiler book: syntax extensions and parsing context](https://doc.rust-lang.org/reference/macros.html)

## Source version/date/commit

`syn` and Rust Reference documentation reviewed on 2026-09-12; the exact crate
lockfile revision and Rust toolchain must be captured in each run artifact.

## What the source proves

`syn` provides Rust syntax parsing and traversal structures for supported Rust
grammar versions.

## What it does not prove

Parsing and AST traversal do not prove runtime behavior, concurrency safety, or
semantic correctness of arbitrary programs.

## Implementation implication

LMP reports parser-supported structural checks and explicit unsupported-language
or malformed-source findings.

## Chosen decision

Use versioned cyclomatic semantics and structured parser errors.

## Rejected alternatives

Claims of compiler-equivalent universal quality were rejected.

## Test plan

Use malformed, truncated, nested, oversized, and valid syntax fixtures.

## Known limitation

The supported grammar and implemented visitors define the evidence boundary.
