#!/usr/bin/env python3
"""Ensure a release tag matches every product manifest.

Mind packages are deliberately excluded: a Mind has its own lifecycle and
version, while the tag describes the LMP runtime and tooling release.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TAG_PATTERN = re.compile(r"^v(?P<version>0\.\d+\.\d+)$")


def product_versions() -> list[tuple[Path, str]]:
    versions: list[tuple[Path, str]] = []
    for path in sorted((ROOT / "crates").glob("*/Cargo.toml")):
        text = path.read_text(encoding="utf-8")
        match = re.search(r'(?m)^version\s*=\s*"([^"]+)"', text)
        if match:
            versions.append((path, match.group(1)))

    for path in sorted(ROOT.rglob("package.json")):
        if (
            "node_modules" in path.parts
            or "test-fixtures" in path.parts
            or ".lmp-real-world-work" in path.parts
            or "lmp-test-results" in path.parts
        ):
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        name = data.get("name", "")
        if data.get("private") is True or name.startswith("@lending-mind/") or name == "create-lmp":
            if isinstance(data.get("version"), str):
                versions.append((path, data["version"]))
    return versions


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tag", help="release tag, for example v0.1.0")
    args = parser.parse_args()

    match = TAG_PATTERN.fullmatch(args.tag)
    if not match:
        print(f"release tag must be a pre-1.0 semantic version (v0.x.y): {args.tag}", file=sys.stderr)
        return 2

    expected = match.group("version")
    versions = product_versions()
    mismatches = [(str(path.relative_to(ROOT)), version) for path, version in versions if version != expected]
    if mismatches:
        print(json.dumps({"status": "blocked", "expected": expected, "mismatches": mismatches}, indent=2))
        return 1

    print(json.dumps({
        "status": "pass",
        "tag": args.tag,
        "productVersion": expected,
        "manifestCount": len(versions),
        "mindPackageVersions": "independent",
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
