import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("onboarding_benchmark.py")
SPEC = importlib.util.spec_from_file_location("onboarding_benchmark", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class OnboardingBenchmarkTests(unittest.TestCase):
    def test_real_greenfield_and_brownfield_paths_meet_local_target(self):
        report = MODULE.benchmark(3000)
        self.assertEqual(report["status"], "complete")
        self.assertEqual([case["strategy"] for case in report["cases"]], ["greenfield", "brownfield"])
        self.assertTrue(all(case["exitCode"] == 0 for case in report["cases"]))
        self.assertTrue(all(float(case["elapsedMs"]) <= 3000 for case in report["cases"]))

    def test_output_is_machine_readable_and_does_not_include_workspace_payloads(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "onboarding.json"
            report = MODULE.benchmark(3000)
            output.write_text(json.dumps(report), encoding="utf-8")
            loaded = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(loaded["privacy"], {"sourceCodeIncluded": False, "secretsIncluded": False})
        self.assertEqual(loaded["network"], "disabled")
        self.assertEqual(len(loaded["cases"]), 2)


if __name__ == "__main__":
    unittest.main()
