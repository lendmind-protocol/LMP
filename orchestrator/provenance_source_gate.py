"""Verify canonical profile provenance against the bytes served by each source URL.

This is intentionally a release/qualification gate rather than a build step: source
verification needs network access and third-party documents can change independently
of the repository. A profile is source-backed only when both manifests agree and the
declared SHA-256 matches the fetched bytes.
"""

from __future__ import annotations

import hashlib
import json
import sys
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIND_ROOT = ROOT / "registry" / "minds"


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "lmp-provenance-gate/1"})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read()


def main() -> int:
    failures: list[str] = []
    checked = 0
    profiles = sorted(
        path for path in MIND_ROOT.iterdir() if path.is_dir() and not path.name.startswith(".")
    )
    for profile in profiles:
        try:
            mind = json.loads((profile / "mind.json").read_text(encoding="utf-8"))
            source_index = json.loads((profile / "sources.json").read_text(encoding="utf-8"))
            manifest_sources = mind["provenance"]["sources"]
            indexed_sources = source_index["sources"]
            if len(manifest_sources) != len(indexed_sources):
                raise ValueError("mind.json and sources.json source counts differ")
            for index, (manifest, indexed) in enumerate(zip(manifest_sources, indexed_sources)):
                for field in ("url", "contentDigest"):
                    if manifest.get(field) != indexed.get(field):
                        raise ValueError(f"source {index} {field} differs between manifests")
                expected = manifest["contentDigest"]
                if not isinstance(expected, str) or not expected.startswith("sha256:"):
                    raise ValueError(f"source {index} has no SHA-256 digest")
                actual = hashlib.sha256(fetch(manifest["url"])).hexdigest()
                if actual != expected.removeprefix("sha256:"):
                    raise ValueError(f"source {index} digest mismatch: expected {expected}, got sha256:{actual}")
                checked += 1
        except Exception as error:  # noqa: BLE001 - report every profile, then fail closed.
            failures.append(f"{profile.name}: {error}")

    if failures:
        print(json.dumps({"status": "failed", "checked": checked, "failures": failures}, indent=2))
        return 1
    print(json.dumps({"status": "verified", "profiles": len(profiles), "sources": checked}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
