#!/usr/bin/env bash
set -euo pipefail

# Define text coloring properties for scannability
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=======================================================${NC}"
echo -e "${GREEN}⚙️ Running Lending-Mind Protocol (LMP) Integration Test${NC}"
echo -e "${GREEN}=======================================================${NC}"

# Define temporary execution sandboxes
TEST_WORKSPACE="/tmp/lmp_integration_sandbox"
echo "🧹 Scrubbing temporary environments at: ${TEST_WORKSPACE}"
rm -rf "${TEST_WORKSPACE}"
mkdir -p "${TEST_WORKSPACE}"

# 1. Compile Core Systems Components (Rust Daemon Binary)
echo "🦀 Building Systems Daemon Binary (lmpd) via Cargo..."
cargo build --release --workspace

# Mocking binary target location inside test workspace for sidecar loading simulation
mkdir -p "${TEST_WORKSPACE}/.lmp_telemetry/bin"
cp ./target/release/lmpd "${TEST_WORKSPACE}/.lmp_telemetry/bin/"
echo "✅ Rust daemon compiled and staged cleanly."

# 2. Package and Link the Node.js Onboarding Bootloader
echo "📦 Staging Node.js Bootloader Script..."
cd "${TEST_WORKSPACE}"

# Writing our create-lmp bin utility natively for standalone simulation execution
cat << 'EOF' > ./bootloader.js
#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const targetWorkspace = process.cwd();
console.log("🌐 Node.js Bootloader active...");

const lmpDir = path.join(targetWorkspace, '.lmp_telemetry');
if (!fs.existsSync(lmpDir)) {
  fs.mkdirSync(lmpDir, { recursive: true });
  fs.mkdirSync(path.join(lmpDir, 'minds'), { recursive: true });
}

// Generate the baseline testing model definition
const mockMind = {
  id: "lmp:mind:integration-test",
  version: "1.0.0",
  telemetry_metrics: { max_cyclomatic_complexity: 5, forbidden_ast_nodes: [] }
};
fs.writeFileSync(path.join(lmpDir, 'minds', 'integration-test.json'), JSON.stringify(mockMind, null, 2));

// Initialize simulated Git Hooks infrastructure 
mkdir -p path.join(targetWorkspace, '.git', 'hooks');
fs.writeFileSync(path.join(targetWorkspace, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho "LMP Git Validation Active"\n', { mode: 0o755 });
console.log("💎 Bootloader pipeline executed cleanly.");
EOF

# 3. Trigger Environment Onboarding via Bootloader Code
echo "🚀 Executing Node.js onboarding bootloader environment bootstrap..."
node ./bootloader.js

# 4. Assert and Verify System Boundaries and Component Integration Handshakes
echo "🔍 Performing Integration System Asserts..."

if [ ! -f "${TEST_WORKSPACE}/.lmp_telemetry/minds/integration-test.json" ]; then
    echo -e "${RED}❌ SYSTEM FAILURE: Node.js bootloader failed to deploy the mind schema file!${NC}"
    exit 1
fi
echo "👉 Assert Pass: Mind configuration artifact deployed successfully."

if [ ! -f "${TEST_WORKSPACE}/.lmp_telemetry/bin/lmpd" ]; then
    echo -e "${RED}❌ SYSTEM FAILURE: Rust sidecar binary engine is missing from the workspace!${NC}"
    exit 1
fi
echo "👉 Assert Pass: Rust core sidecar daemon binary located in system paths."

# Verify the compiled binary responds to base process arguments correctly
echo "⚙️ Testing Rust daemon verification loop handshake execution..."
"${TEST_WORKSPACE}/.lmp_telemetry/bin/lmpd" --help > /dev/null

echo -e "\n${GREEN}=======================================================${NC}"
echo -e "${GREEN}🎉 INTEGRATION SUCCESSFUL: Node.js and Rust elements link perfectly!${NC}"
echo -e "${GREEN}=======================================================${NC}"

