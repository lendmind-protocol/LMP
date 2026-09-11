#!/usr/bin/env bash
set -Eeuo pipefail

# Safe release preparation for LMP. By default this is a read-only plan.
# Mutating the checkout, creating a tag, and pushing it each require an
# explicit flag so a release cannot happen from an accidental command.

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
VERSION_TAG=""
APPLY=0
CREATE_TAG=0
PUSH=0

usage() {
  cat <<'EOF'
Usage: ./orchestrator/git_release.sh vX.Y.Z [options]

Default behavior is a read-only release plan.

Options:
  --apply             Update Cargo.toml and package.json versions.
  --tag               Create a signed Git tag after all gates pass.
  --push              Push the current branch and tag (requires --tag).
  -h, --help          Show this help.

Examples:
  ./orchestrator/git_release.sh v0.1.0
  ./orchestrator/git_release.sh v0.1.0 --apply --tag
  ./orchestrator/git_release.sh v0.1.0 --apply --tag --push
EOF
}

fail() { printf '\033[0;31m%s\033[0m\n' "$*" >&2; exit 1; }
info() { printf '\033[0;36m%s\033[0m\n' "$*"; }
pass() { printf '\033[0;32m%s\033[0m\n' "$*"; }

[[ $# -gt 0 ]] || { usage >&2; exit 2; }
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
  usage
  exit 0
fi
VERSION_TAG="$1"
shift
[[ "$VERSION_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "Version must use vX.Y.Z format: $VERSION_TAG"
RAW_VERSION="${VERSION_TAG#v}"

while (($#)); do
  case "$1" in
    --apply) APPLY=1 ;;
    --tag) CREATE_TAG=1 ;;
    --push) PUSH=1 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
  shift
done

(( PUSH == 0 || CREATE_TAG == 1 )) || fail "--push requires --tag"
(( CREATE_TAG == 0 || APPLY == 1 )) || fail "--tag requires --apply"

cd "$ROOT_DIR"
if command -v rustup >/dev/null 2>&1; then
  RUST_TOOLCHAIN="${LMP_RUST_TOOLCHAIN:-1.98.1}"
  if ! rustup toolchain list | grep -Eq "^${RUST_TOOLCHAIN}(-| |$)"; then
    fail "Pinned Rust toolchain ${RUST_TOOLCHAIN} is not installed; set LMP_RUST_TOOLCHAIN only to an explicitly installed compatible toolchain"
  fi
  RUST_TOOLCHAIN_BIN="$(dirname "$(rustup which --toolchain "$RUST_TOOLCHAIN" rustc)")"
  export PATH="$RUST_TOOLCHAIN_BIN:$PATH"
  export RUSTC="$RUST_TOOLCHAIN_BIN/rustc"
  export RUSTDOC="$RUST_TOOLCHAIN_BIN/rustdoc"
fi
command -v git >/dev/null || fail "git is required"
command -v cargo >/dev/null || fail "cargo is required"
command -v python3 >/dev/null || fail "python3 is required"

if (( APPLY )); then
  [[ -z "$(git status --porcelain --untracked-files=all)" ]] || fail "Working tree is dirty; commit or stash unrelated changes before --apply"
fi

if git rev-parse "$VERSION_TAG" >/dev/null 2>&1; then
  fail "Git ref already exists: $VERSION_TAG"
fi

mapfile -t CARGO_FILES < <(find crates -name Cargo.toml -print | sort)
mapfile -t PACKAGE_FILES < <(find . -path '*/node_modules' -prune -o -name package.json -print | sort)

info "Release plan for $VERSION_TAG"
printf '  Rust manifests: %s\n' "${#CARGO_FILES[@]}"
printf '  Node manifests: %s\n' "${#PACKAGE_FILES[@]}"
printf '  Apply versions: %s\n' "$([[ $APPLY == 1 ]] && echo yes || echo no)"
printf '  Signed tag:     %s\n' "$([[ $CREATE_TAG == 1 ]] && echo yes || echo no)"
printf '  Push remote:    %s\n' "$([[ $PUSH == 1 ]] && echo yes || echo no)"

if (( ! APPLY )); then
  pass "Read-only plan complete; no files, commits, tags, or remotes changed"
  exit 0
fi

info "Running release verification gates"
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo build --release --workspace
./orchestrator/integration_test.sh
LMP_SYNC_BIN="$ROOT_DIR/target/release/lmp-sync" ./orchestrator/test_registry_sync.sh
LMP_BIN="$ROOT_DIR/target/release/lmp" ./orchestrator/test_signatures.sh
docker info >/dev/null 2>&1 || fail "Docker daemon is required for a release"
docker build -t lmp-sandbox:local orchestrator
mkdir -p lmp-test-results
python3 orchestrator/onboarding_benchmark.py --max-ms 3000 --output lmp-test-results/onboarding-current.json
python3 orchestrator/qualification_suite.py --lmp target/release/lmp --lmpd target/release/lmpd --mcp target/release/lmp-mcp --output lmp-test-results/qualification-result.json
RESOURCE_WORKSPACE="$(mktemp -d "${TMPDIR:-/tmp}/lmp-resource-workspace.XXXXXX")"
trap 'rm -rf -- "$RESOURCE_WORKSPACE"' EXIT
python3 orchestrator/resource_gate.py --lmpd target/release/lmpd --workspace "$RESOURCE_WORKSPACE" --output lmp-test-results/resource-gate.json
cmp --silent registry/registry.json apps/docs/public/registry.json
python3 orchestrator/registry_release_gate.py registry/registry.json --verify-cids
python3 orchestrator/registry_manifest_gate.py registry/registry.json --lmp target/release/lmp
LMP_DEPLOYMENT_URL="${LMP_DEPLOYMENT_URL:-https://lmp-six.vercel.app}"
python3 orchestrator/verify_static_deployment.py "$LMP_DEPLOYMENT_URL" \
  --expected-registry registry/registry.json \
  --check-manifests \
  --require-https

python3 - "$RAW_VERSION" "${CARGO_FILES[@]}" -- "${PACKAGE_FILES[@]}" <<'PY'
import json
import pathlib
import re
import sys

version = sys.argv[1]
separator = sys.argv.index("--")
cargo_files = [pathlib.Path(item) for item in sys.argv[2:separator]]
package_files = [pathlib.Path(item) for item in sys.argv[separator + 1:]]

for path in cargo_files:
    text = path.read_text(encoding="utf-8")
    updated, count = re.subn(r'(?m)^version\s*=\s*"[^"]+"', f'version = "{version}"', text, count=1)
    if count != 1:
        raise SystemExit(f"missing package version in {path}")
    path.write_text(updated, encoding="utf-8")

for path in package_files:
    data = json.loads(path.read_text(encoding="utf-8"))
    if "version" not in data:
        continue
    data["version"] = version
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
PY

cargo check --workspace
git add Cargo.toml Cargo.lock crates packages apps package.json pnpm-lock.yaml
git commit -m "chore: prepare release $VERSION_TAG" \
  -m "Constraint: release metadata must remain synchronized across Rust and Node manifests." \
  -m "Rejected: automatic tagging from a dirty checkout | it can include unrelated work." \
  -m "Confidence: high" \
  -m "Scope-risk: moderate" \
  -m "Directive: preserve signed-tag and evidence gates for future releases." \
  -m "Tested: Rust, integration, Docker, qualification, and real-world gates." \
  -m "Not-tested: none when the full benchmark is enabled."

# The version bump is part of the release revision. Run the benchmark only
# after that commit exists; otherwise --require-clean would bind evidence to
# the pre-release HEAD and the final tag would not be covered.
info "Running final release evidence against committed revision"
python3 orchestrator/real_world_benchmark.py --lmp target/release/lmp --output lmp-test-results/real-world
python3 orchestrator/benchmark_artifact_gate.py \
  lmp-test-results/real-world/real-world-benchmark.json \
  --require-clean \
  --expected-revision "$(git rev-parse HEAD)"

if (( CREATE_TAG )); then
  git tag -s -m "Lending-Mind Protocol $VERSION_TAG" "$VERSION_TAG"
  pass "Created signed tag $VERSION_TAG"
fi

if (( PUSH )); then
  git push origin HEAD
  git push origin "$VERSION_TAG"
  pass "Pushed branch and tag to origin"
else
  info "Remote push not requested. Push explicitly after reviewing the commit."
fi

pass "Release preparation completed for $VERSION_TAG"
