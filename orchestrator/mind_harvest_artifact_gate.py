#!/usr/bin/env python3
"""Fail-closed validator for deterministic Mind Harvester artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")


def validate_artifact(artifact: object) -> list[str]:
    if not isinstance(artifact, dict):
        return ["harvest artifact must be an object"]
    errors: list[str] = []
    if artifact.get("schemaVersion") != "lmp.mind-harvest/1":
        errors.append("unsupported harvest schemaVersion")
    entity = artifact.get("entity")
    if not isinstance(entity, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", entity):
        errors.append("entity must be a kebab-case identifier")
    privacy = artifact.get("privacy")
    if not isinstance(privacy, dict) or any(privacy.get(key) is not False for key in ("sourceContentIncluded", "rawPathsIncluded", "privateReasoningIncluded")):
        errors.append("privacy flags must explicitly deny source content, raw paths, and private reasoning")
    sources = artifact.get("sources")
    source_ids: set[str] = set()
    if not isinstance(sources, list) or not sources:
        errors.append("sources must be a non-empty array")
        sources = []
    for index, source in enumerate(sources):
        if not isinstance(source, dict):
            errors.append(f"source {index} must be an object")
            continue
        source_id = source.get("id")
        if not isinstance(source_id, str) or not IDENTIFIER.fullmatch(source_id) or source_id in source_ids:
            errors.append(f"source {index} has an invalid or duplicate id")
        else:
            source_ids.add(source_id)
        if source.get("layer") not in {"textual", "implementation", "critique"}:
            errors.append(f"source {index} has an invalid layer")
        if not isinstance(source.get("reference"), str) or not source["reference"].startswith(("https://", "local://redacted")):
            errors.append(f"source {index} reference is not an allowed public or redacted-local reference")
        if not isinstance(source.get("contentDigest"), str) or not DIGEST.fullmatch(source["contentDigest"]):
            errors.append(f"source {index} has an invalid content digest")
        for forbidden in ("content", "text", "path", "rawContent"):
            if forbidden in source:
                errors.append(f"source {index} contains forbidden raw field: {forbidden}")
    signals = artifact.get("signals")
    signal_ids: set[str] = set()
    if not isinstance(signals, list):
        errors.append("signals must be an array")
        signals = []
    for index, signal in enumerate(signals):
        if not isinstance(signal, dict):
            errors.append(f"signal {index} must be an object")
            continue
        if not isinstance(signal.get("id"), str) or signal["id"] in signal_ids:
            errors.append(f"signal {index} has an invalid or duplicate id")
        signal_ids.add(signal.get("id", ""))
        if signal.get("sourceId") not in source_ids:
            errors.append(f"signal {index} references an unknown source")
        if signal.get("polarity") not in {"support", "reject", "mixed"}:
            errors.append(f"signal {index} has an invalid polarity")
    contradictions = artifact.get("contradictions")
    if not isinstance(contradictions, list):
        errors.append("contradictions must be an array")
        contradictions = []
    for index, contradiction in enumerate(contradictions):
        if not isinstance(contradiction, dict):
            errors.append(f"contradiction {index} must be an object")
            continue
        if contradiction.get("resolution") != "human-review-required":
            errors.append(f"contradiction {index} must require human review")
        for key in ("supportingSourceIds", "rejectingSourceIds"):
            values = contradiction.get(key)
            if not isinstance(values, list) or not values or any(value not in source_ids for value in values):
                errors.append(f"contradiction {index} has invalid {key}")
    proposal = artifact.get("proposal")
    if not isinstance(proposal, dict):
        errors.append("proposal must be an object")
    else:
        if proposal.get("status") not in {"draft", "needs-review"}:
            errors.append("harvest proposal status must remain draft or needs-review")
        if proposal.get("approver") is not None or proposal.get("promotionEligible") is not False:
            errors.append("harvest proposal cannot contain an approver or be promotion eligible")
        candidates = proposal.get("candidateChanges")
        if not isinstance(candidates, list):
            errors.append("proposal candidateChanges must be an array")
        else:
            for index, candidate in enumerate(candidates):
                if not isinstance(candidate, dict) or candidate.get("promotionEligible") is not False or candidate.get("enforcement") != "none":
                    errors.append(f"candidate {index} is not proposal-only")
                elif candidate.get("classification") not in {
                    "explicit-statement",
                    "repeated-code-pattern",
                    "review-pattern",
                    "inferred-hypothesis",
                }:
                    errors.append(f"candidate {index} has an invalid classification")
        unsupported = proposal.get("unsupportedSourceIds")
        if not isinstance(unsupported, list) or any(source_id not in source_ids for source_id in unsupported):
            errors.append("proposal unsupportedSourceIds must reference known sources")
        unsupported_ids = set(unsupported) if isinstance(unsupported, list) else set()
        unsupported_sources = proposal.get("unsupportedSources")
        if not isinstance(unsupported_sources, list):
            errors.append("proposal unsupportedSources must be an array")
        else:
            for item in unsupported_sources:
                if (
                    not isinstance(item, dict)
                    or item.get("classification") != "unsupported"
                    or item.get("sourceId") not in source_ids
                    or item.get("sourceId") not in unsupported_ids
                ):
                    errors.append("proposal unsupportedSources contains an invalid entry")
    expected_status = "needs-review" if contradictions else "draft"
    if artifact.get("status") != expected_status:
        errors.append(f"artifact status must be {expected_status} for its contradiction set")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact", type=Path)
    args = parser.parse_args(argv)
    try:
        payload = args.artifact.read_bytes()
        artifact = json.loads(payload)
        errors = validate_artifact(artifact)
    except (OSError, json.JSONDecodeError) as error:
        print(json.dumps({"status": "blocked", "errors": [str(error)]}, sort_keys=True))
        return 1
    if errors:
        print(json.dumps({"status": "blocked", "errors": errors}, sort_keys=True))
        return 1
    print(json.dumps({"status": "verified", "artifact": str(args.artifact), "sha256": hashlib.sha256(payload).hexdigest()}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
