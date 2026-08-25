import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeAst, assertAllowedCommand, inspectDependencies } from "./index.js";

describe("evaluator", () => {
  it("finds prohibited dependencies and computes AST complexity", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-evaluator-"));
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ dependencies: { evil: "1" } }),
    );
    await writeFile(
      join(directory, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { target: "ES2022" }, include: ["src.ts"] }),
    );
    await writeFile(
      join(directory, "src.ts"),
      "export function f(value: boolean) { if (value) return 1; return 0; }",
    );
    await expect(inspectDependencies(directory, ["evil"])).resolves.toMatchObject({
      prohibited: ["evil"],
    });
    expect(analyzeAst(directory).complexity).toBe(2);
    await rm(directory, { recursive: true, force: true });
  });

  it("rejects commands outside the allowlist", () => {
    expect(() => assertAllowedCommand("rm -rf .", ["pnpm"])).toThrow(/not allowlisted/);
  });
});
