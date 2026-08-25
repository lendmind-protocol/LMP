import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileSkill, normalizeMindPackage } from "./index.js";

describe("skill compiler", () => {
  it("normalizes rules and compiles a deterministic instruction bundle", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-compiler-"));
    await writeFile(
      join(directory, "mind.json"),
      JSON.stringify({
        id: "lmp:test",
        version: "1",
        rules: [{ id: "z" }, { id: "a", severity: "error" }],
      }),
    );
    await writeFile(join(directory, "guidance.md"), "Do the small thing.\n\nVerify it.");
    const bundle = await compileSkill(directory);
    expect(bundle.rules.map((rule) => rule.id)).toEqual(["a", "z"]);
    expect(bundle.instructions).toContain("Do the small thing.");
    expect(bundle.digest).toMatch(/^sha256:/);
    await rm(directory, { recursive: true, force: true });
  });

  it("rejects malformed packages", () => {
    expect(() => normalizeMindPackage({ version: "1" })).toThrow();
  });
});
