<div align="center">
  <img src="./public/assets/banner.png" alt="Lending-Mind Protocol banner" width="800" />
</div>

<div align="center">
  <p><strong>Make AI-built software respect the architecture.</strong></p>
  <p>A local-first Rust protocol for turning engineering principles into inspectable, repeatable validation.</p>

  <p>
    <a href="#features">Features</a> ·
    <a href="#how-it-works">How It Works</a> ·
    <a href="#getting-started">Getting Started</a> ·
    <a href="#development">Development</a> ·
    <a href="#contributing">Contributing</a>
  </p>
</div>

---

## Overview

Lending-Mind Protocol (LMP) sits between an AI coding agent and its workspace.
It loads an engineering profile, watches source changes, audits Rust syntax and
code shape, and returns actionable feedback before architectural drift becomes
a merge.

LMP is designed for developers, maintainers, and agent-tool builders who want
engineering preferences to be explicit data instead of undocumented taste.

> [!WARNING]
> LMP is pre-1.0 and local-first. The current synchronization boundary copies
> validated local profiles; OCI/IPFS distribution is not implemented yet. Use
> the current checkout and test results as the source of truth.

## Features

| Feature | Description | Entry point |
| --- | --- | --- |
| Workspace daemon | Watches changed Rust files and reports profile violations. | `lmpd` |
| Shared AST validation | Parses source with `syn`, checks function density, and detects configured AST risks. | `lmp-core` |
| Engineering profiles | Stores axioms, telemetry limits, and skill rules as JSON. | `registry/definitions/` |
| MCP adapter | Exposes recursive workspace audits over JSON-RPC stdio. | `lmp-mcp` |
| Profile synchronization | Validates and copies a local profile into a consumer workspace. | `lmp-sync` |
| Cryptographic signing | Signs exact profile bytes and verifies Ed25519 signatures. | `mind-signer` |
| Benchmark harness | Compares compliant and intentionally bloated repositories. | `orchestrator/` |
| Consumer bootstrap | Creates a local telemetry directory and baseline profile. | `packages/create-lmp/` |

## Getting Started

### Prerequisites

- Rust stable toolchain and Cargo
- Python 3.11 or newer for orchestration scripts
- Node.js for the consumer bootstrapper
- An MCP-compatible client for the JSON-RPC adapter

### Installation

Clone the repository and build the Rust workspace:

```bash
git clone https://github.com/lendmind-protocol/LMP.git
cd LMP
cargo build --workspace
```

### Start the workspace daemon

Select a profile from `registry/definitions/` and watch a target directory:

```bash
cargo run --bin lmpd -- \
  --mind-select tj-ponytail \
  --workspace ./crates
```

The daemon stays active and audits modified or newly created `.rs` files.

### Sync a profile locally

```bash
cargo run --bin lmp-sync -- \
  --mind-id tj-ponytail \
  --output-dir ./.lmp_telemetry/minds
```

The profile is loaded through `lmp-core` before it is copied.

## How It Works

LMP follows a small validation loop:

```text
Engineering profile
        │
        ▼
Profile loader ──────────────┐
        │                    │
        ▼                    ▼
   lmpd watcher          lmp-sync copy
        │
        ▼
  Changed Rust file
        │
        ▼
 lmp-core / syn parser
        │
        ▼
  Violation feedback
```

1. Resolve a profile directly or with `--mind-select <alias>`.
2. Load it into the shared `MindSchema`; optional fields receive safe defaults.
3. Receive a source change from `notify`, or an audit request through MCP.
4. Parse the Rust file with `syn`.
5. Check function statement density, async naming, lock/blocking patterns, and
   configured forbidden AST nodes.
6. Return file-specific validation feedback.

### Core components

| Component | Responsibility |
| --- | --- |
| `lmp-core` | Shared profile model, AST audit, skill audit, and signature verification. |
| `lmpd` | Long-running local filesystem watcher. |
| `lmp-mcp` | JSON-RPC stdio adapter using the same core audit path. |
| `lmp-sync` | Local validated profile copy boundary. |
| `mind-signer` | Ed25519 profile signing utility. |
| `orchestrator` | Benchmarks, metrics plots, integration scripts, and AST docs. |

## Profiles

Profiles live in `registry/definitions/`:

| Profile | Purpose |
| --- | --- |
| `tj-ponytail.json` | Minimal dependency and strict TypeScript-oriented skill rules. |
| `tj-holowaychuk-minimalism.json` | Lightweight capability and manifest mutation profile. |
| `style.schema.json` | Naming and formatting preference schema. |

Create a signed profile with:

```bash
cargo run --bin mind-signer -- \
  --input registry/definitions/tj-ponytail.json \
  --output-dir ./.lmp_telemetry/crypto
```

Never commit generated private keys. See [SECURITY.md](./SECURITY.md) for
security boundaries and reporting.

## MCP Integration

Build the adapter as a stdio server:

```bash
cargo build --release --bin lmp-mcp
```

The `enforce_architectural_axioms` tool accepts:

```json
{
  "workspace_path": "/path/to/workspace",
  "mind_alias": "tj-ponytail"
}
```

It recursively audits Rust files and returns the number checked plus every
violation. MCP and `lmpd` call the same `lmp-core::ast::audit_source` function.

## Project Structure

```text
.
├── crates/
│   ├── lmp-core/        # Shared AST, profile, skill, and crypto logic
│   ├── lmpd/            # Local file-watching daemon
│   ├── lmp-mcp/         # MCP JSON-RPC stdio adapter
│   └── lmp-sync/        # Local profile synchronization CLI
├── orchestrator/        # Python benchmarks, metrics, and docs generation
├── packages/create-lmp/ # Consumer-project bootstrapper
├── registry/
│   ├── definitions/     # Engineering mind profiles
│   └── schemas/         # Registry schemas
├── public/assets/       # Project media and README banner
├── docs/                # Concept, onboarding, solution, and generated notes
├── .github/             # Issue templates and CI/release workflows
└── ARCHITECTURE.md      # Detailed implementation map
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the edit guide and data-flow
details.

## Development

### Run local checks

```bash
cargo fmt --all -- --check
cargo metadata --no-deps --format-version 1
cargo check --workspace
cargo test --workspace
python3 -m compileall -q orchestrator
node --check packages/create-lmp/bin.js
```

### Run the benchmark harness

```bash
python3 orchestrator/test_bed.py
python3 orchestrator/plot_metrics.py
```

The test bed creates an ignored `lmp_test_bed/` directory and should report:

| Scenario | Expected result |
| --- | --- |
| `clean-micro-service` | `COMPLIANT`, zero prohibited dependencies |
| `bloated-node-service` | `NON_COMPLIANT_REJECTED`, three prohibited dependencies |

### Current verification note

Formatting, workspace metadata, Python/Node syntax, README asset checks, and the
benchmark harness pass in the working environment. Full Cargo compilation may
require a current stable Rust toolchain because Cargo 1.75 cannot parse the
cached `base64ct` release that requires Edition 2024 support.

## Roadmap

- [x] Rust workspace with shared profile and AST validation
- [x] Long-running local workspace daemon
- [x] MCP JSON-RPC audit adapter
- [x] Local profile synchronization command
- [x] Ed25519 profile signing and verification primitives
- [x] Python benchmark and telemetry workflow
- [ ] OCI registry transport with digest verification
- [ ] IPFS distribution adapter
- [ ] Richer language parsers beyond Rust
- [ ] Release artifacts built and verified on a current stable toolchain

## Contributing

Contributions are welcome.

1. Read [CONTRIBUTING.md](./CONTRIBUTING.md).
2. Make the smallest focused change that solves the problem.
3. Keep validation logic in `lmp-core`; do not duplicate it in adapters.
4. Add or update a focused regression test for non-trivial behavior.
5. Run formatting, metadata, targeted tests, and the benchmark harness.
6. Update architecture documentation when a boundary changes.
7. Open a pull request with clear scope and verification evidence.

## Security

Please do not report security vulnerabilities through public issues. Read
[SECURITY.md](./SECURITY.md) for the private reporting process.

## Code of Conduct

Please read [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) before participating.

## License

Lending-Mind Protocol is licensed under the [MIT License](./LICENSE).

See also: [Notices](./NOTICE.md) · [Security Policy](./SECURITY.md) ·
[Code of Conduct](./CODE_OF_CONDUCT.md)

---

<div align="center">
  <sub>Built for developers who want AI assistance without architectural drift.</sub>
</div>
