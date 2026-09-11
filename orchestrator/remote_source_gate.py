#!/usr/bin/env python3
"""Verify that a release revision is present on the deployment source branch."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys


def git(*args: str) -> tuple[int, str, str]:
    result = subprocess.run(
        ["git", *args], capture_output=True, text=True, check=False
    )
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def report(remote: str, branch: str, expected_revision: str | None = None) -> dict[str, object]:
    head_code, head, head_error = git("rev-parse", "HEAD")
    if head_code != 0 or not head:
        return {
            "status": "blocked",
            "boundary": "local",
            "reason": "unable to resolve the release revision",
            "detail": head_error,
        }

    expected = expected_revision or head
    ref_code, output, ref_error = git("ls-remote", "--heads", remote, f"refs/heads/{branch}")
    if ref_code != 0:
        return {
            "status": "blocked",
            "boundary": "external",
            "remote": remote,
            "branch": branch,
            "expectedRevision": expected,
            "reason": "unable to resolve the deployment source branch",
            "detail": ref_error or output,
        }

    remote_revision = output.split()[0] if output.split() else ""
    if remote_revision != expected:
        return {
            "status": "blocked",
            "boundary": "external",
            "remote": remote,
            "branch": branch,
            "localRevision": head,
            "expectedRevision": expected,
            "remoteRevision": remote_revision or None,
            "reason": "deployment source branch does not contain the expected release revision",
        }

    return {
        "status": "verified",
        "boundary": "external",
        "remote": remote,
        "branch": branch,
        "localRevision": head,
        "expectedRevision": expected,
        "remoteRevision": remote_revision,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--remote", default="origin")
    parser.add_argument("--branch", default="main")
    parser.add_argument("--expected-revision")
    args = parser.parse_args()
    payload = report(args.remote, args.branch, args.expected_revision)
    print(json.dumps(payload, indent=2))
    return 0 if payload["status"] == "verified" else 1


if __name__ == "__main__":
    raise SystemExit(main())
