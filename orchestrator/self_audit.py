#!/usr/bin/env python3
"""Run LMP's local self-governance evidence loop.

The report is deliberately fail-closed.  It distinguishes a failed check from
an unavailable prerequisite and never converts either into a release pass.
The checks are local and read-only apart from the requested JSON report.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "lmp-test-results" / "self-audit.json"
VERIFIED = "VERIFIED"
BLOCKED = "BLOCKED"
FAILED = "FAILED"


@dataclass(frozen=True)
class Check:
    id: str
    purpose: str
    command: tuple[str, ...]
    required: bool = True


def _tail(value: str, limit: int = 4000) -> str:
    if isinstance(value, bytes):
        value = value.decode(errors="replace")
    return value[-limit:].strip()


def run_check(check: Check, timeout: int) -> dict[str, object]:
    executable = shutil.which(check.command[0])
    if executable is None:
        return {
            "id": check.id,
            "purpose": check.purpose,
            "status": BLOCKED,
            "required": check.required,
            "command": list(check.command),
            "reason": f"required executable is unavailable: {check.command[0]}",
        }
    try:
        environment = {**os.environ, "CI": os.environ.get("CI", "1")}
        command = list(check.command)
        if check.command[0] == "cargo":
            environment.update(rust_toolchain_environment())
            command[0] = environment.get("CARGO", command[0])
        result = subprocess.run(
            command,
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=environment,
        )
    except subprocess.TimeoutExpired as error:
        return {
            "id": check.id,
            "purpose": check.purpose,
            "status": FAILED,
            "required": check.required,
            "command": list(check.command),
            "exitCode": 124,
            "reason": f"timed out after {timeout}s",
            "stdout": _tail(error.stdout or ""),
            "stderr": _tail(error.stderr or ""),
        }
    return {
        "id": check.id,
        "purpose": check.purpose,
        "status": VERIFIED if result.returncode == 0 else FAILED,
        "required": check.required,
        "command": list(check.command),
        "exitCode": result.returncode,
        "stdout": _tail(result.stdout),
        "stderr": _tail(result.stderr),
    }


def rust_toolchain_environment() -> dict[str, str]:
    """Make nested Cargo checks honor the repository's pinned toolchain."""
    toolchain_file = ROOT / "rust-toolchain.toml"
    channel = ""
    if toolchain_file.is_file():
        for line in toolchain_file.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("channel ="):
                channel = line.split("=", 1)[1].strip().strip('"')
                break
    if not channel or shutil.which("rustup") is None:
        return {}
    environment = {"RUSTUP_TOOLCHAIN": channel}
    for variable, component in (("CARGO", "cargo"), ("RUSTC", "rustc"), ("RUSTDOC", "rustdoc")):
        result = subprocess.run(
            ["rustup", "which", component, "--toolchain", channel],
            check=False,
            capture_output=True,
            text=True,
        )
        executable = result.stdout.strip()
        if result.returncode == 0 and executable:
            environment[variable] = executable
    return environment


def sandbox_policy_check() -> dict[str, object]:
    """Verify the actual Docker command, without starting a container."""
    try:
        from orchestrator.sandbox import DockerSandbox
    except ModuleNotFoundError:
        from sandbox import DockerSandbox

    with tempfile.TemporaryDirectory() as directory:
        command = DockerSandbox(directory).build_command(["true"])
    required = {
        "--network=none",
        "--read-only",
        "--cap-drop=ALL",
        "--pids-limit=128",
        "--cpus=2",
        "--memory=128m",
    }
    missing = sorted(required.difference(command))
    return {
        "id": "sandbox-policy",
        "purpose": "Confirm the configured execution boundary before runtime tests.",
        "status": VERIFIED if not missing else FAILED,
        "required": True,
        "command": command,
        "missingControls": missing,
        "runtimeStarted": False,
    }


def checks(include_self_evaluation: bool) -> list[Check]:
    result = [
        Check(
            "rust-tests",
            "Compile the Rust runtime and exercise AST, crypto, evaluator, daemon, and MCP tests.",
            ("cargo", "test", "--workspace"),
        ),
        Check(
            "python-tests",
            "Exercise the orchestration, sandbox, release, and artifact gates.",
            (sys.executable, "-m", "unittest", "discover", "-s", "orchestrator", "-p", "test_*.py"),
        ),
        Check(
            "cli-typecheck",
            "Compile the published TypeScript CLI surface used by npx lmp.",
            ("pnpm", "--filter", "@lending-mind/lmp", "typecheck"),
        ),
    ]
    if include_self_evaluation:
        result.append(
            Check(
                "self-evaluation",
                "Run the Rust evaluator against the repository's own core source in audit mode.",
                (
                    "cargo",
                    "run",
                    "--bin",
                    "lmp",
                    "--",
                    "evaluate",
                    "--mind",
                    "profiles/baseline",
                    "--workspace",
                    "crates/lmp-core",
                    "--mode",
                    "audit",
                    "--json",
                ),
            )
        )
    return result


def build_report(timeout: int, include_self_evaluation: bool) -> dict[str, object]:
    results = [sandbox_policy_check()]
    results.extend(run_check(check, timeout) for check in checks(include_self_evaluation))
    required = [item for item in results if item.get("required") is True]
    if any(item.get("status") == FAILED for item in required):
        status = FAILED
    elif any(item.get("status") == BLOCKED for item in required):
        status = BLOCKED
    else:
        status = VERIFIED
    return {
        "schema": "lmp-self-audit-v1",
        "status": status,
        "repository": str(ROOT),
        "revision": current_revision(),
        "checks": results,
        "claims": {
            "ast": "Rust parser and rule tests passed" if status == VERIFIED else "Only claim the AST checks represented by the passing results.",
            "signatures": "Ed25519 verification tests passed" if status == VERIFIED else "Do not claim signature verification until the crypto check passes.",
            "sandbox": "Docker policy flags were inspected; runtime isolation still requires the Docker qualification suite.",
            "bootstrapping": "The repository can be evaluated by its own Rust runtime only when the self-evaluation check passes.",
        },
        "limitations": [
            "A passing self-audit proves only the listed checks on this checkout and toolchain.",
            "It does not prove policy correctness, author identity, production readiness, or universal security.",
            "Docker execution is not started by this read-only audit; run the qualification suite for runtime evidence.",
        ],
    }


def current_revision() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        return None
    revision = result.stdout.strip()
    return revision if result.returncode == 0 and revision else None


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument(
        "--skip-self-evaluation",
        action="store_true",
        help="Skip the cargo self-evaluation when the Rust binary is not available yet.",
    )
    args = parser.parse_args(argv)
    if args.timeout < 1:
        parser.error("--timeout must be positive")
    report = build_report(args.timeout, not args.skip_self_evaluation)
    destination = args.output if args.output.is_absolute() else ROOT / args.output
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "output": str(destination)}))
    return 0 if report["status"] == VERIFIED else 1


if __name__ == "__main__":
    raise SystemExit(main())
