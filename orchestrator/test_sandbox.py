import tempfile
import unittest
from pathlib import Path

from orchestrator.sandbox import DockerSandbox


class DockerSandboxMountTests(unittest.TestCase):
    def test_no_new_privileges_is_opt_in_for_incompatible_rootless_hosts(self):
        default_command = DockerSandbox("/tmp").build_command(["true"])
        hardened_command = DockerSandbox("/tmp", no_new_privileges=True).build_command(["true"])
        self.assertNotIn("--security-opt=no-new-privileges", default_command)
        self.assertIn("--security-opt=no-new-privileges", hardened_command)

    def test_default_mounts_entire_workspace_read_only(self):
        with tempfile.TemporaryDirectory() as directory:
            command = DockerSandbox(directory).build_command(["true"])
            self.assertIn(f"{Path(directory).resolve()}:/workspace:ro", command)

    def test_delta_mounts_only_selected_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "src").mkdir()
            (root / "src/changed.ts").write_text("export const changed = true;\n", encoding="utf-8")
            command = DockerSandbox(root, include_paths=["src/changed.ts"]).build_command(["true"])
            self.assertIn(
                f"type=bind,source={root / 'src/changed.ts'},destination=/workspace/src/changed.ts,readonly",
                command,
            )
            self.assertNotIn(f"{root}:/workspace:ro", command)

    def test_mounts_reject_workspace_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                DockerSandbox(directory, include_paths=["../outside"]).build_command(["true"])

    def test_mounts_reject_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "target.ts"
            target.write_text("export const target = true;\n", encoding="utf-8")
            link = root / "link.ts"
            link.symlink_to(target)
            with self.assertRaises(ValueError):
                DockerSandbox(root, include_paths=[link]).build_command(["true"])


if __name__ == "__main__":
    unittest.main()
