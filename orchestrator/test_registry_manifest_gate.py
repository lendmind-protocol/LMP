import json
import importlib.util
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("registry_manifest_gate.py")
SPEC = importlib.util.spec_from_file_location("registry_manifest_gate", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class RegistryManifestGateTests(unittest.TestCase):
    def test_checked_in_public_copy_matches_source_registry(self):
        repository = Path(__file__).resolve().parents[1]
        self.assertEqual(
            (repository / "registry/registry.json").read_bytes(),
            (repository / "apps/docs/public/registry.json").read_bytes(),
        )

    def test_matches_signed_local_manifest_metadata(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            package = root / "demo"
            (package / "signatures").mkdir(parents=True)
            manifest = {"id": "lmp:mind:demo", "version": "1.0.0"}
            payload = json.dumps(manifest, separators=(",", ":")).encode() + b"\n"
            (package / "mind.json").write_bytes(payload)
            (package / "signatures/public-key.hex").write_text("0x" + "a" * 64)
            (package / "signatures/manifest.sig").write_text("0x" + "b" * 128)
            index = {
                "entries": [
                    {
                        "id": "lmp:mind:demo",
                        "version": "1.0.0",
                        "digest": __import__("hashlib").sha256(payload).hexdigest(),
                        "publicKey": "0x" + "a" * 64,
                        "signature": "0x" + "b" * 128,
                    }
                ]
            }
            self.assertEqual(MODULE.validate_index(index, root, lambda path: True), [])

    def test_reports_index_drift(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            package = root / "demo"
            (package / "signatures").mkdir(parents=True)
            (package / "mind.json").write_text('{"id":"lmp:mind:demo","version":"1.0.0"}\n')
            (package / "signatures/public-key.hex").write_text("0x" + "a" * 64)
            (package / "signatures/manifest.sig").write_text("0x" + "b" * 128)
            errors = MODULE.validate_index(
                {
                    "entries": [
                        {
                            "id": "lmp:mind:demo",
                            "version": "1.0.0",
                            "digest": "0" * 64,
                            "publicKey": "0x" + "a" * 64,
                            "signature": "0x" + "c" * 128,
                        }
                    ]
                },
                root,
                lambda path: True,
            )
            self.assertIn("digest does not match", " ".join(errors))
            self.assertIn("signature does not match", " ".join(errors))

    def test_rejects_drift_between_registry_and_bundled_profile(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            definitions = root / "definitions"
            bundled = root / "bundled"
            for package_root in (definitions / "demo", bundled / "demo"):
                (package_root / "signatures").mkdir(parents=True)
                (package_root / "mind.json").write_text(
                    '{"id":"lmp:mind:demo","version":"1.0.0"}\n'
                )
                (package_root / "signatures/public-key.hex").write_text("0x" + "a" * 64)
                (package_root / "signatures/manifest.sig").write_text("0x" + "b" * 128)
            (bundled / "demo" / "guidance.md").write_text("different\n")
            payload = (definitions / "demo/mind.json").read_bytes()
            errors = MODULE.validate_index(
                {
                    "entries": [
                        {
                            "id": "lmp:mind:demo",
                            "version": "1.0.0",
                            "digest": __import__("hashlib").sha256(payload).hexdigest(),
                            "publicKey": "0x" + "a" * 64,
                            "signature": "0x" + "b" * 128,
                        }
                    ]
                },
                definitions,
                lambda path: True,
                bundled,
            )
            self.assertIn("file sets differ", " ".join(errors))


if __name__ == "__main__":
    unittest.main()
