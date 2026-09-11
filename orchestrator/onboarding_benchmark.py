#!/usr/bin/env python3
"""Measure the real create-lmp bootstrap path in isolated workspaces.

The measurement is deliberately host-qualified: process startup, filesystem
and Node runtime performance vary by machine.  The gate is still fail-closed
for the stated launch target, and the JSON artifact records both cases so a
release cannot silently measure only the easier greenfield path.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import tempfile
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BOOTSTRAPPER = ROOT / "packages" / "create-lmp" / "bin.js"
TARGET_MS = 3_000


def run_case(strategy: str, workspace: Path) -> dict[str, object]:
    if strategy == "brownfield":
        workspace.mkdir(parents=True, exist_ok=True)
        (workspace / "package.json").write_text("{}\n", encoding="utf-8")

    command = [
        "node",
        str(BOOTSTRAPPER),
        "--yes",
        "--agent",
        "cursor",
        "--mind",
        "tj-ponytail",
        "--stack",
        "typescript-node",
        "--strategy",
        strategy,
        str(workspace),
    ]
    environment = {
        **os.environ,
        "NO_COLOR": "1",
        "LMP_DISABLE_RUNTIME_DOWNLOAD": "1",
    }
    started = time.perf_counter_ns()
    result = subprocess.run(
        command,
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    elapsed_ms = round((time.perf_counter_ns() - started) / 1_000_000, 3)
    output = (result.stdout + result.stderr).strip()
    return {
        "strategy": strategy,
        "status": "pass" if result.returncode == 0 else "blocked",
        "exitCode": result.returncode,
        "elapsedMs": elapsed_ms,
        "workspaceState": "brownfield" if strategy == "brownfield" else "greenfield",
        "detail": output[-2000:] if result.returncode else None,
    }


def benchmark(max_ms: float) -> dict[str, object]:
    if not BOOTSTRAPPER.is_file():
        raise FileNotFoundError(f"bootstrapper not found: {BOOTSTRAPPER}")

    with tempfile.TemporaryDirectory(prefix="lmp-onboarding-benchmark-") as temporary:
        root = Path(temporary)
        cases = [
            run_case("greenfield", root / "greenfield-project"),
            run_case("brownfield", root / "brownfield-project"),
        ]

    for case in cases:
        if case["status"] != "pass":
            continue
        if float(case["elapsedMs"]) > max_ms:
            case["status"] = "blocked"
            case["detail"] = f"elapsed time exceeded target {max_ms:g} ms"

    return {
        "artifactVersion": "1.0",
        "benchmark": "lmp-create-onboarding",
        "status": "complete" if all(case["status"] == "pass" for case in cases) else "blocked",
        "targetMs": max_ms,
        "cases": cases,
        "nodeVersion": subprocess.check_output(["node", "--version"], text=True).strip(),
        "platform": platform.platform(),
        "machine": platform.machine(),
        "source": "packages/create-lmp/bin.js",
        "network": "disabled",
        "privacy": {"sourceCodeIncluded": False, "secretsIncluded": False},
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-ms", type=float, default=TARGET_MS)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = benchmark(args.max_ms)
    serialized = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized, encoding="utf-8")
    print(serialized, end="")
    return 0 if report["status"] == "complete" else 2


if __name__ == "__main__":
    raise SystemExit(main())
