from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "orchestrator" / "docs_quality_gate.py"


class DocsQualityGateTests(unittest.TestCase):
    def test_published_docs_have_valid_structure_and_routes(self) -> None:
        result = subprocess.run(
            [sys.executable, str(SCRIPT)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "pass")
        self.assertEqual(payload["pageCount"], payload["routeCount"])
        self.assertGreater(payload["pageCount"], 0)


if __name__ == "__main__":
    unittest.main()
