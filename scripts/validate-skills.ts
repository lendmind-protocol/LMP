import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { validateMindPackage } from "@lending-mind/skill-schema";

for (const name of await readdir("skills", { withFileTypes: true })) {
  if (!name.isDirectory()) continue;
  const result = await validateMindPackage(join("skills", name.name));
  if (!result.valid) {
    console.error(`${name.name}: ${result.diagnostics.map((d) => d.message).join("; ")}`);
    process.exitCode = 1;
  }
}
