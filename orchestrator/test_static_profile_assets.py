import hashlib
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "registry" / "registry.json"
PUBLIC_REGISTRY = ROOT / "apps" / "docs" / "public" / "registry.json"
PUBLIC_PROFILES = ROOT / "apps" / "docs" / "public" / "profiles"


class StaticProfileAssetTests(unittest.TestCase):
    def test_public_registry_copy_and_profile_payloads_are_digest_bound(self) -> None:
        self.assertEqual(REGISTRY.read_bytes(), PUBLIC_REGISTRY.read_bytes())
        registry = json.loads(REGISTRY.read_text(encoding="utf-8"))

        for entry in registry["entries"]:
            profile_id = entry["id"].removeprefix("lmp:mind:")
            payload_path = PUBLIC_PROFILES / profile_id / "mind.json"
            self.assertTrue(payload_path.is_file(), profile_id)
            payload = payload_path.read_bytes()
            self.assertEqual(hashlib.sha256(payload).hexdigest(), entry["digest"], profile_id)

            manifest = json.loads(payload)
            self.assertEqual(manifest["id"], entry["id"])
            self.assertEqual(manifest["version"], entry["version"])
            package_files = entry.get("packageFiles")
            self.assertIsInstance(package_files, list, profile_id)
            self.assertTrue(package_files, profile_id)
            paths = set()
            for descriptor in package_files:
                path = descriptor["path"]
                self.assertNotIn(path, paths, profile_id)
                self.assertNotEqual(path, "mind.json", profile_id)
                paths.add(path)
                file_path = PUBLIC_PROFILES / profile_id / path
                self.assertTrue(file_path.is_file(), f"{profile_id}/{path}")
                self.assertEqual(
                    hashlib.sha256(file_path.read_bytes()).hexdigest(),
                    descriptor["digest"].removeprefix("sha256:"),
                    f"{profile_id}/{path}",
                )


if __name__ == "__main__":
    unittest.main()
