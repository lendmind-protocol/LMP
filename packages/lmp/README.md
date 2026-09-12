# `lmp`

This is the unscoped `npx lmp` launcher for the verified
`@lending-mind/lmp` CLI.

```bash
npx lmp init
npx lmp use <mind>
npx lmp evaluate --workspace . --mind .lending-mind/mind --changed-only --json
```

The launcher contains no separate policy logic. It forwards arguments to the
scoped CLI package, which remains the maintained implementation and uses the
Rust runtime as the evaluation authority.
