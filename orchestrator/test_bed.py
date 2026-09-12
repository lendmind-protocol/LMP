#!/usr/bin/env python3
import json
import os
import subprocess
import tempfile
import time
import hashlib
from pathlib import Path
from typing import Any, Dict, List

class LMPTestBedOrchestrator:
    def __init__(self, base_test_dir: str | None = None):
        configured_root = base_test_dir or os.environ.get("LMP_TEST_BED_DIR")
        self._temporary_root: tempfile.TemporaryDirectory[str] | None = None
        if configured_root:
            root = Path(configured_root)
            root.mkdir(parents=True, exist_ok=True)
            self.base_dir = Path(tempfile.mkdtemp(prefix="run-", dir=root))
        else:
            self._temporary_root = tempfile.TemporaryDirectory(prefix="lmp-test-bed-")
            self.base_dir = Path(self._temporary_root.name)
        self.repositories_dir = self.base_dir / "repositories"
        self.results_dir = self.base_dir / "results"
        
    def setup_environment(self) -> None:
        """Create a new disposable fixture run without deleting prior evidence."""
        print(f"🧪 Creating isolated local fixture run at: {self.base_dir}")
        self.repositories_dir.mkdir(parents=True, exist_ok=True)
        self.results_dir.mkdir(parents=True, exist_ok=True)
        self._generate_repositories()

    def _generate_repositories(self) -> None:
        """Create controlled fixtures representing explicit policy outcomes."""
        # Scenario 1: A bloated project breaching the Ponytail Minimalism Axioms
        bloated_node_repo = self.repositories_dir / "bloated-node-service"
        bloated_node_repo.mkdir(parents=True, exist_ok=True)
        
        bad_package_json = {
            "name": "legacy-bloat-service",
            "version": "1.0.0",
            "dependencies": {
                "express": "^4.18.2",
                "lodash": "^4.17.21",
                "axios": "^1.4.0",
                "kleur": "^4.1.5"
            }
        }
        (bloated_node_repo / "package.json").write_text(json.dumps(bad_package_json, indent=2) + "\n")
        (bloated_node_repo / "tsconfig.json").write_text(json.dumps({"compilerOptions": {"strict": True}}) + "\n")
        (bloated_node_repo / "implementation.ts").write_text("export function build(input: any) { return eval(input); }\n")
        (bloated_node_repo / "implementation.test.ts").write_text("export const test = true;\n")
            
        # Scenario 2: Clean code that passes validation perfectly
        clean_node_repo = self.repositories_dir / "clean-micro-service"
        clean_node_repo.mkdir(parents=True, exist_ok=True)
        
        good_package_json = {
            "name": "pure-minimalist-service",
            "version": "1.0.0",
            "type": "module",
            "dependencies": {
                "polka": "^0.5.2",
                "undici": "^5.22.0"
            }
        }
        (clean_node_repo / "package.json").write_text(json.dumps(good_package_json, indent=2) + "\n")
        (clean_node_repo / "tsconfig.json").write_text(json.dumps({"compilerOptions": {"strict": True}}) + "\n")
        (clean_node_repo / "implementation.ts").write_text("export function add(left: number, right: number): number { return left + right; }\n")
        (clean_node_repo / "implementation.test.ts").write_text("export const test = true;\n")

    def execute_benchmark_suite(self) -> List[Dict[str, Any]]:
        """Orchestrates local matrix execution loops over all targets."""
        suite_results = []
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        lmp_binary = os.environ.get("LMP_BIN", os.path.join(project_root, "target", "debug", "lmp"))
        mind_path = os.path.join(project_root, "profiles", "typescript-minimal")
        if not os.path.isfile(lmp_binary):
            raise RuntimeError(f"Rust evaluator binary not found: {lmp_binary}")
        
        print("\n🚀 Executing Lending-Mind Test-Bed Pipeline Runners...")
        
        for repo_name in sorted(os.listdir(self.repositories_dir)):
            repo_path = os.path.join(self.repositories_dir, repo_name)
            print(f"\n[TARGET IN evaluation]: {repo_name}")
            
            started = time.perf_counter()
            completed = subprocess.run(
                [
                    lmp_binary,
                    "evaluate",
                    "--mind",
                    mind_path,
                    "--workspace",
                    repo_path,
                    "--mode",
                    "enforced",
                    "--json",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            if completed.returncode not in (0, 1):
                raise RuntimeError(completed.stderr.strip() or "Rust evaluator failed")
            elapsed_time_ms = (time.perf_counter() - started) * 1000
            if not completed.stdout.strip():
                raise RuntimeError(
                    f"LMP evaluation produced no JSON for {repo_name} "
                    f"(exit {completed.returncode}): {completed.stderr.strip()}"
                )
            try:
                artifact = json.loads(completed.stdout)
            except json.JSONDecodeError as error:
                raise RuntimeError(
                    f"LMP evaluation produced invalid JSON for {repo_name}: {error}"
                ) from error
            findings = artifact.get("checks", [])
            violations = [finding.get("ruleId") for finding in findings if not finding.get("passed", False)]
            passed = artifact.get("state") == "pass"
            
            report = {
                "fixtureType": "controlled-fixture",
                "fixtureRevision": self._fixture_revision(Path(repo_path)),
                "repository": repo_name,
                "mind": "lmp:mind:typescript-minimal",
                "evidenceScope": "local controlled fixture; not a production benchmark",
                "status": "COMPLIANT" if passed else "NON_COMPLIANT_REJECTED",
                "metrics": {
                    "evaluation_latency_ms": round(elapsed_time_ms, 4),
                    "axiomatic_breaches": len(violations)
                },
                "detected_violations": violations
            }
            
            suite_results.append(report)
            
            # Save raw metric artifacts to results filesystem tracking
            with open(self.results_dir / f"result-{repo_name}.json", "w") as rf:
                json.dump(report, rf, indent=2)
                
        return suite_results

    @staticmethod
    def _fixture_revision(repo_path: Path) -> str:
        digest = hashlib.sha256()
        for path in sorted(candidate for candidate in repo_path.rglob("*") if candidate.is_file()):
            digest.update(str(path.relative_to(repo_path)).encode("utf-8"))
            digest.update(b"\0")
            digest.update(path.read_bytes())
        return digest.hexdigest()

    def print_aggregated_dashboard(self, results: List[Dict[str, Any]]) -> None:
        """Displays clear scannable telemetry metrics directly to the console."""
        print("\n📊 ============ LMP LOCAL TEST-BED RUNNER DASHBOARD ============")
        print(f"Total Isolated Scenarios Run: {len(results)}")
        print("----------------------------------------------------------------")
        for r in results:
            status_emoji = "✅" if r["status"] == "COMPLIANT" else "❌"
            print(f"{status_emoji} Repo: {r['repository']:<25} | Status: {r['status']:<22} | Breaches: {r['metrics']['axiomatic_breaches']}")
            if r["detected_violations"]:
                print(f"   ↳ 🚨 Found Prohibited Bloat: {r['detected_violations']}")
        print("=================================================================\n")


if __name__ == "__main__":
    orchestrator = LMPTestBedOrchestrator()
    orchestrator.setup_environment()
    results = orchestrator.execute_benchmark_suite()
    orchestrator.print_aggregated_dashboard(results)
