import json
import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

from orchestrator.release_binary_smoke import BINARY_NAMES, smoke


class ReleaseBinarySmokeTests(unittest.TestCase):
    def test_runs_every_native_binary(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in BINARY_NAMES:
                path = root / name
                path.write_text("#!/bin/sh\nprintf '%s 0.1.0\\n' \"$0\"\n", encoding="utf-8")
                path.chmod(path.stat().st_mode | stat.S_IXUSR)
            report = smoke(root, "x86_64-unknown-linux-gnu")
            self.assertEqual(report["status"], "verified")
            self.assertEqual(len(report["binaries"]), len(BINARY_NAMES))

    def test_rejects_missing_binary(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                smoke(Path(directory), "x86_64-unknown-linux-gnu")

    def test_cli_reports_blocked_as_json(self) -> None:
        result = subprocess.run(
            ["python3", "orchestrator/release_binary_smoke.py", "--target", "x86_64-unknown-linux-gnu", "--binary-dir", tempfile.gettempdir()],
            capture_output=True,
            text=True,
            check=False,
            env={**os.environ, "PYTHONPATH": "orchestrator"},
        )
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout)["status"], "blocked")
