# Awesome Lending-Minds Registry 🧠

The official community-curated catalog for Lending-Mind Protocol (LMP) Mind
Packages. This directory is modeled after an Awesome List, but every entry is
also intended to be an auditable protocol artifact: a package has a declared
identity, explicit rules, provenance, and a verifiable signature before it can
be accepted by the registry automation.

## Ingest a public Mind

The public catalog is serverless and static-first. `registry.json` is a small,
version-controlled index that can be served directly by Vercel, Cloudflare
Pages, or GitHub Pages. Profile manifests are static assets; larger immutable
layers may be addressed by an IPFS CID or an OCI manifest. No custom database
or application server is required for discovery.

```bash
# Local checkout
lmp-sync --registry ./registry/definitions --mind-id <MIND_IDENTIFIER> \
  --output-dir ./.lmp_telemetry/minds

# Static index deployment contract
lmp-sync --registry-url https://lmp-six.vercel.app/registry.json \
  --mind-id <MIND_IDENTIFIER> \
  --trusted-public-key <PINNED_ED25519_PUBLIC_KEY> \
  --output-dir ./.lmp_telemetry/minds
```

The client fetches the small index from the static host, resolves the selected
manifest or IPFS CID, downloads the immutable bytes through a public gateway,
and verifies the digest and Ed25519 signature locally before installation. An
entry may additionally provide `packageFiles`: bounded `{path, url, digest}`
descriptors for the rest of the signed package. When present, `lmp-sync`
fetches every descriptor, verifies each SHA-256 digest, rejects unsafe or
duplicate paths, validates the complete package, and installs it atomically.
When `packageFiles` is absent, the client uses the original manifest-only
compatibility path; that path cannot activate a complete enforcement package.
The
`--trusted-public-key` value is an out-of-band trust anchor; the key supplied by
the remote index is never trusted by itself. If the manifest URL fails, the
client tries the configured IPFS gateway and applies the same digest and
signature checks. Production remote URLs must use HTTPS; loopback HTTP is
accepted only for local integration tests. A signature proves that the package bytes match the signed
bytes and that the configured key signed them; it does not prove that a named
person or organization endorsed the profile, or that its rules are universally
right.

The checked-in `tj-ponytail`, `tj-holowaychuk-minimalism`, `supabase-core`, and
`linux-kernel` entries expose canonical packages through the temporary static
host's `/profiles/` paths, with locally verifiable detached signatures, public
keys, and manifest digests. The same payloads are checked into
`apps/docs/public/profiles/` for the static portal build. They are not yet
production-distributed: the temporary host must be deployed, and immutable
IPFS or OCI addresses remain empty until an external pinning or registry
operation produces independently retrievable content-addressed evidence.

## Static distribution contract

```text
local lmp-sync
  → GET /registry.json from the edge host
  → resolve manifestUrl or ipfsCid
  → fetch immutable manifest and optional packageFiles
  → verify every digest and the package signature locally
  → install into .lending-mind/registry
```

The edge host is only a file distributor. It does not authorize profiles,
rewrite package contents, or make policy decisions. If the static index or
gateway returns altered bytes, local verification rejects the package.

OCI is an optional enterprise transport for the same content-addressed package
layers. IPFS is an optional decentralized transport. Both transports converge
on the same local verification and immutable-install boundary.

## Frontend UI & component architectures

### `shadcn-minimalism`

- **Mind Identifier:** `shadcn-minimalism`
- **Author/Culture:** Community-contributed UI composition pattern
- **Primary Axioms:** Prefer accessible copy-and-paste primitives, small
  composable components, and explicit interaction states over opaque bundles.
- **Trust Anchor:** Not published in this checkout; contribution required.

### `vercel-edge`

- **Mind Identifier:** `vercel-edge`
- **Author/Culture:** Community-contributed edge-runtime pattern
- **Primary Axioms:** Keep request paths small, isolate runtime assumptions,
  and measure cold-start behavior rather than assuming it.
- **Trust Anchor:** Not published in this checkout; contribution required.

## Backend, databases, & infrastructure

### `supabase-core`

- **Mind Identifier:** `supabase-core`
- **Author/Culture:** Community archetype informed by public Supabase material
- **Primary Axioms:** Put tenant authorization at the data boundary, make RLS
  explicit, and record the trade-off between database policy and application
  convenience.
- **Trust Anchor:** Detached signature and public key are present in the
  checked-in package; no Supabase endorsement is claimed.

### `hashicorp-terraform`

- **Mind Identifier:** `hashicorp-terraform`
- **Author/Culture:** Community-contributed immutable-infrastructure pattern
- **Primary Axioms:** Prefer declarative, reproducible infrastructure and make
  operational drift visible instead of relying on manual click-ops.
- **Trust Anchor:** Not published in this checkout; contribution required.

## Systems engineering & languages

### `linux-kernel`

- **Mind Identifier:** `linux-kernel`
- **Author/Culture:** Community archetype informed by public Linux Kernel coding
  guidance; it is not a Linux Kernel project endorsement.
- **Primary Axioms:** Separate policy from mechanism, make allocation and
  ownership explicit, and keep complexity budgets reviewable.
- **Trust Anchor:** Detached signature and public key are present in the
  checked-in package; no Linux Kernel endorsement is claimed.

### `go-core-thompson`

- **Mind Identifier:** `go-core-thompson`
- **Author/Culture:** Community-contributed Go simplicity pattern
- **Primary Axioms:** Prefer composition, explicit error propagation, and
  readability over clever abstraction.
- **Trust Anchor:** Not published in this checkout; contribution required.

## Package standard

New entries should use this canonical layout:

```text
registry/definitions/<slug>/
├── mind.json
├── guidance.md
├── evidence/README.md
├── rules/
└── signatures/
    ├── manifest.sig
    └── public-key.hex
```

`mind.json` must declare a stable `id`, `version`, explicit enforcement
references, and provenance. Rules must be narrow enough to test. Evidence must
describe the source, method, trade-offs, and limitations without copying
private reasoning or claiming authorship that cannot be verified.

Legacy flat definitions are not part of the checked-in public catalog. New
contributions must use the canonical package directory and its detached
signature layers.

## Contribution and verification

1. Add or update a package under `registry/definitions/`.
2. Run `cargo run --bin lmp -- validate registry/definitions/<slug>`.
3. Sign the exact `mind.json` bytes with `mind_signer` and include the public
   key and detached signature.
4. Run `cargo run --bin lmp -- verify registry/definitions/<slug>` and confirm
   `signatureStatus` is `verified`.
5. Open a pull request. The trusted base-branch registry bot treats the PR
   contents as data, runs the Rust validator and regression gates, comments the
   result, labels failures, and enables squash auto-merge only after success.

The catalog is discovery. The Rust validator, package signature, provenance,
and reproducible evidence artifact are the authority for what was actually
verified.

## Provenance

Public source references used to explain a profile must be recorded in
[`provenance/real-sources.json`](./provenance/real-sources.json). Those links
document inspiration or engineering methods; they do not imply that the
source project authored, reviewed, or endorsed an LMP package.
