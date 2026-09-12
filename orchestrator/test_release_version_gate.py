from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "orchestrator" / "release_version_gate.py"


class ReleaseVersionGateTests(unittest.TestCase):
    def run_gate(self, tag: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), tag],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_current_product_release_line_is_v01(self) -> None:
        result = self.run_gate("v0.1.0")
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["productVersion"], "0.1.0")
        self.assertEqual(payload["mindPackageVersions"], "independent")

    def test_production_major_tag_is_rejected(self) -> None:
        result = self.run_gate("v1.0.0")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("pre-1.0", result.stderr)


if __name__ == "__main__":
    unittest.main()
