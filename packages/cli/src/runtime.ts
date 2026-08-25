import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  type MindPackage,
  computePackageDigest,
  redactSecrets,
  sha256,
  signMindPackage,
  verifyMindPackage,
} from "@lending-mind/core";
import { evaluate as evaluateWorkspace } from "@lending-mind/evaluator";
import { compileSkill } from "@lending-mind/skill-compiler";
import { MindPackageSchema, validateMindPackage } from "@lending-mind/skill-schema";

export type Mode = "advisory" | "enforced" | "audit";
type RuntimeArtifact = {
  runId: string;
  summary: { status: string; hardViolationCount: number };
  [key: string]: unknown;
};
export const root = (cwd = process.cwd()) => join(cwd, ".lending-mind");
export const registryRoot = (cwd = process.cwd()) => join(root(cwd), "registry");

export async function loadMind(
  input: string | undefined,
  cwd = process.cwd(),
): Promise<MindPackage> {
  let selected = input;
  if (!selected) {
    try {
      const config = JSON.parse(
        await readFile(resolve(cwd, ".lending-mind/config.json"), "utf8"),
      ) as { defaultMind?: string };
      selected = config.defaultMind;
    } catch {
      /* fall back to the bundled baseline */
    }
  }
  const candidate = selected?.startsWith("lmp:")
    ? resolve(cwd, "skills", selected.split(":").pop() ?? "baseline", "mind.json")
    : resolve(cwd, selected ?? join("skills", "baseline", "mind.json"));
  const value = JSON.parse(await readFile(candidate, "utf8"));
  return MindPackageSchema.parse(value) as MindPackage;
}

export function digestMind(mind: MindPackage): string {
  return sha256(mind as unknown as Parameters<typeof sha256>[0]);
}

export async function validate(path: string) {
  return validateMindPackage(resolve(path));
}

export function instructions(mind: MindPackage, format: "markdown" | "json" = "markdown") {
  const result = {
    mind: mind.id,
    version: mind.version,
    checklist: [
      "Follow the mind package guidance.",
      "Run the relevant checks before reporting completion.",
      "Keep changes minimal and reviewable.",
    ],
  };
  return format === "json"
    ? JSON.stringify(result, null, 2)
    : `# ${mind.name ?? mind.id}\n\n- ${result.checklist.join("\n- ")}`;
}

export async function evaluate(
  mind: MindPackage,
  workspace: string,
  mode: Mode,
): Promise<RuntimeArtifact> {
  const report = await evaluateWorkspace({
    directory: workspace,
    packageDirectory: resolve(`skills/${mind.id.split(":").pop()}`),
    exclusions: ["node_modules", "dist", "build", "coverage", ".git", ".lending-mind"],
    commands: mode === "audit" ? [] : undefined,
    runCommands: false,
    mode,
  });
  return report.artifact as unknown as RuntimeArtifact;
}

export { computePackageDigest, signMindPackage, verifyMindPackage, compileSkill };

export async function installPackage(path: string, cwd = process.cwd()) {
  const result = await validate(path);
  if (!result.valid || !result.package)
    throw new Error(result.diagnostics.map((d) => `${d.path}: ${d.message}`).join("; "));
  const destination = join(
    registryRoot(cwd),
    encodeURIComponent(result.package.id),
    result.package.version,
  );
  await mkdir(destination, { recursive: true });
  await cp(resolve(path), destination, { recursive: true, force: false, errorOnExist: false });
  return {
    id: result.package.id,
    version: result.package.version,
    digest: digestMind(result.package),
    path: destination,
  };
}

export async function listPackages(cwd = process.cwd()) {
  try {
    const ids = await readdir(registryRoot(cwd));
    return (
      await Promise.all(
        ids.map(async (id) => {
          const versions = await readdir(join(registryRoot(cwd), id));
          return Promise.all(
            versions.map(async (version) => {
              const result = await validate(join(registryRoot(cwd), id, version));
              return (
                result.package && {
                  id: result.package.id,
                  version,
                  digest: digestMind(result.package),
                  signatureStatus: "unsigned",
                  installedAt: null,
                  provenance: "local",
                }
              );
            }),
          );
        }),
      )
    )
      .flat()
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function writeJson(path: string, value: unknown) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
