import json
import tempfile
import unittest
from pathlib import Path

from orchestrator.evaluator_artifact_gate import validate


def artifact() -> dict:
    return {
        "artifactVersion": "1.0",
        "runId": "run-1",
        "createdAt": "2026-09-11T00:00:00Z",
        "workspace": {"pathHash": "sha256:" + "a" * 64, "dirty": False},
        "mind": {
            "id": "lmp:mind:example",
            "version": "1.0.0",
            "contentDigest": "sha256:" + "b" * 64,
            "signatureStatus": "verified",
        },
        "mode": "enforced",
        "state": "pass",
        "summary": {"hardViolationCount": 0, "warningCount": 0, "informationalCount": 0},
        "checks": [{
            "ruleId": "example.rule",
            "passed": True,
            "severity": "info",
            "message": "check completed",
            "rationale": "The profile declares this check.",
            "remediation": "No remediation is required.",
            "limitations": ["bounded evidence"],
        }],
        "skippedChecks": [{"checkId": "docker", "reason": "separate gate"}],
        "loopTransitions": [{"state": "evaluating", "event": "started"}],
        "commands": [],
        "limitations": ["bounded evidence"],
        "privacy": {"sourceCodeIncluded": False, "rawPathsIncluded": False, "networkUsed": False},
    }


class EvaluatorArtifactGateTest(unittest.TestCase):
    def write(self, value: dict) -> Path:
        directory = Path(tempfile.mkdtemp(prefix="lmp-artifact-gate-"))
        path = directory / "artifact.json"
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def test_accepts_complete_private_artifact(self):
        result = validate(self.write(artifact()), require_clean=True)
        self.assertEqual(result["status"], "verified")

    def test_rejects_private_data_and_missing_transitions(self):
        value = artifact()
        value["privacy"]["rawPathsIncluded"] = True
        value["loopTransitions"] = []
        with self.assertRaisesRegex(ValueError, "loopTransitions"):
            validate(self.write(value))

    def test_rejects_findings_without_review_context(self):
        value = artifact()
        del value["checks"][0]["rationale"]
        with self.assertRaisesRegex(ValueError, "check rationale"):
            validate(self.write(value))

    def test_accepts_internal_skill_package_identity(self):
        value = artifact()
        value["mind"]["id"] = "lmp:skill:example"
        self.assertEqual(validate(self.write(value))["status"], "verified")

    def test_rejects_noncanonical_package_identity(self):
        value = artifact()
        value["mind"]["id"] = "lmp:profile:example"
        with self.assertRaisesRegex(ValueError, "canonical package ID"):
            validate(self.write(value))


if __name__ == "__main__":
    unittest.main()
