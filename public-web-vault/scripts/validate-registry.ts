#!/usr/bin/env node
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const registryPath = resolve(process.argv[2] ?? join(root, "public-web-vault/registry.json"));
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const requiredCategories = new Set([
  "Systems & Languages",
  "Frontend UI Component Systems",
  "Backend, Databases, & Infrastructure",
  "Agentic Frameworks & Context Engineering",
  "Full-Stack Frameworks & Runtimes",
]);
const requiredPackageFiles = [
  "mind.json",
  "SKILL.md",
  "guidance.md",
  "sources.json",
  "interpretation.json",
  "limitations.md",
  "evidence/README.md",
  "rules/manifest.json",
  "fixtures/compliant",
  "fixtures/violating",
  "signatures/manifest.sig",
  "signatures/public-key.hex",
  "signatures/mind.json.sig",
];
const errors = [];
const requireSourceBacked = process.env.LMP_REQUIRE_SOURCE_BACKED === "1";
if (registry.schemaVersion !== "1") errors.push("schemaVersion must be 1");
if (!Array.isArray(registry.production) || !Array.isArray(registry.draftMinds))
  errors.push("production and draftMinds arrays are required");
const production = registry.production ?? [];
const drafts = registry.draftMinds ?? [];
if (production.length + drafts.length < 50) errors.push("vault must contain at least 50 entries");
const keys = new Set();
for (const entry of [...production, ...drafts]) {
  if (!entry.mindKey || keys.has(entry.mindKey))
    errors.push(`duplicate or missing mindKey: ${entry.mindKey}`);
  keys.add(entry.mindKey);
  if (!requiredCategories.has(entry.category))
    errors.push(`${entry.mindKey}: unsupported category`);
}
for (const entry of production) {
  if (!["OFFICIAL_VERIFIED_SIGNATURE", "COMMUNITY_CONTRIBUTED"].includes(entry.verified_status))
    errors.push(`${entry.mindKey}: invalid verified_status`);
  const packagePath = resolve(root, entry.packagePath);
  try {
    for (const required of requiredPackageFiles) {
      try {
        await readdir(join(packagePath, required));
      } catch {
        try {
          await readFile(join(packagePath, required));
        } catch {
          errors.push(`${entry.mindKey}: required package asset missing: ${required}`);
        }
      }
    }
    const manifest = JSON.parse(await readFile(join(packagePath, "mind.json"), "utf8"));
    if (manifest.id !== `lmp:mind:${entry.mindKey}` || manifest.version !== entry.version)
      errors.push(`${entry.mindKey}: package identity mismatch`);
    if (requireSourceBacked && manifest.metadata?.sourceRuleContractVersion !== "1")
      errors.push(`${entry.mindKey}: production package is not source-backed`);
    if (requireSourceBacked && manifest.metadata?.sourceRuleContractVersion === "1") {
      const contracts = JSON.parse(
        await readFile(join(packagePath, "rules/manifest.json"), "utf8"),
      );
      for (const rule of contracts.rules ?? [])
        for (const field of ["sourceClaim", "sourceLocator", "implementation", "fixture"])
          if (typeof rule.evidence?.[field] !== "string" || !rule.evidence[field].trim())
            errors.push(`${entry.mindKey}: rule ${rule.id} is missing evidence.${field}`);
    }
    const files = [];
    async function visit(directory) {
      for (const item of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, item.name);
        if (item.isDirectory()) await visit(path);
        else if (item.isFile() && item.name !== ".lmp-registry.json") files.push(path);
      }
    }
    await visit(packagePath);
    files.sort();
    const hash = createHash("sha256");
    for (const file of files)
      hash
        .update(file.slice(packagePath.length + 1).replaceAll("\\", "/"))
        .update("\0")
        .update(await readFile(file))
        .update("\0");
    if (`sha256:${hash.digest("hex")}` !== entry.sha256)
      errors.push(`${entry.mindKey}: package digest mismatch`);
    const key = (await readFile(join(packagePath, "signatures/public-key.hex"), "utf8"))
      .trim()
      .replace(/^0x/, "");
    const signature = (await readFile(join(packagePath, "signatures/manifest.sig"), "utf8"))
      .trim()
      .replace(/^0x/, "");
    if (
      `0x${key}`.toLowerCase() !== entry.trustAnchor.toLowerCase() ||
      !/^[0-9a-f]{64}$/i.test(key) ||
      !/^[0-9a-f]{128}$/i.test(signature)
    )
      errors.push(`${entry.mindKey}: invalid trust anchor or signature material`);
    else {
      const spki = Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"),
        Buffer.from(key, "hex"),
      ]);
      if (
        !verify(
          null,
          await readFile(join(packagePath, "mind.json")),
          createPublicKey({ key: spki, format: "der", type: "spki" }),
          Buffer.from(signature, "hex"),
        )
      )
        errors.push(`${entry.mindKey}: manifest signature does not verify`);
    }
  } catch (error) {
    errors.push(`${entry.mindKey}: package unavailable (${error.message})`);
  }
}
for (const entry of drafts)
  if (!["DRAFT", "PENDING_PACKAGING"].includes(entry.status))
    errors.push(`${entry.mindKey}: draft status is invalid`);
const result = {
  status: errors.length ? "invalid" : "verified",
  production: production.length,
  drafts: drafts.length,
  total: production.length + drafts.length,
  errors,
};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
