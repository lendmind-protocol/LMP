#!/usr/bin/env bash
set -Eeuo pipefail

# Idempotent local bootstrap for the Lending-Mind Protocol.
# This script provisions missing directories and verifies the checked-out
# implementation. It never overwrites manifests, profiles, policies, or docs.

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SKIP_DOCKER=0
RUN_FULL_BENCHMARK=0
CHECK_ONLY=0

usage() {
  cat <<'EOF'
Usage: ./install.sh [options]

Options:
  --check-only       Validate prerequisites and layout without building.
  --skip-docker      Skip Docker image build (qualification will be blocked).
  --full-benchmark   Run the 64-scenario real-OSS benchmark after qualification.
  -h, --help         Show this help.
EOF
}

for argument in "$@"; do
  case "$argument" in
    --check-only) CHECK_ONLY=1 ;;
    --skip-docker) SKIP_DOCKER=1 ;;
    --full-benchmark) RUN_FULL_BENCHMARK=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $argument" >&2; usage >&2; exit 2 ;;
  esac
done

cd "$ROOT_DIR"

info() { printf '\033[0;36m%s\033[0m\n' "$*"; }
pass() { printf '\033[0;32m%s\033[0m\n' "$*"; }
warn() { printf '\033[0;33m%s\033[0m\n' "$*" >&2; }
fail() { printf '\033[0;31m%s\033[0m\n' "$*" >&2; exit 1; }

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command is missing: $1"
}

info "Lending-Mind Protocol local bootstrap"
info "Workspace: $ROOT_DIR"

require_command cargo
require_command python3
require_command git

[[ -f Cargo.toml ]] || fail "Cargo.toml is missing from the repository root"
[[ -d crates/lmp-core ]] || fail "Rust workspace member is missing: crates/lmp-core"
[[ -d crates/lmpd ]] || fail "Rust workspace member is missing: crates/lmpd"
[[ -d crates/lmp-mcp ]] || fail "Rust workspace member is missing: crates/lmp-mcp"
[[ -d crates/lmp-sync ]] || fail "Rust workspace member is missing: crates/lmp-sync"
[[ -f orchestrator/qualification_suite.py ]] || fail "Qualification suite is missing"
[[ -f orchestrator/Dockerfile ]] || fail "Docker sandbox definition is missing"
[[ -d skills/typescript-minimal ]] || fail "Bundled Mind package is missing"

for directory in \
  .github/ISSUE_TEMPLATE \
  .github/workflows \
  .vscode \
  crates/lmp-core/src/bin \
  orchestrator \
  packages/create-lmp \
  registry/schemas \
  registry/definitions \
  docs \
  lmp_test_bed/repositories \
  lmp_test_bed/results; do
  mkdir -p "$directory"
done
pass "Workspace layout verified"

if (( CHECK_ONLY )); then
  pass "Check complete; no files were built or modified"
  exit 0
fi

info "Building Rust workspace"
cargo build --workspace
pass "Rust workspace built"

if (( SKIP_DOCKER )); then
  warn "Docker build skipped; qualification will produce status=blocked"
else
  require_command docker
  docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable"
  info "Building required sandbox image"
  docker build -t lmp-sandbox:local orchestrator
  pass "Docker sandbox image ready: lmp-sandbox:local"
fi

mkdir -p lmp-test-results
info "Running end-to-end qualification"
python3 orchestrator/qualification_suite.py \
  --output lmp-test-results/qualification-result.json
pass "Qualification completed; inspect lmp-test-results/qualification-result.json"

if (( RUN_FULL_BENCHMARK )); then
  info "Running 64-scenario real-OSS benchmark"
  python3 orchestrator/real_world_benchmark.py \
    --lmp target/debug/lmp \
    --output lmp-test-results/real-world
  pass "Real-OSS benchmark completed; inspect lmp-test-results/real-world/real-world-benchmark.json"
fi

pass "LMP bootstrap completed without overwriting existing project files"
