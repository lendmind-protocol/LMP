#!/usr/bin/env python3
import os
import shutil
import json
import subprocess
import time
from typing import Dict, Any, List

class LMPTestBedOrchestrator:
    def __init__(self, base_test_dir: str = "./lmp_test_bed"):
        self.base_dir = os.path.abspath(base_test_dir)
        self.mock_repos_dir = os.path.join(self.base_dir, "repositories")
        self.skills_dir = os.path.join(self.base_dir, "skills")
        self.results_dir = os.path.join(self.base_dir, "results")
        
    def setup_environment(self) -> None:
        """Initializes clean file structures and generates mock execution workspaces."""
        print(f"🧹 Scrubbing and re-initializing local testbed boundary at: {self.base_dir}")
        if os.path.exists(self.base_dir):
            shutil.rmtree(self.base_dir)
            
        os.makedirs(self.mock_repos_dir, exist_ok=True)
        os.makedirs(self.skills_dir, exist_ok=True)
        os.makedirs(self.results_dir, exist_ok=True)
        
        self._generate_mock_skills()
        self._generate_mock_repositories()

    def _generate_mock_skills(self) -> None:
        """Injects production-grade skill configurations for testing."""
        ponytail_skill = {
            "id": "lmp:skill:tj-ponytail",
            "version": "1.0.0",
            "manifest_intercepts": {
                "package.json": {
                    "strip_dependencies": ["express", "lodash", "axios"],
                    "inject_fields": { "type": "module" }
                }
            },
            "runtime_execution_policy": {
                "verify_command": "node --version",
                "profile_command": "echo 'Profiling completed'"
            }
        }
        
        with open(os.path.join(self.skills_dir, "tj-ponytail.json"), "w") as f:
            json.dump(ponytail_skill, f, indent=2)

    def _generate_mock_repositories(self) -> None:
        """Creates distinct target codebases representing typical developer mistakes."""
        # Scenario 1: A bloated project breaching the Ponytail Minimalism Axioms
        bloated_node_repo = os.path.join(self.mock_repos_dir, "bloated-node-service")
        os.makedirs(bloated_node_repo, exist_ok=True)
        
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
        with open(os.path.join(bloated_node_repo, "package.json"), "w") as f:
            json.dump(bad_package_json, f, indent=2)
            
        # Scenario 2: Clean code that passes validation perfectly
        clean_node_repo = os.path.join(self.mock_repos_dir, "clean-micro-service")
        os.makedirs(clean_node_repo, exist_ok=True)
        
        good_package_json = {
            "name": "pure-minimalist-service",
            "version": "1.0.0",
            "type": "module",
            "dependencies": {
                "polka": "^0.5.2",
                "undici": "^5.22.0"
            }
        }
        with open(os.path.join(clean_node_repo, "package.json"), "w") as f:
            json.dump(good_package_json, f, indent=2)

    def execute_benchmark_suite(self) -> List[Dict[str, Any]]:
        """Orchestrates local matrix execution loops over all targets."""
        suite_results = []
        skill_config_path = os.path.join(self.skills_dir, "tj-ponytail.json")
        
        print("\n🚀 Executing Lending-Mind Test-Bed Pipeline Runners...")
        
        for repo_name in os.listdir(self.mock_repos_dir):
            repo_path = os.path.join(self.mock_repos_dir, repo_name)
            print(f"\n[TARGET IN evaluation]: {repo_name}")
            
            # Executing our systems-level compiled Rust Binary (`lmpd`) over the workspace
            # For testing integration, we simulate the structured CLI invocation output directly
            start_time = time.perf_counter()
            
            # Simulated execution check parsing the manifest structural compliance rules
            pkg_json_file = os.path.join(repo_path, "package.json")
            with open(pkg_json_file, "r") as f:
                data = json.load(f)
                
            deps = data.get("dependencies", {})
            violations = [v for v in ["express", "lodash", "axios"] if v in deps]
            passed = len(violations) == 0
            
            elapsed_time_ms = (time.perf_counter() - start_time) * 1000
            
            report = {
                "repository": repo_name,
                "skill_applied": "lmp:skill:tj-ponytail",
                "status": "COMPLIANT" if passed else "NON_COMPLIANT_REJECTED",
                "metrics": {
                    "evaluation_latency_ms": round(elapsed_time_ms, 4),
                    "axiomatic_breaches": len(violations)
                },
                "detected_violations": violations
            }
            
            suite_results.append(report)
            
            # Save raw metric artifacts to results filesystem tracking
            with open(os.path.join(self.results_dir, f"result-{repo_name}.json"), "w") as rf:
                json.dump(report, rf, indent=2)
                
        return suite_results

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
    results_payload = os.environ.get("LMP_RUN_MOCK", "true")
    
    if results_payload == "true":
        results = orchestrator.execute_benchmark_suite()
        orchestrator.print_aggregated_dashboard(results)
