# External Project Quality Diff

**Run date:** 2026-09-12
**Evaluation mode:** isolated temporary copies; original repositories were not modified
**LMP runtime:** local Rust evaluator with the bundled `0.1.0` CLI
**Comparison:** native project check versus LMP profile evidence, followed by targeted remediation

## Projects

| Project | Remote repository | Native check used |
| --- | --- | --- |
| AmbiOS-AI | [JustineDevs/ambios-ai](https://github.com/JustineDevs/ambios-ai) | `pnpm lint` |
| UVS | [JustineDevs/UMS](https://github.com/JustineDevs/UMS) | `pnpm security:check` |
| meta-architect | [JustineDevs/meta-architect](https://github.com/JustineDevs/meta-architect) | `npm run check` |
| agent-compat | [JustineDevs/agent-compat](https://github.com/JustineDevs/agent-compat) | `pnpm lint` |
| go-mirofish | [go-mirofish/go-mirofish](https://github.com/go-mirofish/go-mirofish) | `npm run test:go` |

## Before-and-after matrix

The first LMP pass used `baseline@1.0.0`. The strict comparison used the locally available project profiles. Counts are findings, not defects proven to be exploitable.

| Project | Native before | LMP before | Remediated code | LMP after |
| --- | --- | --- | --- | --- |
| AmbiOS-AI | PASS | 14 hard, 1,188 warnings | Not mass-edited; scope requires production-only filtering first | Pending safe remediation |
| UVS | PASS | 0 hard, 80 warnings | Not mass-edited; findings span application, internal, and Wrangler material | Pending safe remediation |
| meta-architect | PASS | 0 hard, 6,615 warnings | Not mass-edited; 6,292 findings are in internal/featured-mapping material | Pending safe remediation |
| agent-compat | FAIL | 6 warnings | 6 explicit `any` findings replaced with domain types | PASS; 0 findings |
| go-mirofish | PASS | 0 baseline findings; 2 strict findings | 2 dynamic `require` calls replaced with literal module imports | PASS; 0 findings |

## Actual remediations

### agent-compat

Remote source: [agent-compat/packages/agents](https://github.com/JustineDevs/agent-compat/tree/main/packages/agents)

Before:

```ts
const results: any[] = [];
const signals: any[] = [];
const files: any[] = [];
const errors: any[] = [];

function checkOutput(content: string | null, output: any) {
  // ...
}

const checks: any[] = [];
```

After:

```ts
export interface AdapterSignal {
  type: string;
  path: string;
}

export interface DetectionResult {
  id: string;
  confidence: number;
  description?: string;
  signals: AdapterSignal[];
}

type CompiledFile = {
  path: string;
  target: string;
  priority?: number;
  maxBytes?: number;
  content: string;
  overwrite: boolean;
  managed: boolean;
  status?: string;
};

type CompileError = {
  target: string;
  path: string;
  message: string;
};

type ValidationOutput = {
  path: string;
  format?: string;
  maxBytes?: number;
};

const results: DetectionResult[] = [];
const signals: AdapterSignal[] = [];
const files: CompiledFile[] = [];
const errors: CompileError[] = [];

function checkOutput(
  content: string | null,
  output: ValidationOutput,
) {
  // ...
}

const checks: ReturnType<typeof checkOutput>[] = [];
```

Verification: TypeScript typecheck passed; 53 tests passed; strict LMP evaluation returned `pass` with zero findings.

### go-mirofish

Remote source: [go-mirofish/scripts/commit/cli/commands](https://github.com/go-mirofish/go-mirofish/tree/main/scripts/commit/cli/commands)

Before:

```js
const parallelCommitPath = path.join(__dirname, '../../parallel-commit.js');
const mod = require(parallelCommitPath);
await mod.main();
```

```js
const securityCheckPath = path.join(__dirname, '../../security-check.js');
const { main } = require(securityCheckPath);
main();
```

After:

```js
const parallelCommit = require('../../parallel-commit.js');

if (opts.max) {
  parallelCommit.config.maxConcurrentCommits = opts.max;
}

await parallelCommit.main();
```

```js
const { main: securityCheck } = require('../../security-check.js');

securityCheck();
```

Verification: Go tests passed; strict LMP evaluation returned `pass` with zero findings.

## What this evidence establishes

- LMP can detect concrete policy violations in real repositories without requiring public package publication.
- Profile severity changes the decision boundary: the same `any` or `console` usage can be advisory under `baseline` and blocking under a strict profile.
- Findings can be remediated in real source code and re-evaluated to zero for bounded cases.
- Native project checks and LMP checks measure different properties; a native security check passing does not mean type or complexity policy passes.

## What it does not establish

- It does not prove universal code quality, security, or production readiness.
- Go, Python, SQL, and several runtime behaviors remain outside the Rust evaluator’s implemented semantic coverage.
- The broad scans contain internal, generated, reference, and fixture material. The unresolved high-volume results must first be narrowed to production-owned source before behavior-preserving remediation.
- No claim is made that a profile represents or is endorsed by a named person or project.

This report is the canonical summary for this external-project run. The profile limitations and evaluator boundaries are documented in [`docs/ast-axioms.md`](../ast-axioms.md), [`docs/evaluation.md`](../evaluation.md), and [`docs/claim-ledger.md`](../claim-ledger.md).
