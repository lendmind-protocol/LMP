#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
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
  const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: directory,
    encoding: "utf8",
  });
  const pack = JSON.parse(output)[0];
  const files = pack.files.map((entry) => entry.path);
  const bad = files.filter((path) => forbiddenPath.test(path));
  if (bad.length) failures.push(`${relative}: release contains test/build files: ${bad.join(", ")}`);
  if (!files.includes("package.json")) failures.push(`${relative}: package.json is missing from release`);
  const hasRuntime = expectedName === "create-lmp" || expectedName === "lmp"
    ? files.includes("bin.js")
    : files.some((path) => path.startsWith("dist/"));
  if (!hasRuntime) failures.push(`${relative}: runtime output is missing from release`);
  verified.push({ name: manifest.name, version: manifest.version, files: files.length });
}

if (failures.length) {
  console.error(JSON.stringify({ status: "blocked", failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: "verified", packages: verified }, null, 2));
