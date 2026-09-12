import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const mindsRoot = join(root, "registry/minds");

type Source = { url: string; contentDigest: string };
type JsonObject = Record<string, unknown>;

const digest = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8")) as JsonObject;

const profiles = (await readdir(mindsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
  .map((entry) => entry.name)
  .sort();
const failures: string[] = [];
let checked = 0;

for (const profile of profiles) {
  try {
    const directory = join(mindsRoot, profile);
    const mind = await readJson(join(directory, "mind.json"));
    const index = await readJson(join(directory, "sources.json"));
    const provenance = mind.provenance as JsonObject | undefined;
    const manifestSources = provenance?.sources as Source[];
    const indexedSources = index.sources as Source[];
    if (!Array.isArray(manifestSources) || !Array.isArray(indexedSources))
      throw new Error("source manifests must contain arrays");
    if (manifestSources.length !== indexedSources.length)
      throw new Error("mind.json and sources.json source counts differ");
    for (let i = 0; i < manifestSources.length; i += 1) {
      const manifest = manifestSources[i];
      const indexed = indexedSources[i];
      if (manifest.url !== indexed.url || manifest.contentDigest !== indexed.contentDigest)
        throw new Error(`source ${i} differs between manifests`);
      const actual = digest(new Uint8Array(await (await fetch(manifest.url)).arrayBuffer()));
      if (actual !== manifest.contentDigest)
        throw new Error(
          `source ${i} digest mismatch: expected ${manifest.contentDigest}, got ${actual}`,
        );
      checked += 1;
    }
  } catch (error) {
    failures.push(`${profile}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", checked, failures }, null, 2));
  process.exit(1);
}
console.log(
  JSON.stringify({ status: "verified", profiles: profiles.length, sources: checked }, null, 2),
);
