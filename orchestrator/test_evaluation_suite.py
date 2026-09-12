import json
import tempfile
import unittest
from pathlib import Path

from orchestrator.evaluation_suite import benchmark_results


class EvaluationSuiteTests(unittest.TestCase):
    def test_normalizes_only_completed_benchmark_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "benchmark.json"
            scenarios = [{
                "id": f"fixture-{index}",
                "guided": {"state": "pass", "hardViolationCount": 0},
                "sandbox": {"guided": {"elapsedMs": 2.5, "exitCode": 0, "timedOut": False}},
            } for index in range(64)]
            path.write_text(json.dumps({
                "benchmark": "lmp-real-world-scenario-matrix",
                "status": "complete",
                "summary": {"scenarioCount": 64, "expectedScenarioCount": 64, "passedTransitions": 64, "allTransitionsPassed": True, "dockerGatesPassed": 128, "dockerGatesExpected": 128},
                "privacy": {"sourceCodeIncluded": False, "rawPathsIncluded": False, "privateReasoningIncluded": False},
                "scenarios": scenarios,
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

    def test_rejects_a_partial_matrix_even_if_status_claims_complete(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "benchmark.json"
            path.write_text(json.dumps({
                "benchmark": "lmp-real-world-scenario-matrix",
                "status": "complete",
                "summary": {"scenarioCount": 1, "expectedScenarioCount": 1},
                "scenarios": [{}],
            }), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "exactly 64"):
                benchmark_results(str(path))


if __name__ == "__main__":
    unittest.main()
