import json
import tempfile
import unittest
from pathlib import Path

from orchestrator.evaluation_suite import benchmark_results


class EvaluationSuiteTests(unittest.TestCase):
    def test_normalizes_only_completed_benchmark_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "benchmark.json"
            path.write_text(json.dumps({
                "benchmark": "lmp-real-world-scenario-matrix",
                "status": "complete",
                "scenarios": [{
                    "id": "fixture-1",
                    "guided": {"state": "pass", "hardViolationCount": 0},
                    "sandbox": {"guided": {"elapsedMs": 2.5, "exitCode": 0}},
                }],
            }), encoding="utf-8")
            self.assertEqual(benchmark_results(str(path))[0]["status"], "COMPLIANT")

    def test_rejects_incomplete_benchmark(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "benchmark.json"
            path.write_text(json.dumps({
                "benchmark": "lmp-real-world-scenario-matrix",
                "status": "blocked",
                "scenarios": [],
            }), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "not complete"):
                benchmark_results(str(path))


if __name__ == "__main__":
    unittest.main()
