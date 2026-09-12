#!/usr/bin/env python3
"""Fail-closed gate for the claims made about LMP evidence.

The research boundary is a release contract: bounded implementation claims may
be verified locally, but unsupported universal, causal, host, and external
distribution claims must not be promoted by a release report.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


ROW = re.compile(r"\|\s*(CL-\d+)\s*\|.*?\|\s*(.*?)\s*\|\s*(VERIFIED|PARTIAL|UNSUPPORTED|FALSE|REMOVED)\s*\|\s*(.*?)\s*\|")
REQUIRED_BOUNDED = {"CL-001", "CL-002", "CL-003", "CL-004", "CL-009", "CL-013"}
REQUIRED_UNSUPPORTED = {"CL-005", "CL-007", "CL-012"}
RELEASE_BLOCKERS = {"CL-006", "CL-008", "CL-010", "CL-011"}


def validate(path: Path) -> dict[str, object]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as error:
        return {"status": "blocked", "errors": [f"claim ledger is unreadable: {error}"]}
    claims = {match.group(1): {"status": match.group(3), "evidence": match.group(2).strip()} for match in ROW.finditer(text)}
    errors: list[str] = []
    for claim_id in sorted(REQUIRED_BOUNDED):
        claim = claims.get(claim_id)
        if not claim:
            errors.append(f"missing bounded claim {claim_id}")
        elif claim["status"] != "VERIFIED":
            errors.append(f"{claim_id} must be VERIFIED, found {claim['status']}")
        elif claim["evidence"] in {"", "none", "None"}:
            errors.append(f"{claim_id} has no evidence artifact")
    for claim_id in sorted(REQUIRED_UNSUPPORTED):
        claim = claims.get(claim_id)
        if not claim:
            errors.append(f"missing explicit non-claim {claim_id}")
        elif claim["status"] not in {"UNSUPPORTED", "FALSE", "REMOVED"}:
            errors.append(f"{claim_id} must remain explicitly unsupported/false/removed")
    blockers = []
    for claim_id in sorted(RELEASE_BLOCKERS):
        claim = claims.get(claim_id)
        if not claim:
            blockers.append(f"{claim_id} is missing from the claim ledger")
        elif claim["status"] != "VERIFIED":
            blockers.append(f"{claim_id} remains {claim['status']}; required evidence is not complete")
    errors.extend(blockers)
    return {"status": "pass" if not errors else "blocked", "claimCount": len(claims), "errors": errors, "releaseBlockers": blockers, "source": str(path)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ledger", type=Path, default=Path("docs/claim-ledger.md"), nargs="?")
    args = parser.parse_args()
    report = validate(args.ledger)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["status"] == "pass" else 2


if __name__ == "__main__":
    raise SystemExit(main())
