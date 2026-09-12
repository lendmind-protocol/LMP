#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import { OciRegistryClient } from "@lending-mind/internal-registry";

const root = resolve(import.meta.dirname, "..");
const registry = process.env.LMP_OCI_REGISTRY ?? "https://ghcr.io";
const repository = process.env.LMP_OCI_REPOSITORY;
const username = process.env.LMP_OCI_USERNAME;
const password = process.env.LMP_OCI_PASSWORD;
const output = resolve(
  root,
  process.env.LMP_OCI_EVIDENCE ?? "lmp-test-results/oci-publication.json",
);
const execFileAsync = promisify(execFile);

if (!repository) throw new Error("LMP_OCI_REPOSITORY is required");
if (!username || !password) throw new Error("LMP_OCI_USERNAME and LMP_OCI_PASSWORD are required");
if (!/^https:\/\//.test(registry)) throw new Error("LMP_OCI_REGISTRY must use HTTPS");

const profiles = ["linux-kernel", "supabase-core", "tj-ponytail"];
const client = new OciRegistryClient({ registry, repository, username, password });
const published = [];

for (const slug of profiles) {
  const source = join(root, "packages/create-lmp/profiles", slug);
  const metadata = await client.install(source);
  const verified = await client.verify(metadata.version);
  if (!verified) throw new Error(`${slug}: hosted OCI pull or signature verification failed`);
  published.push({
    id: metadata.id,
    version: metadata.version,
    packageDigest: metadata.digest,
    ociDigest: metadata.ociDigest,
    registry,
    repository,
    verifiedByPull: true,
  });
}

const sourceRevision =
  process.env.GITHUB_SHA ??
  (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();

const evidence = {
  schema: "lmp-oci-publication-v1",
  status: "verified",
  registry,
  repository,
  published,
  sourceRevision,
  createdAt: new Date().toISOString(),
};
await mkdir(join(root, "lmp-test-results"), { recursive: true });
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
