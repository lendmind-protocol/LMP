#!/usr/bin/env python3
"""Package one Rust target's five release binaries into a verified-safe archive."""

from __future__ import annotations

import argparse
import gzip
import json
import tarfile
from pathlib import Path

BINARY_NAMES = ("lmp", "lmpd", "lmp-mcp", "lmp-sync", "mind_signer")


def package_target(target: str, binary_dir: Path, output_dir: Path) -> Path:
    suffix = ".exe" if target.endswith("windows-msvc") else ""
    output_dir.mkdir(parents=True, exist_ok=True)
    archive_path = output_dir / f"lmp-{target}.tar.gz"
    inputs: list[tuple[Path, str]] = []
    for name in BINARY_NAMES:
        source = binary_dir / f"{name}{suffix}"
        if not source.is_file() or source.is_symlink() or not source.stat().st_size:
            raise ValueError(f"missing, empty, or symlinked release binary: {source}")
        inputs.append((source, f"{name}-{target}{suffix}"))
    # Normalize archive metadata so the same binaries produce the same bytes
    # regardless of the runner filesystem, user, or packaging timestamp.
    with archive_path.open("wb") as output, gzip.GzipFile(fileobj=output, mode="wb", mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w") as archive:
            for source, member_name in inputs:
                stat = source.stat()
                member = tarfile.TarInfo(member_name)
                member.size = stat.st_size
                member.mode = stat.st_mode & 0o777
                member.mtime = 0
                member.uid = 0
                member.gid = 0
                member.uname = ""
                member.gname = ""
                with source.open("rb") as payload:
                    archive.addfile(member, payload)
    return archive_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    parser.add_argument("--binary-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        archive = package_target(args.target, args.binary_dir, args.output_dir)
    except (OSError, ValueError, tarfile.TarError) as error:
        print(json.dumps({"status": "blocked", "error": str(error)}, sort_keys=True))
        return 1
    print(json.dumps({"status": "packaged", "target": args.target, "archive": str(archive)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
