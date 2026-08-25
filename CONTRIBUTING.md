# Contributing

Requirements: Node 22+, pnpm, and Git. Start with `pnpm install`, then run
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm validate:skills`.

Package boundaries are documented in [docs/architecture.md](docs/architecture.md).
Add a static rule in the evaluator with a focused passing and failing test,
severity/remediation text, artifact coverage, and documentation. Add a skill
under `skills/<name>` with canonical `mind.json`, all four rule files, guidance,
provenance, fixtures, and validation tests.

Pull requests must explain security/privacy impact, preserve offline defaults,
avoid automatic installation or source mutation, and include fresh verification.
