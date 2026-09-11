#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LMPD_BIN="${LMPD_BIN:-${ROOT_DIR}/target/release/lmpd}"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/lmpd-lifecycle.XXXXXX")"
DAEMON_PID=""

cleanup() {
    if [[ -n "${DAEMON_PID}" ]] && kill -0 "${DAEMON_PID}" 2>/dev/null; then
        kill -TERM "${DAEMON_PID}" 2>/dev/null || true
        wait "${DAEMON_PID}" 2>/dev/null || true
    fi
    rm -rf "${TEST_ROOT}"
}
trap cleanup EXIT

[[ -x "${LMPD_BIN}" ]] || { echo "lmpd binary is required: ${LMPD_BIN}" >&2; exit 2; }
mkdir -p "${TEST_ROOT}/workspace"
"${LMPD_BIN}" \
    --workspace "${TEST_ROOT}/workspace" \
    --mind "${ROOT_DIR}/skills/baseline" \
    --mode advisory \
    --pid-file "${TEST_ROOT}/lmpd.pid" \
    >"${TEST_ROOT}/daemon.log" 2>&1 &
DAEMON_PID=$!

for _ in $(seq 1 50); do
    [[ -f "${TEST_ROOT}/lmpd.pid" ]] && break
    sleep 0.1
done
[[ -f "${TEST_ROOT}/lmpd.pid" ]] || { cat "${TEST_ROOT}/daemon.log" >&2; exit 1; }

status="$(${LMPD_BIN} --status --pid-file "${TEST_ROOT}/lmpd.pid")"
[[ "${status}" == *'"status":"running"'* ]] || { echo "unexpected status: ${status}" >&2; exit 1; }

"${LMPD_BIN}" --reload --pid-file "${TEST_ROOT}/lmpd.pid" >/dev/null
for _ in $(seq 1 50); do
    if grep -q 'reloaded and re-evaluated' "${TEST_ROOT}/daemon.log"; then
        break
    fi
    sleep 0.1
done
grep -q 'reloaded and re-evaluated' "${TEST_ROOT}/daemon.log"

printf 'export const removed: any = 1;\n' >"${TEST_ROOT}/workspace/removed.ts"
for _ in $(seq 1 50); do
    if grep -q 'finding' "${TEST_ROOT}/daemon.log"; then
        break
    fi
    sleep 0.1
done
grep -q 'finding' "${TEST_ROOT}/daemon.log"
rm "${TEST_ROOT}/workspace/removed.ts"
for _ in $(seq 1 50); do
    if grep -q 'aligned' "${TEST_ROOT}/daemon.log"; then
        break
    fi
    sleep 0.1
done
grep -q 'aligned' "${TEST_ROOT}/daemon.log"

"${LMPD_BIN}" --stop --pid-file "${TEST_ROOT}/lmpd.pid" >/dev/null
wait "${DAEMON_PID}"
DAEMON_PID=""
stopped="$(${LMPD_BIN} --status --pid-file "${TEST_ROOT}/lmpd.pid")"
[[ "${stopped}" == *'"status":"stopped"'* ]] || { echo "unexpected stopped status: ${stopped}" >&2; exit 1; }

echo '{"status":"verified","checks":["status","reload","create","remove","stop","pid-file-cleanup"]}'
