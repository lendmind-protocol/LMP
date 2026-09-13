#!/usr/bin/env python3
"""Validate the evidence contract emitted by the real-world benchmark."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

EXPECTED_SCENARIOS = 64
REVIEW_DECISIONS = {"pass", "pass-with-limitations", "needs-revision"}


def validate_reviewer_annotations(
    annotations: object, revision: str, require_review: bool = False
) -> None:
    if not isinstance(annotations, list):
        raise ValueError("reviewerAnnotations must be an array")
    if require_review and not annotations:
        raise ValueError("release benchmark requires at least one reviewer annotation")
    reviewers: set[str] = set()
    for index, annotation in enumerate(annotations):
        if not isinstance(annotation, dict):
            raise ValueError(f"reviewer annotation {index} must be an object")
        for field in ("reviewer", "reviewedRevision", "decision", "notes"):
            value = annotation.get(field)
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"reviewer annotation {index} requires non-empty {field}")
        reviewer = annotation["reviewer"].strip()
        if reviewer in reviewers:
            raise ValueError(f"reviewer annotation {index} duplicates reviewer {reviewer}")
        reviewers.add(reviewer)
        if annotation["reviewedRevision"] != revision:
            raise ValueError(
                f"reviewer annotation {index} targets {annotation['reviewedRevision']}, "
                f"not benchmark revision {revision}"
            )
        if annotation["decision"] not in REVIEW_DECISIONS:
            raise ValueError(f"reviewer annotation {index} has an unsupported decision")
        for field in ("reviewTimeMinutes", "reworkCount", "severity", "confidence", "falsePositiveCount"):
            if field not in annotation:
                raise ValueError(f"reviewer annotation {index} requires {field}")
        if isinstance(annotation["reviewTimeMinutes"], bool) or not isinstance(annotation["reviewTimeMinutes"], (int, float)) or annotation["reviewTimeMinutes"] < 0:
            raise ValueError(f"reviewer annotation {index} requires non-negative reviewTimeMinutes")
        if isinstance(annotation["reworkCount"], bool) or not isinstance(annotation["reworkCount"], int) or annotation["reworkCount"] < 0:
            raise ValueError(f"reviewer annotation {index} requires non-negative reworkCount")
        if annotation["severity"] not in {"none", "low", "medium", "high", "critical"}:
            raise ValueError(f"reviewer annotation {index} has an unsupported severity")
        if isinstance(annotation["confidence"], bool) or not isinstance(annotation["confidence"], (int, float)) or not 0 <= annotation["confidence"] <= 1:
            raise ValueError(f"reviewer annotation {index} requires confidence between 0 and 1")
        if isinstance(annotation["falsePositiveCount"], bool) or not isinstance(annotation["falsePositiveCount"], int) or annotation["falsePositiveCount"] < 0:
            raise ValueError(f"reviewer annotation {index} requires non-negative falsePositiveCount")
        if require_review and annotation["decision"] == "needs-revision":
            raise ValueError("release benchmark review must not require revision")


def validate(
    path: Path,
    require_clean: bool = False,
    expected_revision: str | None = None,
) -> dict[str, object]:
    report = json.loads(path.read_text(encoding="utf-8"))
    if report.get("artifactVersion") != "1.2":
        raise ValueError("benchmark artifactVersion must be 1.2")
    if report.get("status") != "complete":
        raise ValueError(f"benchmark status is {report.get('status')!r}, not complete")
    summary = report.get("summary") or {}
    expected = summary.get("expectedScenarioCount")
    if expected != EXPECTED_SCENARIOS or summary.get("scenarioCount") != EXPECTED_SCENARIOS:
        raise ValueError(f"scenario count must be exactly {EXPECTED_SCENARIOS}")
    if summary.get("passedTransitions") != expected or not summary.get("allTransitionsPassed"):
        raise ValueError("not all baseline-to-guided transitions passed")
    if summary.get("dockerGatesExpected") != EXPECTED_SCENARIOS * 2 or summary.get("dockerGatesPassed") != EXPECTED_SCENARIOS * 2:
        raise ValueError("Docker gate count must be exactly 128 passed of 128 expected")
    if summary.get("controlChecksExpected") != EXPECTED_SCENARIOS * 2 or summary.get("controlChecksPassed") != EXPECTED_SCENARIOS * 2:
        raise ValueError("ordinary control check count must be exactly 128 passed of 128 expected")
    metadata = report.get("evidenceMetadata") or {}
    revision = metadata.get("repositoryRevision")
    if not isinstance(revision, str) or not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("a full repository revision is required")
    if expected_revision is not None and revision != expected_revision:
        raise ValueError(f"benchmark revision {revision} does not match expected revision {expected_revision}")
    if not isinstance(metadata.get("repositoryDirty"), bool):
        raise ValueError("repositoryDirty must be a boolean")
    if require_clean and metadata["repositoryDirty"] is not False:
        raise ValueError("release benchmark was run from a dirty repository")
    profile = metadata.get("profile") or {}
    if not isinstance(profile.get("path"), str) or not re.fullmatch(r"[0-9a-f]{64}", str(profile.get("mindSha256"))):
        raise ValueError("profile path and SHA-256 digest are required")
    tools = metadata.get("tools") or {}
    for key in ("lmp", "python", "platform", "docker"):
        if not isinstance(tools.get(key), str) or not tools[key]:
            raise ValueError(f"tool metadata is missing: {key}")
    validate_reviewer_annotations(
        metadata.get("reviewerAnnotations"), revision, require_review=require_clean
    )
    timing = report.get("timingSeconds") or {}
    if not isinstance(timing.get("total"), (int, float)) or timing["total"] < 0:
        raise ValueError("total benchmark timing is required")
    privacy = report.get("privacy") or {}
    for field in ("sourceCodeIncluded", "rawPathsIncluded", "privateReasoningIncluded"):
        if privacy.get(field) is not False:
            raise ValueError(f"benchmark privacy evidence is invalid: {field}")
    scenarios = report.get("scenarios") or []
    if len(scenarios) != EXPECTED_SCENARIOS:
        raise ValueError(f"every one of the {EXPECTED_SCENARIOS} scenarios is required")
    for index, scenario in enumerate(scenarios):
        if not isinstance(scenario, dict):
            raise ValueError(f"scenario {index} must be an object")
        for field in ("id", "repository", "revision", "taskType"):
            if not isinstance(scenario.get(field), str) or not scenario[field]:
                raise ValueError(f"scenario {index} is missing {field} provenance")
        if not re.fullmatch(r"[0-9a-f]{40}", scenario["revision"]):
            raise ValueError(f"scenario {index} has an invalid source revision")
        if scenario.get("transitionPassed") is not True:
            raise ValueError(f"scenario {index} did not pass its baseline-to-guided transition")
        timing = scenario.get("timingSeconds") or {}
        if not isinstance(timing.get("scenario"), (int, float)) or timing["scenario"] < 0:
            raise ValueError(f"scenario {index} is missing timing evidence")
        for candidate_name in ("baseline", "guided"):
            candidate = scenario.get(candidate_name) or {}
            if not isinstance(candidate, dict) or not isinstance(candidate.get("state"), str):
                raise ValueError(f"scenario {index} is missing {candidate_name} evaluation evidence")
            if not isinstance(candidate.get("exitCode"), int):
                raise ValueError(f"scenario {index} is missing {candidate_name} exit evidence")
            if not isinstance(candidate.get("rules"), list) or not isinstance(candidate.get("hardViolationCount"), int):
                raise ValueError(f"scenario {index} has incomplete {candidate_name} rule evidence")
            privacy = candidate.get("privacy") or {}
            if privacy.get("sourceCodeIncluded") is not False or privacy.get("rawPathsIncluded") is not False:
                raise ValueError(f"scenario {index} has unsafe {candidate_name} privacy metadata")
        if scenarios[index]["baseline"]["state"] != "needs_revision" or scenarios[index]["guided"]["state"] != "pass":
            raise ValueError(f"scenario {index} does not prove a needs_revision-to-pass transition")
        sandbox = scenario.get("sandbox") or {}
        if not isinstance(sandbox, dict):
            raise ValueError(f"scenario {index} is missing Docker evidence")
        for candidate_name in ("baseline", "guided"):
            docker = sandbox.get(candidate_name) or {}
            if not isinstance(docker, dict) or docker.get("exitCode") != 0 or docker.get("timedOut") is not False:
                raise ValueError(f"scenario {index} {candidate_name} Docker gate did not pass")
            if not isinstance(docker.get("command"), list) or not docker["command"]:
                raise ValueError(f"scenario {index} {candidate_name} Docker command evidence is missing")
            if not isinstance(docker.get("elapsedMs"), (int, float)) or docker["elapsedMs"] < 0:
                raise ValueError(f"scenario {index} {candidate_name} Docker timing is missing")
        controls = scenario.get("ordinaryControls") or {}
        if not isinstance(controls, dict) or controls.get("repositoryCommandsExecuted") is not False:
            raise ValueError(f"scenario {index} ordinary-control execution boundary is invalid")
        control = scenario.get("control") or {}
        if not isinstance(control, dict):
            raise ValueError(f"scenario {index} is missing ordinary compiler control evidence")
        for candidate_name in ("baseline", "guided"):
            result = control.get(candidate_name) or {}
            if not isinstance(result, dict) or result.get("tool") != "typescript-compiler":
                raise ValueError(f"scenario {index} {candidate_name} compiler control is missing")
            if result.get("exitCode") != 0 or result.get("state") != "pass":
                raise ValueError(f"scenario {index} {candidate_name} compiler control did not pass")
            if result.get("timedOut") is not False or result.get("outputIncluded") is not False:
                raise ValueError(f"scenario {index} {candidate_name} compiler control privacy/timing is invalid")
            if not isinstance(result.get("command"), list) or not result["command"]:
                raise ValueError(f"scenario {index} {candidate_name} compiler control command is missing")
            if not isinstance(result.get("elapsedMs"), (int, float)) or result["elapsedMs"] < 0:
                raise ValueError(f"scenario {index} {candidate_name} compiler control timing is missing")
    sources = report.get("sourceVerification") or []
    if not sources or any(item.get("verified") is not True for item in sources):
        raise ValueError("every declared provenance source must be verified")
    for index, source in enumerate(sources):
        if not isinstance(source, dict) or not isinstance(source.get("id"), str) or not source["id"]:
            raise ValueError(f"source {index} is missing an identifier")
        if not isinstance(source.get("url"), str) or not source["url"].startswith("https://"):
            raise ValueError(f"source {index} must use HTTPS provenance")
        if not isinstance(source.get("status"), int) or source["status"] < 200 or source["status"] >= 400:
            raise ValueError(f"source {index} is missing a successful HTTP status")
        if not isinstance(source.get("contentBytes"), int) or source["contentBytes"] <= 0:
            raise ValueError(f"source {index} is missing content-size evidence")
        if not isinstance(source.get("contentSha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", source["contentSha256"]):
            raise ValueError(f"source {index} is missing content digest evidence")
    if summary.get("verifiedSources") != len(sources):
        raise ValueError("verified source count does not match source evidence")
    return {"status": "verified", "scenarioCount": expected, "revision": revision}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact", type=Path)
    parser.add_argument("--require-clean", action="store_true")
    parser.add_argument("--expected-revision")
    args = parser.parse_args()
    try:
        print(json.dumps(validate(args.artifact, args.require_clean, args.expected_revision), indent=2))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"benchmark artifact gate failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
