#!/usr/bin/env python3
"""Verify that every checked-in Mind rule has an explicit evaluator owner."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAP = ROOT / "protocol/rule-evaluator-map.json"
MANIFESTS = [
    *ROOT.glob("registry/minds/*/rules/manifest.json"),
    *ROOT.glob("packages/create-lmp/profiles/*/rules/manifest.json"),
    *ROOT.glob("profiles/*/rules/manifest.json"),
]
REQUIRED = {"evaluator", "implementation", "scope", "limitation"}


def main() -> None:
    mapping = json.loads(MAP.read_text())
    rules = mapping.get("rules")
    if mapping.get("version") != 1 or not isinstance(rules, dict):
        raise SystemExit("rule evaluator map has an invalid schema")
    declared: dict[str, list[str]] = {}
    for manifest_path in sorted(MANIFESTS):
        manifest = json.loads(manifest_path.read_text())
        for rule in manifest.get("rules", []):
            rule_id = rule.get("id")
            if not isinstance(rule_id, str) or not rule_id:
                raise SystemExit(f"{manifest_path}: rule id is missing")
            declared.setdefault(rule_id, []).append(str(manifest_path.relative_to(ROOT)))
    errors: list[str] = []
    for rule_id, locations in sorted(declared.items()):
        entry = rules.get(rule_id)
        if not isinstance(entry, dict) or not REQUIRED.issubset(entry):
            errors.append(f"{rule_id}: missing evaluator mapping ({', '.join(locations)})")
            continue
        implementation = entry["implementation"]
        if not isinstance(implementation, str) or not implementation:
            errors.append(f"{rule_id}: implementation locator is empty")
        else:
            for locator in implementation.split(";"):
                path = locator.strip().split("#", 1)[0]
                if not (ROOT / path).is_file():
                    errors.append(f"{rule_id}: implementation file does not exist: {path}")
        if not isinstance(entry["scope"], list) or not entry["scope"]:
            errors.append(f"{rule_id}: evaluator scope is empty")
        if not isinstance(entry["limitation"], str) or not entry["limitation"].strip():
            errors.append(f"{rule_id}: limitation is empty")
    extra = sorted(set(rules) - set(declared))
    if extra:
        errors.append(f"mapping contains rules not declared by a checked-in Mind: {', '.join(extra)}")
    if errors:
        raise SystemExit("rule contract gate failed:\n- " + "\n- ".join(errors))
    print(json.dumps({"status": "verified", "manifests": len(MANIFESTS), "rules": len(declared)}))


if __name__ == "__main__":
    main()
