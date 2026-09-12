# Registry and distribution contract

LMP has two related registry surfaces:

- `registry/` is the repository’s signed package source.
- `public-web-vault/registry.json` is the public discovery catalog generated from those packages plus clearly labeled draft archetypes.

The catalog is not allowed to manufacture deployment evidence. A production package must have a real package directory, a recomputable digest, a valid public key, and a detached signature over the canonical manifest. External distribution fields remain null until the package is actually pinned to IPFS and published through an OCI registry.

## Validate and resolve

```bash
node public-web-vault/scripts/validate-registry.ts
cargo run --locked --bin lmp -- registry validate --path public-web-vault/registry.json --json
cargo run --locked --bin lmp -- mind list --registry public-web-vault/registry.json
cargo run --locked --bin lmp -- mind resolve --mind rust-defensive-systems --registry public-web-vault/registry.json --json
```

`mind resolve` rejects draft-only entries. This prevents discovery content from being treated as an executable policy package.

## Distribution status

The existing OCI and IPFS adapters verify content and signatures when pointed at a real endpoint or gateway. They do not claim a public publication exists. The release gate remains blocked until an operator supplies real external artifacts, immutable references, and the corresponding release evidence.
