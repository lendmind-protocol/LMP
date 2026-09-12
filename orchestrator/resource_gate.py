#!/usr/bin/env python3
"""Measure lmpd idle resource usage on the current host.

The result is deliberately host-qualified. It proves the observed binary on
the current runner, not every operating system or workload.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import select
import subprocess
import time
from pathlib import Path


def linux_sample(pid: int) -> tuple[int, int]:
    status = Path(f"/proc/{pid}/status").read_text(encoding="utf-8")
    rss_kb = next(int(line.split()[1]) for line in status.splitlines() if line.startswith("VmRSS:"))
    fields = Path(f"/proc/{pid}/stat").read_text(encoding="utf-8").split()
    return rss_kb, int(fields[13]) + int(fields[14])


def main() -> int:
    parser = argparse.ArgumentParser(description="Measure lmpd idle CPU and memory")
    parser.add_argument("--lmpd", type=Path, required=True)
    parser.add_argument("--mind", type=Path, default=Path("profiles/baseline/mind.json"))
    parser.add_argument("--workspace", type=Path, default=Path("."))
    parser.add_argument("--duration", type=float, default=5.0)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    report: dict[str, object] = {
        "platform": platform.platform(),
        "measurement": "idle watcher process",
        "targets": {"maxRssMb": 15, "maxCpuPercent": 1},
        "status": "blocked",
    }
    if platform.system() != "Linux":
        report["reason"] = "This implementation uses /proc; run the equivalent native sampler on this host."
    elif not args.lmpd.is_file():
        report["reason"] = f"lmpd binary not found: {args.lmpd}"
    else:
        process = subprocess.Popen(
            [str(args.lmpd), "--mind", str(args.mind), "--workspace", str(args.workspace)],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        try:
            ready = False
            deadline = time.monotonic() + 30
            while process.stdout and time.monotonic() < deadline:
                remaining = max(0.0, deadline - time.monotonic())
                readable, _, _ = select.select([process.stdout], [], [], min(remaining, 0.25))
                if not readable:
                    if process.poll() is not None:
                        break
                    continue
                line = process.stdout.readline()
                if not line:
                    break
                if "lmpd watching" in line:
                    ready = True
                    break
            if not ready:
                report["reason"] = "lmpd did not reach its watching state"
                report["startupOutput"] = process.stdout.read() if process.stdout else ""
            else:
                # Let the evaluator release transient startup allocations before
                # measuring the steady-state watcher.
                time.sleep(3.0)
                start_time = time.monotonic()
                start_rss, start_ticks = linux_sample(process.pid)
                time.sleep(max(args.duration, 1.0))
                end_time = time.monotonic()
                end_rss, end_ticks = linux_sample(process.pid)
                elapsed = end_time - start_time
                ticks_per_second = os.sysconf(os.sysconf_names["SC_CLK_TCK"])
                cpu_percent = ((end_ticks - start_ticks) / ticks_per_second) / elapsed * 100
                max_rss_mb = max(start_rss, end_rss) / 1024
                report.update(
                    {
                        "status": "pass" if max_rss_mb < 15 and cpu_percent < 1 else "fail",
                        "rssMb": round(max_rss_mb, 3),
                        "cpuPercent": round(cpu_percent, 3),
                        "sampleSeconds": round(elapsed, 3),
                    }
                )
        finally:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()

    encoded = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded, encoding="utf-8")
    print(encoded, end="")
    return 0 if report["status"] == "pass" else 2


if __name__ == "__main__":
    raise SystemExit(main())
