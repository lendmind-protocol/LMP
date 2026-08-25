import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { MindPackage } from "@lending-mind/core";
import { CanonicalMindPackageSchema } from "./schema.js";

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
        "guidance.md",
        ...Object.values(result.data.enforcement ?? {}),
        "evidence/README.md",
        "signatures/manifest.sig",
        "signatures/public-key.pem",
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
