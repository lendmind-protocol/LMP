# Lending-Mind Protocol documentation

The public documentation site is a Fumadocs application backed by MDX in
`content/docs`. It is intentionally a separate presentation layer: the
repository-level `docs/` directory remains the engineering record, while this
app provides the discoverable product documentation for users, operators, and
contributors.

## Development

From the repository root:

```bash
pnpm --filter @lending-mind/docs dev
```

Then open `http://localhost:3000/docs`.

The repository includes [`vercel.json`](../../vercel.json) so a Vercel project
whose root is the repository installs the pnpm workspace and builds this app
explicitly. The hosted deployment is still validated separately by the
release gate; a local build must not be treated as proof that the public URL is
serving the registry.

## Content contract

Every page should state its audience, prerequisites, expected result, and
verification method. Use the four top-level sections consistently:

- Concepts explain the protocol model and why it exists.
- Guides solve one task from a known starting point to a verified result.
- Reference documents stable commands, schemas, APIs, and exit states.
- Operations covers deployment, security, scaling, troubleshooting, and proof.

The writing style is direct and evidence-oriented. Examples are runnable or
explicitly marked illustrative. Claims about enforcement or performance must
point to a test, artifact, or known limitation.
