import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const profileRoots = [
  join(root, "registry/minds"),
  join(root, "profiles"),
  join(root, "packages/create-lmp/profiles"),
  join(root, "packages/cli/profiles"),
];

type Source = { url: string; contentDigest: string };
type JsonObject = Record<string, unknown>;

const digest = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8")) as JsonObject;

async function findManifests(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const manifests: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "workspaces") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) manifests.push(...(await findManifests(path)));
    else if (entry.name === "mind.json") manifests.push(path);
  }
  return manifests;
}

const profiles = (await Promise.all(profileRoots.map(findManifests))).flat().sort();
const failures: string[] = [];
let checked = 0;
const fetched = new Map<string, string>();

for (const manifestPath of profiles) {
  try {
    const directory = manifestPath.slice(0, manifestPath.lastIndexOf("/"));
    const mind = await readJson(manifestPath);
    const provenance = mind.provenance as JsonObject | undefined;
    const manifestSources = provenance?.sources as Source[];
    if (!Array.isArray(manifestSources)) throw new Error("provenance.sources must be an array");
    if (directory.startsWith(join(root, "registry/minds"))) {
      const index = await readJson(join(directory, "sources.json"));
      const indexedSources = index.sources as Source[];
      if (!Array.isArray(indexedSources)) throw new Error("sources.json.sources must be an array");
      if (manifestSources.length !== indexedSources.length)
        throw new Error("mind.json and sources.json source counts differ");
      for (let i = 0; i < manifestSources.length; i += 1) {
        const manifest = manifestSources[i];
        const indexed = indexedSources[i];
        if (manifest.url !== indexed.url || manifest.contentDigest !== indexed.contentDigest)
          throw new Error(`source ${i} differs between manifests`);
      }
    }
    for (let i = 0; i < manifestSources.length; i += 1) {
      const manifest = manifestSources[i];
      if (!manifest.url || !manifest.contentDigest) throw new Error(`source ${i} is incomplete`);
      const cacheKey = `${manifest.url}\0${manifest.contentDigest}`;
      let actual = fetched.get(cacheKey);
      if (!actual) {
        actual = digest(new Uint8Array(await (await fetch(manifest.url)).arrayBuffer()));
        fetched.set(cacheKey, actual);
      }
      if (actual !== manifest.contentDigest)
        throw new Error(
          `source ${i} digest mismatch: expected ${manifest.contentDigest}, got ${actual}`,
        );
      checked += 1;
    }
  } catch (error) {
    failures.push(
      `${manifestPath.slice(root.length)}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

if (failures.length > 0) {
  console.error(
    JSON.stringify({ status: "failed", checked, profiles: profiles.length, failures }, null, 2),
  );
  process.exit(1);
}
console.log(
  JSON.stringify({ status: "verified", profiles: profiles.length, sources: checked }, null, 2),
);
