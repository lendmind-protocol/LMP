#!/usr/bin/env bash
set -euo pipefail

if command -v rustup >/dev/null 2>&1; then
    RUST_TOOLCHAIN="${LMP_RUST_TOOLCHAIN:-1.98.1}"
    if ! rustup toolchain list | grep -Eq "^${RUST_TOOLCHAIN}(-| |$)"; then
        echo "Pinned Rust toolchain ${RUST_TOOLCHAIN} is not installed" >&2
        exit 1
    fi
    RUST_TOOLCHAIN_BIN="$(dirname "$(rustup which --toolchain "$RUST_TOOLCHAIN" rustc)")"
    export PATH="$RUST_TOOLCHAIN_BIN:$PATH"
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Define text coloring properties for scannability
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=======================================================${NC}"
echo -e "${GREEN}⚙️ Running Lending-Mind Protocol (LMP) Integration Test${NC}"
echo -e "${GREEN}=======================================================${NC}"

# Define temporary execution sandboxes
TEST_WORKSPACE="/tmp/lmp_integration_sandbox"
RUST_CLI_WORKSPACE="/tmp/lmp_rust_cli_sandbox"
echo "🧹 Scrubbing temporary environments at: ${TEST_WORKSPACE}"
rm -rf "${TEST_WORKSPACE}"
rm -rf "${RUST_CLI_WORKSPACE}"
mkdir -p "${TEST_WORKSPACE}"

# 1. Compile the actual Rust runtime components used by onboarding
echo "🦀 Building Rust runtime binaries (lmp, lmpd, lmp-mcp) via Cargo..."
if command -v rustup >/dev/null 2>&1; then
    rustup run "${RUST_TOOLCHAIN:-stable}" cargo build --release --workspace --manifest-path "${ROOT_DIR}/Cargo.toml"
else
    cargo build --release --workspace --manifest-path "${ROOT_DIR}/Cargo.toml"
fi

echo "✅ Rust runtime compiled cleanly."

# 1b. Verify the Rust-native onboarding path independently of the Node wrapper.
mkdir -p "${RUST_CLI_WORKSPACE}"
echo "🧪 Exercising Rust-native init --baseline and default evaluation..."
(
    cd "${RUST_CLI_WORKSPACE}"
    "${ROOT_DIR}/target/release/lmp" init --baseline
    test -f .lending-mind/skills/baseline/mind.json
    python3 -c 'import json; assert json.load(open(".lending-mind/config.json"))["defaultMind"] == ".lending-mind/skills/baseline"'
    "${ROOT_DIR}/target/release/lmp" evaluate --json > rust-evaluation.json
    python3 -c 'import json; assert json.load(open("rust-evaluation.json"))["state"] == "pass"'
)
echo "👉 Assert Pass: Rust-native baseline onboarding and offline evaluation verified."

# 2. Trigger the real create-lmp onboarding flow against the isolated workspace
echo "🚀 Executing the real Node.js onboarding bootstrapper..."
LMP_DISABLE_RUNTIME_DOWNLOAD=1 \
LMPD_BIN="${ROOT_DIR}/target/release/lmpd" \
LMP_MCP_BIN="${ROOT_DIR}/target/release/lmp-mcp" \
node "${ROOT_DIR}/packages/create-lmp/bin.ts" \
    --yes --agent cursor --mind tj-ponytail --stack rust --strategy greenfield \
    "${TEST_WORKSPACE}"

# 3. Assert the generated workspace and actual component handshakes
echo "🔍 Performing Integration System Asserts..."

if [ ! -f "${TEST_WORKSPACE}/.lending-mind/mind/mind.json" ]; then
    echo -e "${RED}❌ SYSTEM FAILURE: create-lmp failed to deploy the selected Mind package!${NC}"
    exit 1
fi
echo "👉 Assert Pass: Signed Mind package deployed successfully."

if [ ! -x "${TEST_WORKSPACE}/.lmp_telemetry/bin/lmpd" ] || [ ! -x "${TEST_WORKSPACE}/.lmp_telemetry/bin/lmp-mcp" ]; then
    echo -e "${RED}❌ SYSTEM FAILURE: create-lmp failed to install both Rust sidecars!${NC}"
    exit 1
fi
echo "👉 Assert Pass: Rust daemon and MCP sidecars installed."

if ! grep -q '"signatureStatus": "verified"' "${TEST_WORKSPACE}/.lending-mind/config.json"; then
    echo -e "${RED}❌ SYSTEM FAILURE: onboarding did not record verified profile provenance!${NC}"
    exit 1
fi
echo "👉 Assert Pass: Profile signature status recorded as verified."

if ! grep -q 'lending-mind' "${TEST_WORKSPACE}/.cursor/mcp.json"; then
    echo -e "${RED}❌ SYSTEM FAILURE: onboarding failed to configure the project MCP integration!${NC}"
    exit 1
fi
echo "👉 Assert Pass: Cursor project MCP integration configured."

echo "⚙️ Testing both compiled Rust sidecars..."
"${TEST_WORKSPACE}/.lmp_telemetry/bin/lmpd" --help > /dev/null
"${TEST_WORKSPACE}/.lmp_telemetry/bin/lmp-mcp" --help > /dev/null

echo "🔁 Verifying daemon status, reload, stop, and PID cleanup lifecycle..."
LMPD_BIN="${ROOT_DIR}/target/release/lmpd" "${ROOT_DIR}/orchestrator/test_daemon_lifecycle.sh" > /dev/null
echo "👉 Assert Pass: Daemon lifecycle controls verified."

echo -e "\n${GREEN}=======================================================${NC}"
echo -e "${GREEN}🎉 INTEGRATION SUCCESSFUL: Node.js and Rust elements link perfectly!${NC}"
echo -e "${GREEN}=======================================================${NC}"
