# Registry and distribution contract

LMP has two related registry surfaces:

- `registry/` is the repository’s signed package source.
- `public-web-vault/registry.json` is the public discovery catalog generated from those packages plus clearly labeled draft archetypes.

The catalog is not allowed to manufacture deployment evidence. A production package must have a real package directory, a recomputable digest, a valid public key, and a detached signature over the canonical manifest. Distribution fields are populated only for exact immutable artifacts whose retrieved bytes match the current package; otherwise the package remains `PENDING_IPFS_PIN`.

## Validate and resolve

```bash
node public-web-vault/scripts/validate-registry.ts
cargo run --locked --bin lmp -- registry validate --path public-web-vault/registry.json --json
cargo run --locked --bin lmp -- mind list --registry public-web-vault/registry.json
cargo run --locked --bin lmp -- mind resolve --mind rust-defensive-systems --registry public-web-vault/registry.json --json
```

`mind resolve` rejects draft-only entries. This prevents discovery content from being treated as an executable policy package.

## Distribution status

The existing OCI and IPFS adapters verify content and signatures when pointed at a real endpoint or gateway. One current package has a verified IPFS pin; three older pins were detected as stale and are no longer advertised. The release gate remains blocked until an operator supplies current immutable artifacts for every production package and the corresponding release evidence.
