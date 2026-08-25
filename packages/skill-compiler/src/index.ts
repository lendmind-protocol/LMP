import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  type JsonValue,
  type MindPackage,
  type RuleDefinition,
  canonicalJson,
  sha256,
} from "@lending-mind/core";
import { MindPackageSchema, validateMindPackage } from "@lending-mind/skill-schema";

export interface InstructionBundle {
  package: MindPackage;
  instructions: string;
  guidance: string[];
  rules: RuleDefinition[];
  evidence: Record<string, unknown>;
  digest: string;
  signature: string;
}

export interface LoadedSkill {
  directory: string;
  package: MindPackage;
  guidance: string[];
  evidence: Record<string, unknown>;
  signature: string;
  declaredRules?: RuleDefinition[];
}

const readOptional = async (directory: string, file: string): Promise<string | undefined> => {
  try {
    return await readFile(join(directory, file), "utf8");
  } catch {
    return undefined;
  }
};

export async function loadSkill(directory: string): Promise<LoadedSkill> {
  const result = await validateMindPackage(directory);
  if (!result.valid || !result.package) {
    throw new Error(
      result.diagnostics
        .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
        .join("\n"),
    );
  }
  const guidance =
    (await readOptional(directory, "guidance.md"))
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean) ?? [];
  let evidence: Record<string, unknown> = {};
  const evidenceText = await readOptional(directory, "evidence.json");
  if (evidenceText) {
    const parsed: unknown = JSON.parse(evidenceText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new TypeError("evidence.json must contain an object");
    evidence = parsed as Record<string, unknown>;
  }
  const declaredRules: RuleDefinition[] = [];
  for (const [name, path] of Object.entries(result.package.enforcement ?? {})) {
    try {
      const policy = JSON.parse(await readFile(join(directory, path), "utf8")) as Record<
        string,
        unknown
      >;
      for (const [key, value] of Object.entries(policy))
        if (typeof value === "boolean" || typeof value === "number" || Array.isArray(value))
          declaredRules.push({
            id: `${name}.${key}`,
            severity: key.startsWith("error") ? "error" : "warning",
            description: `${key}: ${JSON.stringify(value)}`,
            metadata: { policy: name, key, value },
          });
    } catch {
      /* legacy packages can omit declared policy files */
    }
  }
  return {
    directory: resolve(directory),
    package: result.package,
    guidance,
    evidence,
    declaredRules,
    signature: (await readOptional(directory, "signature.txt"))?.trim() ?? "UNSIGNED",
  };
}

export function normalizeMindPackage(value: unknown): MindPackage {
  const parsed = MindPackageSchema.parse(value) as MindPackage;
  const rules: RuleDefinition[] = [...(parsed.rules ?? [])]
    .map((rule): RuleDefinition => ({ severity: "info", ...rule }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    ...parsed,
    rules,
    metadata: { ...(parsed.metadata ?? {}) },
  };
}

export function compileInstructions(skill: LoadedSkill): InstructionBundle {
  const normalized = normalizeMindPackage(skill.package);
  const rules = [...(normalized.rules ?? []), ...(skill.declaredRules ?? [])];
  const sections = [
    `# ${normalized.name ?? normalized.id}`,
    normalized.description ?? "",
    ...skill.guidance,
    ...rules.map(
      (rule) =>
        `Rule ${rule.id} (${rule.severity}): ${rule.description ?? "Follow this observable constraint."}`,
    ),
  ].filter(Boolean);
  const instructions = sections.join("\n");
  const payload = {
    package: normalized,
    instructions,
    guidance: skill.guidance,
    rules: normalized.rules,
    evidence: skill.evidence,
  };
  return {
    package: normalized,
    instructions,
    guidance: skill.guidance,
    rules,
    evidence: skill.evidence,
    digest: sha256(canonicalJson(payload as unknown as JsonValue)),
    signature: skill.signature,
  };
}

export async function compileSkill(directory: string): Promise<InstructionBundle> {
  return compileInstructions(await loadSkill(directory));
}

export const loadMindPackage = loadSkill;
export const compile = compileSkill;
