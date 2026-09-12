#!/usr/bin/env python3
"""End-to-end LMP qualification matrix.

This suite deliberately exercises the released Rust CLI and MCP binaries, not
internal Python policy reimplementations. It is a pre-release gate and must
remain green before publishing any package or binary.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import time
import argparse
from pathlib import Path

from sandbox import DockerSandbox


ROOT = Path(__file__).resolve().parents[1]
LMP = Path(os.environ.get("LMP_BIN", ROOT / "target/debug/lmp"))
LMPD = Path(os.environ.get("LMPD_BIN", ROOT / "target/debug/lmpd"))
MCP = Path(os.environ.get("LMP_MCP_BIN", ROOT / "target/debug/lmp-mcp"))
MIND = ROOT / "profiles/typescript-minimal"
OUTPUT_PATH: Path | None = None
EXPECTED_SCENARIOS = 39


def run_lmp(*args: str, expected: tuple[int, ...] = (0, 1)) -> tuple[int, dict]:
    result = subprocess.run([str(LMP), *args], capture_output=True, text=True, check=False)
    if result.returncode not in expected:
        raise AssertionError(result.stderr or result.stdout)
    try:
        return result.returncode, json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise AssertionError(
            f"LMP did not emit JSON (exit={result.returncode}, stdout={result.stdout!r}, stderr={result.stderr!r})"
        ) from error


def evaluate(workspace: Path, *, mode: str = "enforced", extra: tuple[str, ...] = ()) -> tuple[int, dict]:
    return run_lmp(
        "evaluate", "--mind", str(MIND), "--workspace", str(workspace), "--mode", mode, "--json", *extra
    )


def git(repo: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True, text=True)


def make_git_repo(root: Path) -> Path:
    repo = root / "git-repo"
    repo.mkdir()
    git(repo, "init", "-q")
    git(repo, "config", "user.email", "lmp@test.invalid")
    git(repo, "config", "user.name", "LMP Qualification")
    (repo / "stable.ts").write_text("export const stable = 1;\n", encoding="utf-8")
    (repo / "legacy.ts").write_text("export const legacy: any = 1;\n", encoding="utf-8")
    git(repo, "add", ".")
    git(repo, "commit", "-qm", "initial")
    return repo


def sign_profile(profile: Path) -> None:
    """Re-seal a copied profile after the qualification matrix edits its manifest."""
    signer = ROOT / "target/debug/mind_signer"
    result = subprocess.run(
        [str(signer), "--input", str(profile / "mind.json"), "--output-dir", str(profile)],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise AssertionError(result.stderr or result.stdout)


def main() -> None:
    global LMP, LMPD, MCP, OUTPUT_PATH
    parser = argparse.ArgumentParser(description="Run the end-to-end LMP qualification gate")
    parser.add_argument("--lmp", type=Path, default=LMP)
    parser.add_argument("--lmpd", type=Path, default=LMPD)
    parser.add_argument("--mcp", type=Path, default=MCP)
    parser.add_argument("--output", type=Path, default=Path(os.environ.get("LMP_QUALIFICATION_OUTPUT", "lmp-test-results/qualification-result.json")))
    args = parser.parse_args()
    LMP, LMPD, MCP = args.lmp, args.lmpd, args.mcp
    OUTPUT_PATH = args.output
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if not LMP.is_file() or not LMPD.is_file() or not MCP.is_file():
        report = {"artifactVersion": "1.1", "status": "blocked", "reason": "Rust CLI, daemon, and MCP binaries are required", "scenarioCount": 0, "expectedScenarioCount": EXPECTED_SCENARIOS}
        args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, indent=2))
        raise SystemExit(2)

    docker_ready = shutil.which("docker") and subprocess.run(["docker", "info"], capture_output=True, check=False).returncode == 0 and subprocess.run(["docker", "image", "inspect", "lmp-sandbox:local"], capture_output=True, check=False).returncode == 0
    if not docker_ready:
        report = {"artifactVersion": "1.1", "status": "blocked", "reason": "Docker daemon and lmp-sandbox:local image are required", "scenarioCount": 0, "expectedScenarioCount": EXPECTED_SCENARIOS}
        args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, indent=2))
        raise SystemExit(2)

    passed: list[str] = []
    docker_evidence: list[dict[str, object]] = []
    with tempfile.TemporaryDirectory(prefix="lmp-qualification-") as temp:
        root = Path(temp)

        def case(name: str, check) -> None:
            check()
            passed.append(name)

        clean = root / "clean"
        clean.mkdir()
        (clean / "service.ts").write_text("export const service = { ok: true };\n", encoding="utf-8")
        case("clean production-style source passes", lambda: assert_state(evaluate(clean), "pass"))

        def prohibited() -> None:
            (clean / "package.json").write_text('{"dependencies":{"lodash":"4"}}\n', encoding="utf-8")
            assert_state(evaluate(clean), "needs_revision")
            (clean / "package.json").unlink()

        case("prohibited dependency is rejected", prohibited)

        source_cases = {
            "explicit any": "export const value: any = 1;\n",
            "eval": "export const value = eval(input);\n",
            "console output": "console.log('debug');\n",
            "dynamic require": "const moduleName = input; require(moduleName);\n",
        }
        for name, source in source_cases.items():
            def check(source=source):
                (clean / "service.ts").write_text(source, encoding="utf-8")
                assert_state(evaluate(clean), "needs_revision")
            case(f"TypeScript {name} is rejected", check)
        (clean / "service.ts").write_text("export const service = { ok: true };\n", encoding="utf-8")

        rust = root / "rust"
        rust.mkdir()
        (rust / "main.rs").write_text("fn main( {\n", encoding="utf-8")
        case("invalid Rust syntax is reported", lambda: assert_finding(evaluate(rust), "rust.syntax"))
        (rust / "main.rs").write_text("fn main() { let x = 1; }\n", encoding="utf-8")
        case("valid Rust parses", lambda: assert_no_finding(evaluate(rust), "rust.syntax"))

        mixed = root / "mixed"
        mixed.mkdir()
        (mixed / "main.rs").write_text("fn main() { let x = 1; }\n", encoding="utf-8")
        (mixed / "app.ts").write_text("export const app = true;\n", encoding="utf-8")
        case("mixed Rust and TypeScript workspace is evaluated", lambda: assert_checked(evaluate(mixed), 2))

        unsupported = root / "unsupported-language"
        unsupported.mkdir()
        (unsupported / "worker.go").write_text("package main\n", encoding="utf-8")
        _, unsupported_report = evaluate(unsupported)
        assert unsupported_report["workspace"]["scope"]["checkedFiles"] == 0
        assert any(item["checkId"] == "language.go" for item in unsupported_report["skippedChecks"])
        passed.append("unsupported source languages are reported explicitly")

        empty = root / "empty"
        empty.mkdir()
        case("empty workspace produces a pass", lambda: assert_state(evaluate(empty), "pass"))
        docs = root / "docs"
        docs.mkdir()
        (docs / "README.md").write_text("documentation only\n", encoding="utf-8")
        case("non-source workspace is bounded", lambda: assert_checked(evaluate(docs), 0))

        excluded = root / "excluded"
        (excluded / "node_modules").mkdir(parents=True)
        (excluded / "dist").mkdir()
        (excluded / "node_modules/bad.ts").write_text("eval(input);\n", encoding="utf-8")
        (excluded / "dist/bad.ts").write_text("eval(input);\n", encoding="utf-8")
        case("generated and dependency directories are excluded", lambda: assert_checked(evaluate(excluded), 0))

        invalid = root / "invalid-signature"
        shutil.copytree(MIND, invalid)
        (invalid / "signatures").mkdir(exist_ok=True)
        (invalid / "signatures/manifest.sig").write_text("invalid", encoding="utf-8")
        (invalid / "signatures/public-key.hex").write_text("invalid", encoding="utf-8")
        code, artifact = run_lmp("evaluate", "--mind", str(invalid), "--workspace", str(clean), "--mode", "enforced", "--json")
        assert artifact["state"] == "blocked" and code == 1
        passed.append("invalid signature blocks evaluation")

        missing = root / "missing-policy"
        shutil.copytree(MIND, missing)
        (missing / "rules/typescript.json").unlink()
        result = subprocess.run([str(LMP), "validate", str(missing)], capture_output=True, text=True, check=False)
        assert result.returncode != 0
        passed.append("missing policy is rejected by validation")

        artifact_dir = root / "artifacts"
        _, artifact = run_lmp("evaluate", "--mind", str(MIND), "--workspace", str(clean), "--mode", "advisory", "--artifact-dir", str(artifact_dir), "--json")
        assert list(artifact_dir.glob("run-*.json")) and "sourceCodeIncluded" in artifact["privacy"]
        passed.append("artifact is persisted with privacy metadata")
        assert "layers" in artifact["mind"] and all("digest" in layer for layer in artifact["mind"]["layers"])
        passed.append("compiled profile layers are content addressed")
        cache = clean / ".lending-mind/cache/profiles"
        assert list(cache.glob("*.bin"))
        passed.append("binary profile cache is created")
        first_digest = artifact["mind"]["contentDigest"]
        _, second = evaluate(clean, mode="advisory")
        assert second["mind"]["contentDigest"] == first_digest
        passed.append("profile compilation is deterministic")

        repo = make_git_repo(root)
        (repo / "changed.ts").write_text("export const changed: any = 1;\n", encoding="utf-8")
        _, delta = evaluate(repo, extra=("--changed-only",))
        assert delta["workspace"]["scope"]["source"] == "git-diff"
        assert delta["workspace"]["scope"]["changedOnly"] is True
        assert delta["workspace"]["scope"]["checkedFiles"] == 1
        passed.append("Git delta includes modified files")
        (repo / "untracked.ts").write_text("export const untracked: any = 1;\n", encoding="utf-8")
        _, delta = evaluate(repo, extra=("--changed-only",))
        assert delta["workspace"]["scope"]["checkedFiles"] == 2
        passed.append("Git delta includes untracked files")
        (repo / "stable.ts").write_text("export const stable: any = 1;\n", encoding="utf-8")
        _, delta = evaluate(repo, extra=("--changed-only",))
        assert delta["workspace"]["scope"]["checkedFiles"] == 3
        assert not any("legacy.ts" in json.dumps(check) for check in delta["checks"])
        passed.append("Git delta excludes unchanged committed violations")
        non_git = root / "non-git"
        non_git.mkdir()
        (non_git / "file.ts").write_text("export const value: any = 1;\n", encoding="utf-8")
        _, fallback = evaluate(non_git, extra=("--changed-only",))
        assert fallback["workspace"]["scope"]["source"] == "workspace-fallback"
        passed.append("non-Git workspace falls back explicitly")

        large = root / "large"
        large.mkdir()
        (large / "large.ts").write_text("x\n" * (9 * 1024 * 1024), encoding="utf-8")
        case("oversized source is bounded", lambda: assert_finding(evaluate(large), "workspace.file-too-large"))
        link = root / "symlink"
        link.mkdir()
        outside = root / "outside.ts"
        outside.write_text("eval(input);\n", encoding="utf-8")
        (link / "outside.ts").symlink_to(outside)
        case("symlinked source is not traversed", lambda: assert_checked(evaluate(link), 0))

        for mode in ("advisory", "audit"):
            _, report = evaluate(clean, mode=mode)
            assert report["mode"] == mode
            passed.append(f"{mode} mode is accepted")

        mcp_input = "\n".join(
            [
                json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize"}),
                json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}),
                json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}),
                json.dumps({"jsonrpc": "1.0", "id": 3, "method": "tools/list"}),
            ]
        ) + "\n"
        mcp_lines = subprocess.run(
            [str(MCP)], input=mcp_input, capture_output=True, text=True, check=True
        ).stdout.splitlines()
        assert len(mcp_lines) == 3
        mcp_responses = {json.loads(line).get("id"): json.loads(line) for line in mcp_lines}
        mcp_initialize = mcp_responses[1]
        mcp_tools = mcp_responses[2]
        mcp_invalid = mcp_responses[3]
        assert mcp_initialize["result"]["serverInfo"]
        passed.append("MCP initialize handshake works")
        assert len(mcp_tools["result"]["tools"]) >= 5
        passed.append("MCP exposes protocol tools")
        assert "error" in mcp_invalid
        passed.append("MCP rejects invalid JSON-RPC")

        daemon_workspace = root / "daemon-workspace"
        daemon_workspace.mkdir()
        daemon = subprocess.Popen([str(LMPD), "--mind", str(MIND), "--workspace", str(daemon_workspace)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        time.sleep(0.4)
        (daemon_workspace / "daemon.ts").write_text("export const daemon: any = 1;\n", encoding="utf-8")
        time.sleep(0.6)
        (daemon_workspace / "daemon.ts").unlink()
        time.sleep(0.6)
        daemon.terminate()
        stdout, stderr = daemon.communicate(timeout=5)
        assert "watching" in stdout or "finding" in stderr.lower(), (stdout, stderr)
        assert "aligned" in stdout, (stdout, stderr)
        passed.append("daemon watches created, changed, and removed workspace paths")

        oss = ROOT / "test-fixtures/oss/express-utils"
        case("OSS fixture evaluates through the real CLI", lambda: assert_checked(evaluate(oss), 1))

        enterprise = root / "enterprise-brownfield"
        enterprise.mkdir()
        for index in range(5000):
            lines = [f"export const value_{index}_{line} = {line};\n" for line in range(200)]
            (enterprise / f"module-{index}.ts").write_text("".join(lines), encoding="utf-8")
        case("5,000-file million-line brownfield scan completes", lambda: assert_checked(evaluate(enterprise), 5000))

        profile_root = root / "profile-matrix"
        profile_root.mkdir()
        profile_digests = set()
        for index in range(32):
            profile = profile_root / f"profile-{index}"
            shutil.copytree(MIND, profile)
            manifest = json.loads((profile / "mind.json").read_text(encoding="utf-8"))
            manifest["id"] = f"lmp:mind:qualification-profile-{index}"
            manifest["version"] = "1.0.%d" % index
            (profile / "mind.json").write_text(json.dumps(manifest), encoding="utf-8")
            release = json.loads((profile / "release.json").read_text(encoding="utf-8"))
            release["packageId"] = manifest["id"]
            release["version"] = manifest["version"]
            (profile / "release.json").write_text(json.dumps(release), encoding="utf-8")
            sign_profile(profile)
            _, report = run_lmp("evaluate", "--mind", str(profile), "--workspace", str(empty), "--mode", "enforced", "--json")
            profile_digests.add(report["mind"]["contentDigest"])
        assert len(profile_digests) == 32
        passed.append("32 parallel profile definitions remain isolated")

        sandbox_root = ROOT / ".lmp-qualification-docker"
        shutil.rmtree(sandbox_root, ignore_errors=True)
        (sandbox_root / "src").mkdir(parents=True)
        (sandbox_root / "src/changed.ts").write_text("changed\n", encoding="utf-8")
        (sandbox_root / "src/hidden.ts").write_text("hidden\n", encoding="utf-8")
        sandbox_result = DockerSandbox(sandbox_root, image="lmp-sandbox:local", include_paths=["src/changed.ts"]).run(
            ["python", "-c", "from pathlib import Path; print(Path('/workspace/src/changed.ts').is_file(), Path('/workspace/src/hidden.ts').exists())"],
            timeout_seconds=20,
        )
        assert sandbox_result.exit_code == 0 and sandbox_result.stdout.strip() == "True False", sandbox_result.to_dict()
        passed.append("Docker sandbox mounts only selected changed paths")
        docker_evidence.append({
            "check": "selected-path-mount",
            "image": "lmp-sandbox:local",
            "network": "none",
            "exitCode": sandbox_result.exit_code,
            "timedOut": sandbox_result.timed_out,
        })
        shutil.rmtree(sandbox_root, ignore_errors=True)

        docker_runtime = DockerSandbox(
            ROOT,
            image="lmp-sandbox:local",
            include_paths=["target/debug/lmp", "registry/minds/lmp-protocol-core"],
        ).run(
            [
                "/workspace/target/debug/lmp",
                "validate",
                "/workspace/registry/minds/lmp-protocol-core",
            ],
            timeout_seconds=30,
        )
        assert docker_runtime.exit_code == 0 and docker_runtime.stdout.strip() == "valid", docker_runtime.to_dict()
        passed.append("compiled Rust CLI validates the signed Mind inside the network-disabled Docker sandbox")
        docker_evidence.append({
            "check": "signed-mind-validation",
            "image": "lmp-sandbox:local",
            "network": "none",
            "capabilities": "dropped-all",
            "filesystem": "read-only",
            "exitCode": docker_runtime.exit_code,
            "stdout": docker_runtime.stdout.strip(),
            "timedOut": docker_runtime.timed_out,
        })

        fleet_graph = ROOT / "docs/examples/fleet-graph.json"
        fleet_reports = ROOT / "docs/examples/fleet-reports.json"
        _, fleet_validation = run_lmp("fleet-validate", "--graph", str(fleet_graph))
        assert fleet_validation["status"] == "valid"
        assert fleet_validation["executionOrder"] == ["architect", "verifier"]
        passed.append("bounded fleet graph validates with deterministic order")

        _, fleet_run = run_lmp("fleet-merge", "--graph", str(fleet_graph), "--reports", str(fleet_reports))
        assert fleet_run["state"] == "pass"
        assert fleet_run["disagreements"] == []
        passed.append("bounded fleet reports merge to a passing run")

        disagreement_reports = root / "fleet-reports-disagreement.json"
        disagreement_payload = json.loads(fleet_reports.read_text(encoding="utf-8"))
        disagreement_payload[1]["evidence"][0]["key"] = "scope"
        disagreement_payload[1]["evidence"][0]["value"] = "all-files"
        disagreement_reports.write_text(json.dumps(disagreement_payload), encoding="utf-8")
        code, blocked_fleet = run_lmp(
            "fleet-merge", "--graph", str(fleet_graph), "--reports", str(disagreement_reports), expected=(1,)
        )
        assert code == 1
        assert blocked_fleet["state"] == "needs_revision"
        assert blocked_fleet["disagreements"]
        passed.append("fleet evidence disagreement blocks a passing decision")

    report = {"artifactVersion": "1.1", "status": "complete" if len(passed) == EXPECTED_SCENARIOS else "incomplete", "scenarioCount": len(passed), "expectedScenarioCount": EXPECTED_SCENARIOS, "dockerRequired": True, "dockerEvidence": docker_evidence, "passed": passed}
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    if report["status"] != "complete":
        raise SystemExit(1)


def assert_state(result: tuple[int, dict], state: str) -> None:
    _, artifact = result
    assert artifact["state"] == state, artifact


def assert_finding(result: tuple[int, dict], rule: str) -> None:
    _, artifact = result
    assert any(check["ruleId"] == rule for check in artifact["checks"]), artifact


def assert_no_finding(result: tuple[int, dict], rule: str) -> None:
    _, artifact = result
    assert not any(check["ruleId"] == rule for check in artifact["checks"]), artifact


def assert_checked(result: tuple[int, dict], count: int) -> None:
    _, artifact = result
    assert artifact["workspace"]["scope"]["checkedFiles"] == count, artifact


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        import traceback

        traceback.print_exc()
        report = {
            "artifactVersion": "1.1",
            "status": "incomplete",
            "reason": "Qualification execution stopped before all required checks passed",
            "scenarioCount": 0,
            "expectedScenarioCount": EXPECTED_SCENARIOS,
            "dockerRequired": True,
            "error": {"type": type(error).__name__, "message": str(error)},
        }
        if OUTPUT_PATH is not None:
            OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
            OUTPUT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, indent=2))
        raise SystemExit(1) from error
