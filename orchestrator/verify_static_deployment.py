#!/usr/bin/env python3
"""Verify that the deployed static portal exposes the registry contract."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import urllib.request
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "lmp-release-gate/0.1"})
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status != 200:
            raise RuntimeError(f"{url}: HTTP {response.status}")
        return response.read()


def validate_deployed_entries(
    registry: dict[str, object], fetch_manifest, require_https: bool = False
) -> list[str]:
    errors: list[str] = []
    entries = registry.get("entries")
    if not isinstance(entries, list) or not entries:
        return ["deployed registry has no entries"]
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            errors.append(f"entry {index} is not an object")
            continue
        identifier = entry.get("id", f"entry {index}")
        for field in ("id", "version", "manifestUrl", "digest", "signature", "publicKey"):
            if not entry.get(field):
                errors.append(f"{identifier}: missing {field}")
        digest = entry.get("digest")
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", digest):
            errors.append(f"{identifier}: invalid SHA-256 digest")
        for field, length in (("signature", 130), ("publicKey", 66)):
            value = entry.get(field)
            if not isinstance(value, str) or not re.fullmatch(r"0x[0-9a-fA-F]+", value) or len(value) != length:
                errors.append(f"{identifier}: invalid {field}")
        manifest_url = entry.get("manifestUrl")
        if require_https and (not isinstance(manifest_url, str) or urlparse(manifest_url).scheme != "https"):
            errors.append(f"{identifier}: manifestUrl must use HTTPS")
        if isinstance(manifest_url, str) and isinstance(digest, str) and re.fullmatch(r"[0-9a-fA-F]{64}", digest):
            try:
                manifest = fetch_manifest(manifest_url)
                actual = hashlib.sha256(manifest).hexdigest()
                if actual.lower() != digest.lower():
                    errors.append(f"{identifier}: manifest digest mismatch")
                parsed = json.loads(manifest)
                if parsed.get("id") != entry.get("id") or parsed.get("version") != entry.get("version"):
                    errors.append(f"{identifier}: manifest identity/version mismatch")
            except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, TypeError, ValueError) as error:
                errors.append(f"{identifier}: manifest fetch failed: {error}")
        package_files = entry.get("packageFiles")
        if isinstance(package_files, list):
            seen_paths: set[str] = set()
            for package_file in package_files:
                if not isinstance(package_file, dict):
                    errors.append(f"{identifier}: packageFiles entry is not an object")
                    continue
                path = package_file.get("path")
                file_url = package_file.get("url")
                file_digest = package_file.get("digest")
                if not isinstance(path, str) or not path or path == "mind.json" or path.startswith("/") or ".." in path.split("/") or path in seen_paths:
                    errors.append(f"{identifier}: package file path is unsafe or duplicated")
                    continue
                seen_paths.add(path)
                if not isinstance(file_url, str) or (require_https and urlparse(file_url).scheme != "https"):
                    errors.append(f"{identifier}: package file URL must use HTTPS")
                    continue
                if not isinstance(file_digest, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", file_digest.removeprefix("sha256:")):
                    errors.append(f"{identifier}: package file digest is invalid")
                    continue
                try:
                    actual_file_digest = hashlib.sha256(fetch(file_url)).hexdigest()
                    if actual_file_digest.lower() != file_digest.removeprefix("sha256:").lower():
                        errors.append(f"{identifier}: package file digest mismatch: {path}")
                except (HTTPError, URLError, TimeoutError, ValueError) as error:
                    errors.append(f"{identifier}: package file fetch failed for {path}: {error}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("base_url")
    parser.add_argument("--expected-registry", type=argparse.FileType("r", encoding="utf-8"))
    parser.add_argument("--check-manifests", action="store_true")
    parser.add_argument("--require-https", action="store_true")
    args = parser.parse_args()
    base = args.base_url.rstrip("/") + "/"
    errors: list[str] = []
    if args.require_https and urlparse(base).scheme != "https":
        errors.append("production deployment URL must use HTTPS")
        print(json.dumps({"status": "blocked", "errors": errors}, indent=2))
        return 1
    try:
        fetch(base)
        registry = json.loads(fetch(urljoin(base, "registry.json")))
        if args.expected_registry is not None:
            expected = json.load(args.expected_registry)
            if registry != expected:
                errors.append("deployed registry does not match the checked-in registry index")
        if args.check_manifests:
            errors.extend(validate_deployed_entries(registry, fetch, args.require_https))
        elif not isinstance(registry.get("entries"), list) or not registry["entries"]:
            errors.append("deployed registry has no entries")
    except HTTPError as error:
        errors.append(f"{error.url}: HTTP {error.code}")
    except (URLError, TimeoutError) as error:
        errors.append(f"deployment request failed: {error}")
    except (json.JSONDecodeError, TypeError, AttributeError) as error:
        errors.append(f"deployed registry is not valid JSON: {error}")

    if errors:
        print(json.dumps({"status": "blocked", "errors": errors}, indent=2))
        return 1

    print(json.dumps({"status": "reachable", "entries": len(registry["entries"])}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
