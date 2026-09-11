from __future__ import annotations

import importlib.util
import io
import tarfile
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("registry_gate.py")
SPEC = importlib.util.spec_from_file_location("registry_gate", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class RegistryGateExtractionTests(unittest.TestCase):
    def make_tar(self, member_name: str) -> tarfile.TarFile:
        raw = io.BytesIO()
        with tarfile.open(fileobj=raw, mode="w") as archive:
            payload = b"{}"
            info = tarfile.TarInfo(member_name)
            info.size = len(payload)
            archive.addfile(info, io.BytesIO(payload))
        raw.seek(0)
        return tarfile.open(fileobj=raw, mode="r")

    def test_extracts_package_members_into_package_root(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            destination = Path(raw)
            archive = self.make_tar("registry/definitions/example/mind.json")
            with archive:
                MODULE.extract_tar_package(archive, "example", destination)
            self.assertEqual((destination / "mind.json").read_bytes(), b"{}")
            self.assertFalse((destination / "registry").exists())

    def test_rejects_members_outside_package_prefix(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            archive = self.make_tar("registry/definitions/other/mind.json")
            with archive:
                with self.assertRaisesRegex(ValueError, "outside package"):
                    MODULE.extract_tar_package(archive, "example", Path(raw))


if __name__ == "__main__":
    unittest.main()
