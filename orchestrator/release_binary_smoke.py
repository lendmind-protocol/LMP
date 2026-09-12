#!/usr/bin/env python3
"""Run a native smoke check for every binary included in a release archive."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path


BINARY_NAMES = ("lmp", "lmpd", "lmp-mcp", "lmp-sync", "mind_signer")
PROBES = {
    "lmp": ("--version",),
    "lmpd": ("--version",),
    "lmp-mcp": ("--help",),
    "lmp-sync": ("--version",),
    "mind_signer": ("--help",),
}


def smoke(binary_dir: Path, target: str) -> dict[str, object]:
    suffix = ".exe" if target.endswith("windows-msvc") else ""
    results: list[dict[str, object]] = []
    for name in BINARY_NAMES:
        path = binary_dir / f"{name}{suffix}"
        if not path.is_file() or path.is_symlink() or not path.stat().st_size:
            raise ValueError(f"missing, empty, or symlinked release binary: {path}")
        completed = subprocess.run(
            [str(path), *PROBES[name]],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
            env={**os.environ, "LMP_NETWORK": "offline"},
        )
        if completed.returncode != 0:
            raise ValueError(
                f"{name} probe failed with exit code {completed.returncode}: "
                f"{completed.stderr.strip()}"
            )
        output = (completed.stdout or completed.stderr).strip()
        if not output:
            raise ValueError(f"{name} probe returned no output")
        results.append({"name": name, "path": str(path), "version": output})
    return {"status": "verified", "target": target, "binaries": results}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    parser.add_argument("--binary-dir", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        report = smoke(args.binary_dir, args.target)
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(json.dumps({"status": "blocked", "target": args.target, "error": str(error)}, sort_keys=True))
        return 1
    print(json.dumps(report, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
