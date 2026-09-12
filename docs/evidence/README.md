# Launch-day evidence

These files are generated from commands run in this checkout. They are evidence of local behavior, not a substitute for independent review or an external release.

| Evidence | What it proves |
| --- | --- |
| [`registry-validation.json`](./registry-validation.json) | The generated catalog has 67 unique entries, 11 validated production packages, and 56 drafts. |
| [`registry-tests.txt`](./registry-tests.txt) | Registry validator tests cover the valid catalog, duplicate keys, and missing packages. |
| [`mind-resolution.json`](./mind-resolution.json) | A production Mind resolves to its package, digest, and trust anchor; draft resolution is rejected. |
| [`bootstrap-tests.txt`](./bootstrap-tests.txt) | The Node bootstrapper’s 12 integration tests passed, including discovery, MCP preservation, runtime verification, and uninstall. |
| [`init-simple.log`](./init-simple.log) | Real `npx lmp init`-equivalent run against a simple repository. |
| [`init-monorepo.log`](./init-monorepo.log) | Real initialization against pnpm/Turborepo/Next.js metadata. |
| [`init-legacy.log`](./init-legacy.log) | Real initialization against an existing repository with project guidance files. |
| [`lmp-on-lmp-reality.md`](./lmp-on-lmp-reality.md) | Canonical self-hosting, Docker, Rust, Python, Node, registry, and release-profile results. |
| [`self-hosting-evaluation.json`](./self-hosting-evaluation.json) | The real enforced LMP-on-LMP artifact produced by the Rust evaluator. |
| [`docker-qualification.json`](./docker-qualification.json) | The real Docker qualification artifact, when Docker is available. |

The release-candidate profile is intentionally not marked complete while
immutable public package retrieval and independent review are absent. The
four-target hosted qualification is recorded separately in the workflow run
linked from the maturity report. No placeholder CID or digest is used to make
that gate green.
