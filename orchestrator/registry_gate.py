#!/usr/bin/env python3
"""Validate registry pull-request packages without executing PR contents.

The workflow builds the Rust validator from the trusted base checkout. This
script only treats the candidate commit as data: it archives package files,
checks their shape, and passes the extracted package to the Rust validator.
Flat JSON files are rejected so every accepted registry entry has an explicit
manifest, policy layers, provenance, and detached Ed25519 signature.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PREFIX = "registry/definitions/"
REQUIRED_FILES = (
    "mind.json",
    "guidance.md",
    "evidence.json",
    "release.json",
    "evidence/README.md",
    "rules/manifest.json",
    "signatures/manifest.sig",
    "signatures/public-key.hex",
)


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True
    )
    return result.stdout


def changed_paths(base: str, head: str) -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--name-status", base, head, "--", "registry/definitions/"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    paths: list[str] = []
    for line in result.stdout.splitlines():
        status, _, path = line.partition("\t")
        if status.startswith("R"):
            _, _, renamed = path.partition("\t")
            paths.extend([path, renamed])
        elif path:
            if status.startswith("D"):
                raise ValueError(f"registry deletion requires maintainer review: {path}")
            paths.append(path)
    return paths


def package_name(path: str) -> str:
    if not path.startswith(REGISTRY_PREFIX):
        raise ValueError(f"unexpected registry path: {path}")
    remainder = path.removeprefix(REGISTRY_PREFIX)
    parts = PurePosixPath(remainder).parts
    if len(parts) == 1 and parts[0].rsplit(".", 1)[-1] in {"json", "sig", "pub"}:
        return f"flat:{parts[0].rsplit('.', 1)[0]}"
    if len(parts) < 2 or parts[1] == "":
        raise ValueError(
            f"{path}: flat registry JSON is not accepted; use "
            "registry/definitions/<name>/mind.json"
        )
    return parts[0]


def extract_package(head: str, name: str, destination: Path) -> None:
    prefix = f"registry/definitions/{name}/"
    archive = subprocess.run(
        ["git", "archive", head, prefix], cwd=ROOT, check=True, capture_output=True
    ).stdout
    with tempfile.NamedTemporaryFile() as archive_file:
        archive_file.write(archive)
        archive_file.flush()
        with tarfile.open(archive_file.name) as tar:
            extract_tar_package(tar, name, destination)


def extract_tar_package(tar: tarfile.TarFile, name: str, destination: Path) -> None:
    """Safely materialize one canonical package without trusting archive paths."""
    members = tar.getmembers()
    root = f"registry/definitions/{name}"
    for member in members:
        try:
            relative = PurePosixPath(member.name).relative_to(root)
        except ValueError as error:
            raise ValueError(f"archive member is outside package {name}: {member.name}") from error
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError(f"unsafe archive member: {member.name}")
        if member.issym() or member.islnk():
            raise ValueError(f"symlinks are not allowed in registry packages: {member.name}")
        if not (member.isdir() or member.isfile()):
            raise ValueError(f"unsupported archive member: {member.name}")
    for member in members:
        relative = PurePosixPath(member.name).relative_to(root)
        if not relative.parts:
            continue
        target = destination.joinpath(*relative.parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        if member.isfile():
            source = tar.extractfile(member)
            if source is None:
                raise ValueError(f"unable to read archive member: {member.name}")
            target.write_bytes(source.read())


def extract_flat_package(head: str, filename: str, destination: Path) -> None:
    """Materialize the legacy flat mapping as a package for Rust validation."""
    package = destination / filename
    package.mkdir()
    for suffix in ("json", "sig", "pub"):
        source = f"registry/definitions/{filename}.{suffix}"
        result = subprocess.run(
            ["git", "show", f"{head}:{source}"],
            cwd=ROOT,
            check=False,
            capture_output=True,
        )
        if result.returncode != 0:
            raise ValueError(f"{source}: missing detached registry asset")
        if suffix == "json":
            (package / "package.json").write_bytes(result.stdout)
        else:
            (package / "signatures").mkdir(exist_ok=True)
            target = "manifest.sig" if suffix == "sig" else "public-key.hex"
            (package / "signatures" / target).write_bytes(result.stdout)


def run_validator(binary: Path, command: str, package: Path) -> str:
    result = subprocess.run(
        [str(binary), command, str(package)],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise ValueError(result.stderr.strip() or result.stdout.strip() or f"lmp {command} failed")
    return result.stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", required=True)
    parser.add_argument("--lmp", default=os.environ.get("LMP_BIN", "target/debug/lmp"))
    args = parser.parse_args()
    binary = Path(args.lmp)
    if not binary.is_file():
        raise ValueError(f"Rust validator not found: {binary}")

    paths = changed_paths(args.base, args.head)
    if not paths:
        raise ValueError("no registry definition changes were found")
    packages = sorted({package_name(path) for path in paths})
    results: list[dict[str, str]] = []
    with tempfile.TemporaryDirectory(prefix="lmp-registry-gate-") as temporary:
        root = Path(temporary)
        for name in packages:
            if name.startswith("flat:"):
                filename = name.removeprefix("flat:")
                extract_flat_package(args.head, filename, root)
                package = root / filename
                manifest = package / "package.json"
                required_files = ("package.json", "signatures/manifest.sig", "signatures/public-key.hex")
            else:
                package = root / name
                package.mkdir()
                extract_package(args.head, name, package)
                manifest = package / "mind.json"
                required_files = REQUIRED_FILES
            if not manifest.is_file():
                raise ValueError(f"{name}: missing mind.json")
            parsed = json.loads(manifest.read_text(encoding="utf-8"))
            if not parsed.get("id") or not parsed.get("version"):
                raise ValueError(f"{name}: mind.json requires id and version")
            package_root = manifest.parent
            for required in required_files:
                if not (package_root / required).is_file():
                    raise ValueError(f"{name}: missing required package file {required}")
            run_validator(binary, "validate", package_root)
            verification = json.loads(run_validator(binary, "verify", package_root))
            if verification.get("signatureStatus") != "verified":
                raise ValueError(f"{name}: signature status is not verified: {verification}")
            results.append({"name": name, "id": parsed["id"], "status": "verified"})

    print(json.dumps({"packages": results, "count": len(results)}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError, subprocess.CalledProcessError) as error:
        print(f"registry gate failed: {error}", file=sys.stderr)
        raise SystemExit(1)
