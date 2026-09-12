# Lending-Mind Protocol repository guide

This repository contains the LMP runtime, signed Mind Packages, agent-facing
skills, documentation, and verification harnesses. Keep the layers distinct:
an agent skill can guide work, while the LMP runtime evaluates observable
workspace state and emits evidence.

## Source languages and ownership

- Rust is the canonical implementation for protocol semantics, Mind Package
  validation, evaluation, artifacts, signatures, registry behavior, daemon,
  MCP server, filesystem watching, and low-level parsing.
- TypeScript is the only authored JavaScript-family language. Node.js 22 runs
  the delivery CLI, onboarding wrapper, repository scripts, tests, and docs
  configuration. Generated JavaScript in `dist/`, `.next/`, or dependencies is
  build output, not authored source.
- Python is used for bounded orchestration, Docker qualification, benchmarks,
  and evidence aggregation.
- MDX and Markdown hold documentation and agent guidance; Bash is used for
  bounded repository workflows and test harnesses.
- Adapters and scripts consume Rust contracts. They must not create competing
  protocol semantics or silently reinterpret evaluator results.

## Skills, Mind Packages, and installed state

These directories are intentionally different:

| Path | Meaning | Edit policy |
| --- | --- | --- |
| `.agents/skills/` | Curated agent skills used by repository agent tooling. Each skill has a `SKILL.md` and may have references/assets. | Add or update a skill when its workflow is genuinely reusable and verified. |
| `.agents/skills/lending-mind-protocol/` | The repository’s LMP integration skill: setup, profile loading, evaluation, remediation, and evidence reporting. | Keep it synchronized with real CLI behavior and documented limitations. |
| `.claude/skills/` | Claude Code compatibility links into `.agents/skills/`. | Do not duplicate or edit link targets here. |
| `profiles/` | Canonical, signed LMP Mind Packages shipped from this repository. These include `mind.json`, guidance, rules, evidence, and signatures. | Change only with validation, fixture coverage, signature/release handling, and review. |
| `packages/cli/profiles/` and `packages/create-lmp/profiles/` | Package-owned profile copies used by release packages and onboarding. | Keep synchronized through the package/release workflow. |
| `.lending-mind/` | Generated, project-local installed Minds, telemetry, and run artifacts. | Never treat it as canonical source; keep generated state ignored. |
| `skills/` and `lmp-skills/` | Removed legacy/reserved names. They are not valid source locations. | Do not recreate them; use `.agents/skills/` or `profiles/`. |

`SKILL.md` inside a Mind Package is the profile’s agent-facing guidance. It
does not make the package equivalent to a general-purpose agent skill, and a
skill does not replace profile validation or runtime evaluation.

## Required LMP workflow

1. Inspect the repository, tests, package manager, working-tree state, and
   existing `.lending-mind/` configuration.
2. Select a complete, locally validated Mind Package. Do not infer semantics
   from a profile name or from prose alone.
3. Load the active `mind.json`, `SKILL.md`, `guidance.md`, and rules before
   proposing changes.
4. Prefer changed-only evaluation for brownfield work and preserve the JSON
   evidence artifact under an ignored run directory.
5. Fix hard findings and rerun the same profile and scope. Record approved
   exceptions instead of weakening rules to obtain a pass.
6. Run native project tests, typecheck, lint, build, and security checks when
   applicable. A passing LMP evaluation does not prove universal correctness.
7. Report profile identity/version/signature, selected files, findings,
   skipped checks, artifact path, native checks, and limitations.

For a project user, the normal onboarding path is:

```bash
npx create-lmp --yes \
  --agent claudecode \
  --stack typescript-node \
  --strategy brownfield \
  --mind baseline .
npx lmp use baseline
npx lmp instructions --mind ./.lending-mind/mind
npx lmp evaluate --workspace . --mind ./.lending-mind/mind \
  --changed-only --artifact-dir ./.lending-mind/artifacts --json
```

If packages are unpublished, use a local tarball or direct file path. Do not
describe local package testing as public publication, hosted deployment, or an
immutable IPFS/OCI release.

## Verification requirements

- Preserve schemas, findings, artifacts, exit codes, signatures, and CLI
  compatibility unless a versioned change explicitly requires otherwise.
- Add regression tests for protocol behavior and boundary conditions.
- Run targeted tests first, then relevant typecheck, lint, build, Rust checks,
  integration tests, fixture benchmarks, and security checks.
- Keep generated output, temporary evaluation copies, telemetry, private keys,
  package tarballs, and benchmark scratch data out of commits.
- Never claim a capability is complete without fresh implementation and
  verification evidence. Unsupported parsers, unavailable Docker, evaluator
  errors, and external publication gates must remain explicit.

## Protected references

The following files are authoritative project references. Do not rewrite,
rename, delete, format, or generate over them while making implementation
changes:

- `ROADMAP.md`
- `NOTICE.md`
- `SECURITY.md`
- `docs/architecture.md`
- `docs/Solution.md`
- `docs/Onboarding.md`
- `docs/Concept.md`
- `.internal/Context.pdf`

Make changes in source code, tests, configuration, profiles, skills, or other
non-protected files, and verify the resulting behavior.
