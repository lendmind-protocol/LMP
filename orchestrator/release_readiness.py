#!/usr/bin/env python3
"""Produce a fail-closed, machine-readable LMP release-readiness report.

This report composes the existing evidence gates.  It never turns an absent
external proof into a pass: deployment, IPFS, cross-platform archives, and
human adoption evidence remain explicitly blocked until their artifacts exist.
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUALIFICATION_SCENARIOS = 39


def run_gate(command: list[str]) -> dict[str, object]:
    result = subprocess.run(
        command,
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    output = (result.stdout or result.stderr).strip()
    try:
        payload = json.loads(output) if output else {}
    except json.JSONDecodeError:
        payload = {"detail": output[-2000:]}
    return {
        "status": "pass" if result.returncode == 0 else "blocked",
        "exitCode": result.returncode,
        "evidence": payload,
    }


def current_revision() -> str | None:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    revision = result.stdout.strip()
    return revision if result.returncode == 0 and revision else None


def absent(reason: str, boundary: str = "local") -> dict[str, object]:
    return {"status": "blocked", "boundary": boundary, "reason": reason}


def working_tree_check() -> dict[str, object]:
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return absent(f"unable to inspect repository state: {result.stderr.strip()}")
    changed = [line for line in result.stdout.splitlines() if line.strip()]
    if changed:
        return {
            "status": "blocked",
            "boundary": "local",
            "reason": "release readiness requires a clean checkout",
            "changedPathCount": len(changed),
        }
    return {"status": "pass", "changedPathCount": 0}


def registry_copy_check(source: Path, public: Path) -> dict[str, object]:
    if not source.is_file():
        return absent(f"source registry index not found: {source}")
    if not public.is_file():
        return absent(f"public registry copy not found: {public}")
    try:
        if source.read_bytes() != public.read_bytes():
            return {"status": "blocked", "reason": "public registry copy differs from source registry index"}
    except OSError as error:
        return absent(f"registry parity check failed: {error}")
    return {"status": "pass", "source": str(source), "public": str(public)}


def validate_human_pilot(payload: object) -> list[str]:
    if not isinstance(payload, dict):
        return ["human pilot report must be an object"]
    errors: list[str] = []
    if payload.get("status") != "complete":
        errors.append("human pilot status must be complete")
    participants = payload.get("participants")
    if not isinstance(participants, int) or isinstance(participants, bool) or participants < 5:
        errors.append("human pilot requires at least 5 participants")
    categories = payload.get("repositoryCategories")
    if not isinstance(categories, list) or any(not isinstance(item, str) or not item.strip() for item in categories) or len(set(categories)) < 3:
        errors.append("human pilot requires at least 3 repository categories")
    operating_systems = payload.get("operatingSystems")
    if not isinstance(operating_systems, list) or any(not isinstance(item, str) or not item.strip() for item in operating_systems) or len(set(operating_systems)) < 2:
        errors.append("human pilot requires at least 2 operating systems")
    completed = payload.get("completedOnboardingWithoutHelp")
    if (
        not isinstance(completed, int)
        or isinstance(completed, bool)
        or not isinstance(participants, int)
        or completed != participants
    ):
        errors.append("every participant must complete onboarding without maintainer help")
    remediated = payload.get("remediatedFindingParticipants")
    if (
        not isinstance(remediated, int)
        or isinstance(remediated, bool)
        or not isinstance(participants, int)
        or remediated < 0
        or remediated > participants
        or remediated * 100 < participants * 80
    ):
        errors.append("at least 80% of participants must remediate a finding")
    understood = payload.get("understoodPassBoundaryParticipants")
    if (
        not isinstance(understood, int)
        or isinstance(understood, bool)
        or not isinstance(participants, int)
        or understood != participants
    ):
        errors.append("every participant must understand the limits of a passing result")
    privacy = payload.get("privacy")
    if not isinstance(privacy, dict) or privacy.get("sourceCodeIncluded") is not False or privacy.get("secretsIncluded") is not False:
        errors.append("human pilot artifact must exclude source code and secrets")
    return errors


def validate_resource_report(payload: object) -> list[str]:
    if not isinstance(payload, dict):
        return ["daemon resource report must be an object"]
    if payload.get("status") != "pass":
        return ["daemon resource report status must be pass"]
    targets = payload.get("targets")
    if not isinstance(targets, dict):
        return ["daemon resource report must include numeric targets"]
    errors: list[str] = []
    for measurement, target_key in (("rssMb", "maxRssMb"), ("cpuPercent", "maxCpuPercent")):
        value = payload.get(measurement)
        target = targets.get(target_key)
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
            errors.append(f"daemon resource report requires numeric {measurement}")
        if not isinstance(target, (int, float)) or isinstance(target, bool) or not math.isfinite(target):
            errors.append(f"daemon resource report requires numeric target {target_key}")
        elif isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > target:
            errors.append(f"daemon resource report exceeds {target_key}")
    sample_seconds = payload.get("sampleSeconds")
    if not isinstance(sample_seconds, (int, float)) or isinstance(sample_seconds, bool) or not math.isfinite(sample_seconds) or sample_seconds < 5:
        errors.append("daemon resource report requires at least 5 seconds of sampling")
    return errors


def validate_onboarding_report(payload: object, target_ms: float = 3_000) -> list[str]:
    if not isinstance(payload, dict):
        return ["onboarding benchmark must be an object"]
    errors: list[str] = []
    if payload.get("status") != "complete":
        errors.append("onboarding benchmark status must be complete")
    if payload.get("benchmark") != "lmp-create-onboarding":
        errors.append("onboarding benchmark identity is invalid")
    cases = payload.get("cases")
    if not isinstance(cases, list) or len(cases) != 2 or {case.get("strategy") for case in cases if isinstance(case, dict)} != {"greenfield", "brownfield"}:
        errors.append("onboarding benchmark must include greenfield and brownfield cases")
    else:
        for case in cases:
            if not isinstance(case, dict) or case.get("status") != "pass" or case.get("exitCode") != 0:
                errors.append("every onboarding case must exit successfully")
                continue
            elapsed = case.get("elapsedMs")
            if not isinstance(elapsed, (int, float)) or isinstance(elapsed, bool) or not math.isfinite(elapsed) or elapsed > target_ms:
                errors.append(f"{case.get('strategy', 'unknown')} onboarding case exceeds {target_ms:g} ms")
    privacy = payload.get("privacy")
    if not isinstance(privacy, dict) or privacy.get("sourceCodeIncluded") is not False or privacy.get("secretsIncluded") is not False:
        errors.append("onboarding benchmark must exclude source code and secrets")
    return errors


def validate_qualification_report(payload: object) -> list[str]:
    if not isinstance(payload, dict):
        return ["qualification report must be an object"]
    errors: list[str] = []
    if payload.get("status") != "complete":
        errors.append("qualification report status must be complete")
    if payload.get("scenarioCount") != QUALIFICATION_SCENARIOS:
        errors.append(f"qualification report must contain exactly {QUALIFICATION_SCENARIOS} scenarios")
    if payload.get("expectedScenarioCount") != QUALIFICATION_SCENARIOS:
        errors.append(f"qualification report expectedScenarioCount must be {QUALIFICATION_SCENARIOS}")
    if payload.get("dockerRequired") is not True:
        errors.append("qualification report must require Docker")
    passed = payload.get("passed")
    if not isinstance(passed, list) or len(passed) != QUALIFICATION_SCENARIOS or any(not isinstance(item, str) or not item.strip() for item in passed):
        errors.append(f"qualification report must list all {QUALIFICATION_SCENARIOS} named scenarios")
    elif len(set(passed)) != QUALIFICATION_SCENARIOS:
        errors.append("qualification report scenario names must be unique")
    return errors


def readiness(args: argparse.Namespace) -> dict[str, object]:
    checks: dict[str, dict[str, object]] = {}
    checks["workingTree"] = working_tree_check()
    checks["registryCopyParity"] = registry_copy_check(
        Path(args.registry), Path(args.public_registry)
    )
    checks["evidenceBoundary"] = run_gate(
        [sys.executable, "orchestrator/evidence_boundary_gate.py", args.claim_ledger]
    )
    qualification = Path(args.qualification)
    if qualification.is_file():
        try:
            payload = json.loads(qualification.read_text(encoding="utf-8"))
            errors = validate_qualification_report(payload)
            checks["qualificationEvidence"] = {"status": "pass", "evidence": payload} if not errors else {"status": "blocked", "errors": errors, "evidence": payload}
        except (OSError, json.JSONDecodeError) as error:
            checks["qualificationEvidence"] = absent(f"qualification artifact is unreadable: {error}")
    else:
        checks["qualificationEvidence"] = absent(f"qualification artifact not found: {qualification}")
    benchmark = Path(args.benchmark)
    if benchmark.is_file():
        technical_command = [sys.executable, "orchestrator/benchmark_artifact_gate.py", str(benchmark)]
        checks["benchmarkTechnicalEvidence"] = run_gate(technical_command)
        command = [*technical_command]
        if args.require_clean:
            command.append("--require-clean")
            revision = current_revision()
            if revision is None:
                checks["benchmarkEvidence"] = absent(
                    "unable to resolve HEAD for clean benchmark revision binding"
                )
            else:
                command.extend(["--expected-revision", revision])
                checks["benchmarkEvidence"] = run_gate(command)
        else:
            checks["benchmarkEvidence"] = run_gate(command)
        try:
            payload = json.loads(benchmark.read_text(encoding="utf-8"))
            annotations = (payload.get("evidenceMetadata") or {}).get("reviewerAnnotations")
            if not isinstance(annotations, list):
                checks["independentReview"] = absent(
                    "benchmark reviewerAnnotations must be an array", "human"
                )
            elif not annotations:
                checks["independentReview"] = absent(
                    "independent benchmark review annotations are missing", "human"
                )
            else:
                checks["independentReview"] = {
                    "status": "pass",
                    "boundary": "human",
                    "annotationCount": len(annotations or []),
                }
        except (OSError, json.JSONDecodeError) as error:
            checks["independentReview"] = absent(
                f"benchmark review evidence is unreadable: {error}", "human"
            )
    else:
        checks["benchmarkTechnicalEvidence"] = absent(f"benchmark artifact not found: {benchmark}")
        checks["benchmarkEvidence"] = absent(f"benchmark artifact not found: {benchmark}")
        checks["independentReview"] = absent(
            f"benchmark artifact not found: {benchmark}", "human"
        )

    registry = Path(args.registry)
    if registry.is_file():
        command = [sys.executable, "orchestrator/registry_release_gate.py", str(registry)]
        if args.verify_cids:
            command.append("--verify-cids")
        checks["registryRelease"] = run_gate(command)
        checks["registryRelease"]["boundary"] = "external"
        verifier = Path(args.lmp)
        if verifier.is_file():
            checks["registryManifestParity"] = run_gate(
                [
                    sys.executable,
                    "orchestrator/registry_manifest_gate.py",
                    str(registry),
                    "--lmp",
                    str(verifier),
                ]
            )
        else:
            checks["registryManifestParity"] = absent(f"Rust verifier binary not found: {verifier}")
    else:
        checks["registryRelease"] = absent(f"registry index not found: {registry}")
        checks["registryManifestParity"] = absent(f"registry index not found: {registry}")

    if args.deployment:
        command = [sys.executable, "orchestrator/verify_static_deployment.py", args.deployment]
        command.append("--require-https")
        if args.expected_registry:
            command.extend(["--expected-registry", args.expected_registry])
        if args.check_manifests:
            command.append("--check-manifests")
        checks["staticDeployment"] = run_gate(command)
        checks["staticDeployment"]["boundary"] = "external"
    else:
        checks["staticDeployment"] = absent("deployment URL was not supplied", "external")

    if args.release_artifacts:
        checks["crossPlatformArtifacts"] = run_gate(
            [sys.executable, "orchestrator/release_artifact_gate.py", args.release_artifacts]
        )
        checks["crossPlatformArtifacts"]["boundary"] = "external"
    else:
        checks["crossPlatformArtifacts"] = absent(
            "cross-platform release artifact directory was not supplied", "external"
        )

    if args.resource_report:
        report = Path(args.resource_report)
        if report.is_file():
            try:
                payload = json.loads(report.read_text(encoding="utf-8"))
                errors = validate_resource_report(payload)
                checks["daemonResources"] = {"status": "pass", "evidence": payload} if not errors else {"status": "blocked", "errors": errors, "evidence": payload}
            except (OSError, json.JSONDecodeError) as error:
                checks["daemonResources"] = absent(f"resource report is unreadable: {error}")
        else:
            checks["daemonResources"] = absent(f"resource report not found: {report}")
    else:
        checks["daemonResources"] = absent("host-qualified daemon resource report was not supplied")

    onboarding = Path(args.onboarding)
    if onboarding.is_file():
        try:
            payload = json.loads(onboarding.read_text(encoding="utf-8"))
            errors = validate_onboarding_report(payload)
            checks["onboardingPerformance"] = {"status": "pass", "evidence": payload} if not errors else {"status": "blocked", "errors": errors, "evidence": payload}
        except (OSError, json.JSONDecodeError) as error:
            checks["onboardingPerformance"] = absent(f"onboarding benchmark is unreadable: {error}")
    else:
        checks["onboardingPerformance"] = absent(f"onboarding benchmark not found: {onboarding}")

    if args.human_pilot_report:
        report = Path(args.human_pilot_report)
        if report.is_file():
            try:
                payload = json.loads(report.read_text(encoding="utf-8"))
                errors = validate_human_pilot(payload)
                checks["humanAdoptionPilot"] = (
                    {"status": "pass", "boundary": "human", "evidence": payload}
                    if not errors
                    else {
                        "status": "blocked",
                        "boundary": "human",
                        "errors": errors,
                        "evidence": payload,
                    }
                )
            except (OSError, json.JSONDecodeError) as error:
                checks["humanAdoptionPilot"] = absent(
                    f"human pilot report is unreadable: {error}", "human"
                )
        else:
            checks["humanAdoptionPilot"] = absent(
                f"human pilot report not found: {report}", "human"
            )
    else:
        checks["humanAdoptionPilot"] = absent(
            "independent human adoption pilot report was not supplied", "human"
        )

    if args.remote_source:
        checks["remoteSource"] = run_gate(
            [
                sys.executable,
                "orchestrator/remote_source_gate.py",
                "--remote",
                args.remote_source,
                "--branch",
                args.remote_branch,
            ]
        )
        checks["remoteSource"]["boundary"] = "external"

    all_checks_pass = all(item.get("status") == "pass" for item in checks.values())
    release_clean = bool(args.require_clean and all_checks_pass)
    return {
        "artifactVersion": "1.0",
        "status": "ready" if release_clean else "blocked",
        "decision": "RELEASE_CANDIDATE_QUALIFIED" if release_clean else "BLOCKED",
        "releaseCleanRequired": True,
        "claim": "The release candidate met the configured qualification checks in the documented environment." if release_clean else "Release evidence is incomplete; no publication claim is made.",
        "checks": checks,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--benchmark",
        default="lmp-test-results/real-world-clean-current/real-world-benchmark.json",
        help="clean retained benchmark artifact; CI may override this with its run output",
    )
    parser.add_argument("--qualification", default="lmp-test-results/qualification-result.json")
    parser.add_argument("--registry", default="registry/registry.json")
    parser.add_argument("--public-registry", default="apps/docs/public/registry.json")
    parser.add_argument("--claim-ledger", default="docs/claim-ledger.md")
    parser.add_argument("--lmp", default="target/release/lmp")
    parser.add_argument("--deployment")
    parser.add_argument("--expected-registry")
    parser.add_argument("--check-manifests", action="store_true")
    parser.add_argument("--verify-cids", action="store_true")
    parser.add_argument("--release-artifacts")
    parser.add_argument("--resource-report")
    parser.add_argument("--onboarding", default="lmp-test-results/onboarding-current.json")
    parser.add_argument("--human-pilot-report")
    parser.add_argument("--remote-source", help="Git remote that must contain the release revision")
    parser.add_argument("--remote-branch", default="main")
    parser.add_argument("--require-clean", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = readiness(args)
    encoded = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded, encoding="utf-8")
    print(encoded, end="")
    return 0 if report["status"] == "ready" else 2


if __name__ == "__main__":
    raise SystemExit(main())
