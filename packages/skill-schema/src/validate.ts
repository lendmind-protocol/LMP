import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { MindPackage } from "@lending-mind/sdk";
import {
  CanonicalMindPackageSchema,
  EvidenceManifestSchema,
  ReleaseMetadataSchema,
  RuleContractManifestSchema,
} from "./schema.js";

export interface ValidationDiagnostic {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  package?: MindPackage;
  diagnostics: ValidationDiagnostic[];
}

export async function validateMindPackage(directory: string): Promise<ValidationResult> {
  let file: string | undefined;
  for (const candidate of ["mind.json", "package.json"]) {
    try {
      await access(join(directory, candidate));
      file = join(directory, candidate);
      break;
    } catch {
      /* try next manifest */
    }
  }
  if (!file)
    return {
      valid: false,
      diagnostics: [{ path: directory, message: "mind.json or package.json is required" }],
    };

  let value: unknown;
  try {
    value = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    return {
      valid: false,
      diagnostics: [
        { path: file, message: error instanceof Error ? error.message : "invalid JSON" },
      ],
    };
  }

  const result = CanonicalMindPackageSchema.safeParse(value);
  if (result.success) {
    const diagnostics: ValidationDiagnostic[] = [];
    if (result.data.$schema) {
      for (const required of [
        "SKILL.md",
        "guidance.md",
        ...Object.values(result.data.enforcement ?? {}),
        "evidence/README.md",
      ]) {
        try {
          await access(join(directory, required));
        } catch {
          diagnostics.push({
            path: join(directory, required),
            message: "declared package file is missing",
          });
        }
      }
      try {
        const evidence = JSON.parse(await readFile(join(directory, "evidence.json"), "utf8"));
        EvidenceManifestSchema.parse(evidence);
      } catch (error) {
        diagnostics.push({
          path: join(directory, "evidence.json"),
          message: error instanceof Error ? error.message : "invalid evidence manifest",
        });
      }
      try {
        const release = JSON.parse(await readFile(join(directory, "release.json"), "utf8"));
        const parsedRelease = ReleaseMetadataSchema.parse(release);
        if (parsedRelease.packageId !== result.data.id)
          throw new Error(`release metadata packageId must match ${result.data.id}`);
        if (parsedRelease.version !== result.data.version)
          throw new Error(`release metadata version must match ${result.data.version}`);
      } catch (error) {
        diagnostics.push({
          path: join(directory, "release.json"),
          message: error instanceof Error ? error.message : "invalid release metadata",
        });
      }
      try {
        const contracts = RuleContractManifestSchema.parse(
          JSON.parse(await readFile(join(directory, "rules/manifest.json"), "utf8")),
        );
        const sourceBacked = result.data.metadata?.sourceRuleContractVersion === "1";
        if (sourceBacked) {
          for (const rule of contracts.rules) {
            for (const field of [
              "sourceClaim",
              "sourceLocator",
              "implementation",
              "fixture",
            ] as const)
              if (!rule.evidence[field])
                throw new Error(`source-backed rule ${rule.id} is missing evidence.${field}`);
          }
        }
        const policyFiles = new Set(Object.values(result.data.enforcement ?? {}));
        const declaredPolicyFiles = new Set(contracts.rules.map((rule) => rule.policyFile));
        for (const policyFile of policyFiles)
          if (!declaredPolicyFiles.has(policyFile))
            throw new Error(`rule contract manifest does not cover ${policyFile}`);
      } catch (error) {
        diagnostics.push({
          path: join(directory, "rules/manifest.json"),
          message: error instanceof Error ? error.message : "invalid rule contract manifest",
        });
      }
    }
    return { valid: diagnostics.length === 0, package: result.data as MindPackage, diagnostics };
  }
  return {
    valid: false,
    diagnostics: result.error.issues.map((issue) => ({
      path: `${file}:${issue.path.join(".") || "$"}`,
      message: issue.message,
    })),
  };
}
