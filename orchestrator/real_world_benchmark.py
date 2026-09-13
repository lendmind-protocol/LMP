#!/usr/bin/env python3
"""Execute the 64-scenario real-OSS benchmark and source provenance check."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import platform
import time
import urllib.request
from pathlib import Path

from sandbox import DockerSandbox


ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "registry/provenance/real-sources.json"
MIND = ROOT / "profiles/typescript-minimal"

REPOSITORIES = [
    ("express", "https://github.com/expressjs/express.git"),
    ("hono", "https://github.com/honojs/hono.git"),
    ("create-t3-app", "https://github.com/t3-oss/create-t3-app.git"),
    ("supabase", "https://github.com/supabase/supabase.git"),
    ("codex-security", "https://github.com/openai/codex-security.git"),
    ("typescript", "https://github.com/microsoft/TypeScript.git"),
    ("swagger-ui", "https://github.com/swagger-api/swagger-ui.git"),
    ("cal-com", "https://github.com/calcom/cal.com.git"),
]

TASKS = [
    ("api-behavior", "Add a small request handler while preserving explicit control flow.", "express-guide"),
    ("dependency-choice", "Implement a helper using native platform capability before adding a dependency.", "hono-guide"),
    ("input-validation", "Validate untrusted input with strict types and explicit invalid cases.", "typescript-handbook"),
    ("security-boundary", "Keep authorization at the strongest available boundary and test rejection.", "supabase-rls"),
    ("test-regression", "Add a regression test for the changed behavior without unrelated edits.", "google-code-review"),
    ("performance", "Measure the narrow operation before adding permanent infrastructure.", "linux-coding-style"),
    ("cli-workflow", "Add a small CLI-facing behavior with explicit errors and no hidden execution.", "node-security"),
    ("architecture-refactor", "Make a narrow change that remains understandable and independently testable.", "typescript-repository"),
]
EXPECTED_SCENARIOS = len(REPOSITORIES) * len(TASKS)
SANDBOX_IMAGE = "lmp-sandbox:local"
CONTROL_TIMEOUT_SECONDS = 30
COMMAND_TIMEOUT_SECONDS = 120


def run(command: list[str], cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        text=True,
        capture_output=True,
        check=check,
        timeout=COMMAND_TIMEOUT_SECONDS,
    )


def command_version(command: list[str], cwd: Path | None = None) -> str | None:
    try:
        result = run(command, cwd=cwd, check=False)
    except subprocess.TimeoutExpired:
        return None
    if result.returncode != 0:
        return None
    return (result.stdout or result.stderr).strip().splitlines()[0] if (result.stdout or result.stderr).strip() else None


def evidence_metadata(binary: Path) -> dict[str, object]:
    revision = command_version(["git", "rev-parse", "HEAD"], cwd=ROOT)
    dirty = command_version(["git", "status", "--porcelain"], cwd=ROOT)
    return {
        "repositoryRevision": revision,
        "repositoryDirty": bool(dirty),
        "profile": {
            "path": str(MIND.relative_to(ROOT)),
            "mindSha256": hashlib.sha256((MIND / "mind.json").read_bytes()).hexdigest(),
        },
        "tools": {
            "lmp": command_version([str(binary), "--version"]),
            "python": platform.python_version(),
            "platform": platform.platform(),
            "docker": command_version(["docker", "--version"]),
        },
        "reviewerAnnotations": [],
    }


def load_reviewer_annotations(path: Path, revision: str | None) -> list[dict[str, object]]:
    """Load independent review records without inventing review evidence."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    annotations = payload.get("annotations") if isinstance(payload, dict) else payload
    if not isinstance(annotations, list) or not annotations:
        raise ValueError("reviewer annotation input must contain a non-empty array")
    required = ("reviewer", "reviewedRevision", "decision", "notes")
    for index, annotation in enumerate(annotations):
        if not isinstance(annotation, dict):
            raise ValueError(f"reviewer annotation {index} must be an object")
        for field in required:
            value = annotation.get(field)
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"reviewer annotation {index} requires non-empty {field}")
        if revision and annotation["reviewedRevision"] != revision:
            raise ValueError(
                f"reviewer annotation {index} targets {annotation['reviewedRevision']}, "
                f"not benchmark revision {revision}"
            )
        for field in ("reviewTimeMinutes", "reworkCount", "severity", "confidence", "falsePositiveCount"):
            if field not in annotation:
                raise ValueError(f"reviewer annotation {index} requires {field}")
        if not isinstance(annotation["reviewTimeMinutes"], (int, float)) or annotation["reviewTimeMinutes"] < 0:
            raise ValueError(f"reviewer annotation {index} requires non-negative reviewTimeMinutes")
        if not isinstance(annotation["reworkCount"], int) or annotation["reworkCount"] < 0:
            raise ValueError(f"reviewer annotation {index} requires non-negative reworkCount")
        if annotation["severity"] not in {"none", "low", "medium", "high", "critical"}:
            raise ValueError(f"reviewer annotation {index} has an unsupported severity")
        if not isinstance(annotation["confidence"], (int, float)) or not 0 <= annotation["confidence"] <= 1:
            raise ValueError(f"reviewer annotation {index} requires confidence between 0 and 1")
        if not isinstance(annotation["falsePositiveCount"], int) or annotation["falsePositiveCount"] < 0:
            raise ValueError(f"reviewer annotation {index} requires non-negative falsePositiveCount")
    return annotations


def reviewer_limitations(metadata: dict[str, object]) -> list[str]:
    if metadata.get("reviewerAnnotations"):
        return []
    return ["reviewerAnnotations is empty until an independent reviewer records findings."]


def verify_sources() -> list[dict[str, object]]:
    manifest = json.loads(SOURCES.read_text(encoding="utf-8"))
    results = []
    for source in manifest["sources"]:
        request = urllib.request.Request(source["url"], headers={"User-Agent": "lmp-provenance-verifier/1.0"})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                body = response.read()
                results.append({**source, "verified": True, "status": response.status, "contentBytes": len(body), "contentSha256": hashlib.sha256(body).hexdigest()})
        except Exception as error:
            results.append({**source, "verified": False, "errorCategory": type(error).__name__})
    return results


def check_prerequisites(binary: Path) -> dict[str, object]:
    docker_available = shutil.which("docker") is not None
    daemon_ready = False
    image_ready = False
    docker_error = None
    if docker_available:
        daemon = run(["docker", "info"], check=False)
        daemon_ready = daemon.returncode == 0
        image = run(["docker", "image", "inspect", SANDBOX_IMAGE], check=False)
        image_ready = image.returncode == 0
        if not daemon_ready:
            docker_error = "Docker daemon is unavailable"
        elif not image_ready:
            docker_error = f"Docker image {SANDBOX_IMAGE} is unavailable"
    else:
        docker_error = "docker executable is unavailable"
    return {
        "rustBinary": {"path": str(binary), "ready": binary.is_file()},
        "docker": {
            "executable": docker_available,
            "daemon": daemon_ready,
            "image": SANDBOX_IMAGE,
            "imageReady": image_ready,
            "ready": docker_available and daemon_ready and image_ready,
            "error": docker_error,
        },
        "ready": binary.is_file() and docker_available and daemon_ready and image_ready,
    }


def clone(name: str, url: str, root: Path) -> tuple[Path, str]:
    destination = root / name
    run(["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse", url, str(destination)])
    run(["git", "sparse-checkout", "set", "--cone", ".github", "packages", "src", "lib", "cli", "package.json", "README.md"], cwd=destination, check=False)
    revision = run(["git", "rev-parse", "HEAD"], cwd=destination).stdout.strip()
    return destination, revision


def write_candidate(workspace: Path, scenario: str, guided: bool) -> None:
    target = workspace / "lmp-benchmark"
    target.mkdir(exist_ok=True)
    if guided:
        text = "export function handleInput(value: unknown): string | undefined {\n  if (typeof value !== 'string') return undefined;\n  const normalized = value.trim();\n  return normalized.length > 0 ? normalized : undefined;\n}\n"
        package = {"name": f"lmp-{scenario}", "private": True, "dependencies": {}}
    else:
        text = "export function handleInput(value: any): any {\n  console.log(value);\n  return eval(value);\n}\n"
        package = {"name": f"lmp-{scenario}", "private": True, "dependencies": {"lodash": "^4.17.21"}}
    (target / "implementation.ts").write_text(text, encoding="utf-8")
    (target / "implementation.test.ts").write_text("import { handleInput } from './implementation.js';\nhandleInput('demo');\n", encoding="utf-8")
    (target / "package.json").write_text(json.dumps(package) + "\n", encoding="utf-8")


def evaluate(binary: Path, workspace: Path, artifact: Path) -> dict[str, object]:
    artifact.mkdir(parents=True, exist_ok=True)
    result = run([str(binary), "evaluate", "--mind", str(MIND), "--workspace", str(workspace), "--mode", "enforced", "--changed-only", "--json", "--artifact-dir", str(artifact)], check=False)
    report = json.loads(result.stdout)
    return {"exitCode": result.returncode, "state": report["state"], "hardViolationCount": report["summary"]["hardViolationCount"], "rules": sorted({item["ruleId"] for item in report["checks"]}), "privacy": report["privacy"]}


def control_state(exit_code: int) -> str:
    """Classify the ordinary compiler control without treating it as LMP proof."""
    return "pass" if exit_code == 0 else "needs_revision"


def existing_control_check(workspace: Path) -> dict[str, object]:
    """Run only the local TypeScript compiler as a conservative ordinary-control baseline.

    Repository-provided scripts are discovered and recorded, never executed. This keeps
    the benchmark safe for untrusted OSS while still showing what the compiler-only
    control accepts before LMP policy evaluation.
    """
    target = workspace / "lmp-benchmark/implementation.ts"
    command = [
        "tsc",
        "--noEmit",
        "--strict",
        "--target",
        "ES2022",
        "--module",
        "NodeNext",
        "--moduleResolution",
        "NodeNext",
        "--skipLibCheck",
        "lmp-benchmark/implementation.ts",
    ]
    started = time.monotonic()
    result = subprocess.run(
        [str(ROOT / "node_modules/.bin/tsc"), *command[1:]],
        cwd=workspace,
        check=False,
        capture_output=True,
        text=True,
        timeout=CONTROL_TIMEOUT_SECONDS,
    )
    return {
        "tool": "typescript-compiler",
        "command": command,
        "exitCode": result.returncode,
        "state": control_state(result.returncode),
        "timedOut": False,
        "elapsedMs": round((time.monotonic() - started) * 1000, 3),
        "outputIncluded": False,
    }


def discover_existing_controls(source: Path) -> dict[str, object]:
    """Record ordinary project controls without running repository-owned commands."""
    guidance_names = (
        "AGENTS.md",
        "CLAUDE.md",
        ".clinerules",
        ".github/copilot-instructions.md",
    )
    config_names = (
        "package.json",
        "tsconfig.json",
        "biome.json",
        "biome.jsonc",
        ".eslintrc",
        ".eslintrc.json",
        ".eslintrc.js",
    )
    guidance = [name for name in guidance_names if (source / name).is_file()]
    configs = [name for name in config_names if (source / name).is_file()]
    return {
        "guidanceFiles": guidance,
        "toolConfigs": configs,
        "repositoryCommandsExecuted": False,
        "limitations": [
            "Repository-owned lint, test, and CI commands are discovered but not executed in this control lane.",
            "The compiler-only control is a lower-bound comparison, not a claim that ordinary project controls are universally complete.",
        ],
    }


def sandbox_check(workspace: Path) -> dict[str, object]:
    result = DockerSandbox(workspace, image=SANDBOX_IMAGE, include_paths=["lmp-benchmark/implementation.ts", "lmp-benchmark/package.json"]).run(
        ["python", "-c", "from pathlib import Path; assert Path('/workspace/lmp-benchmark/implementation.ts').is_file(); assert Path('/workspace/lmp-benchmark/package.json').is_file(); print('candidate mounted')"],
        timeout_seconds=30,
    )
    return result.to_dict()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lmp", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--reviewer-annotations",
        type=Path,
        help="JSON array (or {annotations: [...]}) independently authored for this revision",
    )
    args = parser.parse_args()
    started = time.monotonic()
    prerequisites = check_prerequisites(args.lmp)
    # Capture repository state before creating the evidence directory. The
    # benchmark must not classify its own newly-created output as source-tree
    # drift; pre-existing changes remain visible and still fail --require-clean.
    metadata = evidence_metadata(args.lmp)
    if args.reviewer_annotations:
        try:
            metadata["reviewerAnnotations"] = load_reviewer_annotations(
                args.reviewer_annotations, metadata.get("repositoryRevision")
            )
        except (OSError, ValueError, json.JSONDecodeError) as error:
            print(f"reviewer annotation input rejected: {error}", file=sys.stderr)
            return 2
    args.output.mkdir(parents=True, exist_ok=True)
    if not prerequisites["ready"]:
        report = {
            "artifactVersion": "1.2",
            "benchmark": "lmp-real-world-scenario-matrix",
            "status": "blocked",
            "evidenceMetadata": metadata,
            "prerequisites": prerequisites,
            "sourceVerification": [],
            "scenarios": [],
            "summary": {"scenarioCount": 0, "expectedScenarioCount": EXPECTED_SCENARIOS, "verifiedSources": 0, "passedTransitions": 0, "allTransitionsPassed": False, "dockerGatesPassed": 0, "dockerGatesExpected": EXPECTED_SCENARIOS * 2},
            "privacy": {"sourceCodeIncluded": False, "rawPathsIncluded": False, "privateReasoningIncluded": False},
            "timingSeconds": {"total": round(time.monotonic() - started, 3)},
            "limitations": [
                "The benchmark was not started because a required prerequisite was unavailable.",
                *reviewer_limitations(metadata),
            ],
        }
        (args.output / "real-world-benchmark.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"status": report["status"], "prerequisites": prerequisites}, indent=2))
        return 2
    source_results = verify_sources()
    source_by_id = {item["id"]: item for item in source_results}
    if not source_results or not all(item["verified"] for item in source_results):
        report = {
            "artifactVersion": "1.2",
            "benchmark": "lmp-real-world-scenario-matrix",
            "status": "blocked",
            "evidenceMetadata": metadata,
            "prerequisites": prerequisites,
            "sourceVerification": source_results,
            "scenarios": [],
            "summary": {"scenarioCount": 0, "expectedScenarioCount": EXPECTED_SCENARIOS, "verifiedSources": sum(item["verified"] for item in source_results), "passedTransitions": 0, "allTransitionsPassed": False, "dockerGatesPassed": 0, "dockerGatesExpected": EXPECTED_SCENARIOS * 2},
            "privacy": {"sourceCodeIncluded": False, "rawPathsIncluded": False, "privateReasoningIncluded": False},
            "timingSeconds": {"total": round(time.monotonic() - started, 3)},
            "limitations": [
                "The benchmark was not started because one or more pinned provenance sources could not be verified.",
                *reviewer_limitations(metadata),
            ],
        }
        (args.output / "real-world-benchmark.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"status": report["status"], "verifiedSources": report["summary"]["verifiedSources"]}, indent=2))
        return 2
    workspace_parent = ROOT / ".lmp-real-world-work"
    workspace_parent.mkdir(parents=True, exist_ok=True)
    root = Path(tempfile.mkdtemp(prefix="lmp-real-world-", dir=workspace_parent))
    scenarios = []
    run_error = None
    try:
        for repo_name, url in REPOSITORIES:
            source, revision = clone(repo_name, url, root)
            for task_index, (task_type, task, source_id) in enumerate(TASKS, start=1):
                scenario_id = f"{repo_name}-{task_index:02d}-{task_type}"
                scenario_started = time.monotonic()
                baseline = root / f"{scenario_id}-baseline"
                guided = root / f"{scenario_id}-guided"
                shutil.copytree(source, baseline, symlinks=True)
                shutil.copytree(source, guided, symlinks=True)
                shutil.copytree(MIND, baseline / "mind")
                shutil.copytree(MIND, guided / "mind")
                write_candidate(baseline, scenario_id, guided=False)
                write_candidate(guided, scenario_id, guided=True)
                baseline_result = evaluate(args.lmp, baseline, args.output / scenario_id / "baseline")
                guided_result = evaluate(args.lmp, guided, args.output / scenario_id / "guided")
                control_context = discover_existing_controls(source)
                baseline_control = existing_control_check(baseline)
                guided_control = existing_control_check(guided)
                baseline_sandbox = sandbox_check(baseline)
                guided_sandbox = sandbox_check(guided)
                sandbox_passed = baseline_sandbox["exitCode"] == 0 and guided_sandbox["exitCode"] == 0 and not baseline_sandbox["timedOut"] and not guided_sandbox["timedOut"]
                scenarios.append({"id": scenario_id, "repository": url, "revision": revision, "taskType": task_type, "task": task, "source": source_by_id[source_id], "ordinaryControls": control_context, "control": {"baseline": baseline_control, "guided": guided_control}, "baseline": baseline_result, "guided": guided_result, "sandbox": {"baseline": baseline_sandbox, "guided": guided_sandbox}, "transitionPassed": sandbox_passed and baseline_result["state"] == "needs_revision" and guided_result["state"] == "pass", "timingSeconds": {"scenario": round(time.monotonic() - scenario_started, 3)}})
    except Exception as error:
        run_error = {"type": type(error).__name__, "message": str(error)}
    finally:
        shutil.rmtree(root, ignore_errors=True)
    passed_transitions = sum(item["transitionPassed"] for item in scenarios)
    docker_gates_passed = sum(
        (item["sandbox"]["baseline"]["exitCode"] == 0)
        + (item["sandbox"]["guided"]["exitCode"] == 0)
        for item in scenarios
    )
    control_checks_passed = sum(
        (item["control"]["baseline"]["exitCode"] == 0)
        + (item["control"]["guided"]["exitCode"] == 0)
        for item in scenarios
    )
    all_transitions_passed = len(scenarios) == EXPECTED_SCENARIOS and all(item["transitionPassed"] for item in scenarios)
    status = "complete" if run_error is None and all_transitions_passed and docker_gates_passed == EXPECTED_SCENARIOS * 2 and control_checks_passed == EXPECTED_SCENARIOS * 2 else ("failed" if run_error or scenarios else "blocked")
    report = {"artifactVersion": "1.2", "benchmark": "lmp-real-world-scenario-matrix", "status": status, "evidenceMetadata": metadata, "timingSeconds": {"total": round(time.monotonic() - started, 3)}, "prerequisites": prerequisites, "sourceVerification": source_results, "scenarios": scenarios, "summary": {"scenarioCount": len(scenarios), "expectedScenarioCount": EXPECTED_SCENARIOS, "verifiedSources": sum(item["verified"] for item in source_results), "passedTransitions": passed_transitions, "allTransitionsPassed": all_transitions_passed, "dockerGatesPassed": docker_gates_passed, "dockerGatesExpected": EXPECTED_SCENARIOS * 2, "controlChecksPassed": control_checks_passed, "controlChecksExpected": EXPECTED_SCENARIOS * 2}, "error": run_error, "privacy": {"sourceCodeIncluded": False, "rawPathsIncluded": False, "privateReasoningIncluded": False}, "limitations": ["Scenarios use reproducible candidate patches in pinned real repositories; they are not a statistical claim about all model outputs.", "Source verification proves URL reachability and content identity at run time, not that a source author endorses the generated Mind.", "The ordinary-controls comparison runs the TypeScript compiler only; repository-owned lint, test, and CI commands are discovered but not executed.", *reviewer_limitations(metadata), "Human adoption and long-running production telemetry remain separate evidence gates."]}
    (args.output / "real-world-benchmark.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))
    return 0 if report["status"] == "complete" and report["summary"]["verifiedSources"] == len(source_results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
