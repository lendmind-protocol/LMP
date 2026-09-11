#!/usr/bin/env bash
set -Eeuo pipefail

if command -v rustup >/dev/null 2>&1; then
  RUST_TOOLCHAIN="${LMP_RUST_TOOLCHAIN:-1.98.1}"
  if ! rustup toolchain list | grep -Eq "^${RUST_TOOLCHAIN}(-| |$)"; then
    echo "Pinned Rust toolchain ${RUST_TOOLCHAIN} is not installed" >&2
    exit 1
  fi
  RUST_TOOLCHAIN_BIN="$(dirname "$(rustup which --toolchain "$RUST_TOOLCHAIN" rustc)")"
  export PATH="$RUST_TOOLCHAIN_BIN:$PATH"
fi

# Exercise the static registry contract locally without a backend or external
# IPFS credentials. The client still performs its real HTTP fetch and install.
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lmp-registry-sync.XXXXXX")"
PORT="${LMP_REGISTRY_TEST_PORT:-18765}"
LMP_SYNC_BIN="${LMP_SYNC_BIN:-$ROOT_DIR/target/debug/lmp-sync}"
SERVER_PID=""
cleanup() {
  if [[ -n "$SERVER_PID" ]]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  rm -rf -- "$WORK_DIR"
}
trap cleanup EXIT

if [[ ! -x "$LMP_SYNC_BIN" ]]; then
  cargo build -q -p lmp-sync
elif [[ "$LMP_SYNC_BIN" == "$ROOT_DIR/target/debug/lmp-sync" ]]; then
  cargo build -q -p lmp-sync
fi
python3 - "$ROOT_DIR/registry/definitions/tj-ponytail" "$WORK_DIR/registry.json" "$PORT" <<'PY'
import json
import hashlib
import sys
from pathlib import Path

profile, destination, port = sys.argv[1:]
profile_path = Path(profile)
payload = (profile_path / "mind.json").read_bytes()
package_files = []
for file in sorted(profile_path.rglob("*")):
    if not file.is_file() or file.name == "mind.json":
        continue
    relative = file.relative_to(profile_path).as_posix()
    package_files.append({
        "path": relative,
        "url": f"http://127.0.0.1:{port}/registry/profiles/tj-ponytail/{relative}",
        "digest": hashlib.sha256(file.read_bytes()).hexdigest(),
    })
registry = {
    "schemaVersion": "1",
    "generatedFrom": "packages/create-lmp/profiles/tj-ponytail",
    "entries": [{
        "id": "lmp:mind:tj-ponytail",
        "version": json.loads(payload)["version"],
        "manifestUrl": f"http://127.0.0.1:{port}/registry/profiles/missing.json",
        "digest": hashlib.sha256(payload).hexdigest(),
        "signatureStatus": "verified",
        "signature": (profile_path / "signatures/manifest.sig").read_text().strip(),
        "publicKey": (profile_path / "signatures/public-key.hex").read_text().strip(),
        "ipfsCid": "local-test-cid",
        "packageFiles": package_files,
    }],
}
json.dump(registry, open(destination, "w", encoding="utf-8"), indent=2)
open(destination, "a", encoding="utf-8").write("\n")
PY

mkdir -p "$WORK_DIR/registry/profiles"
mkdir -p "$WORK_DIR/registry/profiles/tj-ponytail"
cp -R "$ROOT_DIR/registry/definitions/tj-ponytail/." "$WORK_DIR/registry/profiles/tj-ponytail/"
mkdir -p "$WORK_DIR/ipfs"
cp "$ROOT_DIR/registry/definitions/tj-ponytail/mind.json" "$WORK_DIR/ipfs/local-test-cid"
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$WORK_DIR" >/dev/null 2>&1 &
SERVER_PID=$!
for _ in {1..20}; do
  curl --silent --fail "http://127.0.0.1:${PORT}/registry.json" >/dev/null 2>&1 && break
  sleep 0.1
done

OUTPUT_DIR="$WORK_DIR/installed"
if "$LMP_SYNC_BIN" \
  --registry-url "http://127.0.0.1:${PORT}/registry.json" \
  --mind-id tj-ponytail \
  --output-dir "$OUTPUT_DIR" >/dev/null 2>&1; then
  echo "registry sync unexpectedly accepted an unpinned public key" >&2
  exit 1
fi
"$LMP_SYNC_BIN" \
  --registry-url "http://127.0.0.1:${PORT}/registry.json" \
  --mind-id tj-ponytail \
  --output-dir "$OUTPUT_DIR" \
  --ipfs-gateway "http://127.0.0.1:${PORT}/missing/{cid}" \
  --ipfs-gateway "http://127.0.0.1:${PORT}/ipfs/{cid}" \
  --trusted-public-key "$(cat "$ROOT_DIR/registry/definitions/tj-ponytail/signatures/public-key.hex")"

test -f "$OUTPUT_DIR/lmp:mind:tj-ponytail/1.0.0/mind.json"
test -f "$OUTPUT_DIR/lmp:mind:tj-ponytail/1.0.0/SKILL.md"
test -f "$OUTPUT_DIR/lmp:mind:tj-ponytail/1.0.0/rules/manifest.json"
test -f "$OUTPUT_DIR/lmp:mind:tj-ponytail/1.0.0/signatures/manifest.sig"
echo "registry sync integration passed"
