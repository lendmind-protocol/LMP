import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const registryPath = join(root, "registry/registry.json");
const publicRoot = join(root, "apps/docs/public");
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const sourceRoots = [
  join(root, "registry/definitions"),
  join(root, "packages/create-lmp/profiles"),
];

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function filesUnder(directory) {
  const files = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`symlink is not allowed: ${path}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  await visit(directory);
  return files.sort((left, right) => left.localeCompare(right));
}

await mkdir(join(publicRoot, "profiles"), { recursive: true });
for (const entry of registry.entries) {
  const slug = entry.id.split(":").at(-1);
  let sourceDirectory;
  for (const candidate of sourceRoots.map((rootPath) => join(rootPath, slug))) {
    try {
      await readFile(join(candidate, "mind.json"));
      sourceDirectory = candidate;
      break;
    } catch {
      // Try the next canonical source root.
    }
  }
  if (!sourceDirectory) throw new Error(`profile source not found: ${entry.id}`);

  const publicDirectory = join(publicRoot, "profiles", slug);
  await rm(publicDirectory, { recursive: true, force: true });
  await cp(sourceDirectory, publicDirectory, { recursive: true, force: false });

  const manifestUrl = String(entry.manifestUrl);
  const packageFiles = [];
  for (const file of await filesUnder(sourceDirectory)) {
    const path = relative(sourceDirectory, file).split(sep).join("/");
    if (path === "mind.json") continue;
    packageFiles.push({
      path,
      url: `${manifestUrl.slice(0, -"mind.json".length)}${path}`,
      digest: digest(await readFile(file)),
    });
  }
  entry.packageFiles = packageFiles;
}

await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
await writeFile(join(publicRoot, "registry.json"), `${JSON.stringify(registry, null, 2)}\n`);
console.log(JSON.stringify({ status: "generated", entries: registry.entries.length }));
