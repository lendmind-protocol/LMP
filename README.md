<div align="center">
  <img src="./public/assets/banner.png" alt="Lending-Mind Protocol" width="800" />
</div>

<h1 align="center">Lending-Mind Protocol</h1>

<p align="center">A verifiable engineering methodology layer for AI coding agents.</p>

Lending-Mind combines human-readable guidance, deterministic repository checks,
privacy-preserving evidence artifacts, and human-reviewed policy evolution. It
does not merely tell an agent how to behave; it checks the resulting repository.

> MVP status: local TypeScript runtime, filesystem registry, CLI, and stdio MCP
> server. Node 22+ is required. The existing Rust prototype remains a legacy
> reference surface and is not required by the TypeScript runtime.

## What it is

| Layer | Responsibility |
| --- | --- |
| Mind Package | Versioned methodology, provenance, and machine-readable policies |
| Compiler | Deterministic agent instruction bundle and visible checklist |
| Evaluator | Dependency, TypeScript, AST, complexity, command, and artifact checks |
| Registry | Offline immutable local installation and resolution |
| CLI / MCP | Human and coding-agent integration surfaces |
| Evidence | Redacted, hashed evaluation artifacts stored locally |

It is not an identity clone, model-weight training system, telemetry service,
automatic code mutator, security-review replacement, or automatic uploader.
Archetypes are generic; individual or organization authorship is opt-in and
verified with provenance.

## Quickstart

```bash
pnpm install
pnpm --filter @lending-mind/cli build
pnpm lmp init --install-baseline
pnpm lmp evaluate --mind skills/baseline --workspace examples/compliant-service
```

The evaluator is advisory by default. Select `--mode enforced` to fail on hard
violations, or `--mode audit` to collect evidence without running commands or
failing for policy findings.

## CLI

```bash
pnpm lmp skill validate skills/typescript-minimal
pnpm lmp skill compile skills/typescript-minimal --out /tmp/lmp-instructions.md
pnpm lmp registry install skills/typescript-minimal
pnpm lmp registry list
pnpm lmp evaluate --mind skills/typescript-minimal --workspace examples/noncompliant-service --mode advisory --json
pnpm lmp artifact list
pnpm lmp doctor
```

Example summary:

```text
warning: 3 violation(s), 0 command(s) executed
remediation: remove denied dependencies, replace eval, and add explicit tests
artifact: .lending-mind/artifacts/2026-08-25-run.json
```

## MCP

The stdio server is `lending-mind-mcp` and exposes `lmp_list_minds`,
`lmp_get_instructions`, `lmp_evaluate_workspace`, `lmp_verify_mind`, and
`lmp_get_artifact`. Configure an MCP client with a placeholder executable path:

```json
{
  "mcpServers": {
    "lending-mind": {
      "command": "<path-to-pnpm>",
      "args": ["--dir", "<path-to-repository>", "exec", "lending-mind-mcp"]
    }
  }
}
```

Commands are never run through MCP unless `runCommands: true`; audit and
offline paths refuse command execution. No MCP operation publishes or uploads.

## Mind Package format

```text
skills/<name>/{mind.json,guidance.md}
skills/<name>/rules/{dependencies,complexity,typescript,commands}.json
skills/<name>/{tests/fixtures,evidence,signatures}/
```

`mind.json` contains a versioned ID, mode defaults, author/provenance,
principles and trade-offs, capabilities, and rule-file references. Guidance is
philosophical; rules are deterministic. Signatures cover canonical package
manifests, never arbitrary executable behavior. See [docs/skill-format.md](docs/skill-format.md).

## Security defaults

- No network, uploads, package installation, telemetry, or source mutation by default.
- Child processes use `shell: false`, exact allowlists, workspace cwd, timeout, truncation, and redaction.
- Artifacts hash workspace paths and exclude source, secrets, environments, and raw paths.
- Signatures prove key possession, not policy correctness.
- Passing validation never replaces code review, security review, tests, threat modeling, or human judgment.

## Repository map

| Directory | Purpose |
| --- | --- |
| `packages/` | Core, schema, compiler, evaluator, registry, CLI, MCP, initializer |
| `skills/` | Bundled baseline and TypeScript Minimal policies |
| `examples/` / `test-fixtures/` | Reproducible compliant and violating workspaces |
| `docs/` | Architecture, format, evaluation, governance, and threats |
| `crates/` | Preserved legacy Rust prototype, not a TypeScript dependency |

## Development

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:skills
```

The supported runtime is Node 22+ and pnpm. The local environment used for
some development checks may report an engine warning when it is older.

## Roadmap

More languages, opt-in OCI distribution, a verified author program, benchmark
suites, and a reviewable policy-promotion workflow are intentionally deferred.
The current promotion command creates a proposal and never edits a Mind Package.

## Contributing and governance

Read [CONTRIBUTING.md](CONTRIBUTING.md), [docs/governance.md](docs/governance.md),
and [SECURITY.md](SECURITY.md) before proposing a rule or skill.

## License

Released under the [MIT License](LICENSE). See [NOTICE.md](NOTICE.md) for
attribution and third-party notices.
