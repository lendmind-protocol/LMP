from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from orchestrator.evidence_boundary_gate import validate


HEADER = "| Claim ID | Claim | Source | Implementation | Test | Evidence | Status | Limitation |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n"


def row(claim_id: str, status: str, evidence: str = "artifact.json") -> str:
    return f"| {claim_id} | claim | source | implementation | test | {evidence} | {status} | bounded |\n"


class EvidenceBoundaryGateTests(unittest.TestCase):
    def test_blocks_release_when_partial_evidence_remains(self) -> None:
        bounded = "".join(row(identifier, "VERIFIED") for identifier in {"CL-001", "CL-002", "CL-003", "CL-004", "CL-009", "CL-013"})
        explicit = row("CL-005", "UNSUPPORTED") + row("CL-007", "FALSE") + row("CL-012", "REMOVED")
        partial = "".join(row(identifier, "PARTIAL") for identifier in {"CL-006", "CL-008", "CL-010", "CL-011"})
        with tempfile.TemporaryDirectory() as raw:
            ledger = Path(raw) / "claims.md"
            ledger.write_text(HEADER + bounded + explicit + partial, encoding="utf-8")
            report = validate(ledger)
        self.assertEqual(report["status"], "blocked")
        self.assertEqual(len(report["releaseBlockers"]), 4)

    def test_pass_requires_all_bounded_claims_and_explicit_non_claims(self) -> None:
        verified = {"CL-001", "CL-002", "CL-003", "CL-004", "CL-006", "CL-008", "CL-009", "CL-010", "CL-011", "CL-013"}
        text = HEADER + "".join(row(identifier, "VERIFIED") for identifier in verified)
        text += row("CL-005", "UNSUPPORTED") + row("CL-007", "FALSE") + row("CL-012", "REMOVED")
        with tempfile.TemporaryDirectory() as raw:
            ledger = Path(raw) / "claims.md"
            ledger.write_text(text, encoding="utf-8")
            report = validate(ledger)
        self.assertEqual(report["status"], "pass")


if __name__ == "__main__":
    unittest.main()
