from __future__ import annotations

import importlib.util
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).with_name("remote_source_gate.py")
SPEC = importlib.util.spec_from_file_location("remote_source_gate", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class RemoteSourceGateTests(unittest.TestCase):
    def test_matching_remote_revision_passes(self) -> None:
        results = [
            subprocess.CompletedProcess([], 0, "abc123\n", ""),
            subprocess.CompletedProcess([], 0, "abc123\trefs/heads/main\n", ""),
        ]
        with patch.object(MODULE.subprocess, "run", side_effect=results):
            payload = MODULE.report("origin", "main")
        self.assertEqual(payload["status"], "verified")

    def test_remote_revision_drift_blocks(self) -> None:
        results = [
            subprocess.CompletedProcess([], 0, "local\n", ""),
            subprocess.CompletedProcess([], 0, "remote\trefs/heads/main\n", ""),
        ]
        with patch.object(MODULE.subprocess, "run", side_effect=results):
            payload = MODULE.report("origin", "main")
        self.assertEqual(payload["status"], "blocked")
        self.assertIn("does not contain", payload["reason"])

    def test_remote_lookup_failure_is_external_blocker(self) -> None:
        results = [
            subprocess.CompletedProcess([], 0, "local\n", ""),
            subprocess.CompletedProcess([], 128, "", "network unavailable"),
        ]
        with patch.object(MODULE.subprocess, "run", side_effect=results):
            payload = MODULE.report("origin", "main")
        self.assertEqual(payload["status"], "blocked")
        self.assertEqual(payload["boundary"], "external")


if __name__ == "__main__":
    unittest.main()
