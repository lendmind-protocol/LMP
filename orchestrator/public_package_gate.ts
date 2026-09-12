#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const packages = [
  ["packages/core", "@lending-mind/sdk"],
  ["packages/skill-schema", "@lending-mind/skill"],
  ["packages/cli", "@lending-mind/lmp"],
  ["packages/lmp", "lmp"],
  ["packages/mcp-server", "@lending-mind/mcp"],
  ["packages/create-lmp", "create-lmp"],
];

const forbiddenPath = /(?:\.test\.|\.tsbuildinfo$|(?:^|\/)\.turbo\/)/;
const failures = [];
const verified = [];

for (const [relative, expectedName] of packages) {
  const directory = join(root, relative);
  const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  if (manifest.name !== expectedName) failures.push(`${relative}: expected package name ${expectedName}`);
  if (!Array.isArray(manifest.files) || !manifest.files.length)
    failures.push(`${relative}: package must explicitly publish its runtime files`);
  const staging = await mkdtemp(join(tmpdir(), "lmp-package-gate-"));
  let pack: { filename: string; files: Array<{ path: string }> };
  try {
    // pnpm is the workspace publisher and rewrites workspace:* dependencies
    // to concrete versions in the packed manifest. Inspect that exact output
    // rather than npm's dry-run view, which can preserve workspace protocols.
    const output = execFileSync("pnpm", ["pack", "--pack-destination", staging, "--json"], {
      cwd: directory,
      encoding: "utf8",
    });
    // pnpm prints lifecycle-script output before its JSON payload (notably
    // when create-lmp runs its prepack build). Parse the structured payload
    // from the final JSON object rather than assuming stdout is JSON-only.
    const payloadStart = output.lastIndexOf("\n{");
    pack = JSON.parse(output.slice(payloadStart >= 0 ? payloadStart + 1 : 0)) as typeof pack;
    const packedManifest = JSON.parse(
      execFileSync("tar", ["-xOf", pack.filename, "package/package.json"], {
        encoding: "utf8",
      }),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const unresolved = Object.entries({
      ...packedManifest.dependencies,
      ...packedManifest.devDependencies,
    })
      .filter(([, version]) => version.startsWith("workspace:"))
      .map(([name, version]) => `${name}@${version}`);
    if (unresolved.length) failures.push(`${relative}: packed manifest has workspace dependencies: ${unresolved.join(", ")}`);
    if (expectedName === "create-lmp") {
      execFileSync("tar", ["-xzf", pack.filename, "-C", staging]);
      execFileSync(
        process.execPath,
        [
          join(staging, "package", "dist", "bin.js"),
          "--yes",
          "--agent",
          "cursor",
          "--mind",
          "tj-ponytail",
          "--stack",
          "typescript-node",
          "--strategy",
          "greenfield",
          join(staging, "workspace"),
        ],
        {
          cwd: staging,
          env: { ...process.env, LMP_DISABLE_RUNTIME_DOWNLOAD: "1", NO_COLOR: "1" },
          stdio: "ignore",
        },
      );
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  const files = pack.files.map((entry) => entry.path);
  const bad = files.filter((path) => forbiddenPath.test(path));
  if (bad.length) failures.push(`${relative}: release contains test/build files: ${bad.join(", ")}`);
  if (!files.includes("package.json")) failures.push(`${relative}: package.json is missing from release`);
  const hasRuntime = expectedName === "create-lmp" || expectedName === "lmp"
    ? files.includes("bin.ts") || files.includes("dist/bin.js")
    : files.some((path) => path.startsWith("dist/"));
  if (!hasRuntime) failures.push(`${relative}: runtime output is missing from release`);
  verified.push({ name: manifest.name, version: manifest.version, files: files.length });
}

if (failures.length) {
  console.error(JSON.stringify({ status: "blocked", failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: "verified", packages: verified }, null, 2));
