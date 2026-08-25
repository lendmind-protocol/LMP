#!/usr/bin/env python3
import os
import json
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
                "code_quality_score": round(final_quality_score, 2),
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
        print(f"Calculated Quality Score    : {current['aggregate_metrics']['code_quality_score']}%")
        print(f"Active Axiom Breaches Found : {current['aggregate_metrics']['total_breaches']}")
        print(f"Mean Core Runtime Latency   : {current['aggregate_metrics']['mean_latency_ms']} ms")
        print("---------------------------------------------------------")
        
        if len(history) > 1:
            previous_score = history[-2]["aggregate_metrics"]["code_quality_score"]
            delta = current["aggregate_metrics"]["code_quality_score"] - previous_score
            direction = "🔺 Improved" if delta >= 0 else "🔻 Regressed"
            print(f"Progression Vector Shift    : {direction} by {abs(round(delta, 2))}% since last run")
        else:
            print("Progression Vector Shift    : Baseline run established. Waiting for next telemetry iteration.")
        print("=========================================================\n")

if __name__ == "__main__":
    # Test suite run simulating code adjustments coming from the agent loop
    suite = LMPEvaluationSuite()
    
    # Mock data modeling an agent cleaning its code assets after receiving an invalidation signal
    simulated_run_output = [
        {
            "repository": "bloated-node-service",
            "status": "COMPLIANT",  # Refactored down successfully by the agent
            "metrics": {"evaluation_latency_ms": 1.24, "axiomatic_breaches": 0}
        },
        {
            "repository": "clean-micro-service",
            "status": "COMPLIANT",
            "metrics": {"evaluation_latency_ms": 0.86, "axiomatic_breaches": 0}
        }
    ]
    
    suite.log_current_run(simulated_run_output)
