#!/usr/bin/env node
import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { arch, platform } from "node:process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const profileRoot = process.env.LMP_PROFILE_ROOT ?? join(packageRoot, "profiles");
const packageManifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const args = process.argv.slice(2);
const valueFlags = new Set(["--agent", "--mind", "--stack", "--strategy"]);
const workspaceArg = args.find((value, index) => !value.startsWith("--") && !valueFlags.has(args[index - 1]));
const workspace = resolve(workspaceArg ?? process.cwd());
const flags = new Map(args.filter((value) => value.startsWith("--")).map((value) => [value, true]));
const force = flags.has("--force");
const installHooks = flags.has("--install-hooks") || existsSync(join(workspace, ".git"));

// A greenfield target may be a path that does not exist yet. Create it before
// probing its contents so the same bootstrap path works for both new and
// existing workspaces.
await mkdir(workspace, { recursive: true });

const agents = [
  ["claudecode", "Claude Code"],
  ["claudedesktop", "Claude Desktop"],
  ["cursor", "Cursor"],
  ["cline", "Roo Code / Cline"],
];
const minds = [
  ["supabase-core", "lmp:mind:supabase-core", "SQL/Postgres · database-level data isolation"],
  ["tj-ponytail", "lmp:mind:tj-ponytail", "TypeScript/Node · zero-dependency minimalism"],
  ["linux-kernel", "lmp:mind:linux-kernel", "C/Rust · defensive systems safety · complexity cap 6"],
];
const stackOptions = [
  ["rust", "Rust", "Cargo workspace or Rust systems project"],
  ["typescript-node", "TypeScript / Node.js", "package.json or Node service"],
  ["python", "Python", "pyproject.toml or Python service"],
  ["mixed", "Mixed workspace", "multiple language runtimes"],
  ["unknown", "Other / not detected", "configure the runtime manually"],
];
const strategyOptions = [
  ["greenfield", "Greenfield", "new project or first commit"],
  ["brownfield", "Brownfield", "existing or legacy repository"],
];

const ignoredWorkspaceEntries = new Set([
  ".git",
  ".gitignore",
  ".lending-mind",
  ".lmp_telemetry",
  "lmp_test_bed",
  ".lmp-qualification-docker",
  "node_modules",
  "target",
]);

const gitignoreBlock = `# Lending-Mind Protocol local state (generated; do not commit)
.lending-mind/
.lmp_telemetry/
lmp_test_bed/
.lmp-qualification-docker/
private-key.pem
*.private.pem
`;

async function ensureGitignore() {
  const path = join(workspace, ".gitignore");
  let current = "";
  try {
    current = await readFile(path, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const lines = current.split(/\r?\n/);
  const required = gitignoreBlock.trimEnd().split("\n").filter((entry) => !entry.startsWith("# "));
  const missing = required.filter((entry) => !lines.includes(entry));
  if (missing.length === 0) return false;
  const prefix = current && !current.endsWith("\n") ? `${current}\n` : current;
  const header = "# Lending-Mind Protocol local state (generated; do not commit)";
  const headerLine = lines.includes(header) ? "" : `${header}\n`;
  await writeFile(
    path,
    `${prefix}${prefix ? "\n" : ""}${headerLine}${missing.join("\n")}\n`,
  );
  return true;
}

async function installEnforcedHook(mind: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(mind)) {
    throw new Error(`invalid Mind id for enforcement hook: ${mind}`);
  }
  const gitDirectory = join(workspace, ".git");
  if (!existsSync(gitDirectory)) {
    throw new Error(`cannot install enforcement hook: ${gitDirectory} is missing`);
  }
  const hook = join(gitDirectory, "hooks", "pre-commit");
  if (existsSync(hook) && !force) {
    throw new Error(`pre-commit hook exists at ${hook}; use --force to replace it`);
  }
  await mkdir(join(gitDirectory, "hooks"), { recursive: true });
  await writeFile(hook, `#!/bin/sh
# LENDING-MIND GENERATED ENFORCEMENT HOOK
set -eu
root="$(git rev-parse --show-toplevel)"
cd "$root"
if command -v lmp >/dev/null 2>&1; then
  exec lmp evaluate --mind .lending-mind/mind --workspace . --mode enforced --artifact-dir .lending-mind/artifacts --changed-only
fi
if [ -x "$root/.lmp_telemetry/bin/lmp" ]; then
  exec "$root/.lmp_telemetry/bin/lmp" evaluate --mind .lending-mind/mind --workspace . --mode enforced --artifact-dir .lending-mind/artifacts --changed-only
fi
if command -v npx >/dev/null 2>&1; then
  exec npx --no-install @lending-mind/lmp evaluate --mind .lending-mind/mind --workspace . --mode enforced --artifact-dir .lending-mind/artifacts --changed-only
fi
echo "LMP enforcement unavailable: install @lending-mind/lmp or provide .lmp_telemetry/bin/lmp" >&2
exit 3
`);
  await chmod(hook, 0o755);
  return hook;
}

function assertHookInstallable(mind: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(mind)) {
    throw new Error(`invalid Mind id for enforcement hook: ${mind}`);
  }
  const gitDirectory = join(workspace, ".git");
  if (!existsSync(gitDirectory)) {
    throw new Error(`cannot install enforcement hook: ${gitDirectory} is missing`);
  }
  const hook = join(gitDirectory, "hooks", "pre-commit");
  if (existsSync(hook) && !force) {
    throw new Error(`pre-commit hook exists at ${hook}; use --force to replace it`);
  }
}

function detectStack() {
  const files = ["Cargo.toml", "package.json", "pyproject.toml", "go.mod", "pom.xml"].filter((file) => existsSync(join(workspace, file)));
  if (files.includes("Cargo.toml")) return "rust";
  if (files.includes("package.json")) return "typescript-node";
  if (files.includes("pyproject.toml")) return "python";
  return "unknown";
}

function detectProject() {
  const files = new Set(readdirSync(workspace));
  const languages = [];
  if (files.has("package.json")) languages.push("typescript-javascript");
  if (files.has("Cargo.toml")) languages.push("rust");
  if (files.has("go.mod")) languages.push("go");
  if (files.has("pyproject.toml") || files.has("setup.py") || files.has("requirements.txt")) languages.push("python");
  if (files.has("main.tf") || files.has(".terraform")) languages.push("terraform");
  const monorepo = [];
  if (files.has("turbo.json")) monorepo.push("turborepo");
  if (files.has("nx.json")) monorepo.push("nx");
  if (files.has("pnpm-workspace.yaml")) monorepo.push("pnpm");
  if (files.has("lerna.json")) monorepo.push("lerna");
  if (files.has("Cargo.toml")) {
    try {
      if (/^\s*\[workspace\]/m.test(requireText(join(workspace, "Cargo.toml")))) monorepo.push("cargo");
    } catch { /* unreadable manifests are reported by the runtime later */ }
  }
  const frameworks = [];
  try {
    const packageJson = JSON.parse(requireText(join(workspace, "package.json")));
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (dependencies.next) frameworks.push("next.js");
    if (dependencies.react) frameworks.push("react");
    if (dependencies.vue) frameworks.push("vue");
    if (dependencies.svelte) frameworks.push("svelte");
    if (dependencies.fastify || dependencies.express || dependencies.nestjs) frameworks.push("node-server");
    if (dependencies["@vercel/node"] || dependencies["@vercel/edge"]) frameworks.push("vercel-edge");
  } catch { /* package.json is optional */ }
  if (files.has("manage.py")) frameworks.push("django");
  try {
    const pythonProject = ["pyproject.toml", "requirements.txt"].filter((file) => files.has(file)).map((file) => requireText(join(workspace, file))).join("\n");
    if (/\bfastapi\b/i.test(pythonProject)) frameworks.push("fastapi");
  } catch { /* Python metadata is optional */ }
  if (files.has("pom.xml")) frameworks.push("spring");
  if (files.has("config/routes.rb")) frameworks.push("rails");
  return { languages, monorepo, frameworks, root: workspace };
}

function requireText(path) {
  return readFileSync(path, "utf8");
}

function detectWorkspaceState() {
  const signals = [
    ["Cargo.toml", "Rust manifest"],
    ["package.json", "Node.js manifest"],
    ["pyproject.toml", "Python manifest"],
    ["go.mod", "Go manifest"],
    ["pom.xml", "Java Maven manifest"],
    ["src", "source directory"],
    ["app", "application directory"],
    ["apps", "application workspace directory"],
  ];
  const evidence = signals.filter(([entry]) => existsSync(join(workspace, entry))).map(([, label]) => label);

  if (evidence.length === 0) {
    for (const entry of readdirSync(workspace)) {
      if (ignoredWorkspaceEntries.has(entry) || entry.startsWith(".")) continue;
      const path = join(workspace, entry);
      if (statSync(path).isFile() || statSync(path).isDirectory()) {
        evidence.push(`existing workspace entry: ${entry}`);
        break;
      }
    }
  }

  return {
    kind: evidence.length > 0 ? "brownfield" : "greenfield",
    evidence,
  };
}

function parseFlag(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function choose(question, options, requested) {
  if (requested && options.some(([id]) => id === requested)) return requested;
  if (flags.has("--yes") && options[0]) return options[0][0];
  if (!input.isTTY || !output.isTTY) return options[0][0];
  const terminal = createInterface({ input, output });
  try {
    console.log(`\n${question}`);
    options.forEach(([id, label, detail], index) => console.log(`  ${index + 1}. ${label}${detail ? `  [${detail}]` : ""}${index === 0 ? "  (recommended)" : ""}`));
    const answer = await terminal.question("Select a number: ");
    const selected = options[Number.parseInt(answer, 10) - 1];
    return selected?.[0] ?? options[0][0];
  } finally {
    terminal.close();
  }
}

async function confirmStrategyMismatch(detected, selected) {
  if (detected.kind === selected) return;

  const detectedLabel = detected.kind === "brownfield" ? "existing (brownfield)" : "new (greenfield)";
  const selectedLabel = selected === "brownfield" ? "brownfield" : "greenfield";
  const evidence = detected.evidence.length > 0 ? ` Evidence: ${detected.evidence.join(", ")}.` : "";
  const message = `Workspace appears ${detectedLabel}, but ${selectedLabel} was selected.${evidence}`;

  if (flags.has("--allow-strategy-mismatch")) {
    console.warn(`⚠️  ${message} Continuing because --allow-strategy-mismatch was supplied.`);
    return;
  }

  if (!input.isTTY || !output.isTTY || flags.has("--yes")) {
    throw new Error(`${message} Refusing to continue without an explicit confirmation. Use --strategy ${detected.kind}, or add --allow-strategy-mismatch if this choice is intentional.`);
  }

  const terminal = createInterface({ input, output });
  try {
    console.warn(`\n⚠️  ${message}`);
    console.warn(`   ${selectedLabel} mode can apply assumptions that do not match this workspace.`);
    const answer = await terminal.question("Continue with this strategy anyway? Type 'continue' to confirm: ");
    if (answer.trim().toLowerCase() !== "continue") {
      throw new Error(`Strategy selection cancelled. Choose --strategy ${detected.kind} and run onboarding again.`);
    }
  } finally {
    terminal.close();
  }
}

async function profileFiles(alias) {
  const source = join(profileRoot, alias);
  const manifestPath = join(source, "mind.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await validateProfileContract(source, manifest);
  const signature = (await readFile(join(source, "signatures", "manifest.sig"), "utf8")).trim();
  const publicKey = (await readFile(join(source, "signatures", "public-key.hex"), "utf8")).trim();
  const publicKeyDer = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKey.replace(/^0x/, ""), "hex")]);
  const valid = verifySignature(null, await readFile(manifestPath), createPublicKey({ key: publicKeyDer, format: "der", type: "spki" }), Buffer.from(signature.replace(/^0x/, ""), "hex"));
  if (!valid) throw new Error(`signature verification failed for ${manifest.id}`);
  return { source, manifest, signatureStatus: "verified" };
}

async function validateProfileContract(source, manifest) {
  const required = [
    "mind.json",
    "SKILL.md",
    "guidance.md",
    "evidence.json",
    "release.json",
    "evidence/README.md",
    "rules/manifest.json",
    "signatures/manifest.sig",
    "signatures/public-key.hex",
    ...(Object.values(manifest.enforcement ?? {}) as string[]),
  ];
  for (const relative of new Set(required)) {
    if (!existsSync(join(source, relative)))
      throw new Error(`profile ${manifest.id} is missing required file: ${relative}`);
  }
  const contractObjectKeysValid = (value, allowed) =>
    value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => allowed.has(key));
  const nonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
  if (!nonEmptyString(manifest.$schema) || !/^https?:\/\/[^\s]+$/.test(manifest.$schema))
    throw new Error(`profile ${manifest.id} has an invalid canonical schema URL`);
  if (manifest.specVersion !== "1.0")
    throw new Error(`profile ${manifest.id} must declare specVersion 1.0`);
  if (!/^lmp:mind:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id))
    throw new Error(`profile ${manifest.id} has an invalid canonical ID`);
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(manifest.version))
    throw new Error(`profile ${manifest.id} must use semantic versioning`);
  if (!manifest.modeDefaults || !["advisory", "enforced", "audit"].includes(manifest.modeDefaults.validation) || manifest.modeDefaults.network !== "offline")
    throw new Error(`profile ${manifest.id} must use an offline supported validation mode`);
  for (const field of ["author", "provenance", "philosophy", "capabilities", "enforcement"])
    if (!manifest[field] || (typeof manifest[field] === "object" && Object.keys(manifest[field]).length === 0))
      throw new Error(`profile ${manifest.id} is missing required canonical metadata: ${field}`);
  if (manifest.author.verified && manifest.author.kind !== "official-maintainer")
    throw new Error(`profile ${manifest.id} has invalid verified authorship metadata`);
  if (manifest.author.kind === "community-archetype" && manifest.author.verified)
    throw new Error(`profile ${manifest.id} marks a community archetype as verified`);
  const release = JSON.parse(await readFile(join(source, "release.json"), "utf8"));
  if (release.packageId !== manifest.id || release.version !== manifest.version)
    throw new Error(`profile ${manifest.id} has identity-mismatched release metadata`);
  if (!Array.isArray(release.changelog) || !release.changelog.length || !Array.isArray(release.limitations) || !release.limitations.length || !release.review)
    throw new Error(`profile ${manifest.id} has incomplete release metadata`);
  const evidence = JSON.parse(await readFile(join(source, "evidence.json"), "utf8"));
  const tests = Array.isArray(evidence.tests) ? evidence.tests : [];
  const evidenceManifestKeys = new Set(["status", "tests", "notes"]);
  const fixtureKeys = new Set(["id", "kind", "description", "expected"]);
  const fixtureIds = new Set(tests.map((fixture) => fixture?.id));
  const fixturesValid = tests.every((fixture) =>
    contractObjectKeysValid(fixture, fixtureKeys) &&
    nonEmptyString(fixture.id) &&
    ["positive", "negative", "exception"].includes(fixture.kind) &&
    nonEmptyString(fixture.description) &&
    ["pass", "needs_revision", "blocked"].includes(fixture.expected)
  );
  if (!contractObjectKeysValid(evidence, evidenceManifestKeys) || evidence.status !== "verified-fixtures" || !nonEmptyString(evidence.notes) || tests.length < 3 || fixtureIds.size !== tests.length || !fixturesValid || !["positive", "negative", "exception"].every((kind) => tests.some((fixture) => fixture.kind === kind)))
    throw new Error(`profile ${manifest.id} has an incomplete evidence fixture contract`);
  const contracts = JSON.parse(await readFile(join(source, "rules/manifest.json"), "utf8"));
  const contractManifestKeys = new Set(["schemaVersion", "rules"]);
  const contractKeys = new Set([
    "id",
    "policyFile",
    "severity",
    "classification",
    "rationale",
    "assertion",
    "scope",
    "remediation",
    "limitations",
    "evidence",
  ]);
  const evidenceKeys = new Set(["classification", "sourceId", "sourceClaim", "sourceLocator", "implementation", "fixture"]);
  const contractIds = new Set();
  const contractsValid = Array.isArray(contracts.rules) && contracts.rules.length > 0 && contracts.rules.every((rule) => {
    if (!contractObjectKeysValid(rule, contractKeys) || contractIds.has(rule.id)) return false;
    contractIds.add(rule.id);
    return (
      nonEmptyString(rule.id) &&
      nonEmptyString(rule.policyFile) &&
      ["info", "warning", "error"].includes(rule.severity) &&
      ["deterministic", "verifiable", "judgment-guided", "human-only"].includes(rule.classification) &&
      nonEmptyString(rule.rationale) &&
      nonEmptyString(rule.assertion) &&
      Array.isArray(rule.scope) &&
      rule.scope.length > 0 &&
      rule.scope.every(nonEmptyString) &&
      nonEmptyString(rule.remediation) &&
      Array.isArray(rule.limitations) &&
      rule.limitations.length > 0 &&
      rule.limitations.every(nonEmptyString) &&
      contractObjectKeysValid(rule.evidence, evidenceKeys) &&
      ["explicit-statement", "repeated-code-pattern", "review-pattern", "inferred-hypothesis", "unsupported", "verified-fixture"].includes(rule.evidence.classification) &&
      nonEmptyString(rule.evidence.sourceId)
    );
  });
  const policyFiles = new Set(Object.values(manifest.enforcement ?? {}));
  const contractPolicyFiles = new Set((contracts.rules ?? []).map((rule) => rule.policyFile));
  if (!contractObjectKeysValid(contracts, contractManifestKeys) || contracts.schemaVersion !== "1.0" || !Array.isArray(contracts.rules) || !contracts.rules.length || !contractsValid || ![...policyFiles].every((policyFile) => contractPolicyFiles.has(policyFile)))
    throw new Error(`profile ${manifest.id} has an incomplete rule contract manifest`);
}

async function copyProfile(source, destination) {
  const entries = ["mind.json", "SKILL.md", "guidance.md", "evidence.json", "release.json", "evidence/README.md", "rules/manifest.json", "rules/commands.json", "rules/complexity.json", "rules/dependencies.json", "rules/typescript.json", "signatures/manifest.sig", "signatures/public-key.hex"];
  for (const relative of entries) {
    const from = join(source, relative);
    if (!existsSync(from)) throw new Error(`profile copy source is missing: ${relative}`);
    const target = join(destination, relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(from));
  }
}

async function assertOnboardingTargetIsWritable() {
  if (force) return;
  for (const [relativePath, label] of [
    [".lending-mind", "LMP state"],
    [".lmp_telemetry", "LMP telemetry"],
  ]) {
    if (!existsSync(join(workspace, relativePath))) continue;
    throw new Error(
      `Onboarding blocked: ${label} already exists at ${relativePath}. ` +
        "Refusing to overwrite existing generated state; rerun with --force only after reviewing it.",
    );
  }
}

async function uninstallGeneratedState() {
  for (const relativePath of [".lending-mind", ".lmp_telemetry"]) {
    await rm(join(workspace, relativePath), { recursive: true, force: true });
  }
  for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
    const path = join(workspace, filename);
    if (!existsSync(path)) continue;
    const current = await readFile(path, "utf8");
    const cleaned = current.replace(/\n*# 🛡️ LENDING-MIND PROTOCOL ACTIVE[\s\S]*?(?=\n# |\n## |$)/, "").replace(/\n{3,}/g, "\n\n").trimEnd();
    if (cleaned !== current.trimEnd()) await writeFile(path, `${cleaned}\n`);
  }
  console.log(`✅ Removed generated LMP state from ${workspace}. Existing project files and unrelated MCP servers were preserved.`);
}

if (flags.has("--uninstall")) {
  await uninstallGeneratedState();
  process.exit(0);
}

const selectedAgent = await choose("Which AI Agent framework are you actively running in this project workspace?", agents, parseFlag("--agent"));
const selectedMind = await choose("Which expert engineering soul do you want to lend to your agent's reasoning loop?", minds, parseFlag("--mind"));
const selectedMindInfo = minds.find(([id]) => id === selectedMind) ?? minds[0];
const detectedStack = detectStack();
const detectedProject = detectProject();
const orderedStacks = detectedStack === "unknown" ? stackOptions : [stackOptions.find(([id]) => id === detectedStack), ...stackOptions.filter(([id]) => id !== detectedStack)].filter(Boolean);
const selectedStack = await choose("Which project stack should the active Mind target?", orderedStacks, parseFlag("--stack") ?? detectedStack);
const detectedWorkspace = detectWorkspaceState();
const strategyHint = detectedWorkspace.kind;
const strategyRequest = parseFlag("--strategy") ?? ((!input.isTTY || !output.isTTY || flags.has("--yes")) ? strategyHint : undefined);
const selectedStrategy = await choose("Is this a greenfield or brownfield workspace?", strategyOptions, strategyRequest);
await confirmStrategyMismatch(detectedWorkspace, selectedStrategy);
const profile = await profileFiles(selectedMind);
await assertOnboardingTargetIsWritable();
if (installHooks) assertHookInstallable(selectedMind);
const gitignoreUpdated = await ensureGitignore();

const lmpDirectory = join(workspace, ".lending-mind");
const telemetryDirectory = join(workspace, ".lmp_telemetry");
const activeMind = join(lmpDirectory, "mind");
await mkdir(join(lmpDirectory, "artifacts"), { recursive: true });
await mkdir(join(telemetryDirectory, "bin"), { recursive: true });
await mkdir(join(telemetryDirectory, "minds"), { recursive: true });
await copyProfile(profile.source, activeMind);

const config = {
  version: 2,
  defaultMind: ".lending-mind/mind",
  defaultMindId: selectedMindInfo[1],
  defaultMode: installHooks ? "enforced" : "advisory",
  enforcementBoundary: installHooks ? "git-pre-commit" : "none",
  network: "offline",
  commands: "disabled",
  agent: selectedAgent,
  stack: selectedStack,
  strategy: selectedStrategy,
  changedOnly: true,
  signatureStatus: profile.signatureStatus,
  discovery: detectedProject,
};
await writeFile(join(lmpDirectory, "config.json"), `${JSON.stringify(config, null, 2)}\n`);

const guidance = `# 🛡️ LENDING-MIND PROTOCOL ACTIVE\n\n- Active Mind: ${selectedMindInfo[1]}\n- Agent framework: ${selectedAgent}\n- Target stack: ${selectedStack}\n- The Rust LMP runtime is authoritative for compilation, AST evaluation, signatures, artifacts, and MCP.\n- Pre-flight: request the LMP MCP evaluation before proposing a file save when the host supports MCP.\n- Failure condition: if the Rust sidecar reports a policy finding, stop and revise the change before accepting it.\n- Never invent policy semantics outside the active Mind Package.\n`;
for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
  const target = join(workspace, filename);
  let current = "";
  try { current = await readFile(target, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (!current.includes("LENDING-MIND PROTOCOL ACTIVE")) await writeFile(target, `${current}${current ? "\n\n" : ""}${guidance}`);
}

const executableSuffix = platform === "win32" ? ".exe" : "";
const runtimeCandidates = {
  lmp: process.env.LMP_BIN ?? join(workspace, "target", "release", `lmp${executableSuffix}`),
  lmpd: process.env.LMPD_BIN ?? join(workspace, "target", "release", `lmpd${executableSuffix}`),
  "lmp-mcp": process.env.LMP_MCP_BIN ?? join(workspace, "target", "release", `lmp-mcp${executableSuffix}`),
};
const installedBinaries = [];
for (const [name, candidate] of Object.entries(runtimeCandidates)) {
  if (!existsSync(candidate)) continue;
  const destination = join(telemetryDirectory, "bin", `${name}${executableSuffix}`);
  await copyFile(candidate, destination);
  await chmod(destination, 0o755);
  installedBinaries.push(name);
}

function releaseTarget() {
  if (platform === "linux" && arch === "x64") return "x86_64-unknown-linux-gnu";
  if (platform === "darwin" && arch === "arm64") return "aarch64-apple-darwin";
  if (platform === "darwin" && arch === "x64") return "x86_64-apple-darwin";
  if (platform === "win32" && arch === "x64") return "x86_64-pc-windows-msvc";
  return undefined;
}

async function downloadRuntime(target) {
  if (process.env.LMP_DISABLE_RUNTIME_DOWNLOAD === "1")
    return { status: "disabled", source: null, target };
  const base = (process.env.LMP_RELEASE_BASE_URL ?? `https://github.com/lendmind-protocol/LMP/releases/download/v${packageManifest.version}`).replace(/\/$/, "");
  const archiveName = `lmp-${target}.tar.gz`;
  const [archiveResponse, sumsResponse] = await Promise.all([
    fetch(`${base}/${archiveName}`),
    fetch(`${base}/SHA256SUMS`),
  ]);
  if (!archiveResponse.ok) throw new Error(`runtime archive download failed: HTTP ${archiveResponse.status}`);
  if (!sumsResponse.ok) throw new Error(`runtime checksum download failed: HTTP ${sumsResponse.status}`);
  const archive = Buffer.from(await archiveResponse.arrayBuffer());
  const sums = await sumsResponse.text();
  const expected = sums
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/, 2))
    .find(([hash, name]) => name === archiveName)?.[0];
  if (!expected || !/^[0-9a-f]{64}$/i.test(expected)) throw new Error(`checksum for ${archiveName} is missing`);
  const actual = createHash("sha256").update(archive).digest("hex");
  if (actual !== expected.toLowerCase()) throw new Error(`checksum mismatch for ${archiveName}`);

  const temporary = await mkdtemp(join(tmpdir(), "lmp-runtime-"));
  try {
    const archivePath = join(temporary, archiveName);
    const extracted = join(temporary, "extracted");
    await mkdir(extracted, { recursive: true });
    await writeFile(archivePath, archive);
    await new Promise<void>((resolveProcess, rejectProcess) => {
      const child = spawn("tar", ["-xzf", archivePath, "-C", extracted], { stdio: "ignore" });
      child.on("error", rejectProcess);
      child.on("close", (code) => code === 0 ? resolveProcess() : rejectProcess(new Error(`runtime archive extraction failed with code ${code}`)));
    });
    const extractedFiles = await readdir(extracted, { recursive: true });
    const suffix = platform === "win32" ? ".exe" : "";
    const runtimeNames = installHooks ? ["lmp", "lmpd", "lmp-mcp"] : ["lmpd", "lmp-mcp"];
    for (const name of runtimeNames) {
      const expectedName = `${name}-${target}${suffix}`;
      const found = extractedFiles.find((entry) => entry === expectedName);
      if (!found) throw new Error(`runtime archive is missing ${expectedName}`);
      const source = join(extracted, found);
      const destination = join(telemetryDirectory, "bin", `${name}${suffix}`);
      await copyFile(source, destination);
      await chmod(destination, 0o755);
      installedBinaries.push(name);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  return { status: "verified-download", source: base, target, checksum: actual, archive: archiveName };
}

let runtimeDownload = null;
const requiredRuntime = installHooks ? ["lmp", "lmpd", "lmp-mcp"] : ["lmpd", "lmp-mcp"];
if (!requiredRuntime.every((name) => installedBinaries.includes(name))) {
  const target = releaseTarget();
  if (target) {
    try {
      runtimeDownload = await downloadRuntime(target);
    } catch (error) {
      runtimeDownload = { status: "download-failed", target, error: error instanceof Error ? error.message : String(error) };
      console.warn(`⚠️  Rust sidecar download unavailable: ${runtimeDownload.error}`);
    }
  } else {
    runtimeDownload = { status: "unsupported-platform", target: null };
  }
}
await writeFile(join(telemetryDirectory, "runtime.json"), `${JSON.stringify({ platform, arch, targetStack: selectedStack, strategy: selectedStrategy, discovery: detectedProject, binaryDirectory: ".lmp_telemetry/bin", installedBinaries, requiredRuntime, runtimeStatus: requiredRuntime.every((name) => installedBinaries.includes(name)) ? "ready" : runtimeDownload?.status ?? "requires-rust-runtime", releaseSource: process.env.LMP_RELEASE_BASE_URL ?? `https://github.com/lendmind-protocol/LMP/releases/download/v${packageManifest.version}`, runtimeDownload, installHint: "Provide a verified release asset or build the required Rust runtime locally." }, null, 2)}\n`);

const installedMcpName = platform === "win32" ? "lmp-mcp.exe" : "lmp-mcp";
const installedMcpPath = join(telemetryDirectory, "bin", installedMcpName);
const adapter = {
  name: "lending-mind-mcp",
  command: existsSync(installedMcpPath) ? installedMcpPath : "lmp-mcp",
  args: [],
  workspaceRoot: workspace,
  agent: selectedAgent,
  available: existsSync(installedMcpPath),
  generatedAt: new Date().toISOString(),
  note: "Host-specific global configuration is not overwritten. Use this adapter manifest with the selected agent host.",
};
await writeFile(join(telemetryDirectory, "agent-mcp.json"), `${JSON.stringify(adapter, null, 2)}\n`);

async function installWorkspaceMcpConfig(relativePath) {
  const path = join(workspace, relativePath);
  let document: { mcpServers?: Record<string, unknown> } = {};
  if (existsSync(path)) {
    try {
      document = JSON.parse(await readFile(path, "utf8"));
    } catch {
      return { path: relativePath, status: "blocked-invalid-existing-config" };
    }
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      return { path: relativePath, status: "blocked-invalid-existing-config" };
    }
  }
  if (document.mcpServers !== undefined && (typeof document.mcpServers !== "object" || document.mcpServers === null || Array.isArray(document.mcpServers))) {
    return { path: relativePath, status: "blocked-invalid-existing-config" };
  }
  const servers = document.mcpServers ?? {};
  const server = {
    command: installedMcpPath,
    args: [],
    env: { LMP_WORKSPACE_ROOT: workspace },
  };
  if (servers["lending-mind"] !== undefined) {
    return {
      path: relativePath,
      status: JSON.stringify(servers["lending-mind"]) === JSON.stringify(server)
        ? "already-configured"
        : "blocked-existing-server",
    };
  }
  document.mcpServers = { ...servers, "lending-mind": server };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`);
  return { path: relativePath, status: "configured" };
}

const hostIntegrations = [];
if (adapter.available) {
  if (selectedAgent === "claudecode") hostIntegrations.push(await installWorkspaceMcpConfig(".mcp.json"));
  if (selectedAgent === "cursor") hostIntegrations.push(await installWorkspaceMcpConfig(".cursor/mcp.json"));
  if (selectedAgent === "cline") {
    hostIntegrations.push(await installWorkspaceMcpConfig(".cline/mcp.json"));
    hostIntegrations.push(await installWorkspaceMcpConfig(".roo/mcp.json"));
  }
} else {
  hostIntegrations.push({
    path: ".lmp_telemetry/agent-mcp.json",
    status: "runtime-unavailable",
    reason: "Install or build lmp-mcp before enabling host configuration.",
  });
}
if (selectedAgent === "claudedesktop") {
  const desktopConfigPath = join(telemetryDirectory, "claude-desktop-mcp.json");
  await writeFile(desktopConfigPath, `${JSON.stringify({
    mcpServers: {
      "lending-mind": {
        command: adapter.command,
        args: [],
        env: { LMP_WORKSPACE_ROOT: workspace },
      },
    },
  }, null, 2)}\n`);
  hostIntegrations.push({
    path: ".lmp_telemetry/claude-desktop-mcp.json",
    status: adapter.available ? "config-artifact-written" : "runtime-unavailable",
    note: "Claude Desktop uses user-owned application configuration; copy this verified project entry into its MCP settings without replacing other servers.",
  });
}
await writeFile(join(telemetryDirectory, "host-integrations.json"), `${JSON.stringify({ agent: selectedAgent, integrations: hostIntegrations }, null, 2)}\n`);

let enforcement = { status: "not-requested", path: null };
if (installHooks) {
  const path = await installEnforcedHook(selectedMind);
  enforcement = { status: "installed", path: path.replace(`${workspace}/`, "") };
}
await writeFile(join(telemetryDirectory, "enforcement.json"), `${JSON.stringify({
  boundary: "git-pre-commit",
  mode: "enforced",
  ...enforcement,
  limitation: "This gate evaluates the staged commit boundary; it is not a universal pre-write filesystem interceptor.",
}, null, 2)}\n`);

console.log("\n🔒 Ingesting cryptographically sealed Mind manifest configuration layers...");
console.log(`✅ Verified signature for ${selectedMindInfo[1]}.`);
console.log(`✅ ${selectedAgent} integration guidance written to AGENTS.md and CLAUDE.md.`);
console.log("✅ Active profile copied to .lending-mind/mind/");
console.log(`✅ Host detected: ${platform}/${arch}; stack selected: ${selectedStack}.`);
console.log(`✅ Local generated files: ${gitignoreUpdated ? "added to .gitignore" : "already protected by .gitignore"}.`);
console.log(`✅ Rust runtime status: ${requiredRuntime.every((name) => installedBinaries.includes(name)) ? "ready" : "requires local release binaries"}.`);
console.log(`✅ Host MCP integration: ${hostIntegrations.map((entry) => `${entry.path} (${entry.status})`).join(", ")}.`);
console.log(`✅ Commit enforcement: ${enforcement.status}${enforcement.path ? ` (${enforcement.path})` : ""}.`);
console.log("\nNext check: cargo run --bin lmp -- evaluate --mind .lending-mind/mind --workspace . --mode advisory --changed-only --json");
console.log("MCP adapter manifest: .lmp_telemetry/agent-mcp.json");
console.log("\n🛠️  Create your own Mind later: sign a package with mind-signer, validate it, then install it under .lending-mind/mind.");
