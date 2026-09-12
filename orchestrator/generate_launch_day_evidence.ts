import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const output = join(root, "docs/evidence");
const bootstrapper = join(root, "packages/create-lmp/bin.ts");
await mkdir(output, { recursive: true });

const scenarios = [
  ["init-simple.log", async (workspace) => {
    await writeFile(join(workspace, "package.json"), "{}\n");
  }],
  ["init-monorepo.log", async (workspace) => {
    await writeFile(join(workspace, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0", react: "19.0.0" } }));
    await writeFile(join(workspace, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    await writeFile(join(workspace, "turbo.json"), "{\"tasks\":{}}\n");
  }],
  ["init-legacy.log", async (workspace) => {
    await writeFile(join(workspace, "package.json"), "{}\n");
    await writeFile(join(workspace, "AGENTS.md"), "# Existing project guidance\n\nKeep the public API stable.\n");
    await writeFile(join(workspace, "CLAUDE.md"), "# Existing Claude guidance\n");
  }],
];

for (const [filename, prepare] of scenarios) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "lmp-launch-day-evidence-"));
  const workspace = join(temporaryRoot, "workspace");
  await mkdir(workspace, { recursive: true });
  await prepare(workspace);
  let text = "";
  let exitCode = 0;
  try {
    const result = await run(process.execPath, [bootstrapper, "--yes", "--agent", "cursor", "--mind", "tj-ponytail", "--stack", "typescript-node", "--strategy", "brownfield", workspace], {
      cwd: root,
      env: { ...process.env, NO_COLOR: "1", LMP_DISABLE_RUNTIME_DOWNLOAD: "1" },
    });
    text = `${result.stdout}${result.stderr}`;
  } catch (error) {
    exitCode = error.code ?? 1;
    text = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  const configPath = join(workspace, ".lending-mind/config.json");
  let discovery = null;
  try { discovery = JSON.parse(await readFile(configPath, "utf8")).discovery; } catch { /* bootstrap failure remains in the log */ }
  await writeFile(join(output, filename), `${text.replaceAll(temporaryRoot, "<temporary-workspace>")}\nExit code: ${exitCode}\nDiscovery: ${JSON.stringify(discovery).replaceAll(temporaryRoot, "<temporary-workspace>")}\n`);
  await rm(temporaryRoot, { recursive: true, force: true });
}
for (const [source, destination] of [
  [join(root, ".lmp/artifacts/self-hosting.json"), join(output, "self-hosting-evaluation.json")],
  [join(root, "lmp-test-results/lmp-on-lmp-docker.json"), join(output, "docker-qualification.json")],
]) {
  try { await copyFile(source, destination); } catch { /* evidence is produced after the corresponding run */ }
}
console.log(JSON.stringify({ status: "generated", scenarios: scenarios.length, output }));
