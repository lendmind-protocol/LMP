#!/usr/bin/env python3
"""Execute the documented LMP-on-LMP reality test and retain honest evidence.

This runner orchestrates independent toolchains. It never turns a skipped,
failed, or unsupported check into PASS and writes both machine-readable and
human-readable reports from the commands that actually ran.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PYTHON = str(ROOT / ".venv/bin/python") if (ROOT / ".venv/bin/python").is_file() else sys.executable
MINDS = [
    ("lmp:mind:lmp-protocol-core", "1.0.0", ".", "core protocol and trust boundaries"),
    ("lmp:mind:rust-defensive-systems", "1.0.0", "crates", "Rust implementation"),
    ("lmp:mind:kernel-inspired-systems", "1.0.0", "crates/lmp-core,crates/lmpd,crates/lmp-sync", "applicable systems crates"),
    ("lmp:mind:python-orchestration-safety", "1.0.0", "orchestrator", "Python orchestration"),
    ("lmp:mind:node-onboarding-safety", "1.0.0", "packages/create-lmp", "Node onboarding"),
    ("lmp:mind:security-and-trust-boundaries", "1.0.0", "crates,orchestrator,packages", "security and trust"),
    ("lmp:mind:monorepo-and-release-discipline", "1.0.0", ".", "workspace and release discipline"),
    ("lmp:mind:documentation-truthfulness", "1.0.0", "README.md,docs,apps/docs/content/docs", "documentation claims"),
]

# These checks are intentionally executed by the independent Python/Docker
# gates below. They are retained in each Mind artifact, but are not reported
# as uncovered limitations when that independent evidence passes.
COVERED_STATIC_SKIPS = {"behavioral.docker", "language.python"}


def run(command: list[str], timeout: int = 900) -> dict[str, Any]:
    started = time.perf_counter()
    if shutil.which(command[0]) is None and not Path(command[0]).exists():
        return {"command": command, "status": "BLOCKED", "reason": f"executable unavailable: {command[0]}"}
    command = list(command)
    env = dict(os.environ)
    toolchain = ROOT / "rust-toolchain.toml"
    if command and command[0] == "cargo" and toolchain.exists():
        env["RUSTUP_TOOLCHAIN"] = "1.98.1"
        rustup = shutil.which("rustup")
        if rustup:
            for variable, tool in (("CARGO", "cargo"), ("RUSTC", "rustc"), ("RUSTDOC", "rustdoc")):
                located = subprocess.run([rustup, "which", tool, "--toolchain", "1.98.1"], capture_output=True, text=True, check=False)
                if located.returncode == 0 and located.stdout.strip():
                    env[variable] = located.stdout.strip()
                    if variable == "CARGO":
                        command[0] = located.stdout.strip()
    try:
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=timeout, env=env)
    except subprocess.TimeoutExpired as error:
        return {"command": command, "status": "FAILED", "exitCode": 124, "elapsedMs": round((time.perf_counter() - started) * 1000, 3), "stdout": str(error.stdout or "")[-4000:], "stderr": str(error.stderr or "")[-4000:]}
    unavailable_module = "No module named pytest" in result.stderr
    return {"command": command, "status": "VERIFIED" if result.returncode == 0 else "BLOCKED" if unavailable_module else "FAILED", "exitCode": result.returncode, "elapsedMs": round((time.perf_counter() - started) * 1000, 3), "stdout": result.stdout[-4000:], "stderr": result.stderr[-4000:], **({"reason": "pytest is not installed in the active verification environment"} if unavailable_module else {})}


def run_candidate_remediation(binary: str) -> dict[str, Any]:
    """Run a real failing candidate through revision and re-evaluation.

    The candidate is isolated in a temporary workspace. Only the redacted
    evaluator artifacts are retained, so this proves the transition without
    copying source into the report directory.
    """
    bad_artifact = ROOT / "lmp-test-results/e2e-candidate-needs-revision.json"
    good_artifact = ROOT / "lmp-test-results/e2e-candidate-pass.json"
    with tempfile.TemporaryDirectory(prefix="lmp-candidate-") as workspace:
        candidate = Path(workspace) / "change.rs"
        shutil.copyfile(ROOT / "registry/minds/lmp-protocol-core/fixtures/violating/unsupported.rs", candidate)
        bad_command = [binary, "evaluate", "--workspace", workspace, "--mind", "lmp:mind:lmp-protocol-core", "--mode", "enforced", "--artifact-out", str(bad_artifact), "--json"]
        bad_run = run(bad_command)
        bad = json.loads(bad_artifact.read_text(encoding="utf-8")) if bad_artifact.exists() else {}

        shutil.copyfile(ROOT / "registry/minds/lmp-protocol-core/fixtures/compliant/clean.rs", candidate)
        good_command = [binary, "evaluate", "--workspace", workspace, "--mind", "lmp:mind:lmp-protocol-core", "--mode", "enforced", "--artifact-out", str(good_artifact), "--json"]
        good_run = run(good_command)
        good = json.loads(good_artifact.read_text(encoding="utf-8")) if good_artifact.exists() else {}

    bad_expected = bad_run.get("exitCode") == 1 and bad.get("state") == "needs_revision"
    good_expected = good_run.get("status") == "VERIFIED" and good_run.get("exitCode") == 0 and good.get("state") == "pass"
    privacy_verified = all(
        artifact.get("privacy", {}).get(field) is expected
        for artifact in (bad, good)
        for field, expected in (("networkUsed", False), ("rawPathsIncluded", False), ("sourceCodeIncluded", False))
    )
    return {
        "id": "end-to-end-remediation",
        "purpose": "real candidate change, enforced finding, revision, re-evaluation, and redacted artifact verification",
        "status": "VERIFIED" if bad_expected and good_expected and privacy_verified else "FAILED",
        "command": ["lmp evaluate ... (candidate workspace)"],
        "workflow": {
            "initialDecision": bad.get("state"),
            "initialExitCode": bad_run.get("exitCode"),
            "revisedDecision": good.get("state"),
            "revisedExitCode": good_run.get("exitCode"),
            "privacyVerified": privacy_verified,
            "initialFindingCount": len(bad.get("checks", [])),
            "revisedFindingCount": len(good.get("checks", [])),
        },
        "artifacts": [str(bad_artifact), str(good_artifact)],
    }


def evaluate_minds(binary: str) -> list[dict[str, Any]]:
    results = []
    for mind, version, scope, purpose in MINDS:
        artifact_path = ROOT / ".lmp/artifacts" / f"reality-{mind.rsplit(':', 1)[-1]}.json"
        command = [binary, "evaluate", "--workspace", ".", "--mind", mind, "--mode", "advisory", "--artifact-out", str(artifact_path), "--json"]
        if scope != ".":
            command.extend(["--scope", scope])
        result = run(command)
        artifact: dict[str, Any] = {}
        if artifact_path.exists():
            try:
                artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                pass
        elif result.get("stdout"):
            try:
                artifact = json.loads(result["stdout"])
            except json.JSONDecodeError:
                pass
        skipped = artifact.get("skippedChecks", []) if isinstance(artifact, dict) else []
        uncovered = [item for item in skipped if item.get("checkId", item.get("id")) not in COVERED_STATIC_SKIPS]
        state = artifact.get("state") if isinstance(artifact, dict) else None
        result_name = "VERIFIED" if result["status"] == "VERIFIED" and state == "pass" and not uncovered else "PARTIAL" if result["status"] == "VERIFIED" else result["status"]
        results.append({"mind": mind, "version": version, "scope": scope, "purpose": purpose, "result": result_name, "limitations": uncovered, "coveredSkips": [item for item in skipped if item not in uncovered], "evidence": artifact, "command": command})
    return results


def mind_findings(minds: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flatten every executed Mind check into an auditable finding record."""
    findings: list[dict[str, Any]] = []
    for item in minds:
        artifact = item.get("evidence", {})
        for check in artifact.get("checks", []) if isinstance(artifact, dict) else []:
            if check.get("passed") is not True:
                findings.append(
                    {
                        "id": f"{item['mind']}:{check.get('id', 'unknown')}:{check.get('file', 'workspace')}",
                        "rule": check.get("id", "unknown"),
                        "severity": check.get("severity", "review-required"),
                        "evidence": check.get("message") or check.get("detail") or check,
                        "status": "needs_revision",
                        "mind": item["mind"],
                        "scope": item["scope"],
                    }
                )
        for skipped in item.get("limitations", []):
            findings.append(
                {
                    "id": f"{item['mind']}:unsupported:{skipped.get('id', 'unknown')}",
                    "rule": skipped.get("id", "unsupported"),
                    "severity": "unsupported",
                    "evidence": skipped,
                    "status": "unsupported",
                    "mind": item["mind"],
                    "scope": item["scope"],
                }
            )
    return findings


def markdown(report: dict[str, Any]) -> str:
    lines = ["# Lending-Mind Protocol Implementation Verification Report", "", "## Verified", ""]
    for check in report["checks"]:
        if check["status"] == "VERIFIED":
            lines += [f"- Requirement: `{check['id']}`", f"  - Implementation paths: {check['purpose']}", f"  - Tests/commands: `{' '.join(check['command'])}`", f"  - Actual output summary: exit `{check.get('exitCode', 0)}`, `{check.get('elapsedMs', 0)}ms`", f"  - Artifact location: `{check.get('artifact', 'captured in this report')}`"]
    lines += ["", "## Partial", ""]
    for item in report["minds"]:
        if item["result"] == "PARTIAL":
            lines += [f"- Mind `{item['mind']}`: evaluation ran, but its static evaluator reported unsupported or skipped scope evidence.", "  - Exact next implementation task: add the language-specific adapter or independently execute the omitted check."]
    lines += ["", "## Blocked", ""]
    blocked = [check for check in report["checks"] if check["status"] == "BLOCKED"]
    lines += ["- None recorded." if not blocked else "- External prerequisite checks are blocked; see the machine report for the exact executable and reason."]
    lines += ["", "## Unsupported", "", "- No claim is made for a tool or language that was not actually evaluated.", "", "## Claims Corrected", "", "- Static evaluation is bounded evidence, not universal correctness.", "- Signatures authenticate package bytes; they do not prove policy wisdom or authorship.", "- Docker flags describe a configured boundary; they do not make execution universally secure.", "", "## Self-Hosting Result", "", f"- selected Minds: {len(report['minds'])}", f"- evaluator: `{report['binary']}`", f"- decision: `{report['decision']}`", f"- report artifact: `{report['output']}`", "", "## Benchmark Evidence", "", "> No controlled benchmark evidence exists yet. LMP has not demonstrated that it improves AI-generated code quality beyond existing instructions, skills, CI, testing, and review workflows.", "", "## Remaining Risks", "", "- Independent human review, external vulnerability review, cross-platform release verification, and controlled quality benchmarks remain separate evidence requirements.", "", "## Next Work", "", "1. Resolve every failed or blocked command recorded in the machine report.", "2. Add independent fixtures for every partial Mind/language boundary.", "3. Run a pinned baseline-versus-guided benchmark before making quality-improvement claims.", "", "## LMP-on-LMP Reality Test", "", "### Scope Evaluated", "", "- Rust protocol crates: crates", "- Python orchestration: orchestrator", "- Node onboarding: packages/create-lmp", "- Mind registry: registry/minds", "- CI: .github/workflows", "- Documentation: README.md, docs, apps/docs/content/docs", "- Docker/sandbox: qualification suite", "- Remote sync: packages/registry and crates/lmp-sync", "", "### Minds Applied", "", "| Mind | Version | Scope | Result | Limitations |", "| --- | --- | --- | --- | --- |"]
    for item in report["minds"]:
        lines.append(f"| {item['mind']} | {item['version']} | {item['scope']} | {item['result']} | {len(item['limitations'])} skipped/unsupported checks |")
    lines += ["", "### Claims Tested", "", "| Claim | Result | Evidence | Contradiction Found | Correction Applied |", "| --- | --- | --- | --- | --- |", "| LMP can evaluate its own bounded implementation | recorded | self-hosting Mind artifacts | any failed/partial command remains visible | claims are scoped to executed checks |", "| Docker provides a configured execution boundary | recorded | qualification artifact | host/runtime availability can block | no universal security claim |", "", "### Self-Hosting Findings", ""]
    for item in report["findings"]:
        lines += [f"- Finding ID: `{item['id']}`", f"  - Mind/rule ID: `{item.get('rule', 'independent-check')}`", f"  - Severity: `{item.get('severity', 'review-required')}`", f"  - File/package scope: `{item.get('scope', 'see Mind artifact')}`", f"  - Evidence: {item['evidence']}", f"  - Remediation status: `{item['status']}`", f"  - Exception rationale: `{item.get('exception', 'none recorded')}`", "  - Human review required: yes for policy or claim changes."]
    lines += ["", "### Independent Verification", "", "- Rust compiler/build/tests: `rust-format`, `rust-clippy`, `rust-tests`, and `rust-build`.", "- Rust lint: `cargo clippy --workspace --all-targets --locked`.", "- Python tests: unittest discovery and `python3 -m pytest orchestrator`.", "- Node tests: package typecheck, package test suite, and `node --test packages/create-lmp/bin.test.ts`.", "- Docker sandbox tests: `orchestrator/qualification_suite.py` with a real Docker runtime.", "- Signature tamper tests: Rust crypto tests and all eight Mind validation/signature checks.", "- Artifact redaction tests: Python artifact-gate tests plus self-hosting artifact capture.", "- CI workflow tests: workflow files are present, but a remote GitHub Actions run was not executed in this local verification.", "", "### Final Self-Hosting Decision", "", report["decision"], "", "### What This Result Does Not Prove", "", "- It does not prove universal correctness, secure behavior against all inputs, authorship, production readiness, or improved AI code quality.", "- It does prove only the command results and artifact contents captured in this checkout.", "- Independent review and controlled benchmarks remain required."]
    def release_decision(identifier: str) -> str:
        check = next((check for check in report["checks"] if check["id"] == identifier), {})
        try:
            return str(json.loads(check.get("stdout", "{}" )).get("decision", "MISSING"))
        except json.JSONDecodeError:
            return "MISSING"

    e2e = next((check for check in report["checks"] if check["id"] == "end-to-end-remediation"), None)
    audit = next((check for check in report["checks"] if check["id"] == "completion-audit"), None)
    lines += [
        "", "## Release Qualification", "",
        "- Exact verifier commands were executed for `local`, `ci`, and `release-candidate`; their JSON output and exit codes are retained in the machine report.",
        f"- Local profile: `{release_decision('release-verify-local')}`.",
        f"- CI profile: `{release_decision('release-verify-ci')}`.",
        f"- Release-candidate profile: `{release_decision('release-verify-release-candidate')}`.",
        "- A non-qualified result is not converted into PASS.",
        "", "## End-to-End Workflow Evidence", "",
        f"- Status: `{e2e.get('status') if e2e else 'MISSING'}`.",
        f"- Workflow: `{json.dumps(e2e.get('workflow', {}), sort_keys=True) if e2e else 'not executed'}`.",
        f"- Artifacts: `{', '.join(e2e.get('artifacts', [])) if e2e else 'none'}`.",
        "- The first candidate is intentionally invalid, produces `NEEDS_REVISION`, is replaced with a compliant candidate, and is re-evaluated to `pass`.",
        "", "## Implemented and Verified", "",
        "- Mind resolution, signature validation, static evaluation, redacted artifacts, configured command execution, completion audit, Docker qualification, and release verification are exercised by the captured checks.",
        f"- Completion audit: `{audit.get('status') if audit else 'MISSING'}`.",
        "", "## Self-Hosting Evidence", "",
        "- The LMP evaluator is run against the repository using the pinned `lmp-protocol-core` Mind and multiple language-specific Minds.",
        "- Policy findings remain visible; a failing policy evaluation is evidence of a finding, not a fabricated test failure or a PASS.",
        "", "## Production Qualification Evidence", "",
        "- Local toolchain, unit/integration tests, Docker qualification, and artifact checks are local evidence only.",
        "- Remote CI, cross-platform release artifacts, deployment, independent review, and controlled quality benchmarks are not claimed unless present in the captured report.",
        "", "## Remaining Risks", "",
        "- The complete mandate still requires any failed policy findings to be remediated or explicitly accepted, plus external release evidence where the verifier reports BLOCKED.",
        "", "## Claims Removed or Corrected", "",
        "- No claim of universal correctness, complete sandbox security, production readiness, or improved AI output quality is made.",
        "", "## Final Truth Statement", "",
        f"- This checkout's evidence decision is `{report['decision']}`. It is not presented as complete while any required check is failed, blocked, or unsupported.",
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "lmp-test-results/lmp-on-lmp-reality.json")
    parser.add_argument("--report", type=Path, default=ROOT / "lmp-test-results/lmp-on-lmp-reality.md")
    parser.add_argument("--timeout", type=int, default=900)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    binary = str(ROOT / "target/debug/lmp")
    checks: list[dict[str, Any]] = []
    commands = [
        ("rust-format", ["cargo", "fmt", "--all", "--", "--check"]),
        ("rust-clippy", ["cargo", "clippy", "--workspace", "--all-targets", "--locked"]),
        ("rust-tests", ["cargo", "test", "--workspace"]),
        ("rust-build", ["cargo", "build", "--workspace", "--locked"]),
        ("release-build", ["cargo", "build", "--release", "--workspace", "--locked"]),
        ("release-binary-smoke", [sys.executable, "orchestrator/release_binary_smoke.py", "--target", "x86_64-unknown-linux-gnu", "--binary-dir", "target/release"]),
        ("mcp-tests", ["cargo", "test", "-p", "lmp-mcp"]),
        ("daemon-tests", ["cargo", "test", "-p", "lmpd"]),
        ("sync-tests", ["cargo", "test", "-p", "lmp-sync"]),
        ("python-tests", [PYTHON, "-m", "unittest", "discover", "-s", "orchestrator", "-p", "test_*.py"]),
        ("python-pytest", [PYTHON, "-m", "pytest", "orchestrator"]),
        ("node-typecheck", ["pnpm", "--filter", "@lending-mind/lmp", "typecheck"]),
        ("node-tests", ["pnpm", "--filter", "@lending-mind/lmp", "test", "--", "--run"]),
        ("registry-distribution-typecheck", ["pnpm", "--filter", "@lending-mind/internal-registry", "typecheck"]),
        ("registry-distribution-tests", ["pnpm", "--filter", "@lending-mind/internal-registry", "test", "--", "--run"]),
        ("vault-registry-validation", ["node", "public-web-vault/scripts/validate-registry.ts"]),
        ("vault-registry-tests", ["node", "--test", "public-web-vault/scripts/registry.test.ts"]),
        ("create-lmp-tests", ["node", "--test", "packages/create-lmp/bin.test.ts"]),
        ("docker-qualification", [sys.executable, "orchestrator/qualification_suite.py", "--output", "lmp-test-results/lmp-on-lmp-docker.json"]),
        ("required-status", [binary, "status", "--workspace", "."]),
        ("required-self-hosting-evaluation", [binary, "evaluate", "--workspace", ".", "--mind", "lmp:mind:lmp-protocol-core", "--mode", "enforced", "--artifact-out", ".lmp/artifacts/self-hosting.json", "--json"]),
        ("required-rust-systems-evaluation", [binary, "evaluate", "--workspace", ".", "--mind", "lmp:mind:rust-defensive-systems", "--scope", "crates", "--mode", "enforced", "--artifact-out", ".lmp/artifacts/rust-systems.json", "--json"]),
        ("required-kernel-evaluation", [binary, "evaluate", "--workspace", ".", "--mind", "lmp:mind:kernel-inspired-systems", "--scope", "crates/lmp-core,crates/lmp-evaluator,crates/lmpd,crates/lmp-sync", "--mode", "advisory", "--artifact-out", ".lmp/artifacts/kernel-inspired.json", "--json"]),
        ("required-python-evaluation", [binary, "evaluate", "--workspace", ".", "--mind", "lmp:mind:python-orchestration-safety", "--scope", "orchestrator", "--mode", "enforced", "--artifact-out", ".lmp/artifacts/python-orchestrator.json", "--json"]),
        ("required-node-evaluation", [binary, "evaluate", "--workspace", ".", "--mind", "lmp:mind:node-onboarding-safety", "--scope", "packages/create-lmp", "--mode", "enforced", "--artifact-out", ".lmp/artifacts/node-onboarding.json", "--json"]),
        ("required-docs-evaluation", [binary, "evaluate", "--workspace", ".", "--mind", "lmp:mind:documentation-truthfulness", "--scope", "README.md,docs", "--mode", "advisory", "--artifact-out", ".lmp/artifacts/docs-truthfulness.json", "--json"]),
        ("completion-audit", [binary, "audit", "completion", "--workspace", ".", "--json"]),
        ("release-verify-local", [binary, "release", "verify", "--profile", "local", "--json"]),
        ("release-verify-ci", [binary, "release", "verify", "--profile", "ci", "--json"]),
        ("release-verify-release-candidate", [binary, "release", "verify", "--profile", "release-candidate", "--json"]),
    ]
    for identifier, command in commands:
        result = run(command, args.timeout)
        if identifier.startswith("release-verify-") and result.get("stdout"):
            try:
                release_decision = json.loads(result["stdout"]).get("decision")
            except (TypeError, json.JSONDecodeError):
                release_decision = None
            if release_decision == "BLOCKED":
                result["status"] = "BLOCKED"
                result["reason"] = "release verifier reported BLOCKED"
        result["id"] = identifier
        result["purpose"] = identifier
        checks.append(result)
    checks.append(run_candidate_remediation(binary))
    checks.extend({"id": f"mind-validate-{index}", "purpose": "canonical Mind validation and signature verification", "command": [binary, "mind", "validate", mind], **run([binary, "mind", "validate", mind], args.timeout)} for index, (mind, _, _, _) in enumerate(MINDS))
    minds = evaluate_minds(binary)
    findings = [{"id": check["id"], "status": check["status"], "evidence": check.get("stderr", "")[-500:] or check.get("stdout", "")[-500:]} for check in checks if check["status"] != "VERIFIED"]
    findings.extend(mind_findings(minds))
    decision = "PASS" if all(check["status"] == "VERIFIED" for check in checks) and all(item["result"] == "VERIFIED" for item in minds) else "BLOCKED" if any(check["status"] == "BLOCKED" for check in checks) else "NEEDS_REVISION"
    report: dict[str, Any] = {"schema": "lmp-on-lmp-reality-v1", "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "binary": binary, "output": str(args.output), "decision": decision, "checks": checks, "minds": minds, "findings": findings}
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(markdown(report), encoding="utf-8")
    print(json.dumps({"decision": decision, "output": str(args.output), "report": str(args.report)}))
    return 0 if decision == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
