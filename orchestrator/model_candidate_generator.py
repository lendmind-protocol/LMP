#!/usr/bin/env python3
"""Generate digest-bound paired benchmark inputs from one external model host.

The generator is deliberately provider-neutral. The configured command receives
one JSON request on stdin and must return one JSON object containing
implementation, test, and package strings. No generated response is accepted
without the requested fields and a matching request digest in the manifest.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shlex
import subprocess
from pathlib import Path
from typing import Any

try:
    from .real_world_benchmark import REPOSITORIES, TASKS
except ImportError:
    from real_world_benchmark import REPOSITORIES, TASKS


def digest(value: object) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def request_for(
    input_id: str,
    trial: int,
    repository: tuple[str, str],
    task: tuple[str, str, str],
    condition: str,
    lmp_context: str,
) -> dict[str, Any]:
    return {
        "protocol": "lmp-cl-008-model-generation-v1",
        "inputId": input_id,
        "trial": trial,
        "repository": {"name": repository[0], "url": repository[1]},
        "task": {"type": task[0], "instruction": task[1], "sourceId": task[2]},
        "condition": condition,
        "instructions": (
            "Generate a minimal TypeScript implementation, a matching test, and "
            "a package JSON object. Return JSON only with fields implementation, "
            "test, and package. Do not use markdown fences."
        ),
        "lmpContext": lmp_context if condition == "guided" else None,
    }


def run_model(command: list[str], request: dict[str, Any], timeout: int) -> dict[str, str]:
    result = subprocess.run(
        command,
        input=json.dumps(request),
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"model command failed with exit code {result.returncode}")
    try:
        response = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise ValueError("model command returned invalid JSON") from error
    if not isinstance(response, dict):
        raise ValueError("model response must be a JSON object")
    values: dict[str, str] = {}
    for field in ("implementation", "test", "package"):
        value = response.get(field)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"model response requires non-empty {field}")
        values[field] = value
    try:
        package = json.loads(values["package"])
    except json.JSONDecodeError as error:
        raise ValueError("model response package must contain valid JSON") from error
    if not isinstance(package, dict):
        raise ValueError("model response package must be a JSON object")
    values["package"] = json.dumps(package, sort_keys=True, separators=(",", ":"))
    return values


def generate(
    command: list[str],
    provider: str,
    model: str,
    host: str,
    trials: int,
    output: Path,
    lmp_context: str,
    timeout: int,
) -> None:
    inputs = []
    requests = []
    for trial in range(1, trials + 1):
        for repository in REPOSITORIES:
            for task in TASKS:
                input_id = f"model-{trial}-{repository[0]}-{task[0]}"
                condition_values = {}
                for condition in ("baseline", "guided"):
                    request = request_for(input_id, trial, repository, task, condition, lmp_context)
                    requests.append(request)
                    condition_values[condition] = run_model(command, request, timeout)
                paired = {"baseline": condition_values["baseline"], "guided": condition_values["guided"]}
                inputs.append(
                    {
                        "inputId": input_id,
                        "trial": trial,
                        "provenance": {"source": "model-command", "sha256": digest(paired)},
                        **condition_values,
                    }
                )
    request_digest = digest(requests)
    manifest = {
        "manifestVersion": "1.0",
        "producer": {
            "kind": "model",
            "name": "LMP CL-008 model generation adapter",
            "version": "1.0.0",
            "provider": provider,
            "model": model,
            "host": host,
            "requestSha256": request_digest,
        },
        "inputs": inputs,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--command", required=True, help="argv receiving one JSON request on stdin")
    parser.add_argument("--provider", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--host", required=True)
    parser.add_argument("--trials", type=int, default=3)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--lmp-context", default="Use the selected LMP Mind as a review constraint; return evidence-friendly code.")
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args()
    if args.trials < 2:
        parser.error("--trials must be at least 2 for CL-008")
    try:
        generate(shlex.split(args.command), args.provider, args.model, args.host, args.trials, args.output, args.lmp_context, args.timeout)
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        parser.error(str(error))
    print(json.dumps({"status": "generated", "output": str(args.output), "producer": "model", "trials": args.trials}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
