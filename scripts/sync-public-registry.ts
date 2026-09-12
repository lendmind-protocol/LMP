import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
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

async function verifySourcePackage(sourceDirectory, entry) {
  const manifestPath = join(sourceDirectory, "mind.json");
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  if (manifest.id !== entry.id || manifest.version !== entry.version)
    throw new Error(`profile identity mismatch for ${entry.id}`);
  const sources = manifest.provenance?.sources;
  if (!Array.isArray(sources) || sources.length === 0)
    throw new Error(`profile provenance is missing: ${entry.id}`);
  for (const source of sources) {
    if (
      typeof source?.title !== "string" ||
      typeof source?.licenseNote !== "string" ||
      typeof source?.url !== "string" ||
      !/^https:\/\//.test(source.url) ||
      !/^sha256:[0-9a-f]{64}$/.test(source.contentDigest ?? "")
    )
      throw new Error(`profile provenance is incomplete: ${entry.id}`);
  }
  const signature = (await readFile(join(sourceDirectory, "signatures/manifest.sig"), "utf8"))
    .trim()
    .replace(/^0x/, "");
  const publicKey = (await readFile(join(sourceDirectory, "signatures/public-key.hex"), "utf8"))
    .trim()
    .replace(/^0x/, "");
  if (!/^[0-9a-f]{128}$/i.test(signature) || !/^[0-9a-f]{64}$/i.test(publicKey))
    throw new Error(`profile signature material is invalid: ${entry.id}`);
  const spki = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    Buffer.from(publicKey, "hex"),
  ]);
  if (
    !verifySignature(
      null,
      manifestBytes,
      createPublicKey({ key: spki, format: "der", type: "spki" }),
      Buffer.from(signature, "hex"),
    )
  )
    throw new Error(`profile manifest signature is invalid: ${entry.id}`);

  // The checked-in registry identity must describe the exact source payload
  // copied into the public vault. Never retain a digest or signing identity
  // from an older package revision.
  entry.digest = digest(manifestBytes);
  entry.signature = `0x${signature}`;
  entry.publicKey = `0x${publicKey}`;
  entry.signatureStatus = "verified";
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
  let sourceDirectory: string | undefined;
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
  await verifySourcePackage(sourceDirectory, entry);

  const publicDirectory = join(publicRoot, "profiles", slug);
  await rm(publicDirectory, { recursive: true, force: true });
  await cp(sourceDirectory, publicDirectory, { recursive: true, force: false });

  const manifestUrl = String(entry.manifestUrl);
  if (entry.distribution?.status === "VERIFIED_IPFS_PIN" && entry.ipfsCid) {
    const sourceFiles = new Map();
    for (const file of await filesUnder(sourceDirectory)) {
      const path = relative(sourceDirectory, file).split(sep).join("/");
      if (path !== "mind.json") sourceFiles.set(path, digest(await readFile(file)));
    }
    entry.packageFiles = [...sourceFiles].map(([path, fileDigest]) => {
      const existing = entry.packageFiles?.find((candidate) => candidate.path === path);
      return {
        path,
        url: existing?.url ?? `${manifestUrl.slice(0, -"mind.json".length)}${path}`,
        digest: fileDigest,
      };
    });
    continue;
  }
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
