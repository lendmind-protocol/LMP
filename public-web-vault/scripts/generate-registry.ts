#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const output = join(root, "public-web-vault/registry.json");
const packageRoots = ["registry/minds", "registry/definitions"];
const categories = [
  "Systems & Languages",
  "Frontend UI Component Systems",
  "Backend, Databases, & Infrastructure",
  "Agentic Frameworks & Context Engineering",
  "Full-Stack Frameworks & Runtimes",
];
const draftNames = [
  ["rust-async-systems", "Rust async systems", 0],
  ["go-concurrency", "Go concurrency", 0],
  ["python-data-pipelines", "Python data pipelines", 0],
  ["java-spring-services", "Spring service boundaries", 4],
  ["kotlin-mobile-platform", "Kotlin platform engineering", 0],
  ["swift-app-architecture", "Swift application architecture", 4],
  ["c-c-memory-safety", "C memory safety", 0],
  ["cpp-performance", "C++ performance", 0],
  ["zig-systems", "Zig systems programming", 0],
  ["wasm-components", "WebAssembly components", 4],
  ["react-component-systems", "React component systems", 1],
  ["vue-composition", "Vue composition", 1],
  ["svelte-interface", "Svelte interfaces", 1],
  ["design-system-accessibility", "Accessible design systems", 1],
  ["css-layout-discipline", "CSS layout discipline", 1],
  ["tailwind-utility-discipline", "Tailwind utility discipline", 1],
  ["web-performance", "Web performance", 1],
  ["mobile-interface", "Mobile interface engineering", 1],
  ["electron-desktop", "Electron desktop apps", 4],
  ["storybook-components", "Storybook component review", 1],
  ["postgres-data-isolation", "Postgres data isolation", 2],
  ["mysql-schema-discipline", "MySQL schema discipline", 2],
  ["sqlite-local-first", "SQLite local-first data", 2],
  ["redis-reliability", "Redis reliability", 2],
  ["kafka-event-streams", "Kafka event streams", 2],
  ["terraform-infrastructure", "Terraform infrastructure", 2],
  ["kubernetes-operations", "Kubernetes operations", 2],
  ["docker-images", "Docker image hygiene", 2],
  ["aws-well-architected", "AWS well-architected systems", 2],
  ["cloudflare-edge", "Cloudflare edge delivery", 2],
  ["observability-sre", "Observability and SRE", 2],
  ["api-security", "API security", 2],
  ["mcp-tool-contracts", "MCP tool contracts", 3],
  ["retrieval-grounding", "Retrieval grounding", 3],
  ["prompt-evaluation", "Prompt evaluation", 3],
  ["agent-memory", "Agent memory boundaries", 3],
  ["context-compression", "Context compression", 3],
  ["human-in-the-loop", "Human-in-the-loop review", 3],
  ["ai-safety-evals", "AI safety evaluations", 3],
  ["structured-output", "Structured AI output", 3],
  ["multi-agent-coordination", "Multi-agent coordination", 3],
  ["claude-projects", "Claude Projects workflows", 3],
  ["chatgpt-custom-gpts", "Custom GPT workflows", 3],
  ["nextjs-production", "Next.js production", 4],
  ["remix-web", "Remix web applications", 4],
  ["rails-conventions", "Rails conventions", 4],
  ["django-services", "Django services", 4],
  ["fastapi-services", "FastAPI services", 4],
  ["laravel-applications", "Laravel applications", 4],
  ["nestjs-services", "NestJS services", 4],
  ["deno-runtime", "Deno runtime", 4],
  ["bun-runtime", "Bun runtime", 4],
  ["edge-functions", "Edge functions", 4],
  ["monorepo-platform", "Monorepo platform engineering", 4],
  ["release-engineering", "Release engineering", 4],
];
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

const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
async function filesUnder(directory) {
  const result = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink())
        throw new Error(`symlink is not allowed: ${current}/${entry.name}`);
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) result.push(path);
    }
  }
  await visit(directory);
  return result.sort();
}
function humanize(value) {
  return value
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
async function packageEntry(directory, packagePath) {
  const manifest = JSON.parse(await readFile(join(directory, "mind.json"), "utf8"));
  const files = await filesUnder(directory);
  const hash = createHash("sha256");
  for (const file of files)
    hash
      .update(relative(directory, file).replaceAll("\\", "/"))
      .update("\0")
      .update(await readFile(file))
      .update("\0");
  const publicKey = (await readFile(join(directory, "signatures/public-key.hex"), "utf8")).trim();
  const source = manifest.provenance?.sources?.[0]?.url;
  const category = /rust|kernel|python|node|security|protocol|documentation|release/.test(
    manifest.id,
  )
    ? categories[0]
    : categories[3];
  return {
    mindKey: manifest.id.replace(/^lmp:mind:/, ""),
    name: humanize(manifest.id.replace(/^lmp:mind:/, "")),
    version: manifest.version,
    attribution: "Community archetype; no author or organization endorsement is implied.",
    category,
    verified_status: "COMMUNITY_CONTRIBUTED",
    packagePath,
    sha256: `sha256:${hash.digest("hex")}`,
    trustAnchor: publicKey.startsWith("0x") ? publicKey : `0x${publicKey}`,
    ...(typeof source === "string" ? { source } : {}),
    distribution: {
      status: "PENDING_IPFS_PIN",
      ipfsCid: null,
      ociReference: null,
      mintingWorkflow:
        "Publish the complete signed package, record the immutable CID and OCI manifest digest, then rerun the production release gate.",
    },
  };
}
const production = [];
const pendingPackages = [];
for (const packageRoot of packageRoots) {
  const absoluteRoot = join(root, packageRoot);
  for (const entry of await readdir(absoluteRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = join(absoluteRoot, entry.name);
    try {
      await stat(join(directory, "mind.json"));
    } catch {
      continue;
    }
    const complete = await Promise.all(
      requiredPackageFiles.map(async (file) => {
        try {
          await stat(join(directory, file));
          return true;
        } catch {
          return false;
        }
      }),
    ).then((results) => results.every(Boolean));
    if (!complete) {
      const manifest = JSON.parse(await readFile(join(directory, "mind.json"), "utf8"));
      pendingPackages.push({
        mindKey: manifest.id.replace(/^lmp:mind:/, ""),
        name: manifest.name ?? humanize(manifest.id.replace(/^lmp:mind:/, "")),
        category: categories[0],
        status: "PENDING_PACKAGING",
        promotionWorkflow:
          "Complete the signed Mind package layout, add executable compliant and violating fixtures, then pass the registry validator before promotion.",
      });
      continue;
    }
    production.push(await packageEntry(directory, `${packageRoot}/${entry.name}`));
  }
}
const packagedKeys = new Set(production.map((entry) => entry.mindKey));
const draftMinds = [
  ...pendingPackages,
  ...draftNames.map(([mindKey, name, categoryIndex]) => ({
    mindKey,
    name,
    category: categories[categoryIndex],
    status: "DRAFT",
    promotionWorkflow:
      "Create the full signed Mind package with guidance, provenance, limitations, rules, compliant and violating fixtures, then pass the registry validator before promotion.",
  })),
].filter((entry) => !packagedKeys.has(entry.mindKey));
const registry = {
  schemaVersion: "1",
  generatedAt: new Date().toISOString(),
  production,
  draftMinds,
};
if (production.length + draftMinds.length < 50)
  throw new Error("vault must contain at least 50 entries");
await import("node:fs/promises").then(({ mkdir, writeFile }) =>
  mkdir(join(root, "public-web-vault"), { recursive: true }).then(() =>
    writeFile(output, `${JSON.stringify(registry, null, 2)}\n`),
  ),
);
console.log(
  JSON.stringify({
    status: "generated",
    production: production.length,
    drafts: draftMinds.length,
    total: production.length + draftMinds.length,
    output,
  }),
);
