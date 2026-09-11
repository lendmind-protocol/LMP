"""Bounded Docker execution for Rust-produced LMP evaluation plans.

This module owns orchestration and measurement only. Policy interpretation and
the evaluation decision remain in the Rust runtime.
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence


@dataclass(frozen=True)
class SandboxResult:
    command: list[str]
    exit_code: int
    elapsed_ms: float
    stdout: str
    stderr: str
    timed_out: bool

    def to_dict(self) -> dict[str, object]:
        return {
            "command": self.command,
            "exitCode": self.exit_code,
            "elapsedMs": round(self.elapsed_ms, 3),
            "stdout": self.stdout,
            "stderr": self.stderr,
            "timedOut": self.timed_out,
        }


class DockerSandbox:
    def __init__(
        self,
        workspace: str | Path,
        image: str = "lmp-sandbox:latest",
        no_new_privileges: bool | None = None,
        include_paths: Sequence[str | Path] | None = None,
    ) -> None:
        self.workspace = Path(workspace).resolve()
        self.image = image
        self.include_paths = tuple(include_paths or ())
        self.no_new_privileges = (
            no_new_privileges
            if no_new_privileges is not None
            else os.environ.get("LMP_SANDBOX_NO_NEW_PRIVILEGES", "0") == "1"
        )

    def _mounts(self) -> list[str]:
        if not self.include_paths:
            return [f"{self.workspace}:/workspace:ro"]
        mounts: list[str] = []
        for raw_path in self.include_paths:
            requested = (self.workspace / raw_path) if not Path(raw_path).is_absolute() else Path(raw_path)
            if requested.is_symlink():
                raise ValueError(f"sandbox path cannot be a symlink: {requested}")
            path = requested.resolve()
            if not path.is_relative_to(self.workspace):
                raise ValueError(f"sandbox path escapes workspace: {path}")
            if path.is_symlink():
                raise ValueError(f"sandbox path cannot be a symlink: {path}")
            relative = path.relative_to(self.workspace)
            mounts.extend(
                [
                    "--mount",
                    f"type=bind,source={path},destination=/workspace/{relative},readonly",
                ]
            )
        return mounts

    def build_command(self, command: Sequence[str]) -> list[str]:
        if not command:
            raise ValueError("sandbox command cannot be empty")
        docker_command = [
            "docker",
            "run",
            "--rm",
            "--network=none",
            "--read-only",
            "--cap-drop=ALL",
            "--pids-limit=128",
            "--cpus=2",
            "--memory=128m",
        ]
        if self.no_new_privileges:
            docker_command.append("--security-opt=no-new-privileges")
        docker_command.extend(
            [
                *self._mounts(),
                "-w",
                "/workspace",
                self.image,
                *command,
            ]
        )
        return docker_command

    def run(self, command: Sequence[str], timeout_seconds: int = 120) -> SandboxResult:
        docker_command = self.build_command(command)
        started = time.perf_counter()
        try:
            completed = subprocess.run(
                docker_command,
                check=False,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                shell=False,
            )
            return SandboxResult(
                command=list(command),
                exit_code=completed.returncode,
                elapsed_ms=(time.perf_counter() - started) * 1000,
                stdout=completed.stdout[-16_384:],
                stderr=completed.stderr[-16_384:],
                timed_out=False,
            )
        except subprocess.TimeoutExpired as error:
            stdout = error.stdout or ""
            stderr = error.stderr or ""
            if isinstance(stdout, bytes):
                stdout = stdout.decode(errors="replace")
            if isinstance(stderr, bytes):
                stderr = stderr.decode(errors="replace")
            return SandboxResult(
                command=list(command),
                exit_code=124,
                elapsed_ms=(time.perf_counter() - started) * 1000,
                stdout=stdout[-16_384:],
                stderr=stderr[-16_384:],
                timed_out=True,
            )


def write_result(path: str | Path, result: SandboxResult) -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result.to_dict(), indent=2) + "\n", encoding="utf-8")
