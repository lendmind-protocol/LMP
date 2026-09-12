# LMP Public Web Vault

This directory is the static, edge-deployable discovery index for Lending-Mind
profiles. It deliberately separates real packages from proposals:

- `production` contains packages that exist in this checkout and whose digest
  and detached Ed25519 signature are verified by `scripts/validate-registry.ts`.
- `draftMinds` contains discoverable proposals only. Drafts are not resolvable
  as enforcement packages and have no invented CID, digest, key, or endorsement.

Generate and validate it with:

```bash
node public-web-vault/scripts/generate-registry.ts
node public-web-vault/scripts/validate-registry.ts
node public-web-vault/scripts/seed-mind-fixtures.ts
```

An external publisher may promote a packaged entry only after publishing the
complete signed package, recording a real immutable IPFS CID or OCI manifest
digest, and rerunning the release gates. Named authors and organizations are
not endorsers unless explicit authorization is recorded in the package.
