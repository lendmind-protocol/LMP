from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "orchestrator" / "release_artifact_gate.py"
PACKAGER = ROOT / "orchestrator" / "package_release_artifact.py"
TARGET = "x86_64-unknown-linux-gnu"
MATRIX = (
    "x86_64-unknown-linux-gnu",
    "aarch64-apple-darwin",
    "x86_64-apple-darwin",
    "x86_64-pc-windows-msvc",
)


def make_archive(directory: Path, target: str = TARGET, extra: str | None = None, omit: str | None = None) -> None:
    archive_path = directory / f"lmp-{target}.tar.gz"
    names = ["lmp", "lmpd", "lmp-mcp", "lmp-sync", "mind_signer"]
    suffix = ".exe" if target.endswith("windows-msvc") else ""
    with tarfile.open(archive_path, "w:gz") as archive:
        for name in names:
            if name == omit:
                continue
            payload = f"binary:{name}".encode()
            info = tarfile.TarInfo(f"{name}-{target}{suffix}")
            info.size = len(payload)
            import io

            archive.addfile(info, io.BytesIO(payload))
        if extra:
            payload = b"unexpected"
            info = tarfile.TarInfo(extra)
            info.size = len(payload)
            import io

            archive.addfile(info, io.BytesIO(payload))
    digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    (directory / "SHA256SUMS").write_text(f"{digest}  {archive_path.name}\n", encoding="utf-8")


def write_sums(directory: Path, targets: tuple[str, ...]) -> None:
    lines = []
    for target in targets:
        archive = directory / f"lmp-{target}.tar.gz"
        lines.append(f"{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}")
    (directory / "SHA256SUMS").write_text("\n".join(lines) + "\n", encoding="utf-8")


class ReleaseArtifactGateTests(unittest.TestCase):
    def run_gate(self, directory: Path) -> tuple[int, dict]:
        result = subprocess.run(
            [sys.executable, str(SCRIPT), str(directory), "--targets", TARGET],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        return result.returncode, json.loads(result.stdout)

    def test_accepts_complete_archive_and_checksum(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            directory = Path(raw)
            make_archive(directory)
            code, result = self.run_gate(directory)
            self.assertEqual(code, 0, result)
            self.assertEqual(result["status"], "verified")

    def test_shared_packager_creates_gate_compatible_archive(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            binaries = root / "binaries"
            output = root / "dist"
            binaries.mkdir()
            for name in ("lmp", "lmpd", "lmp-mcp", "lmp-sync", "mind_signer"):
                (binaries / name).write_bytes(f"{name}-binary".encode())
            result = subprocess.run(
                [sys.executable, str(PACKAGER), "--target", TARGET, "--binary-dir", str(binaries), "--output-dir", str(output)],
                cwd=ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            archive = output / f"lmp-{TARGET}.tar.gz"
            self.assertTrue(archive.is_file())
            archive_digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            (output / "SHA256SUMS").write_text(f"{archive_digest}  {archive.name}\n", encoding="utf-8")
            code, gate_result = self.run_gate(output)
            self.assertEqual(code, 0, gate_result)
            self.assertEqual(gate_result["status"], "verified")

    def test_shared_packager_rejects_missing_binary(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            binaries = root / "binaries"
            binaries.mkdir()
            (binaries / "lmp").write_bytes(b"only-one")
            result = subprocess.run(
                [sys.executable, str(PACKAGER), "--target", TARGET, "--binary-dir", str(binaries), "--output-dir", str(root / "dist")],
                cwd=ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(json.loads(result.stdout)["status"], "blocked")

    def test_shared_packager_is_byte_for_byte_reproducible(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            binaries = root / "binaries"
            first = root / "first"
            second = root / "second"
            binaries.mkdir()
            for name in ("lmp", "lmpd", "lmp-mcp", "lmp-sync", "mind_signer"):
                (binaries / name).write_bytes(f"{name}-binary".encode())
            for output in (first, second):
                result = subprocess.run(
                    [sys.executable, str(PACKAGER), "--target", TARGET, "--binary-dir", str(binaries), "--output-dir", str(output)],
                    cwd=ROOT,
                    check=False,
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                if output == first:
                    # Ensure the test catches gzip wall-clock timestamps as
                    # well as tar member metadata.
                    time.sleep(1.1)
            first_bytes = (first / f"lmp-{TARGET}.tar.gz").read_bytes()
            second_bytes = (second / f"lmp-{TARGET}.tar.gz").read_bytes()
            self.assertEqual(hashlib.sha256(first_bytes).digest(), hashlib.sha256(second_bytes).digest())

    def test_release_workflow_writes_gate_compatible_basename_checksums(self) -> None:
        workflow = (ROOT / ".github/workflows/release.yml").read_text(encoding="utf-8")
        self.assertIn("working-directory: dist", workflow)
        self.assertIn("run: sha256sum *.tar.gz > SHA256SUMS", workflow)
        self.assertIn("orchestrator/package_release_artifact.py", workflow)
        self.assertIn("uses: actions/setup-python@v5", workflow)
        self.assertIn("shell: bash", workflow)
        self.assertIn("python orchestrator/package_release_artifact.py", workflow)
        self.assertIn('path: dist/lmp-${{ matrix.target }}.tar.gz', workflow)
        self.assertIn('find "$idle_workspace" -mindepth 1 -delete', workflow)
        self.assertGreaterEqual(
            workflow.count("fetch-depth: 0"),
            2,
            "verify and aggregate release jobs must fetch origin/main for source verification",
        )

    def test_accepts_the_complete_release_matrix_including_windows_suffixes(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            directory = Path(raw)
            for target in MATRIX:
                make_archive(directory, target)
            write_sums(directory, MATRIX)
            result = subprocess.run(
                [sys.executable, str(SCRIPT), str(directory)],
                cwd=ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stdout)
            self.assertEqual(json.loads(result.stdout)["status"], "verified")

    def test_rejects_missing_binary(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            directory = Path(raw)
            make_archive(directory, omit="mind_signer")
            code, result = self.run_gate(directory)
            self.assertNotEqual(code, 0)
            self.assertEqual(result["status"], "blocked")

    def test_rejects_unexpected_member(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            directory = Path(raw)
            make_archive(directory, extra="unexpected.txt")
            code, result = self.run_gate(directory)
            self.assertNotEqual(code, 0)
            self.assertIn("unexpected files", result["error"])


if __name__ == "__main__":
    unittest.main()
