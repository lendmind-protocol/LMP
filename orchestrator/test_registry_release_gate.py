import importlib.util
import hashlib
import unittest
from unittest.mock import Mock, patch
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("registry_release_gate.py")
SPEC = importlib.util.spec_from_file_location("registry_release_gate", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class RegistryReleaseGateTests(unittest.TestCase):
    def test_reports_every_missing_production_requirement(self):
        errors = MODULE.validate_registry(
            {
                "entries": [
                    {
                        "id": "lmp:test:unsigned",
                        "signatureStatus": "unsigned",
                        "publicKey": None,
                        "digest": None,
                        "ipfsCid": None,
                    }
                ]
            }
        )

        self.assertEqual(len(errors), 6)
        self.assertTrue(any("signatureStatus" in error for error in errors))
        self.assertTrue(any("public key" in error for error in errors))
        self.assertTrue(any("SHA-256" in error for error in errors))
        self.assertTrue(any("IPFS CID" in error for error in errors))
        self.assertTrue(any("detached signature" in error for error in errors))
        self.assertTrue(any("manifestUrl" in error for error in errors))

    def test_rejects_an_insecure_manifest_url(self):
        errors = MODULE.validate_registry(
            {
                "entries": [
                    {
                        "id": "lmp:test:http",
                        "signatureStatus": "verified",
                        "signature": "0x" + "c" * 128,
                        "publicKey": "0x" + "a" * 64,
                        "digest": "b" * 64,
                        "manifestUrl": "http://example.invalid/mind.json",
                        "ipfsCid": "bafy" + "a" * 56,
                    }
                ]
            }
        )
        self.assertEqual(len(errors), 1)
        self.assertIn("HTTPS required", errors[0])

    def test_accepts_a_complete_entry_without_network_fetch(self):
        errors = MODULE.validate_registry(
            {
                "entries": [
                    {
                        "id": "lmp:test:verified",
                        "signatureStatus": "verified",
                        "signature": "0x" + "c" * 128,
                        "publicKey": "0x" + "a" * 64,
                        "digest": "b" * 64,
                        "manifestUrl": "https://example.invalid/mind.json",
                        "ipfsCid": "bafy" + "a" * 56,
                    }
                ]
            }
        )

        self.assertEqual(errors, [])

    def test_rejects_arbitrary_cid_text(self):
        errors = MODULE.validate_registry(
            {
                "entries": [
                    {
                        "id": "lmp:test:invalid-cid",
                        "signatureStatus": "verified",
                        "signature": "0x" + "c" * 128,
                        "publicKey": "0x" + "a" * 64,
                        "digest": "b" * 64,
                        "manifestUrl": "https://example.invalid/mind.json",
                        "ipfsCid": "not-a-cid",
                    }
                ]
            }
        )

        self.assertEqual(len(errors), 1)
        self.assertIn("syntactically invalid", errors[0])

    def test_cid_retrieval_is_a_separate_release_gate(self):
        registry = {
            "entries": [
                {
                    "id": "lmp:test:verified",
                    "signatureStatus": "verified",
                    "signature": "0x" + "c" * 128,
                    "publicKey": "0x" + "a" * 64,
                    "digest": "b" * 64,
                    "manifestUrl": "https://example.invalid/mind.json",
                    "ipfsCid": "bafy" + "a" * 56,
                }
            ]
        }

        def unavailable(_cid, _gateways, _expected_digest=None):
            return False, "gateway unavailable"

        original = MODULE.fetch_cid
        MODULE.fetch_cid = unavailable
        try:
            errors = MODULE.validate_registry(registry, verify_cids=True)
        finally:
            MODULE.fetch_cid = original

        self.assertEqual(len(errors), 1)
        self.assertIn("could not be retrieved", errors[0])

    def test_cid_retrieval_rejects_content_digest_mismatch(self):
        payload = b"retrieved bytes"
        response = Mock()
        response.status = 200
        response.read.return_value = payload
        response.__enter__ = lambda value: response
        response.__exit__ = Mock(return_value=False)
        with patch.object(MODULE.urllib.request, "urlopen", return_value=response):
            reachable, detail = MODULE.fetch_cid(
                "bafy" + "a" * 56,
                ("https://gateway.example/ipfs/{cid}",),
                hashlib.sha256(b"different bytes").hexdigest(),
            )
        self.assertFalse(reachable)
        self.assertIn("content digest mismatch", detail)

    def test_rejects_an_invalid_complete_package_file_contract(self):
        errors = MODULE.validate_registry(
            {
                "entries": [
                    {
                        "id": "lmp:test:invalid-files",
                        "signatureStatus": "verified",
                        "signature": "0x" + "c" * 128,
                        "publicKey": "0x" + "a" * 64,
                        "digest": "b" * 64,
                        "manifestUrl": "https://example.invalid/mind.json",
                        "ipfsCid": "bafy" + "a" * 56,
                        "packageFiles": [
                            {"path": "../escape", "url": "http://example.invalid/file", "digest": "bad"},
                            {"path": "../escape", "url": "https://example.invalid/file", "digest": "b" * 64},
                        ],
                    }
                ]
            }
        )
        self.assertGreaterEqual(len(errors), 3)
        self.assertTrue(any("unsafe or duplicate" in error for error in errors))
        self.assertTrue(any("must use HTTPS" in error for error in errors))
        self.assertTrue(any("invalid SHA-256" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
