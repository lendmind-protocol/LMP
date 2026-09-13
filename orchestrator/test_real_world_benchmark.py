from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("real_world_benchmark.py")
sys.path.insert(0, str(MODULE_PATH.parent))
SPEC = importlib.util.spec_from_file_location("real_world_benchmark", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class RealWorldBenchmarkTests(unittest.TestCase):
    def test_command_version_uses_the_supplied_repository_root(self) -> None:
        with tempfile.TemporaryDirectory(prefix="lmp-benchmark-git-") as directory:
            repository = Path(directory)
            subprocess.run(["git", "init", "-q", str(repository)], check=True)
            expected = subprocess.run(
                ["git", "-C", str(repository), "rev-parse", "--show-toplevel"],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()

            observed = MODULE.command_version(
                ["git", "rev-parse", "--show-toplevel"], cwd=repository
            )

            self.assertEqual(observed, expected)

    def test_reviewer_annotations_must_target_the_benchmark_revision(self) -> None:
        with tempfile.TemporaryDirectory(prefix="lmp-review-") as directory:
            path = Path(directory) / "review.json"
            path.write_text(
                json.dumps(
                    [
                        {
                            "reviewer": "independent-reviewer",
                            "reviewedRevision": "a" * 40,
                            "decision": "pass-with-limitations",
                            "notes": "The bounded Docker transitions are reproducible.",
                            "reviewTimeMinutes": 18,
                            "reworkCount": 1,
                            "severity": "low",
                            "confidence": 0.9,
                            "falsePositiveCount": 0,
                        }
                    ]
                ),
                encoding="utf-8",
            )
            annotations = MODULE.load_reviewer_annotations(path, "a" * 40)
            self.assertEqual(len(annotations), 1)

            with self.assertRaises(ValueError):
                MODULE.load_reviewer_annotations(path, "b" * 40)

    def test_reviewer_annotations_cannot_be_empty(self) -> None:
        with tempfile.TemporaryDirectory(prefix="lmp-review-empty-") as directory:
            path = Path(directory) / "review.json"
            path.write_text("[]", encoding="utf-8")
            with self.assertRaises(ValueError):
                MODULE.load_reviewer_annotations(path, "a" * 40)

    def test_reviewer_annotations_reject_invalid_confidence(self) -> None:
        with tempfile.TemporaryDirectory(prefix="lmp-review-confidence-") as directory:
            path = Path(directory) / "review.json"
            path.write_text(
                json.dumps([{
                    "reviewer": "independent-reviewer",
                    "reviewedRevision": "a" * 40,
                    "decision": "pass-with-limitations",
                    "notes": "The bounded Docker transitions are reproducible.",
                    "reviewTimeMinutes": 18,
                    "reworkCount": 1,
                    "severity": "low",
                    "confidence": 2,
                    "falsePositiveCount": 0,
                }]),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "confidence"):
                MODULE.load_reviewer_annotations(path, "a" * 40)

    def test_reviewer_annotations_reject_boolean_metrics(self) -> None:
        with tempfile.TemporaryDirectory(prefix="lmp-review-bool-") as directory:
            path = Path(directory) / "review.json"
            path.write_text(
                json.dumps([{
                    "reviewer": "independent-reviewer",
                    "reviewedRevision": "a" * 40,
                    "decision": "pass-with-limitations",
                    "notes": "The bounded Docker transitions are reproducible.",
                    "reviewTimeMinutes": True,
                    "reworkCount": 1,
                    "severity": "low",
                    "confidence": 0.9,
                    "falsePositiveCount": 0,
                }]),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "reviewTimeMinutes"):
                MODULE.load_reviewer_annotations(path, "a" * 40)

    def test_control_state_is_explicit(self) -> None:
        self.assertEqual(MODULE.control_state(0), "pass")
        self.assertEqual(MODULE.control_state(1), "needs_revision")

    def test_benchmark_commands_are_time_bounded(self) -> None:
        with patch.object(MODULE, "COMMAND_TIMEOUT_SECONDS", 0.01):
            with self.assertRaises(subprocess.TimeoutExpired):
                MODULE.run([sys.executable, "-c", "import time; time.sleep(1)"], check=False)


if __name__ == "__main__":
    unittest.main()
