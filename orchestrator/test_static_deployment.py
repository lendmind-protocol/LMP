from __future__ import annotations

import json
import subprocess
import sys
import threading
import unittest
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "orchestrator" / "verify_static_deployment.py"


class StaticDeploymentHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        if self.path in ("/", "/index.html"):
            payload = b"<html><body>LMP</body></html>"
            self.send_response(200)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        if self.path == "/registry.json":
            payload = json.dumps({"entries": [{"id": "lmp:test"}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        self.send_error(404)

    def log_message(self, *_args: object) -> None:
        return


class StaticDeploymentVerifierTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), StaticDeploymentHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.thread.join(timeout=2)
        self.server.server_close()

    def run_gate(self, base_url: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), base_url],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )

    def test_accepts_a_reachable_static_registry(self) -> None:
        result = self.run_gate(f"http://127.0.0.1:{self.server.server_port}")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "reachable")

    def test_reports_http_failure_as_a_blocked_gate(self) -> None:
        result = self.run_gate(
            f"http://127.0.0.1:{self.server.server_port}/missing"
        )
        self.assertEqual(result.returncode, 1)
        report = json.loads(result.stdout)
        self.assertEqual(report["status"], "blocked")
        self.assertIn("HTTP 404", report["errors"][0])

    def test_production_mode_rejects_http(self) -> None:
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                f"http://127.0.0.1:{self.server.server_port}",
                "--require-https",
            ],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("must use HTTPS", json.loads(result.stdout)["errors"][0])

    def test_rejects_registry_drift_against_checked_in_index(self) -> None:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8") as expected:
            json.dump({"entries": [{"id": "different"}]}, expected)
            expected.flush()
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    f"http://127.0.0.1:{self.server.server_port}",
                    "--expected-registry",
                    expected.name,
                ],
                cwd=ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
        self.assertEqual(result.returncode, 1)
        self.assertIn("does not match", json.loads(result.stdout)["errors"][0])


if __name__ == "__main__":
    unittest.main()
