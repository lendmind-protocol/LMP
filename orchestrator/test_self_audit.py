import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from orchestrator.self_audit import Check, build_report, run_check


class SelfAuditTests(unittest.TestCase):
    def test_missing_prerequisite_is_blocked_not_passed(self):
        check = Check("missing", "test", ("not-a-real-lmp-executable",))
        result = run_check(check, timeout=1)
        self.assertEqual(result["status"], "blocked")

    def test_report_contains_explicit_claim_limits(self):
        report = build_report(timeout=1, include_self_evaluation=False)
        self.assertEqual(report["schema"], "lmp-self-audit-v1")
        self.assertIn("limitations", report)
        self.assertIn("sandbox", report["claims"])

    def test_output_is_valid_json_when_written_by_caller(self):
        report = build_report(timeout=1, include_self_evaluation=False)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "report.json"
            path.write_text(json.dumps(report), encoding="utf-8")
            self.assertEqual(json.loads(path.read_text())["schema"], "lmp-self-audit-v1")


if __name__ == "__main__":
    unittest.main()
