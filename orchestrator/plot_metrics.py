#!/usr/bin/env python3
import os
import json
import matplotlib.pyplot as plt

def generate_performance_timeline(results_dir: str, output_image_path: str) -> None:
    """Parses local test-bed metrics and exports a scannable performance chart."""
    if not os.path.exists(results_dir):
        print(f"⚠️ Telemetry source directory not found: {results_dir}")
        return

    repositories = []
    latencies = []
    violations = []

    # Harvest metric signatures out of file logs
    for file_name in os.listdir(results_dir):
        if file_name.startswith("result-") and file_name.endswith(".json"):
            file_path = os.path.join(results_dir, file_name)
            try:
                with open(file_path, "r") as f:
                    data = json.load(f)
                    repositories.append(data.get("repository", "unknown"))
                    latencies.append(data.get("metrics", {}).get("evaluation_latency_ms", 0.0))
                    violations.append(data.get("metrics", {}).get("axiomatic_breaches", 0))
            except Exception as e:
                print(f"❌ Failed to parse metric file {file_name}: {e}")

    if not repositories:
        print("Empty telemetry set. Skipping metric presentation layout.")
        return

    # Create twin-axis performance dashboard layout
    fig, ax1 = plt.subplots(figsize=(10, 5))

    color = '#1f77b4'
    ax1.set_xlabel('Evaluated Repositories / Code Workspaces', fontweight='bold', labelpad=12)
    ax1.set_ylabel('Evaluation Latency (ms)', color=color, fontweight='bold')
    bars = ax1.bar(repositories, latencies, color=color, alpha=0.6, width=0.4, label='Latency (ms)')
    ax1.tick_params(axis='y', labelcolor=color)
    ax1.set_xticklabels(repositories, rotation=15, ha='right')

    ax2 = ax1.twinx()  
    color = '#d62728'
    ax2.set_ylabel('Axiomatic Breaches Encountered', color=color, fontweight='bold')
    line = ax2.plot(repositories, violations, color=color, marker='o', linewidth=2, markersize=8, label='Axiom Breaches')
    ax2.tick_params(axis='y', labelcolor=color)

    plt.title('Lending-Mind Protocol (LMP) Execution Telemetry Dashboard', fontsize=14, fontweight='bold', pad=20)
    fig.tight_layout()
    
    # Save the consolidated chart artifact back to file system tracking
    plt.savefig(output_image_path, dpi=150)
    print(f"✨ Performance visualization matrix exported to: {output_image_path}")

if __name__ == "__main__":
    base_dir = "./lmp_test_bed/results"
    output_target = os.path.join(base_dir, "evaluation_metrics_dashboard.png")
    generate_performance_timeline(base_dir, output_target)

