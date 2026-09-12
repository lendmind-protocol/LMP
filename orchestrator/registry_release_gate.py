#!/usr/bin/env python3
"""Reject a public registry index until every entry is production-verifiable."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import urllib.request
from pathlib import Path


HEX64 = re.compile(r"^[0-9a-f]{64}$")
HEX128 = re.compile(r"^0x[0-9a-fA-F]{128}$")
# CIDv0 uses the base58btc `Qm` form; CIDv1 uses a lowercase base32 multibase
# prefix. Syntax is checked locally; `--verify-cids` additionally proves that
# the CID can be retrieved from at least one configured public gateway.
CID = re.compile(r"^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$")
DEFAULT_GATEWAYS = (
    "https://gateway.pinata.cloud/ipfs/{cid}",
    "https://ipfs.io/ipfs/{cid}",
    "https://dweb.link/ipfs/{cid}",
)


def load_json(source: str) -> dict:
    if source.startswith(("http://", "https://")):
        with urllib.request.urlopen(source, timeout=15) as response:
            return json.load(response)
    return json.loads(Path(source).read_text(encoding="utf-8"))


def fetch_cid(cid: str, gateways: tuple[str, ...]) -> tuple[bool, str]:
    failures: list[str] = []
    for template in gateways:
        url = template.format(cid=cid)
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "lmp-release-gate/0.1"})
            with urllib.request.urlopen(request, timeout=15) as response:
                if response.status == 200:
                    return True, url
                failures.append(f"{url}: HTTP {response.status}")
        except OSError as error:
            failures.append(f"{url}: {error}")
    return False, "; ".join(failures)


def validate_registry(
    registry: dict,
    verify_manifests: bool = False,
    verify_cids: bool = False,
    gateways: tuple[str, ...] = DEFAULT_GATEWAYS,
) -> list[str]:
    entries = registry.get("entries")
    if not isinstance(entries, list) or not entries:
        return ["registry must contain at least one entry"]

    seen: set[str] = set()
    errors: list[str] = []
    for entry in entries:
        if not isinstance(entry, dict):
            errors.append("registry entry must be an object")
            continue
        identifier = entry.get("id")
        if not isinstance(identifier, str) or identifier in seen:
            errors.append(f"invalid or duplicate registry id: {identifier!r}")
            continue
        seen.add(identifier)
        if entry.get("signatureStatus") != "verified":
            errors.append(f"{identifier}: signatureStatus must be verified")
        signature = entry.get("signature")
        if not isinstance(signature, str) or not HEX128.fullmatch(signature):
            errors.append(f"{identifier}: missing Ed25519 detached signature")
        public_key = entry.get("publicKey")
        if not isinstance(public_key, str) or not re.fullmatch(r"0x[0-9a-fA-F]{64}", public_key):
            errors.append(f"{identifier}: missing Ed25519 public key")
        digest = entry.get("digest")
        if not isinstance(digest, str) or not HEX64.fullmatch(digest):
            errors.append(f"{identifier}: missing SHA-256 digest")
        manifest_url = entry.get("manifestUrl")
        if not isinstance(manifest_url, str) or not manifest_url.startswith("https://"):
            errors.append(f"{identifier}: missing or insecure manifestUrl (HTTPS required)")
        package_files = entry.get("packageFiles")
        if package_files is not None:
            if not isinstance(package_files, list) or not package_files:
                errors.append(f"{identifier}: packageFiles must be a non-empty array when present")
            else:
                paths: set[str] = set()
                for file in package_files:
                    if not isinstance(file, dict):
                        errors.append(f"{identifier}: packageFiles entries must be objects")
                        continue
                    path = file.get("path")
                    url = file.get("url")
                    file_digest = file.get("digest")
                    if (
                        not isinstance(path, str)
                        or not path
                        or path == "mind.json"
                        or path.startswith("/")
                        or ".." in path.split("/")
                        or path in paths
                    ):
                        errors.append(f"{identifier}: packageFiles contains an unsafe or duplicate path")
                    else:
                        paths.add(path)
                    if not isinstance(url, str) or not url.startswith("https://"):
                        errors.append(f"{identifier}: package file URL must use HTTPS")
                    if not isinstance(file_digest, str) or not HEX64.fullmatch(file_digest.removeprefix("sha256:")):
                        errors.append(f"{identifier}: package file has an invalid SHA-256 digest")
        cid = entry.get("ipfsCid")
        if not isinstance(cid, str) or not CID.fullmatch(cid):
            errors.append(f"{identifier}: missing or syntactically invalid immutable IPFS CID")
        elif verify_cids:
            reachable, detail = fetch_cid(cid, gateways)
            if not reachable:
                errors.append(f"{identifier}: IPFS CID could not be retrieved from a configured gateway: {detail}")
        if verify_manifests:
            if isinstance(manifest_url, str) and manifest_url.startswith("https://"):
                try:
                    request = urllib.request.Request(
                        manifest_url,
                        headers={"User-Agent": "lmp-release-gate/0.1"},
                    )
                    payload = urllib.request.urlopen(request, timeout=15).read()
                    actual = hashlib.sha256(payload).hexdigest()
                    if actual != digest:
                        errors.append(f"{identifier}: manifest digest mismatch")
                except OSError as error:
                    errors.append(f"{identifier}: manifest fetch failed: {error}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("registry")
    parser.add_argument("--verify-manifests", action="store_true")
    parser.add_argument("--verify-cids", action="store_true")
    parser.add_argument("--gateway", action="append", dest="gateways", help="IPFS gateway URL template containing {cid}")
    args = parser.parse_args()
    registry = load_json(args.registry)
    gateways = tuple(args.gateways or DEFAULT_GATEWAYS)
    errors = validate_registry(
        registry,
        verify_manifests=args.verify_manifests,
        verify_cids=args.verify_cids,
        gateways=gateways,
    )
    if errors:
        print(json.dumps({"status": "blocked", "errors": errors}, indent=2))
        return 1

    print(json.dumps({"status": "verified", "entries": len(registry["entries"])}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
