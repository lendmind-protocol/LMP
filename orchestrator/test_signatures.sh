#!/usr/bin/env bash
set -Eeuo pipefail

if command -v rustup >/dev/null 2>&1; then
  RUST_TOOLCHAIN="${LMP_RUST_TOOLCHAIN:-1.98.1}"
  if rustup toolchain list | grep -q "^${RUST_TOOLCHAIN}"; then
    RUST_TOOLCHAIN_BIN="$(dirname "$(rustup which --toolchain "$RUST_TOOLCHAIN" rustc)")"
    export PATH="$RUST_TOOLCHAIN_BIN:$PATH"
  fi
fi

# Sign and verify a disposable package copy. Never place generated private
# keys or trust anchors in the checked-in registry during a release check.
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lmp-signatures.XXXXXX")"
LMP_BIN="${LMP_BIN:-$ROOT_DIR/target/debug/lmp}"
trap 'rm -rf -- "$WORK_DIR"' EXIT

mkdir -p "$WORK_DIR/package"
cp "$ROOT_DIR/skills/baseline/mind.json" "$WORK_DIR/package/mind.json"
cp "$ROOT_DIR/skills/baseline/SKILL.md" "$WORK_DIR/package/SKILL.md"
cp "$ROOT_DIR/skills/baseline/guidance.md" "$WORK_DIR/package/guidance.md"
cp -R "$ROOT_DIR/skills/baseline/evidence" "$WORK_DIR/package/evidence"
cp -R "$ROOT_DIR/skills/baseline/rules" "$WORK_DIR/package/rules"

cargo run -q -p lmp-core --bin mind_signer -- \
  --input "$WORK_DIR/package/mind.json" \
  --output-dir "$WORK_DIR/package"

PRIVATE_KEY="$WORK_DIR/package/lmp_identity.priv"
test "$(stat -c '%a' "$PRIVATE_KEY" 2>/dev/null || stat -f '%Lp' "$PRIVATE_KEY")" = "600"
VERIFY_OUTPUT="$("$LMP_BIN" verify "$WORK_DIR/package")"
grep -q '"signatureStatus":"verified"' <<<"$VERIFY_OUTPUT"

echo "disposable signer and verifier integration passed"
