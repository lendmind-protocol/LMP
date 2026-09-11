#!/usr/bin/env python3
"""Verify that the static registry index matches signed local package bytes."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from typing import Callable


def load_registry(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_package(definitions: Path, slug: str, bundled_root: Path) -> Path | None:
    candidates = [definitions / slug]
    bundled = bundled_root / slug
    if bundled not in candidates:
        candidates.append(bundled)
    return next((candidate for candidate in candidates if (candidate / "mind.json").is_file()), None)


def validate_index(
    registry: dict,
    definitions: Path,
    verify: Callable[[Path], bool],
    bundled_root: Path | None = None,
) -> list[str]:
    bundled_root = bundled_root or Path(__file__).resolve().parents[1] / "packages/create-lmp/profiles"
    errors: list[str] = []
    entries = registry.get("entries")
    if not isinstance(entries, list) or not entries:
        return ["registry must contain at least one entry"]

    for entry in entries:
        if not isinstance(entry, dict):
            errors.append("registry entry must be an object")
            continue
        identifier = entry.get("id")
        if not isinstance(identifier, str) or ":" not in identifier:
            errors.append(f"invalid registry id: {identifier!r}")
            continue
        slug = identifier.rsplit(":", 1)[-1]
        package = resolve_package(definitions, slug, bundled_root)
        if package is None:
            errors.append(f"{identifier}: local manifest is missing")
            continue
        manifest = package / "mind.json"
        try:
            payload = manifest.read_bytes()
            parsed = json.loads(payload)
        except (OSError, json.JSONDecodeError) as error:
            errors.append(f"{identifier}: manifest cannot be read: {error}")
            continue
        if parsed.get("id") != identifier:
            errors.append(f"{identifier}: manifest id does not match index")
        if parsed.get("version") != entry.get("version"):
            errors.append(f"{identifier}: manifest version does not match index")
        digest = hashlib.sha256(payload).hexdigest()
        if entry.get("digest") != digest:
            errors.append(f"{identifier}: index digest does not match manifest bytes")
        try:
            public_key = (package / "signatures/public-key.hex").read_text(encoding="utf-8").strip()
            signature = (package / "signatures/manifest.sig").read_text(encoding="utf-8").strip()
        except OSError as error:
            errors.append(f"{identifier}: detached signature files are missing: {error}")
            continue
        if entry.get("publicKey") != public_key:
            errors.append(f"{identifier}: index public key does not match package")
        if entry.get("signature") != signature:
            errors.append(f"{identifier}: index signature does not match package")
        if not verify(package):
            errors.append(f"{identifier}: Rust signature verification failed")
        bundled = bundled_root / slug
        if bundled.is_dir() and bundled != package:
            primary_files = {
                path.relative_to(package)
                for path in package.rglob("*")
                if path.is_file()
            }
            bundled_files = {
                path.relative_to(bundled)
                for path in bundled.rglob("*")
                if path.is_file()
            }
            if primary_files != bundled_files:
                errors.append(f"{identifier}: registry and bundled profile file sets differ")
            for relative in sorted(primary_files & bundled_files):
                left = package / relative
                right = bundled / relative
                if relative in {
                    Path("signatures/manifest.sig"),
                    Path("signatures/public-key.hex"),
                }:
                    left_bytes = left.read_text(encoding="utf-8").strip().encode()
                    right_bytes = right.read_text(encoding="utf-8").strip().encode()
                else:
                    left_bytes = left.read_bytes()
                    right_bytes = right.read_bytes()
                if left_bytes != right_bytes:
                    errors.append(f"{identifier}: registry and bundled profile differ at {relative}")
    return errors


def rust_verifier(binary: Path) -> Callable[[Path], bool]:
    def verify(package: Path) -> bool:
        result = subprocess.run(
            [str(binary), "verify", str(package)],
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            return False
        try:
            return json.loads(result.stdout).get("signatureStatus") == "verified"
        except json.JSONDecodeError:
            return False

    return verify


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("registry", type=Path)
    parser.add_argument("--definitions", type=Path, default=Path("registry/definitions"))
    parser.add_argument("--lmp", type=Path, default=Path("target/release/lmp"))
    args = parser.parse_args()
    errors = validate_index(load_registry(args.registry), args.definitions, rust_verifier(args.lmp))
    if errors:
        print(json.dumps({"status": "blocked", "errors": errors}, indent=2))
        return 1
    print(json.dumps({"status": "verified", "entries": len(load_registry(args.registry)["entries"])}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
