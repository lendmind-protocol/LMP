import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { validateMindPackage } from "@lending-mind/skill";

const directories = async (parent: string) =>
  (await readdir(parent, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => join(parent, entry.name))
    .sort();

const profileDirectories = [
  ...(await directories("profiles")).filter((directory) => !directory.endsWith("/workspaces")),
  ...(await directories("registry/minds")),
  ...(await directories("registry/definitions")),
  ...(await directories("packages/create-lmp/profiles")),
  "packages/cli/profiles/baseline",
];

if (new Set(profileDirectories).size !== profileDirectories.length) {
  throw new Error("profile validation set contains duplicate package paths");
}

console.log(`Validating ${profileDirectories.length} Mind packages`);

for (const directory of profileDirectories) {
  const result = await validateMindPackage(directory);
  if (!result.valid) {
    console.error(`${directory}: ${result.diagnostics.map((d) => d.message).join("; ")}`);
    process.exitCode = 1;
  }
}
