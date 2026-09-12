# LMP Evidence Contract

A useful report lets another engineer reproduce the decision and see what it
does not establish. Record these fields together:

```json
{
  "profile": "lmp:mind:baseline@1.0.0",
  "workspace": "project-root",
  "scope": "changed-only",
  "selectedFiles": ["src/example.ts"],
  "hardFindings": [],
  "advisoryFindings": [],
  "skippedChecks": [],
  "nativeChecks": {
    "typecheck": "passed",
    "tests": "passed",
    "lint": "passed"
  },
  "artifact": ".lending-mind/artifacts/run.json",
  "limitations": ["A pass does not prove universal correctness."]
}
```

Use the actual artifact schema and command output as the source of truth. Do
not invent fields that are absent from the run, and do not convert an evaluator
error or unsupported parser into `passed`.
