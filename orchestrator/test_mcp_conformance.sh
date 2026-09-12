#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${LMP_MCP_CONFORMANCE_PORT:-39123}"
MCP_BIN="${LMP_MCP_BIN:-$ROOT_DIR/target/debug/lmp-mcp}"

if [[ ! -x "$MCP_BIN" ]]; then
  echo "MCP binary not found or not executable: $MCP_BIN" >&2
  exit 1
fi

server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

LMP_MCP_BIND=127.0.0.1 \
LMP_MCP_PORT="$PORT" \
"$MCP_BIN" --transport streamable-http \
  >"${TMPDIR:-/tmp}/lmp-mcp-conformance.log" 2>&1 &
server_pid=$!

ready=false
for _ in {1..20}; do
  if curl --silent --fail --max-time 1 \
    -X POST "http://127.0.0.1:$PORT/mcp" \
    -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","id":"readiness","method":"ping"}' \
    >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 0.25
done

if [[ "$ready" != true ]]; then
  echo "MCP server did not become ready" >&2
  cat "${TMPDIR:-/tmp}/lmp-mcp-conformance.log" >&2
  exit 1
fi

for scenario in server-initialize ping tools-list; do
  npx --yes @modelcontextprotocol/conformance@0.1.11 \
    server --url "http://127.0.0.1:$PORT/mcp" \
    --scenario "$scenario"
done
