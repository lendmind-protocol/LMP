import json
import tempfile
import unittest
from pathlib import Path

try:
    from .mind_compiler import main
except ImportError:
    from mind_compiler import main


FIXTURE = Path(__file__).parent / "fixtures" / "mind-harvester" / "contradictory-footprint.json"


class MindCompilerTests(unittest.TestCase):
    def test_compiler_entrypoint_delegates_to_canonical_engine(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "proposal.json"
            result = main([
                "--entity", "example-style",
                "--input", str(FIXTURE),
                "--output", str(output),
            ])
            self.assertEqual(result, 0)
            artifact = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(artifact["schemaVersion"], "lmp.mind-harvest/1")
            self.assertEqual(artifact["status"], "needs-review")
            self.assertFalse(artifact["proposal"]["promotionEligible"])
            self.assertFalse(artifact["privacy"]["sourceContentIncluded"])


if __name__ == "__main__":
    unittest.main()
