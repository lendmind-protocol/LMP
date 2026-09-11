import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { validateMindPackage } from "@lending-mind/skill";

const profileDirectories = [
  ...(await readdir("skills", { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => join("skills", entry.name)),
  "packages/cli/profiles/baseline",
  "packages/create-lmp/profiles/linux-kernel",
  "packages/create-lmp/profiles/supabase-core",
  "packages/create-lmp/profiles/tj-ponytail",
  "registry/definitions/tj-holowaychuk-minimalism",
  "registry/definitions/tj-ponytail",
];

for (const directory of profileDirectories) {
  const result = await validateMindPackage(directory);
  if (!result.valid) {
    console.error(`${directory}: ${result.diagnostics.map((d) => d.message).join("; ")}`);
    process.exitCode = 1;
  }
}
