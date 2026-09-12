#!/usr/bin/env python3
"""Render a bounded Markdown review summary from a validated evaluator artifact."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from evaluator_artifact_gate import validate
except ModuleNotFoundError:
    from orchestrator.evaluator_artifact_gate import validate


def text(value: object, limit: int = 240) -> str:
    value = "" if value is None else str(value)
    value = " ".join(value.split())
    return value if len(value) <= limit else f"{value[: limit - 1]}…"


def render(artifact: dict[str, object]) -> str:
    mind = artifact["mind"]
    workspace = artifact["workspace"]
    summary = artifact["summary"]
    checks = artifact.get("checks") or []
    skipped = artifact.get("skippedChecks") or []
    findings = [item for item in checks if isinstance(item, dict) and item.get("passed") is False]
    status = text(summary.get("status"))
    decision = text(artifact.get("state"))
    lines = [
        "## Lending-Mind evaluation",
        "",
        f"- **Decision:** `{decision}`",
        f"- **Profile:** `{text(mind.get('id'))}@{text(mind.get('version'))}`",
        f"- **Signature:** `{text(mind.get('signatureStatus'))}`",
        f"- **Mode:** `{text(artifact.get('mode'))}`",
        f"- **Summary:** `{status}`; {summary.get('hardViolationCount', 0)} hard violation(s), {summary.get('warningCount', 0)} warning(s)",
        f"- **Workspace:** `{text(workspace.get('gitHead') or 'uncommitted or non-Git')}`; dirty=`{workspace.get('dirty')}`",
        "",
        "### Findings requiring attention",
        "",
    ]
    if findings:
        lines.append("| Severity | Rule | Message |")
        lines.append("| --- | --- | --- |")
        for finding in findings:
            lines.append(
                f"| `{text(finding.get('severity'))}` | `{text(finding.get('ruleId'))}` | {text(finding.get('message'))} |"
            )
    else:
        lines.append("No failing findings were recorded in the selected scope.")
    lines.extend(["", "### Checks not run", ""])
    if skipped:
        for item in skipped:
            if isinstance(item, dict):
                lines.append(f"- `{text(item.get('checkId'))}`: {text(item.get('reason'))}")
    else:
        lines.append("None recorded.")
    lines.extend(["", "### Limitations", ""])
    limitations = artifact.get("limitations") or []
    for limitation in limitations:
        lines.append(f"- {text(limitation)}")
    lines.extend(
        [
            "",
            "> This summary describes the selected scope only. It is not a universal quality, security, or production-readiness claim.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--require-clean", action="store_true")
    args = parser.parse_args()
    try:
        artifact = json.loads(args.artifact.read_text(encoding="utf-8"))
        validate(args.artifact, args.require_clean)
        if not isinstance(artifact, dict):
            raise ValueError("artifact must be an object")
        result = render(artifact)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(result, encoding="utf-8")
        else:
            print(result)
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"evaluation summary failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
