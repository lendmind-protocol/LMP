from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "orchestrator" / "release_readiness.py"


class ReleaseReadinessTests(unittest.TestCase):
    def run_report(self, *args: str) -> tuple[int, dict]:
        result = subprocess.run(
            [sys.executable, str(SCRIPT), *args],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        return result.returncode, json.loads(result.stdout)

    def test_default_report_is_fail_closed_and_names_missing_external_proof(self) -> None:
        code, report = self.run_report("--benchmark", "missing.json", "--registry", "missing.json")
        self.assertEqual(code, 2)
        self.assertEqual(report["status"], "blocked")
        self.assertIn("benchmarkEvidence", report["checks"])
        self.assertIn("benchmarkTechnicalEvidence", report["checks"])
        self.assertIn("registryRelease", report["checks"])
        self.assertEqual(report["checks"]["registryCopyParity"]["status"], "blocked")
        self.assertIn("registryManifestParity", report["checks"])
        # The repository is expected to be clean in normal release verification;
        # the report must remain blocked because the supplied evidence is absent,
        # not because this regression test dirties the checkout.
        self.assertEqual(report["checks"]["workingTree"]["status"], "pass")
        self.assertEqual(report["checks"]["workingTree"]["changedPathCount"], 0)
        self.assertEqual(report["checks"]["staticDeployment"]["status"], "blocked")
        self.assertEqual(report["checks"]["staticDeployment"]["boundary"], "external")
        self.assertEqual(report["checks"]["humanAdoptionPilot"]["status"], "blocked")
        self.assertEqual(report["checks"]["humanAdoptionPilot"]["boundary"], "human")
        self.assertEqual(report["checks"]["qualificationEvidence"]["status"], "pass")

    def test_qualification_evidence_requires_the_complete_38_scenario_contract(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            qualification = Path(raw) / "qualification.json"
            qualification.write_text(json.dumps({
                "status": "complete",
                "scenarioCount": 38,
                "expectedScenarioCount": 38,
                "dockerRequired": True,
                "passed": [f"scenario-{index}" for index in range(38)],
            }), encoding="utf-8")
            code, report = self.run_report(
                "--benchmark", "missing.json",
                "--registry", "missing.json",
                "--qualification", str(qualification),
            )
        self.assertEqual(code, 2)
        self.assertEqual(report["checks"]["qualificationEvidence"]["status"], "pass")

    def test_qualification_evidence_rejects_a_partial_result(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            qualification = Path(raw) / "qualification.json"
            qualification.write_text(json.dumps({
                "status": "complete",
                "scenarioCount": 37,
                "expectedScenarioCount": 38,
                "dockerRequired": True,
                "passed": [f"scenario-{index}" for index in range(37)],
            }), encoding="utf-8")
            code, report = self.run_report(
                "--benchmark", "missing.json",
                "--registry", "missing.json",
                "--qualification", str(qualification),
            )
        self.assertEqual(code, 2)
        check = report["checks"]["qualificationEvidence"]
        self.assertEqual(check["status"], "blocked")
        self.assertIn("exactly 38", json.dumps(check))

    def test_failed_registry_gate_is_preserved_as_a_blocker(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            registry = Path(raw) / "registry.json"
            registry.write_text(json.dumps({"entries": []}), encoding="utf-8")
            code, report = self.run_report("--benchmark", "missing.json", "--registry", str(registry))
        self.assertEqual(code, 2)
        self.assertEqual(report["checks"]["registryRelease"]["status"], "blocked")
        self.assertEqual(report["checks"]["registryRelease"]["boundary"], "external")
        self.assertIn("registry must contain", json.dumps(report["checks"]["registryRelease"]))

    def test_registry_manifest_parity_can_pass_independently(self) -> None:
        code, report = self.run_report(
            "--benchmark", "missing.json",
            "--registry", "registry/registry.json",
            "--lmp", "target/debug/lmp",
        )
        self.assertEqual(code, 2)
        self.assertEqual(report["checks"]["registryManifestParity"]["status"], "pass")

    def test_registry_copy_parity_passes_for_checked_in_public_copy(self) -> None:
        code, report = self.run_report(
            "--benchmark", "missing.json",
            "--registry", "registry/registry.json",
            "--lmp", "target/debug/lmp",
        )
        self.assertEqual(code, 2)
        self.assertEqual(report["checks"]["registryCopyParity"]["status"], "pass")

    def test_pass_requires_every_supplied_check(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            resource = Path(raw) / "resource.json"
            resource.write_text(json.dumps({
                "status": "pass",
                "rssMb": 3.7,
                "cpuPercent": 0.0,
                "sampleSeconds": 5.0,
                "targets": {"maxRssMb": 15, "maxCpuPercent": 1},
            }), encoding="utf-8")
            pilot = Path(raw) / "pilot.json"
            pilot.write_text(json.dumps({
                "status": "complete",
                "participants": 5,
                "repositoryCategories": ["web", "cli", "systems"],
                "operatingSystems": ["Linux", "macOS"],
                "completedOnboardingWithoutHelp": 5,
                "remediatedFindingParticipants": 4,
                "understoodPassBoundaryParticipants": 5,
                "privacy": {"sourceCodeIncluded": False, "secretsIncluded": False},
            }), encoding="utf-8")
            code, report = self.run_report(
                "--benchmark", "missing.json",
                "--registry", "missing.json",
                "--resource-report", str(resource),
                "--human-pilot-report", str(pilot),
            )
        self.assertEqual(code, 2)
        self.assertEqual(report["checks"]["daemonResources"]["status"], "pass")
        self.assertEqual(report["checks"]["humanAdoptionPilot"]["status"], "pass")
        self.assertEqual(report["checks"]["humanAdoptionPilot"]["boundary"], "human")
        self.assertNotEqual(report["status"], "ready")

    def test_resource_gate_rejects_status_only_claims(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            resource = Path(raw) / "resource.json"
            resource.write_text(json.dumps({"status": "pass"}), encoding="utf-8")
            code, report = self.run_report(
                "--benchmark", "missing.json",
                "--registry", "missing.json",
                "--resource-report", str(resource),
            )
        self.assertEqual(code, 2)
        check = report["checks"]["daemonResources"]
        self.assertEqual(check["status"], "blocked")
        self.assertIn("numeric targets", json.dumps(check))

    def test_onboarding_gate_requires_both_measured_workspace_modes(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            onboarding = Path(raw) / "onboarding.json"
            onboarding.write_text(json.dumps({
                "artifactVersion": "1.0",
                "benchmark": "lmp-create-onboarding",
                "status": "complete",
                "cases": [{"strategy": "greenfield", "status": "pass", "exitCode": 0, "elapsedMs": 12}],
                "privacy": {"sourceCodeIncluded": False, "secretsIncluded": False},
            }), encoding="utf-8")
            code, report = self.run_report(
                "--benchmark", "missing.json",
                "--registry", "missing.json",
                "--onboarding", str(onboarding),
            )
        self.assertEqual(code, 2)
        check = report["checks"]["onboardingPerformance"]
        self.assertEqual(check["status"], "blocked")
        self.assertIn("greenfield and brownfield", json.dumps(check))

    def test_human_pilot_requires_the_full_acceptance_contract(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            pilot = Path(raw) / "pilot.json"
            pilot.write_text(json.dumps({"status": "complete", "participants": 5}), encoding="utf-8")
            code, report = self.run_report(
                "--benchmark", "missing.json",
                "--registry", "missing.json",
                "--human-pilot-report", str(pilot),
            )
        self.assertEqual(code, 2)
        check = report["checks"]["humanAdoptionPilot"]
        self.assertEqual(check["status"], "blocked")
        self.assertGreaterEqual(len(check["errors"]), 5)

    def test_human_pilot_passes_only_with_redacted_complete_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            pilot = Path(raw) / "pilot.json"
            pilot.write_text(json.dumps({
                "status": "complete",
                "participants": 5,
                "repositoryCategories": ["web", "cli", "systems"],
                "operatingSystems": ["Linux", "macOS"],
                "completedOnboardingWithoutHelp": 5,
                "remediatedFindingParticipants": 4,
                "understoodPassBoundaryParticipants": 5,
                "privacy": {"sourceCodeIncluded": False, "secretsIncluded": False},
            }), encoding="utf-8")
            code, report = self.run_report(
                "--benchmark", "missing.json",
                "--registry", "missing.json",
                "--human-pilot-report", str(pilot),
            )
        self.assertEqual(code, 2)
        self.assertEqual(report["checks"]["humanAdoptionPilot"]["status"], "pass")

    def test_malformed_pilot_arrays_are_reported_as_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            pilot = Path(raw) / "pilot.json"
            pilot.write_text(json.dumps({
                "status": "complete",
                "participants": 5,
                "repositoryCategories": [{"unexpected": "object"}],
                "operatingSystems": ["Linux", 7],
            }), encoding="utf-8")
            code, report = self.run_report(
                "--benchmark", "missing.json",
                "--registry", "missing.json",
                "--human-pilot-report", str(pilot),
            )
        self.assertEqual(code, 2)
        self.assertEqual(report["checks"]["humanAdoptionPilot"]["status"], "blocked")
        self.assertIn("repository categories", json.dumps(report["checks"]))

    def test_human_pilot_rejects_impossible_participant_counts(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            pilot = Path(raw) / "pilot.json"
            pilot.write_text(json.dumps({
                "status": "complete",
                "participants": 5,
                "repositoryCategories": ["web", "cli", "systems"],
                "operatingSystems": ["Linux", "macOS"],
                "completedOnboardingWithoutHelp": 6,
                "remediatedFindingParticipants": 5,
                "understoodPassBoundaryParticipants": 6,
                "privacy": {"sourceCodeIncluded": False, "secretsIncluded": False},
            }), encoding="utf-8")
            code, report = self.run_report(
                "--benchmark", "missing.json",
                "--registry", "missing.json",
                "--human-pilot-report", str(pilot),
            )
        self.assertEqual(code, 2)
        check = report["checks"]["humanAdoptionPilot"]
        self.assertEqual(check["status"], "blocked")
        self.assertIn("every participant", json.dumps(check))


if __name__ == "__main__":
    unittest.main()
