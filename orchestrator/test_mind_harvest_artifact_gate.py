import copy
import json
import importlib.util
import sys
import unittest
from pathlib import Path

def load_module(name: str):
    module_path = Path(__file__).with_name(f"{name}.py")
    spec = importlib.util.spec_from_file_location(name, module_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


harvester = load_module("mind_crawler")
gate = load_module("mind_harvest_artifact_gate")
harvest = harvester.harvest
validate_artifact = gate.validate_artifact


FIXTURE = Path(__file__).parent / "fixtures" / "mind-harvester" / "contradictory-footprint.json"


class MindHarvestArtifactGateTests(unittest.TestCase):
    def setUp(self):
        sources = json.loads(FIXTURE.read_text(encoding="utf-8"))["sources"]
        self.artifact = harvest("example-style", sources)

    def test_fixture_artifact_passes_contract(self):
        self.assertEqual(validate_artifact(self.artifact), [])

    def test_gate_rejects_raw_content(self):
        invalid = copy.deepcopy(self.artifact)
        invalid["sources"][0]["content"] = "private source text"
        self.assertTrue(any("forbidden raw field" in error for error in validate_artifact(invalid)))

    def test_gate_rejects_promotion_or_enforcement(self):
        invalid = copy.deepcopy(self.artifact)
        invalid["proposal"]["promotionEligible"] = True
        invalid["proposal"]["candidateChanges"][0]["enforcement"] = "enforced"
        errors = validate_artifact(invalid)
        self.assertTrue(any("promotion eligible" in error for error in errors))
        self.assertTrue(any("proposal-only" in error for error in errors))

    def test_gate_rejects_unknown_signal_source(self):
        invalid = copy.deepcopy(self.artifact)
        invalid["signals"][0]["sourceId"] = "missing-source"
        self.assertTrue(any("unknown source" in error for error in validate_artifact(invalid)))


if __name__ == "__main__":
    unittest.main()
