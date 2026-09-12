#!/usr/bin/env python3
import argparse
import json
import os
import time
from typing import Dict, Any, List


EXPECTED_BENCHMARK_SCENARIOS = 64

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
        
        run_entry = {
            "timestamp": int(time.time()),
            "date_string": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
            "aggregate_metrics": {
                "compliant_runs": compliant_runs,
                "evaluated_runs": total_runs,
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
        print(f"Compliant evaluated runs   : {current['aggregate_metrics']['compliant_runs']}/{current['aggregate_metrics']['evaluated_runs']}")
        print(f"Active Axiom Breaches Found : {current['aggregate_metrics']['total_breaches']}")
        print(f"Mean Core Runtime Latency   : {current['aggregate_metrics']['mean_latency_ms']} ms")
        print("---------------------------------------------------------")
        
        if len(history) > 1:
            previous_metrics = history[-2].get("aggregate_metrics", {})
            previous_runs = previous_metrics.get("compliant_runs")
            previous_total = previous_metrics.get("evaluated_runs")
            if not isinstance(previous_runs, int) or not isinstance(previous_total, int) or previous_total == 0:
                print("Progression Vector Shift    : Not comparable; prior run lacks count metadata.")
            else:
                current_ratio = current["aggregate_metrics"]["compliant_runs"] / current["aggregate_metrics"]["evaluated_runs"]
                previous_ratio = previous_runs / previous_total
                direction = "higher" if current_ratio >= previous_ratio else "lower"
                print(f"Compliance-count comparison : {direction} observed ratio; no quality score inferred.")
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
    summary = report.get("summary")
    if (
        not isinstance(summary, dict)
        or summary.get("scenarioCount") != EXPECTED_BENCHMARK_SCENARIOS
        or summary.get("expectedScenarioCount") != EXPECTED_BENCHMARK_SCENARIOS
    ):
        raise ValueError(f"benchmark must contain exactly {EXPECTED_BENCHMARK_SCENARIOS} scenarios")
    if summary.get("passedTransitions") != EXPECTED_BENCHMARK_SCENARIOS or summary.get("allTransitionsPassed") is not True:
        raise ValueError("benchmark transitions are incomplete")
    if summary.get("dockerGatesPassed") != EXPECTED_BENCHMARK_SCENARIOS * 2 or summary.get("dockerGatesExpected") != EXPECTED_BENCHMARK_SCENARIOS * 2:
        raise ValueError("benchmark Docker evidence is incomplete")
    privacy = report.get("privacy")
    if not isinstance(privacy, dict) or any(privacy.get(key) is not False for key in ("sourceCodeIncluded", "rawPathsIncluded", "privateReasoningIncluded")):
        raise ValueError("benchmark privacy evidence is incomplete")
    scenarios = report.get("scenarios")
    if not isinstance(scenarios, list) or not scenarios:
        raise ValueError("benchmark contains no scenarios")
    if len(scenarios) != EXPECTED_BENCHMARK_SCENARIOS:
        raise ValueError(f"benchmark must contain exactly {EXPECTED_BENCHMARK_SCENARIOS} scenarios")
    normalized: List[Dict[str, Any]] = []
    for scenario in scenarios:
        guided = scenario.get("guided")
        sandbox = scenario.get("sandbox", {}).get("guided")
        if not isinstance(guided, dict) or not isinstance(sandbox, dict):
            raise ValueError(f"scenario {scenario.get('id', '<unknown>')} has incomplete guided evidence")
        if not isinstance(guided.get("state"), str) or not isinstance(guided.get("hardViolationCount"), int) or guided["hardViolationCount"] < 0:
            raise ValueError(f"scenario {scenario.get('id', '<unknown>')} has invalid guided evidence")
        if not isinstance(sandbox.get("elapsedMs"), (int, float)) or sandbox["elapsedMs"] < 0 or not isinstance(sandbox.get("exitCode"), int) or sandbox.get("timedOut") is not False:
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
