from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("benchmark_artifact_gate.py")
SPEC = importlib.util.spec_from_file_location("benchmark_artifact_gate", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def artifact() -> dict[str, object]:
    scenario_count = MODULE.EXPECTED_SCENARIOS
    candidate = {
        "exitCode": 0,
        "state": "needs_revision",
        "hardViolationCount": 0,
        "rules": [],
        "privacy": {"sourceCodeIncluded": False, "rawPathsIncluded": False},
    }
    docker = {
        "command": ["python", "-c", "print('ok')"],
        "exitCode": 0,
        "elapsedMs": 1.0,
        "timedOut": False,
    }
    return {
        "artifactVersion": "1.2",
        "status": "complete",
        "summary": {
            "expectedScenarioCount": scenario_count,
            "scenarioCount": scenario_count,
            "passedTransitions": scenario_count,
            "allTransitionsPassed": True,
            "dockerGatesPassed": scenario_count * 2,
            "dockerGatesExpected": scenario_count * 2,
            "controlChecksPassed": scenario_count * 2,
            "controlChecksExpected": scenario_count * 2,
            "verifiedSources": 1,
        },
        "evidenceMetadata": {
            "repositoryRevision": "a" * 40,
            "repositoryDirty": False,
            "profile": {"path": "profiles/baseline", "mindSha256": "b" * 64},
            "tools": {"lmp": "lmp 0.1.0", "python": "3.11", "platform": "test", "docker": "Docker"},
            "reviewerAnnotations": [],
        },
        "timingSeconds": {"total": 1.0},
        "privacy": {"sourceCodeIncluded": False, "rawPathsIncluded": False, "privateReasoningIncluded": False},
        "scenarios": [
            {
                "id": f"scenario-{_}",
                "repository": "https://github.com/example/repository.git",
                "revision": "c" * 40,
                "taskType": "test-regression",
                "baseline": candidate,
                "guided": {**candidate, "state": "pass"},
                "sandbox": {"baseline": docker, "guided": docker},
                "ordinaryControls": {"repositoryCommandsExecuted": False},
                "control": {
                    "baseline": {
                        "tool": "typescript-compiler",
                        "command": ["tsc", "--noEmit"],
                        "exitCode": 0,
                        "state": "pass",
                        "timedOut": False,
                        "elapsedMs": 1.0,
                        "outputIncluded": False,
                    },
                    "guided": {
                        "tool": "typescript-compiler",
                        "command": ["tsc", "--noEmit"],
                        "exitCode": 0,
                        "state": "pass",
                        "timedOut": False,
                        "elapsedMs": 1.0,
                        "outputIncluded": False,
                    },
                },
                "timingSeconds": {"scenario": 1.0},
                "transitionPassed": True,
            }
            for _ in range(scenario_count)
        ],
        "sourceVerification": [{"id": "source", "url": "https://example.test/source", "verified": True, "status": 200, "contentBytes": 10, "contentSha256": "d" * 64}],
    }


class BenchmarkArtifactGateTests(unittest.TestCase):
    def write(self, payload: dict[str, object]) -> Path:
        handle = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
        with handle:
            json.dump(payload, handle)
        return Path(handle.name)

    def test_accepts_complete_verified_sources(self) -> None:
        path = self.write(artifact())
        try:
            self.assertEqual(MODULE.validate(path)["status"], "verified")
        finally:
            path.unlink()

    def test_rejects_unverified_source(self) -> None:
        payload = artifact()
        payload["sourceVerification"] = [{"id": "source", "verified": False}]
        path = self.write(payload)
        try:
            with self.assertRaisesRegex(ValueError, "provenance source"):
                MODULE.validate(path)
        finally:
            path.unlink()

    def test_require_clean_rejects_dirty_repository(self) -> None:
        payload = artifact()
        payload["evidenceMetadata"]["repositoryDirty"] = True
        path = self.write(payload)
        try:
            with self.assertRaisesRegex(ValueError, "dirty repository"):
                MODULE.validate(path, require_clean=True)
        finally:
            path.unlink()

    def test_rejects_self_declared_zero_docker_gates(self) -> None:
        payload = artifact()
        payload["summary"]["dockerGatesPassed"] = 0
        payload["summary"]["dockerGatesExpected"] = 0
        path = self.write(payload)
        try:
            with self.assertRaisesRegex(ValueError, "exactly 128"):
                MODULE.validate(path)
        finally:
            path.unlink()

    def test_rejects_missing_ordinary_control_evidence(self) -> None:
        payload = artifact()
        del payload["scenarios"][0]["control"]
        path = self.write(payload)
        try:
            with self.assertRaisesRegex(ValueError, "compiler control"):
                MODULE.validate(path)
        finally:
            path.unlink()

    def test_rejects_artifact_for_a_different_revision(self) -> None:
        path = self.write(artifact())
        try:
            with self.assertRaisesRegex(ValueError, "does not match expected"):
                MODULE.validate(path, expected_revision="c" * 40)
        finally:
            path.unlink()

    def test_require_clean_rejects_missing_dirty_state(self) -> None:
        payload = artifact()
        del payload["evidenceMetadata"]["repositoryDirty"]
        path = self.write(payload)
        try:
            with self.assertRaisesRegex(ValueError, "repositoryDirty must be a boolean"):
                MODULE.validate(path, require_clean=True)
        finally:
            path.unlink()

    def test_rejects_fake_pass_to_pass_transition(self) -> None:
        payload = artifact()
        for scenario in payload["scenarios"]:
            scenario["baseline"]["state"] = "pass"
        path = self.write(payload)
        try:
            with self.assertRaisesRegex(ValueError, "needs_revision-to-pass"):
                MODULE.validate(path)
        finally:
            path.unlink()

    def test_require_clean_rejects_missing_reviewer_evidence(self) -> None:
        path = self.write(artifact())
        try:
            with self.assertRaisesRegex(ValueError, "at least one reviewer"):
                MODULE.validate(path, require_clean=True)
        finally:
            path.unlink()

    def test_rejects_stale_or_malformed_reviewer_annotations(self) -> None:
        payload = artifact()
        payload["evidenceMetadata"]["reviewerAnnotations"] = [{
            "reviewer": "reviewer-a",
            "reviewedRevision": "c" * 40,
            "decision": "pass-with-limitations",
            "notes": "Checked the complete matrix.",
            "reviewTimeMinutes": 12,
            "reworkCount": 0,
            "severity": "none",
            "confidence": 0.95,
            "falsePositiveCount": 0,
        }]
        path = self.write(payload)
        try:
            with self.assertRaisesRegex(ValueError, "targets"):
                MODULE.validate(path)
        finally:
            path.unlink()


if __name__ == "__main__":
    unittest.main()
