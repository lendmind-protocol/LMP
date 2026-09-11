import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const generated = [
  "target",
  "node_modules",
  ".turbo",
  "lmp_test_bed",
  "orchestrator/__pycache__",
  "packages/cli/dist",
  "packages/core/dist",
  "packages/create-lending-mind",
  "packages/evaluator/dist",
  "packages/mcp-server/dist",
  "packages/registry/dist",
  "packages/skill-compiler/dist",
  "packages/skill-schema/dist",
  "packages/cli/node_modules",
  "packages/core/node_modules",
  "packages/evaluator/node_modules",
  "packages/mcp-server/node_modules",
  "packages/registry/node_modules",
  "packages/skill-compiler/node_modules",
  "packages/skill-schema/node_modules",
  "packages/cli/.turbo",
  "packages/core/.turbo",
  "packages/evaluator/.turbo",
  "packages/mcp-server/.turbo",
  "packages/registry/.turbo",
  "packages/skill-compiler/.turbo",
  "packages/skill-schema/.turbo",
];

for (const relative of generated) {
  await rm(join(root, relative), { recursive: true, force: true });
}

console.log("Removed rebuildable LMP build, dependency, cache, and test artifacts.");
