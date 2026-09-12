import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const bootstrapper = join(packageRoot, "bin.ts");

interface BootstrapResult {
  code: number | null;
  output: string;
}

function runBootstrapper(workspace: string, strategy: string, extraEnv: Record<string, string> = {}, agent = "cursor", extraArgs: string[] = []): Promise<BootstrapResult> {
  return new Promise<BootstrapResult>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [bootstrapper, "--yes", "--agent", agent, "--mind", "tj-ponytail", "--stack", "typescript-node", "--strategy", strategy, ...extraArgs, workspace],
      { cwd: packageRoot, env: { ...process.env, NO_COLOR: "1", LMP_DISABLE_RUNTIME_DOWNLOAD: "1", ...extraEnv } },
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
}

test("bootstraps a nonexistent greenfield workspace and verifies its profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "lmp-greenfield-"));
  const workspace = join(root, "new-project");
  const result = await runBootstrapper(workspace, "greenfield");

  assert.equal(result.code, 0, result.output);
  const config = JSON.parse(await readFile(join(workspace, ".lending-mind/config.json"), "utf8"));
  const adapter = JSON.parse(await readFile(join(workspace, ".lmp_telemetry/agent-mcp.json"), "utf8"));
  const integrations = JSON.parse(await readFile(join(workspace, ".lmp_telemetry/host-integrations.json"), "utf8"));
  assert.equal(config.strategy, "greenfield");
  assert.equal(config.signatureStatus, "verified");
  assert.match(await readFile(join(workspace, ".lending-mind/mind/SKILL.md"), "utf8"), /Run LMP evaluation/);
  assert.equal(adapter.available, false);
  assert.equal(adapter.command, "lmp-mcp");
  assert.equal(integrations.integrations[0].status, "runtime-unavailable");
  assert.match(await readFile(join(workspace, ".gitignore"), "utf8"), /\.lmp_telemetry\//);
});

test("rejects a false greenfield selection for an existing workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "lmp-brownfield-"));
  await writeFile(join(root, "package.json"), "{}\n");
  const result = await runBootstrapper(root, "greenfield");

  assert.notEqual(result.code, 0);
  assert.match(result.output, /Workspace appears existing \(brownfield\)/);
});

test("adds only missing generated gitignore rules on a repeated brownfield run", async () => {
  const root = await mkdtemp(join(tmpdir(), "lmp-gitignore-repeat-"));
  await writeFile(join(root, "package.json"), "{}\n");
  await writeFile(join(root, ".gitignore"), "dist/\n# Lending-Mind Protocol local state (generated; do not commit)\n.lending-mind/\n.lmp_telemetry/\n");
  const result = await runBootstrapper(root, "brownfield");

  assert.equal(result.code, 0, result.output);
  const gitignore = await readFile(join(root, ".gitignore"), "utf8");
  assert.equal((gitignore.match(/Lending-Mind Protocol local state/g) ?? []).length, 1);
  assert.equal((gitignore.match(/\.lending-mind\//g) ?? []).length, 1);
  assert.equal((gitignore.match(/\.lmp_telemetry\//g) ?? []).length, 1);
  assert.match(gitignore, /lmp_test_bed\//);
  assert.match(gitignore, /private-key\.pem/);
  assert.match(gitignore, /\*\.private\.pem/);
});

test("blocks onboarding before mutation when generated LMP state already exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "lmp-onboarding-blocked-"));
  await writeFile(join(root, "package.json"), "{}\n");
  await mkdir(join(root, ".lending-mind"), { recursive: true });
  await writeFile(join(root, ".lending-mind/config.json"), '{"sentinel":true}\n');
  const result = await runBootstrapper(root, "brownfield");

  assert.notEqual(result.code, 0);
  assert.match(result.output, /Onboarding blocked/);
  assert.equal(await readFile(join(root, ".lending-mind/config.json"), "utf8"), '{"sentinel":true}\n');
  assert.equal(await readFile(join(root, "package.json"), "utf8"), "{}\n");
});

test("rejects a malformed rule contract before onboarding mutates the workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "lmp-invalid-profile-"));
  const profiles = join(root, "profiles");
  const profile = join(profiles, "tj-ponytail");
  await cp(join(packageRoot, "profiles/tj-ponytail"), profile, { recursive: true });
  const contractPath = join(profile, "rules/manifest.json");
  const contract = JSON.parse(await readFile(contractPath, "utf8"));
  contract.rules.push({ ...contract.rules[0] });
  await writeFile(contractPath, `${JSON.stringify(contract)}\n`);

  const workspace = join(root, "workspace");
  const result = await runBootstrapper(workspace, "greenfield", { LMP_PROFILE_ROOT: profiles });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /incomplete rule contract manifest/);
});

test("rejects a semantically invalid canonical manifest before onboarding", async () => {
  const root = await mkdtemp(join(tmpdir(), "lmp-invalid-canonical-profile-"));
  const profiles = join(root, "profiles");
  const profile = join(profiles, "tj-ponytail");
  await cp(join(packageRoot, "profiles/tj-ponytail"), profile, { recursive: true });
  const manifestPath = join(profile, "mind.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.modeDefaults.network = "online";
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

  const workspace = join(root, "workspace");
  const result = await runBootstrapper(workspace, "greenfield", { LMP_PROFILE_ROOT: profiles });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /offline supported validation mode/);
});

test("preserves existing Cursor MCP servers and reports a conflicting LMP entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "lmp-existing-mcp-"));
  const workspace = join(root, "workspace");
  const lmpd = join(root, "lmpd");
  const mcp = join(root, "lmp-mcp");
  await writeFile(lmpd, "fake lmpd");
  await writeFile(mcp, "fake lmp-mcp");
  await mkdir(join(workspace, ".cursor"), { recursive: true });
  await writeFile(join(workspace, ".cursor/mcp.json"), `${JSON.stringify({
    mcpServers: { existing: { command: "existing-tool", args: [] } },
  }, null, 2)}\n`);
  const result = await runBootstrapper(workspace, "greenfield", {
    LMPD_BIN: lmpd,
    LMP_MCP_BIN: mcp,
  });
  assert.equal(result.code, 0, result.output);
  const config = JSON.parse(await readFile(join(workspace, ".cursor/mcp.json"), "utf8"));
  assert.deepEqual(config.mcpServers.existing, { command: "existing-tool", args: [] });
  assert.match(config.mcpServers["lending-mind"].command, /\.lmp_telemetry[\\/]bin[\\/]lmp-mcp/);

  await writeFile(join(workspace, ".cursor/mcp.json"), `${JSON.stringify({
    mcpServers: { "lending-mind": { command: "different-tool" } },
  }, null, 2)}\n`);
  const conflict = await runBootstrapper(workspace, "brownfield", {
    LMPD_BIN: lmpd,
    LMP_MCP_BIN: mcp,
  }, "cursor", ["--force"]);
  assert.equal(conflict.code, 0, conflict.output);
  const integrations = JSON.parse(await readFile(join(workspace, ".lmp_telemetry/host-integrations.json"), "utf8"));
  assert.equal(integrations.integrations[0].status, "blocked-existing-server");
});

test("configures project-scoped Cline and Roo MCP settings without touching global settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "lmp-cline-manifest-"));
  const workspace = join(root, "workspace");
  const lmpd = join(root, "lmpd");
  const mcp = join(root, "lmp-mcp");
  await writeFile(lmpd, "fake lmpd");
  await writeFile(mcp, "fake lmp-mcp");
  const result = await runBootstrapper(workspace, "greenfield", {
    LMPD_BIN: lmpd,
    LMP_MCP_BIN: mcp,
  }, "cline");
  assert.equal(result.code, 0, result.output);
  const integrations = JSON.parse(await readFile(join(workspace, ".lmp_telemetry/host-integrations.json"), "utf8"));
  assert.deepEqual(integrations.integrations.map((entry) => entry.path), [".cline/mcp.json", ".roo/mcp.json"]);
  assert.ok(integrations.integrations.every((entry) => entry.status === "configured"));
  assert.equal(JSON.parse(await readFile(join(workspace, ".cline/mcp.json"), "utf8")).mcpServers["lending-mind"].env.LMP_WORKSPACE_ROOT, workspace);
  assert.equal(JSON.parse(await readFile(join(workspace, ".roo/mcp.json"), "utf8")).mcpServers["lending-mind"].env.LMP_WORKSPACE_ROOT, workspace);
  assert.equal(JSON.parse(await readFile(join(workspace, ".lmp_telemetry/agent-mcp.json"), "utf8")).available, true);
});

test("writes a copy-ready Claude Desktop MCP entry without touching global settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "lmp-claude-desktop-"));
  const workspace = join(root, "workspace");
  const lmpd = join(root, "lmpd");
  const mcp = join(root, "lmp-mcp");
  await writeFile(lmpd, "fake lmpd");
  await writeFile(mcp, "fake lmp-mcp");
  const result = await runBootstrapper(workspace, "greenfield", {
    LMPD_BIN: lmpd,
    LMP_MCP_BIN: mcp,
  }, "claudedesktop");
  assert.equal(result.code, 0, result.output);
  const config = JSON.parse(await readFile(join(workspace, ".lmp_telemetry/claude-desktop-mcp.json"), "utf8"));
  assert.match(config.mcpServers["lending-mind"].command, /\.lmp_telemetry[\\/]bin[\\/]lmp-mcp/);
  const integrations = JSON.parse(await readFile(join(workspace, ".lmp_telemetry/host-integrations.json"), "utf8"));
  assert.equal(integrations.integrations[0].status, "config-artifact-written");
});

test("downloads and verifies a matching Rust runtime release asset", async () => {
  const root = await mkdtemp(join(tmpdir(), "lmp-runtime-download-"));
  const payload = join(root, "payload");
  const archive = join(root, "lmp-runtime.tar.gz");
  const target = process.platform === "linux" && process.arch === "x64"
    ? "x86_64-unknown-linux-gnu"
    : process.platform === "darwin" && process.arch === "arm64"
      ? "aarch64-apple-darwin"
      : process.platform === "darwin" && process.arch === "x64"
        ? "x86_64-apple-darwin"
        : process.platform === "win32" && process.arch === "x64"
          ? "x86_64-pc-windows-msvc"
          : null;
  if (!target) return;
  const suffix = process.platform === "win32" ? ".exe" : "";
  await mkdir(payload, { recursive: true });
  await writeFile(join(payload, `lmpd-${target}${suffix}`), "fake lmpd");
  await writeFile(join(payload, `lmp-mcp-${target}${suffix}`), "fake lmp-mcp");
  execFileSync("tar", ["-czf", archive, "-C", payload, "."]);
  const archiveName = `lmp-${target}.tar.gz`;
  const archiveBytes = await readFile(archive);
  const checksum = createHash("sha256").update(archiveBytes).digest("hex");
  const server = createServer((request, response) => {
    if (request.url === `/${archiveName}`) {
      response.writeHead(200, { "content-type": "application/gzip" });
      response.end(archiveBytes);
    } else if (request.url === "/SHA256SUMS") {
      response.end(`${checksum}  ${archiveName}\n`);
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    const workspace = join(root, "workspace");
    const result = await runBootstrapper(workspace, "greenfield", {
      LMP_DISABLE_RUNTIME_DOWNLOAD: "0",
      LMP_RELEASE_BASE_URL: `http://127.0.0.1:${address.port}`,
    });
    assert.equal(result.code, 0, result.output);
    const runtime = JSON.parse(await readFile(join(workspace, ".lmp_telemetry/runtime.json"), "utf8"));
    const adapter = JSON.parse(await readFile(join(workspace, ".lmp_telemetry/agent-mcp.json"), "utf8"));
    const cursorConfig = JSON.parse(await readFile(join(workspace, ".cursor/mcp.json"), "utf8"));
    assert.equal(runtime.runtimeDownload.status, "verified-download");
    assert.deepEqual(runtime.installedBinaries, ["lmpd", "lmp-mcp"]);
    assert.equal(adapter.available, true);
    assert.match(adapter.command, /\.lmp_telemetry[\\/]bin[\\/]lmp-mcp/);
    assert.match(cursorConfig.mcpServers["lending-mind"].command, /\.lmp_telemetry[\\/]bin[\\/]lmp-mcp/);
  } finally {
    server.close();
  }
});

test("records workspace topology and framework discovery for a monorepo", async () => {
  const root = await mkdtemp(join(tmpdir(), "lmp-discovery-monorepo-"));
  await writeFile(join(root, "package.json"), `${JSON.stringify({
    dependencies: { next: "15.0.0", react: "19.0.0" },
  })}\n`);
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
  await writeFile(join(root, "turbo.json"), "{\"tasks\":{}}\n");
  const result = await runBootstrapper(root, "brownfield");

  assert.equal(result.code, 0, result.output);
  const config = JSON.parse(await readFile(join(root, ".lending-mind/config.json"), "utf8"));
  assert.deepEqual(config.discovery.languages, ["typescript-javascript"]);
  assert.deepEqual(config.discovery.monorepo, ["turborepo", "pnpm"]);
  assert.deepEqual(config.discovery.frameworks, ["next.js", "react"]);
});

test("uninstalls only generated LMP state and preserves project guidance", async () => {
  const root = await mkdtemp(join(tmpdir(), "lmp-uninstall-"));
  const workspace = join(root, "workspace");
  const first = await runBootstrapper(workspace, "greenfield");
  assert.equal(first.code, 0, first.output);
  await writeFile(join(workspace, "AGENTS.md"), `${await readFile(join(workspace, "AGENTS.md"), "utf8")}\n# Project guidance\nKeep the API stable.\n`);
  await mkdir(join(workspace, ".cursor"), { recursive: true });
  await writeFile(join(workspace, ".cursor/mcp.json"), `${JSON.stringify({ mcpServers: { existing: { command: "existing-tool" } } }, null, 2)}\n`);

  const result = await new Promise<BootstrapResult>((resolveResult, reject) => {
    const child = spawn(process.execPath, [bootstrapper, "--uninstall", workspace], {
      cwd: packageRoot,
      env: { ...process.env, NO_COLOR: "1" },
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolveResult({ code, output }));
  });

  assert.equal(result.code, 0, result.output);
  assert.equal(existsSync(join(workspace, ".lending-mind")), false);
  assert.equal(existsSync(join(workspace, ".lmp_telemetry")), false);
  assert.match(await readFile(join(workspace, "AGENTS.md"), "utf8"), /# Project guidance/);
  assert.deepEqual(JSON.parse(await readFile(join(workspace, ".cursor/mcp.json"), "utf8")), {
    mcpServers: { existing: { command: "existing-tool" } },
  });
});
