# Bundled profiles

This is the canonical root for profiles shipped with the repository. Every
directory directly below this folder is a complete Mind package with its own
`mind.json`, guidance, evidence, rules, and signature material.

- `baseline/` is the general-purpose bundled profile.
- `typescript-minimal/` is the strict TypeScript fixture profile.
- `workspaces/` contains workspace instruction fixtures only; it is intentionally
  excluded from profile validation.

Published package profiles remain in their package-owned `profiles/`
directories, generated documentation copies live under
`apps/docs/public/profiles/`, and signed registry packages live under
`registry/definitions/` or `registry/minds/`.
