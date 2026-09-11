#!/usr/bin/env python3
"""Validate evaluator evidence artifacts without trusting their status fields."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path


SHA256 = re.compile(r"^sha256:[0-9a-f]{64}$")
SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def validate(path: Path, require_clean: bool = False) -> dict[str, object]:
    artifact = json.loads(path.read_text(encoding="utf-8"))
    require(isinstance(artifact, dict), "artifact must be an object")
    require(artifact.get("artifactVersion") in {"1.0", "1.1"}, "unsupported artifactVersion")
    require(isinstance(artifact.get("runId"), str) and artifact["runId"], "runId is required")
    try:
        datetime.fromisoformat(str(artifact["createdAt"]).replace("Z", "+00:00"))
    except (KeyError, ValueError):
        raise ValueError("createdAt must be an ISO-8601 timestamp")

    workspace = artifact.get("workspace")
    require(isinstance(workspace, dict), "workspace record is required")
    path_hash = workspace.get("pathHash")
    require(path_hash == "unavailable" or (isinstance(path_hash, str) and SHA256.fullmatch(path_hash)), "workspace pathHash is invalid")
    require(isinstance(workspace.get("dirty"), bool), "workspace dirty state is required")
    if require_clean:
        require(workspace["dirty"] is False, "artifact was produced from a dirty workspace")

    mind = artifact.get("mind")
    require(isinstance(mind, dict), "mind record is required")
    require(
        isinstance(mind.get("id"), str)
        and re.fullmatch(r"lmp:(?:mind|skill):[a-z0-9]+(?:-[a-z0-9]+)*", mind["id"]),
        "canonical package ID is required",
    )
    require(isinstance(mind.get("version"), str) and SEMVER.fullmatch(mind["version"]), "mind version is invalid")
    require(isinstance(mind.get("contentDigest"), str) and SHA256.fullmatch(mind["contentDigest"]), "mind content digest is required")
    require(mind.get("signatureStatus") in {"unsigned", "verified", "invalid"}, "mind signature status is invalid")

    require(artifact.get("mode") in {"advisory", "enforced", "audit"}, "evaluation mode is invalid")
    require(artifact.get("state") in {"pass", "needs_revision", "blocked", "evaluation_error"}, "evaluation state is invalid")
    summary = artifact.get("summary")
    require(isinstance(summary, dict), "summary is required")
    for key in ("hardViolationCount", "warningCount", "informationalCount"):
        require(isinstance(summary.get(key), int) and summary[key] >= 0, f"summary field is invalid: {key}")
    checks = artifact.get("checks")
    require(isinstance(checks, list), "checks must be an array")
    for item in checks:
        require(isinstance(item, dict), "each check must be an object")
        require(isinstance(item.get("ruleId"), str) and item["ruleId"], "check ruleId is required")
        require(isinstance(item.get("passed"), bool), "check passed must be boolean")
        require(item.get("severity") in {"info", "warning", "error"}, "check severity is invalid")
        require(isinstance(item.get("message"), str) and item["message"], "check message is required")
        require(isinstance(item.get("rationale"), str) and item["rationale"], "check rationale is required")
        require(isinstance(item.get("remediation"), str) and item["remediation"], "check remediation is required")
        require(
            isinstance(item.get("limitations"), list)
            and item["limitations"]
            and all(isinstance(value, str) and value for value in item["limitations"]),
            "check limitations are required",
        )

    analysis = artifact.get("analysis")
    if analysis is not None:
        require(isinstance(analysis, dict), "analysis must be an object")
        for key in ("languages", "parsers", "versions"):
            require(isinstance(analysis.get(key), list) and all(isinstance(item, str) for item in analysis[key]), f"analysis field is invalid: {key}")
        require(isinstance(analysis.get("checkedFiles"), int) and analysis["checkedFiles"] >= 0, "analysis checkedFiles is invalid")

    skipped = artifact.get("skippedChecks")
    require(isinstance(skipped, list), "skippedChecks must be an array")
    for item in skipped:
        require(isinstance(item, dict) and isinstance(item.get("checkId"), str) and isinstance(item.get("reason"), str) and item["reason"], "skipped check needs an ID and reason")

    transitions = artifact.get("loopTransitions")
    require(isinstance(transitions, list) and transitions, "loopTransitions must be non-empty")
    for item in transitions:
        require(isinstance(item, dict) and isinstance(item.get("state"), str) and isinstance(item.get("event"), str), "loop transition needs state and event")

    require(isinstance(artifact.get("commands"), list), "commands must be an array")
    require(isinstance(artifact.get("limitations"), list) and artifact["limitations"], "limitations must be non-empty")
    privacy = artifact.get("privacy")
    require(isinstance(privacy, dict), "privacy record is required")
    for key in ("sourceCodeIncluded", "rawPathsIncluded", "networkUsed"):
        require(isinstance(privacy.get(key), bool), f"privacy field is invalid: {key}")
    require(privacy["sourceCodeIncluded"] is False, "source code must not be included in an evaluator artifact")
    require(privacy["rawPathsIncluded"] is False, "raw paths must not be included in an evaluator artifact")

    return {"status": "verified", "runId": artifact["runId"], "state": artifact["state"]}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact", type=Path)
    parser.add_argument("--require-clean", action="store_true")
    args = parser.parse_args()
    try:
        print(json.dumps(validate(args.artifact, args.require_clean), indent=2))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"evaluator artifact gate failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
