#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const uploadUrl = process.env.PINATA_UPLOAD_URL ?? "https://uploads.pinata.cloud/v3/files";
const gateway = process.env.PINATA_GATEWAY_DOMAIN ?? "gateway.pinata.cloud";
const groupId = process.env.PINATA_GROUP_ID;
const jwt = process.env.PINATA_JWT;
const registryPath = resolve(root, process.env.LMP_REGISTRY ?? "registry/registry.json");
const profileRoots = [
  resolve(root, process.env.LMP_PROFILE_ROOT ?? "registry/definitions"),
  resolve(root, "packages/create-lmp/profiles"),
];
const requested = process.argv.slice(2).filter((value) => !value.startsWith("--"));

if (!jwt)
  throw new Error("PINATA_JWT is required and must only be provided by a server or CI secret");
if (!groupId)
  throw new Error("PINATA_GROUP_ID is required so uploads stay in the selected Pinata group");
if (!/^https:\/\//.test(uploadUrl)) throw new Error("PINATA_UPLOAD_URL must use HTTPS");
if (!/^https:\/\/[^/]+$/.test(`https://${gateway}`))
  throw new Error("PINATA_GATEWAY_DOMAIN must be a hostname without a scheme or path");
const publicGateway = gateway.endsWith(".mypinata.cloud") ? "gateway.pinata.cloud" : gateway;
const filesApiUrl = "https://api.pinata.cloud/v3/files/public";

async function filesUnder(directory) {
  const files = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink())
        throw new Error(`symlink is not allowed: ${current}/${entry.name}`);
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  await visit(directory);
  return files.sort();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function listGroupFiles() {
  const files = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(filesApiUrl);
    url.searchParams.set("group_id", groupId);
    url.searchParams.set("limit", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new Error(
        `Pinata file listing failed: HTTP ${response.status} ${await response.text()}`,
      );
    const payload = await response.json();
    files.push(...(payload?.data?.files ?? []));
    pageToken = payload?.data?.next_page_token || undefined;
  } while (pageToken);
  return files;
}

async function existingFile(files, expectedBytes, expectedDigest, name) {
  const candidates = files.filter(
    (candidate) =>
      candidate.size === expectedBytes.length &&
      typeof candidate.cid === "string" &&
      candidate.keyvalues?.lmp_path === name,
  );
  for (const candidate of candidates) {
    try {
      const response = await fetch(`https://${publicGateway}/ipfs/${candidate.cid}`, {
        headers: { Accept: "application/octet-stream" },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) continue;
      const actual = sha256(Buffer.from(await response.arrayBuffer()));
      if (actual === expectedDigest)
        return {
          cid: candidate.cid,
          bytes: expectedBytes,
          url: `https://${publicGateway}/ipfs/${candidate.cid}`,
        };
    } catch {
      // A size match is not proof of identity; continue until the content matches.
    }
  }
  return undefined;
}

async function upload(name, bytes, digest) {
  const form = new FormData();
  form.append("network", "public");
  form.append("group_id", groupId);
  form.append("name", name);
  form.append("keyvalues", JSON.stringify({ lmp_package: name.split("/")[0], lmp_path: name }));
  form.append("file", new File([bytes], name.replaceAll("/", "--")));
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(
      `Pinata upload failed for ${name}: HTTP ${response.status} ${await response.text()}`,
    );
  const payload = await response.json();
  const cid = payload?.data?.cid;
  if (typeof cid !== "string" || !cid)
    throw new Error(`Pinata response for ${name} did not contain data.cid`);
  return { cid, bytes, digest };
}

async function verify(cid, expectedDigest, name) {
  const url = `https://${publicGateway}/ipfs/${cid}`;
  let lastStatus = "unknown";
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/octet-stream" },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    lastStatus = String(response.status);
    if (response.ok) {
      const bytes = Buffer.from(await response.arrayBuffer());
      const actual = sha256(bytes);
      if (actual !== expectedDigest)
        throw new Error(
          `gateway digest mismatch for ${name}: expected ${expectedDigest}, received ${actual}`,
        );
      return url;
    }
    if (![404, 429, 500, 502, 503, 504].includes(response.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    `Pinata gateway could not retrieve ${name} after propagation retries: HTTP ${lastStatus}`,
  );
}

const registry = JSON.parse(await readFile(registryPath, "utf8"));
const entries = registry.entries.filter(
  (entry) =>
    requested.length === 0 ||
    requested.includes(entry.id) ||
    requested.includes(entry.id.split(":").at(-1)),
);
if (!entries.length) throw new Error("no matching registry entries");
const published = [];
const groupFiles = await listGroupFiles();
console.log(`Pinata group ${groupId}: found ${groupFiles.length} existing file(s)`);

for (const entry of entries) {
  const slug = entry.id.split(":").at(-1);
  let resolvedDirectory: string | undefined;
  for (const candidate of profileRoots.map((candidate) => join(candidate, slug))) {
    try {
      await readFile(join(candidate, "mind.json"));
      resolvedDirectory = candidate;
      break;
    } catch {
      /* try next canonical source */
    }
  }
  if (!resolvedDirectory) throw new Error(`profile source not found for ${entry.id}`);
  const directory = resolvedDirectory;
  const files = await filesUnder(directory);
  const uploaded = [];
  for (const file of files) {
    const path = relative(directory, file).replaceAll("\\", "/");
    const name = `${slug}/${path}`;
    const bytes = await readFile(file);
    const digest = sha256(bytes);
    const result =
      (await existingFile(groupFiles, bytes, digest, name)) ?? (await upload(name, bytes, digest));
    const url = result.url ?? (await verify(result.cid, digest, name));
    uploaded.push({ path, cid: result.cid, digest, url });
    if (!groupFiles.some((candidate) => candidate.cid === result.cid))
      groupFiles.push({ cid: result.cid, size: bytes.length });
  }
  const manifest = uploaded.find((file) => file.path === "mind.json");
  if (!manifest) throw new Error(`${entry.id} is missing mind.json`);
  entry.ipfsCid = manifest.cid;
  entry.manifestUrl = manifest.url;
  entry.packageFiles = uploaded
    .filter((file) => file.path !== "mind.json")
    .map(({ path, digest, url }) => ({ path, url, digest }));
  entry.distribution = {
    ...(entry.distribution ?? {}),
    status: "VERIFIED_IPFS_PIN",
    ipfsCid: manifest.cid,
    pinataGateway: publicGateway,
    verifiedAt: new Date().toISOString(),
  };
  published.push({ id: entry.id, files: uploaded.length, ipfsCid: manifest.cid });
}

await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
console.log(
  JSON.stringify(
    { status: "verified", provider: "pinata", registry: registryPath, published },
    null,
    2,
  ),
);
