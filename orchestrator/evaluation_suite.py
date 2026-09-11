#!/usr/bin/env python3
import argparse
import json
import os
import time
from typing import Dict, Any, List

class LMPEvaluationSuite:
    def __init__(self, history_file: str = "./lmp_test_bed/results/historical_trends.json"):
        self.history_file = os.path.abspath(history_file)
        self.results_dir = os.path.dirname(self.history_file)
        os.makedirs(self.results_dir, exist_ok=True)
        
    def load_historical_data(self) -> List[Dict[str, Any]]:
        """Loads previous code quality runs from the system registry cache."""
        if os.path.exists(self.history_file):
            with open(self.history_file, "r") as f:
                try:
                    return json.load(f)
                except json.JSONDecodeError:
                    return []
        return []

    def log_current_run(self, repo_results: List[Dict[str, Any]]) -> None:
        """Calculates structural metrics and records the historical timeline entry."""
        history = self.load_historical_data()
        
        total_runs = len(repo_results)
        if total_runs == 0:
            return
            
        compliant_runs = sum(1 for r in repo_results if r.get("status") == "COMPLIANT")
        total_breaches = sum(r.get("metrics", {}).get("axiomatic_breaches", 0) for r in repo_results)
        avg_latency = sum(r.get("metrics", {}).get("evaluation_latency_ms", 0.0) for r in repo_results) / total_runs
        
        # Calculate the mathematical quality score (0.0 to 100.0)
        base_score = (compliant_runs / total_runs) * 100.0
        penalty_deduction = total_breaches * 10.0
        final_quality_score = max(0.0, min(100.0, base_score - penalty_deduction))

        run_entry = {
            "timestamp": int(time.time()),
            "date_string": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
            "aggregate_metrics": {
                "policy_compliance_score": round(final_quality_score, 2),
                "compliance_ratio": round(compliant_runs / total_runs, 2),
                "total_breaches": total_breaches,
                "mean_latency_ms": round(avg_latency, 4)
            }
        }
        
        history.append(run_entry)
        
        with open(self.history_file, "w") as f:
            json.dump(history, f, indent=2)
            
        self._render_trend_summary(run_entry, history)

    def _render_trend_summary(self, current: Dict[str, Any], history: List[Dict[str, Any]]) -> None:
        """Outputs an analytical breakdown showing progression across pipeline cycles."""
        print("\n📈 ============ LMP HISTORICAL TREND SUMMARY ============")
        print(f"Current Evaluated Run Date : {current['date_string']}")
        print(f"Calculated Policy Compliance: {current['aggregate_metrics']['policy_compliance_score']}%")
        print(f"Active Axiom Breaches Found : {current['aggregate_metrics']['total_breaches']}")
        print(f"Mean Core Runtime Latency   : {current['aggregate_metrics']['mean_latency_ms']} ms")
        print("---------------------------------------------------------")
        
        if len(history) > 1:
            previous_metrics = history[-2].get("aggregate_metrics", {})
            previous_score = previous_metrics.get(
                "policy_compliance_score", previous_metrics.get("code_quality_score")
            )
            if not isinstance(previous_score, (int, float)):
                raise ValueError("historical entry has no policy-compliance score")
            delta = current["aggregate_metrics"]["policy_compliance_score"] - previous_score
            direction = "🔺 Improved" if delta >= 0 else "🔻 Regressed"
            print(f"Progression Vector Shift    : {direction} by {abs(round(delta, 2))}% since last run")
        else:
            print("Progression Vector Shift    : Baseline run established. Waiting for next telemetry iteration.")
        print("=========================================================\n")


def benchmark_results(path: str) -> List[Dict[str, Any]]:
    """Normalize a completed real-world benchmark into historical metrics.

    This adapter accepts only the benchmark's recorded baseline/guided results.
    It never invents quality, latency, or compliance values when an artifact is
    incomplete or missing a required field.
    """
    with open(path, "r", encoding="utf-8") as handle:
        report = json.load(handle)
    if report.get("benchmark") != "lmp-real-world-scenario-matrix":
        raise ValueError("input is not an LMP real-world benchmark artifact")
    if report.get("status") != "complete":
        raise ValueError(f"benchmark status is {report.get('status')!r}, not complete")
    scenarios = report.get("scenarios")
    if not isinstance(scenarios, list) or not scenarios:
        raise ValueError("benchmark contains no scenarios")
    normalized: List[Dict[str, Any]] = []
    for scenario in scenarios:
        guided = scenario.get("guided")
        sandbox = scenario.get("sandbox", {}).get("guided")
        if not isinstance(guided, dict) or not isinstance(sandbox, dict):
            raise ValueError(f"scenario {scenario.get('id', '<unknown>')} has incomplete guided evidence")
        if not isinstance(guided.get("state"), str) or not isinstance(guided.get("hardViolationCount"), int):
            raise ValueError(f"scenario {scenario.get('id', '<unknown>')} has invalid guided evidence")
        if not isinstance(sandbox.get("elapsedMs"), (int, float)) or not isinstance(sandbox.get("exitCode"), int):
            raise ValueError(f"scenario {scenario.get('id', '<unknown>')} has invalid sandbox evidence")
        normalized.append({
            "repository": scenario.get("repository", scenario.get("id", "unknown")),
            "status": "COMPLIANT" if guided["state"] == "pass" and sandbox["exitCode"] == 0 else "NON_COMPLIANT",
            "metrics": {
                "evaluation_latency_ms": float(sandbox["elapsedMs"]),
                "axiomatic_breaches": guided["hardViolationCount"],
            },
        })
    return normalized

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Aggregate a completed LMP benchmark artifact")
    parser.add_argument("--input", required=True, help="completed real-world-benchmark.json")
    parser.add_argument("--history-file", default="./lmp_test_bed/results/historical_trends.json")
    args = parser.parse_args()
    LMPEvaluationSuite(args.history_file).log_current_run(benchmark_results(args.input))
