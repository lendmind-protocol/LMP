import tempfile
import unittest
from pathlib import Path

from orchestrator.test_bed import LMPTestBedOrchestrator


class TestBedSafetyTests(unittest.TestCase):
    def test_setup_uses_an_isolated_run_and_preserves_existing_evidence(self) -> None:
        with tempfile.TemporaryDirectory(prefix="lmp-test-bed-root-") as root:
            root_path = Path(root)
            sentinel = root_path / "existing-evidence.json"
            sentinel.write_text('{"keep": true}\n', encoding="utf-8")

            orchestrator = LMPTestBedOrchestrator(root)
            orchestrator.setup_environment()

            self.assertEqual(sentinel.read_text(encoding="utf-8"), '{"keep": true}\n')
            self.assertTrue(orchestrator.base_dir.parent == root_path)
            self.assertTrue(
                (orchestrator.repositories_dir / "bloated-node-service" / "implementation.ts").is_file()
            )
            self.assertTrue(
                (orchestrator.repositories_dir / "clean-micro-service" / "implementation.test.ts").is_file()
            )


if __name__ == "__main__":
    unittest.main()
