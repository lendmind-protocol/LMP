import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "orchestrator" / "git_release.sh"


def run_release(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(SCRIPT), *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )


def combined_output(result: subprocess.CompletedProcess[str]) -> str:
    return f"{result.stdout}\n{result.stderr}"


class GitReleaseTests(unittest.TestCase):
    def test_default_release_plan_is_read_only(self) -> None:
        result = run_release("v99.98.97")

        self.assertEqual(result.returncode, 0, combined_output(result))
        self.assertIn("Read-only plan complete", combined_output(result))
        self.assertIn("no files, commits, tags, or remotes changed", combined_output(result))


    def test_push_requires_tag(self) -> None:
        result = run_release("v99.98.96", "--push")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--push requires --tag", combined_output(result))


    def test_tag_requires_apply(self) -> None:
        result = run_release("v99.98.95", "--tag")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--tag requires --apply", combined_output(result))

    def test_apply_requires_untracked_files_to_be_clean(self) -> None:
        script = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("git status --porcelain --untracked-files=all", script)


    def test_skip_real_world_is_not_an_available_release_option(self) -> None:
        result = run_release(
            "v99.98.94",
            "--skip-real-world",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Unknown option", combined_output(result))

    def test_final_benchmark_runs_after_release_commit(self) -> None:
        script = SCRIPT.read_text(encoding="utf-8")
        commit_position = script.index('git commit -m "chore: prepare release')
        benchmark_position = script.index("python3 orchestrator/real_world_benchmark.py")
        self.assertLess(commit_position, benchmark_position)
        self.assertIn("final release evidence against committed revision", script)

    def test_release_preflight_binds_registry_and_requires_https_deployment(self) -> None:
        script = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("registry_manifest_gate.py registry/registry.json --lmp target/release/lmp", script)
        self.assertIn("--check-manifests \\\n  --require-https", script)


if __name__ == "__main__":
    unittest.main()
