import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MindPackageSchema, exportJsonSchema, validateMindPackage } from "./index.js";

describe("mind package schema", () => {
  it("accepts a package and exports a dependency-free JSON Schema", async () => {
    const packageValue = { id: "lmp:skill:test", version: "1.0.0", rules: [{ id: "minimal" }] };
    expect(MindPackageSchema.parse(packageValue)).toEqual(packageValue);
    expect(exportJsonSchema().required).toContain("$schema");
    const directory = await mkdtemp(join(tmpdir(), "lmp-schema-"));
    await writeFile(join(directory, "mind.json"), JSON.stringify(packageValue));
    await expect(validateMindPackage(directory)).resolves.toMatchObject({ valid: true });
    await rm(directory, { recursive: true, force: true });
  });

  it("reports invalid package directories and fields", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-schema-"));
    await writeFile(join(directory, "mind.json"), JSON.stringify({ version: "1.0.0" }));
    const result = await validateMindPackage(directory);
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0]?.path).toContain("id");
    await rm(directory, { recursive: true, force: true });
  });
});
