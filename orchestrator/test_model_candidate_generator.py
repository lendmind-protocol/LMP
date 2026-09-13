import json
import tempfile
import unittest
from pathlib import Path

from orchestrator.model_candidate_generator import digest, request_for, run_model


class ModelCandidateGeneratorTests(unittest.TestCase):
    def test_request_digest_is_stable_and_condition_changes_context(self):
        repository = ("express", "https://github.com/expressjs/express.git")
        task = ("api-behavior", "Add a handler.", "fixture")
        baseline = request_for("x", 1, repository, task, "baseline", "mind")
        guided = request_for("x", 1, repository, task, "guided", "mind")
        self.assertEqual(digest(baseline), digest(json.loads(json.dumps(baseline))))
        self.assertIsNone(baseline["lmpContext"])
        self.assertEqual(guided["lmpContext"], "mind")

    def test_model_response_requires_json_package_object(self):
        script = Path(tempfile.mkstemp(suffix=".py")[1])
        script.write_text(
            "import json,sys; json.dump({'implementation':'x','test':'y','package':json.dumps({'private':True})},sys.stdout)"
        )
        try:
            result = run_model(["python3", str(script)], {"request": "x"}, 10)
        finally:
            script.unlink()
        self.assertEqual(json.loads(result["package"]), {"private": True})

    def test_invalid_model_response_is_rejected(self):
        script = Path(tempfile.mkstemp(suffix=".py")[1])
        script.write_text("print('{}')")
        try:
            with self.assertRaises(ValueError):
                run_model(["python3", str(script)], {"request": "x"}, 10)
        finally:
            script.unlink()


if __name__ == "__main__":
    unittest.main()
