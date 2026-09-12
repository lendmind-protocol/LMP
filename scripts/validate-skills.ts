import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { validateMindPackage } from "@lending-mind/skill";

const directories = async (parent: string) =>
  (await readdir(parent, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => join(parent, entry.name))
    .sort();

const profileDirectories = [
  ...(await directories("profiles")).filter((directory) => !directory.endsWith("/workspaces")),
  ...(await directories("registry/minds")),
  ...(await directories("registry/definitions")),
  ...(await directories("packages/create-lmp/profiles")),
  "packages/cli/profiles/baseline",
];

if (new Set(profileDirectories).size !== profileDirectories.length) {
  throw new Error("profile validation set contains duplicate package paths");
}

console.log(`Validating ${profileDirectories.length} Mind packages`);

const readJson = async (path: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;

const requireNonEmptyDirectory = async (path: string, description: string) => {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    const sourceExtensions = new Set([
      ".c",
      ".cc",
      ".cpp",
      ".cs",
      ".go",
      ".h",
      ".hpp",
      ".hcl",
      ".java",
      ".jl",
      ".js",
      ".jsx",
      ".kt",
      ".kts",
      ".mts",
      ".php",
      ".py",
      ".rb",
      ".rs",
      ".sql",
      ".swift",
      ".tf",
      ".ts",
      ".tsx",
    ]);
    if (
      !entries.some(
        (entry) =>
          entry.isFile() &&
          sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase()),
      )
    )
      throw new Error("no executable source fixture");
  } catch {
    throw new Error(`${description} must contain at least one executable source fixture: ${path}`);
  }
};

const validateCanonicalEvidence = async (directory: string) => {
  if (!directory.startsWith("registry/minds/")) return;
  const sourceManifest = await readJson(join(directory, "sources.json"));
  const sources = sourceManifest.sources;
  if (!Array.isArray(sources) || sources.length === 0)
    throw new Error(`${directory}: sources.json must contain at least one source`);
  for (const source of sources) {
    if (!source || typeof source !== "object")
      throw new Error(`${directory}: invalid source record`);
    const record = source as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.title !== "string" ||
      typeof record.url !== "string"
    )
      throw new Error(`${directory}: source records require id, title, and url`);
    if (!/^sha256:[0-9a-f]{64}$/.test(String(record.contentDigest ?? "")))
      throw new Error(`${directory}: source ${record.id} must have a sha256 content digest`);
  }
  const evidence = await readJson(join(directory, "evidence.json"));
  const tests = evidence.tests;
  if (
    !Array.isArray(tests) ||
    new Set(tests.map((test) => (test as Record<string, unknown>).id)).size !== 3
  )
    throw new Error(`${directory}: evidence.json must declare three distinct fixtures`);
  for (const kind of ["positive", "negative", "exception"])
    if (!tests.some((test) => (test as Record<string, unknown>).kind === kind))
      throw new Error(`${directory}: evidence.json is missing a ${kind} fixture`);
  await requireNonEmptyDirectory(
    join(directory, "fixtures/compliant"),
    `${directory} compliant fixtures`,
  );
  await requireNonEmptyDirectory(
    join(directory, "fixtures/violating"),
    `${directory} violating fixtures`,
  );
  const rules = await readJson(join(directory, "rules/manifest.json"));
  if (!Array.isArray(rules.rules) || rules.rules.length === 0)
    throw new Error(`${directory}: rules/manifest.json must declare executable rule contracts`);
};

const validateBundledBaselineParity = async () => {
  const canonicalRoot = "profiles/baseline";
  const bundledRoot = "packages/cli/profiles/baseline";
  for (const relative of ["rules/manifest.json", "rules/typescript.json"]) {
    const [canonical, bundled] = await Promise.all([
      readFile(join(canonicalRoot, relative), "utf8"),
      readFile(join(bundledRoot, relative), "utf8"),
    ]);
    if (canonical !== bundled) throw new Error(`bundled baseline drift detected in ${relative}`);
  }
};

await validateBundledBaselineParity();

for (const directory of profileDirectories) {
  const result = await validateMindPackage(directory);
  if (!result.valid) {
    console.error(`${directory}: ${result.diagnostics.map((d) => d.message).join("; ")}`);
    process.exitCode = 1;
  }
  await validateCanonicalEvidence(directory);
}
