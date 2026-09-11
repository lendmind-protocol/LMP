import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("render_evaluation_summary.py")
SPEC = importlib.util.spec_from_file_location("render_evaluation_summary", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def artifact() -> dict:
    return {
        "artifactVersion": "1.0",
        "runId": "run-summary",
        "createdAt": "2026-09-12T00:00:00Z",
        "workspace": {"pathHash": "sha256:" + "a" * 64, "gitHead": "a" * 40, "dirty": False},
        "mind": {
            "id": "lmp:mind:example",
            "version": "1.0.0",
            "contentDigest": "sha256:" + "b" * 64,
            "signatureStatus": "verified",
        },
        "mode": "enforced",
        "state": "needs_revision",
        "summary": {"status": "fail", "hardViolationCount": 1, "warningCount": 0, "informationalCount": 0},
        "checks": [{
            "ruleId": "typescript.any",
            "passed": False,
            "severity": "error",
            "message": "explicit any",
            "rationale": "The profile declares this check.",
            "remediation": "Use a precise type.",
            "limitations": ["bounded evidence"],
        }],
        "skippedChecks": [{"checkId": "behavioral.docker", "reason": "separate gate"}],
        "loopTransitions": [{"state": "evaluating", "event": "started"}],
        "commands": [],
        "limitations": ["bounded evidence"],
        "privacy": {"sourceCodeIncluded": False, "rawPathsIncluded": False, "networkUsed": False},
    }


class EvaluationSummaryTests(unittest.TestCase):
    def test_renders_bounded_review_summary(self) -> None:
        value = artifact()
        with tempfile.TemporaryDirectory() as raw:
            path = Path(raw) / "artifact.json"
            path.write_text(json.dumps(value), encoding="utf-8")
            rendered = MODULE.render(value)
            self.assertIn("`needs_revision`", rendered)
            self.assertIn("`typescript.any`", rendered)
            self.assertIn("`behavioral.docker`", rendered)
            self.assertNotIn("sha256:" + "a" * 64, rendered)
            MODULE.validate(path)

    def test_gate_rejects_source_in_summary_input(self) -> None:
        value = artifact()
        value["privacy"]["sourceCodeIncluded"] = True
        with tempfile.TemporaryDirectory() as raw:
            path = Path(raw) / "artifact.json"
            path.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "source code"):
                MODULE.validate(path)


if __name__ == "__main__":
    unittest.main()
