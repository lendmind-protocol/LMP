# Mind Vault

The Mind Vault is a static registry for discovering signed engineering-policy
packages. It is not an authorship directory and it does not turn a profile name
into an endorsement.

## Registry structure

`public-web-vault/registry.json` has two explicit collections:

- `production`: packages present in the repository, with a semantic version,
  package path, deterministic SHA-256 digest, detached Ed25519 trust anchor,
  attribution language, and distribution state.
- `draftMinds`: proposals that are useful for discovery but cannot be resolved
  or enforced. They have no invented digest, key, CID, or OCI reference.

The validator requires five categories: Systems & Languages, Frontend UI
Component Systems, Backend/Databases/Infrastructure, Agentic Frameworks &
Context Engineering, and Full-Stack Frameworks & Runtimes.

## Commands

```bash
node public-web-vault/scripts/validate-registry.ts
node public-web-vault/scripts/generate-registry.ts
node public-web-vault/scripts/seed-mind-fixtures.ts
lmp registry validate --path public-web-vault/registry.json
lmp mind list --registry public-web-vault/registry.json
lmp mind resolve --mind rust-defensive-systems --registry public-web-vault/registry.json
```

The JavaScript validator recomputes package digests and verifies the detached
manifest signature. The Rust commands read the same index, reject malformed
entries, and refuse to resolve drafts as production packages.

## Adding and promoting a Mind

1. Add a package under `registry/minds/<key>` or `registry/definitions/<key>`.
2. Include `mind.json`, guidance, provenance, limitations, rules, compliant and
   violating fixtures, and detached signature material.
3. Run the package validator and evaluator against both fixtures.
4. Regenerate the vault and inspect the diff.
5. Publish the complete immutable package to an approved OCI registry or IPFS
   pinning service, record the actual digest/CID, and run the production gate.
6. Promote the entry only after human review of attribution, provenance, and
   policy scope.

Deprecation keeps the old version addressable and adds a replacement and reason;
it never silently mutates an existing digest.

## Trust and limitations

`OFFICIAL_VERIFIED_SIGNATURE` means an explicit authorization and verified
signature exist. `COMMUNITY_CONTRIBUTED` means the package is signed and
validated but carries no named-author endorsement. A signature authenticates
bytes; it does not prove authorship, wisdom, universal correctness, or secure
behavior in every environment. IPFS and OCI provide content-addressed
distribution, not availability, pin persistence, deployment ownership, or
independent review by themselves.
