# Lending-Mind Protocol (LMP) Enforcement Registry 🛡️

This document is generated from the structured Mind rule registry. It describes declared checks and their limits; it is not a claim that every declaration is implemented by every evaluator.

| Rule | Severity | Assertion | Limitations |
| :--- | :--- | :--- | :--- |
| `commands.allowlist` | error | Every requested command is allowed by the profile policy. | This does not prove a command is safe for every repository. |
| `ast.unsafe-boundary` | error | Unsafe blocks are absent unless an approved exception is recorded. | This does not prove safe code is correct. |
| `architecture.boundary` | warning | Changes preserve the documented package and evaluator boundaries. | Static metadata cannot prove runtime coupling is absent. |
| `security.artifact-redaction` | error | Generated artifacts are redacted and contain no absolute paths or secret-shaped values. | Pattern checks cannot identify every secret format. |
| `complexity.cyclomatic` | error | Measured cyclomatic complexity does not exceed the profile ceiling. | The metric does not assess domain correctness. |
| `dependencies.deny` | error | Denied dependencies are absent from the selected workspace scope. | The check does not replace vulnerability scanning. |
| `typescript.any` | error | The selected TypeScript sources contain no forbidden any usage. | Generated and non-TypeScript code may be outside this check. |
| `typescript.eval` | error | The selected TypeScript sources contain no eval call. | Runtime behavior outside parsed files is not assessed. |
| `typescript.console` | warning | Direct console logging follows the profile policy. | A static check cannot judge whether a log message is operationally useful. |
| `database.app-layer-join` | error | Application-layer join patterns do not violate the active profile policy. | The heuristic requires domain review for unusual query abstractions. |