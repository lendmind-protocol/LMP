# Evaluation

Modes are distinct:

| Mode | Policy findings | Commands | Exit behavior |
| --- | --- | --- | --- |
| advisory | diagnostics | only explicit allowlist/flag | zero unless evaluator errors |
| enforced | hard errors block | only explicit allowlist/flag | non-zero on errors |
| audit | evidence only | never | does not fail for findings |
| offline | local-only constraint | refused | no network |

The evaluator discovers package/tsconfig metadata, scans TypeScript with
ts-morph, approximates cyclomatic complexity, checks `any`, eval, dynamic
require, console calls, empty catches, dependency policy, tests, and configured
exclusions, then emits a privacy-preserving artifact. Complexity starts at one
per function and adds branches for conditionals, loops, catches, cases, and
branch-like logical operators. It is an approximation, not a compiler or code
review replacement.

Commands are exact `pnpm/npm test|lint|typecheck` pairs, use `shell:false`, a
bounded timeout, a minimal environment, and redacted truncated output.
