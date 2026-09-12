#!/usr/bin/env python3
"""Run the complete real-OSS internal demonstration matrix.

The runner intentionally uses controlled, reproducible candidate patches rather
than claiming that a static evaluator can recreate an arbitrary model run. Each
repository receives the same task shape in two isolated workspaces: a baseline
candidate containing known quality regressions and a Mind-guided candidate that
implements the selected minimal/native trade-off.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
ONBOARD = ROOT / "packages/create-lmp/bin.ts"
MIND = ROOT / "profiles/typescript-minimal"


@dataclass(frozen=True)
class DemoRepository:
    key: str
    url: str
    task: str


REPOSITORIES = (
    DemoRepository(
        "create-t3-app",
        "https://github.com/t3-oss/create-t3-app.git",
        "Add a small response-header helper without adding infrastructure.",
    ),
    DemoRepository(
        "supabase",
        "https://github.com/supabase/supabase.git",
        "Add a typed request helper while preserving the existing dependency boundary.",
    ),
    DemoRepository(
        "codex-security",
        "https://github.com/openai/codex-security.git",
        "Add a small validation helper with explicit control flow and no hidden execution.",
    ),
)


def run(command: list[str], cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=cwd, text=True, capture_output=True, check=check)


def json_file(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def clone(repo: DemoRepository, destination: Path) -> str:
    run(["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse", repo.url, str(destination)])
    run(["git", "sparse-checkout", "set", "--cone", ".github", "packages", "src", "lib", "package.json", "README.md"], cwd=destination, check=False)
    return run(["git", "rev-parse", "HEAD"], cwd=destination).stdout.strip()


def onboard(workspace: Path) -> None:
    result = run(["node", str(ONBOARD), str(workspace)], cwd=ROOT, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"onboarding failed: {result.stderr.strip()}")
    required = (".lending-mind/config.json", ".lending-mind/mind/mind.json", "AGENTS.md", "CLAUDE.md")
    missing = [item for item in required if not (workspace / item).exists()]
    if missing:
        raise RuntimeError(f"onboarding did not create: {', '.join(missing)}")


def candidate_files(workspace: Path, guided: bool) -> None:
    target = workspace / "lmp-demo"
    target.mkdir(exist_ok=True)
    if guided:
        (target / "decision.ts").write_text(
            "export function validateInput(value: string): boolean {\n"
            "  return value.trim().length > 0;\n"
            "}\n",
            encoding="utf-8",
        )
        (target / "decision.test.ts").write_text(
            "import { strict as assert } from 'node:assert';\n"
            "import { validateInput } from './decision.js';\n"
            "assert.equal(validateInput('ok'), true);\n",
            encoding="utf-8",
        )
        (target / "package.json").write_text(
            '{"name":"lmp-guided-candidate","private":true,"dependencies":{}}\n',
            encoding="utf-8",
        )
        return
    (target / "decision.ts").write_text(
        "export function validateInput(value: any): boolean {\n"
        "  console.log(value);\n"
        "  return eval('Boolean(value)');\n"
        "}\n",
        encoding="utf-8",
    )
    (target / "decision.test.ts").write_text(
        "import { validateInput } from './decision.js';\n"
        "validateInput('candidate');\n",
        encoding="utf-8",
    )
    (target / "package.json").write_text(
        '{"name":"lmp-baseline-candidate","private":true,"dependencies":{"lodash":"^4.17.21"}}\n',
        encoding="utf-8",
    )


def evaluate(binary: Path, workspace: Path, mind: Path, output: Path) -> dict[str, Any]:
    output.mkdir(parents=True, exist_ok=True)
    result = run(
        [
            str(binary),
            "evaluate",
            "--mind",
            str(mind),
            "--workspace",
            str(workspace),
            "--mode",
            "enforced",
            "--json",
            "--artifact-dir",
            str(output),
        ],
        check=False,
    )
    report = json.loads(result.stdout)
    return {
        "exitCode": result.returncode,
        "state": report["state"],
        "hardViolationCount": report["summary"]["hardViolationCount"],
        "checkedFiles": report["workspace"]["scope"]["checkedFiles"],
        "rules": sorted({check["ruleId"] for check in report["checks"]}),
        "mindDigest": report["mind"]["contentDigest"],
        "privacy": report["privacy"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lmp", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--keep-workspaces", action="store_true")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    workspace_root = Path(tempfile.mkdtemp(prefix="lmp-internal-oss-"))
    results: list[dict[str, Any]] = []
    try:
        for repo in REPOSITORIES:
            source = workspace_root / f"{repo.key}-source"
            revision = clone(repo, source)
            base = workspace_root / f"{repo.key}-base"
            guided = workspace_root / f"{repo.key}-guided"
            shutil.copytree(source, base, symlinks=True)
            shutil.copytree(source, guided, symlinks=True)
            onboard(base)
            onboard(guided)
            shutil.copytree(MIND, base / "mind")
            shutil.copytree(MIND, guided / "mind")
            candidate_files(base, guided=False)
            candidate_files(guided, guided=True)
            baseline = evaluate(args.lmp, base, base / "mind", args.output / repo.key / "baseline")
            guided_result = evaluate(args.lmp, guided, guided / "mind", args.output / repo.key / "guided")
            results.append(
                {
                    "repository": repo.key,
                    "url": repo.url,
                    "revision": revision,
                    "task": repo.task,
                    "mind": "lmp:mind:typescript-minimal@1.0.0",
                    "decision": {
                        "selected": "small typed native implementation",
                        "rejected": ["new dependency", "hidden execution", "untyped input"],
                    },
                    "baseline": baseline,
                    "guided": guided_result,
                    "outcome": baseline["state"] == "needs_revision" and guided_result["state"] == "pass",
                }
            )
    finally:
        if not args.keep_workspaces:
            shutil.rmtree(workspace_root, ignore_errors=True)

    report = {
        "artifactVersion": "1.0",
        "demoId": "internal-real-oss-matrix-001",
        "repositories": results,
        "summary": {
            "repositoryCount": len(results),
            "successfulBaselineToGuidedTransitions": sum(item["outcome"] for item in results),
            "allTransitionsPassed": bool(results) and all(item["outcome"] for item in results),
        },
        "privacy": {
            "sourceCodeIncluded": False,
            "rawPathsIncluded": False,
            "networkUsedByEvaluator": False,
        },
        "limitations": [
            "Candidates are controlled reproducible patches, not claims about an unobserved model's private reasoning.",
            "Static evaluation is evidence for these pinned revisions and does not prove universal code quality.",
            "Human adoption and independent agent-host usability remain separate release gates.",
        ],
    }
    (args.output / "internal-real-oss-matrix.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))
    return 0 if report["summary"]["allTransitionsPassed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
