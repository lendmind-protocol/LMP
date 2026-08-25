import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

await mkdir("docs/generated", { recursive: true });
await writeFile(
  join("docs/generated", "schema.md"),
  "# Generated schema\n\nSee @lending-mind/skill-schema for the canonical JSON Schema export.\n",
);
console.log("Generated docs/generated/schema.md");
