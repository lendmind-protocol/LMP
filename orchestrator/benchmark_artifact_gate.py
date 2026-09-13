#!/usr/bin/env python3
"""Validate the evidence contract emitted by the real-world benchmark."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

EXPECTED_SCENARIOS = 64
ARTIFACT_VERSION = "2.0"
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
    if report.get("artifactVersion") != ARTIFACT_VERSION:
        raise ValueError("benchmark artifactVersion must be 2.0")
    if report.get("status") != "complete":
        raise ValueError(f"benchmark status is {report.get('status')!r}, not complete")
    summary = report.get("summary") or {}
    study = report.get("study") or {}
    if study.get("design") != "paired-repeated-trials" or study.get("causalClaim") != "not-established":
        raise ValueError("study must declare paired repeated trials and no causal claim")
    trial_count = study.get("trialCount")
    if isinstance(trial_count, bool) or not isinstance(trial_count, int) or trial_count < 2:
        raise ValueError("study requires at least two repeated trials")
    expected = summary.get("expectedScenarioCount")
    expected_trials = EXPECTED_SCENARIOS * trial_count
    if expected != EXPECTED_SCENARIOS or summary.get("scenarioCount") != EXPECTED_SCENARIOS or summary.get("trialCount") != trial_count or summary.get("pairedTrialCount") != expected_trials:
        raise ValueError(f"scenario count must be exactly {EXPECTED_SCENARIOS}")
    if summary.get("passedTransitions") != expected_trials or not summary.get("allTransitionsPassed"):
        raise ValueError("not all baseline-to-guided transitions passed")
    if summary.get("dockerGatesExpected") != expected_trials * 2 or summary.get("dockerGatesPassed") != expected_trials * 2:
        raise ValueError("Docker gate count does not cover every paired trial")
    if summary.get("controlChecksExpected") != expected_trials * 2 or summary.get("controlChecksPassed") != expected_trials * 2:
        raise ValueError("ordinary control check count does not cover every paired trial")
    metadata = report.get("evidenceMetadata") or {}
    candidate_inputs = metadata.get("candidateInputs") or {}
    producer = candidate_inputs.get("producer")
    if not isinstance(producer, dict) or not isinstance(candidate_inputs.get("path"), str) or not re.fullmatch(r"[0-9a-f]{64}", str(candidate_inputs.get("manifestSha256"))) or producer.get("kind") not in {"explicit-injection", "model"}:
        raise ValueError("candidate input manifest provenance is required")
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
    if len(scenarios) != expected_trials:
        raise ValueError(f"every one of the {expected_trials} paired trials is required")
    seen_trials: set[tuple[str, int]] = set()
    for index, scenario in enumerate(scenarios):
        if not isinstance(scenario, dict):
            raise ValueError(f"scenario {index} must be an object")
        for field in ("id", "baseScenarioId", "inputId", "repository", "revision", "taskType"):
            if not isinstance(scenario.get(field), str) or not scenario[field]:
                raise ValueError(f"scenario {index} is missing {field} provenance")
        if not re.fullmatch(r"[0-9a-f]{40}", scenario["revision"]):
            raise ValueError(f"scenario {index} has an invalid source revision")
        if scenario.get("transitionPassed") is not True:
            raise ValueError(f"scenario {index} did not pass its baseline-to-guided transition")
        trial = scenario.get("trial")
        if isinstance(trial, bool) or not isinstance(trial, int) or not 1 <= trial <= trial_count:
            raise ValueError(f"scenario {index} has an invalid trial")
        key = (scenario["baseScenarioId"], trial)
        if key in seen_trials:
            raise ValueError(f"scenario {index} duplicates a paired trial")
        seen_trials.add(key)
        provenance = scenario.get("inputProvenance") or {}
        if not isinstance(provenance.get("source"), str) or not provenance["source"] or not re.fullmatch(r"[0-9a-f]{64}", str(provenance.get("sha256"))):
            raise ValueError(f"scenario {index} is missing candidate input provenance")
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
        outcomes = scenario.get("outcomes") or {}
        for candidate_name in ("baseline", "guided"):
            outcome = outcomes.get(candidate_name) or {}
            if not isinstance(outcome.get("evaluatorPass"), bool) or not isinstance(outcome.get("hardViolationCount"), int):
                raise ValueError(f"scenario {index} has incomplete measurable {candidate_name} outcome")
            if not isinstance(outcome.get("qualityCommandCount"), int) or not isinstance(outcome.get("qualityCommandPassCount"), int):
                raise ValueError(f"scenario {index} is missing {candidate_name} quality metrics")
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
        quality_commands = scenario.get("qualityCommands") or {}
        for candidate_name in ("baseline", "guided"):
            quality = quality_commands.get(candidate_name) or {}
            if quality.get("repositoryCommandsExecuted") is not True:
                raise ValueError(f"scenario {index} {candidate_name} repository quality commands were not executed")
            if not isinstance(quality.get("results"), list) or not isinstance(quality.get("commandCount"), int) or quality["commandCount"] != len(quality["results"]):
                raise ValueError(f"scenario {index} {candidate_name} quality command evidence is missing")
            for result in quality["results"]:
                if result.get("outputIncluded") is not False or not isinstance(result.get("command"), list) or not isinstance(result.get("exitCode"), int) or not isinstance(result.get("timedOut"), bool) or not isinstance(result.get("elapsedMs"), (int, float)) or result["elapsedMs"] < 0:
                    raise ValueError(f"scenario {index} has unsafe or incomplete quality command evidence")
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
