#!/usr/bin/env python3
"""Verify the cross-platform release archives before publishing them."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import tarfile
from pathlib import Path, PurePosixPath


TARGETS = (
    "x86_64-unknown-linux-gnu",
    "aarch64-apple-darwin",
    "x86_64-apple-darwin",
    "x86_64-pc-windows-msvc",
)
BINARY_NAMES = ("lmp", "lmpd", "lmp-mcp", "lmp-sync", "mind_signer")
SHA_LINE = re.compile(r"^([0-9a-fA-F]{64})\s+(?:\*?)([^\s]+)$")


def expected_members(target: str) -> set[str]:
    suffix = ".exe" if target.endswith("windows-msvc") else ""
    return {f"{name}-{target}{suffix}" for name in BINARY_NAMES}


def normalized_member(name: str) -> str:
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"unsafe archive member path: {name}")
    normalized = "/".join(part for part in path.parts if part not in ("", "."))
    if not normalized or "/" in normalized:
        raise ValueError(f"archive member must be a top-level file: {name}")
    return normalized


def parse_sums(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line:
            continue
        match = SHA_LINE.fullmatch(line)
        if not match:
            raise ValueError(f"invalid SHA256SUMS line {line_number}: {raw}")
        digest, filename = match.groups()
        if filename in result:
            raise ValueError(f"duplicate checksum entry: {filename}")
        result[filename] = digest.lower()
    return result


def verify_archive(path: Path, target: str, expected_digest: str) -> dict[str, object]:
    actual_digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual_digest != expected_digest:
        raise ValueError(f"checksum mismatch for {path.name}")

    expected = expected_members(target)
    seen: set[str] = set()
    with tarfile.open(path, "r:gz") as archive:
        for member in archive.getmembers():
            normalized = normalized_member(member.name)
            if normalized in seen:
                raise ValueError(f"duplicate archive member: {normalized}")
            seen.add(normalized)
            if not member.isfile() or member.issym() or member.islnk():
                raise ValueError(f"archive member is not a regular file: {member.name}")
            if member.size <= 0:
                raise ValueError(f"archive member is empty: {member.name}")

    missing = sorted(expected - seen)
    extra = sorted(seen - expected)
    if missing:
        raise ValueError(f"{path.name} is missing binaries: {', '.join(missing)}")
    if extra:
        raise ValueError(f"{path.name} contains unexpected files: {', '.join(extra)}")
    return {"target": target, "archive": path.name, "sha256": actual_digest, "members": sorted(seen)}


def verify_directory(directory: Path, targets: tuple[str, ...]) -> dict[str, object]:
    sums_path = directory / "SHA256SUMS"
    if not sums_path.is_file():
        raise ValueError("SHA256SUMS is missing")
    sums = parse_sums(sums_path)
    expected_archives = {f"lmp-{target}.tar.gz" for target in targets}
    if set(sums) != expected_archives:
        missing = sorted(expected_archives - set(sums))
        extra = sorted(set(sums) - expected_archives)
        details = []
        if missing:
            details.append(f"missing checksum entries: {', '.join(missing)}")
        if extra:
            details.append(f"unexpected checksum entries: {', '.join(extra)}")
        raise ValueError("; ".join(details))
    archives = {path.name for path in directory.glob("*.tar.gz")}
    if archives != expected_archives:
        raise ValueError(f"archive set does not match targets: {sorted(archives)}")
    results = [
        verify_archive(directory / f"lmp-{target}.tar.gz", target, sums[f"lmp-{target}.tar.gz"])
        for target in targets
    ]
    return {"status": "verified", "targets": results}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("--targets", nargs="+", default=list(TARGETS))
    args = parser.parse_args()
    try:
        result = verify_directory(args.directory, tuple(args.targets))
    except (OSError, ValueError, tarfile.TarError) as error:
        print(json.dumps({"status": "blocked", "error": str(error)}, indent=2))
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
