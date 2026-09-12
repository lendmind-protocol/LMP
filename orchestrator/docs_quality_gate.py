#!/usr/bin/env python3
"""Validate the published documentation structure and internal links."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "apps" / "docs" / "content" / "docs"
INTERNAL_LINK = re.compile(r"\]\((/docs/[^)#]+)(?:#[^)]+)?\)")
UNSUPPORTED_EVALUATION_STATES = ("invalid_input", "execution_error")


def route_for(path: Path) -> str:
    relative = path.relative_to(DOCS)
    if relative.name == "index.mdx":
        parent = relative.parent.as_posix()
        return "/docs" if parent == "." else f"/docs/{parent}"
    return f"/docs/{relative.with_suffix('').as_posix()}"


def published_routes() -> set[str]:
    return {route_for(path) for path in DOCS.rglob("*.mdx")}


def pinned_rust_toolchain() -> str | None:
    toolchain = ROOT / "rust-toolchain.toml"
    if not toolchain.is_file():
        return None
    match = re.search(
        r'^channel\s*=\s*"([^"]+)"',
        toolchain.read_text(encoding="utf-8"),
        re.MULTILINE,
    )
    return match.group(1) if match else None


def main() -> int:
    errors: list[str] = []
    pages = sorted(DOCS.rglob("*.mdx"))
    routes = published_routes()

    for page in pages:
        text = page.read_text(encoding="utf-8")
        if not text.startswith("---\n") or "\ntitle:" not in text.split("\n---\n", 1)[0]:
            errors.append(f"{page.relative_to(ROOT)}: missing title frontmatter")
        if "\ndescription:" not in text.split("\n---\n", 1)[0]:
            errors.append(f"{page.relative_to(ROOT)}: missing description frontmatter")
        for target in INTERNAL_LINK.findall(text):
            if target not in routes:
                errors.append(f"{page.relative_to(ROOT)}: broken documentation route {target}")
        for state in UNSUPPORTED_EVALUATION_STATES:
            if state in text:
                errors.append(f"{page.relative_to(ROOT)}: unsupported evaluator state {state}")

    rust_toolchain = pinned_rust_toolchain()
    getting_started = DOCS / "getting-started.mdx"
    if rust_toolchain and rust_toolchain not in getting_started.read_text(encoding="utf-8"):
        errors.append(
            f"{getting_started.relative_to(ROOT)}: does not name pinned Rust toolchain {rust_toolchain}"
        )

    for metadata_path in sorted(DOCS.rglob("meta.json")):
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if not isinstance(metadata.get("pages"), list):
            errors.append(f"{metadata_path.relative_to(ROOT)}: pages must be an array")
            continue
        base = metadata_path.parent
        for page in metadata["pages"]:
            if not isinstance(page, str) or not page.strip():
                errors.append(f"{metadata_path.relative_to(ROOT)}: invalid page entry")
                continue
            if not ((base / f"{page}.mdx").is_file() or (base / page).is_dir()):
                errors.append(f"{metadata_path.relative_to(ROOT)}: missing page entry {page}")

    result = {"status": "pass" if not errors else "blocked", "pageCount": len(pages), "routeCount": len(routes), "errors": errors}
    print(json.dumps(result, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
