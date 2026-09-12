import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileSkill, loadSkill, normalizeMindPackage } from "./index.js";

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

  it("rejects inferred evidence in a legacy package before compiling rules", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-compiler-legacy-"));
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ id: "lmp:legacy", version: "1", rules: [{ id: "legacy" }] }),
    );
    await mkdir(join(directory, "rules"));
    await writeFile(
      join(directory, "rules/manifest.json"),
      JSON.stringify({
        schemaVersion: "1.0",
        rules: [
          {
            id: "legacy",
            policyFile: "rules/policy.json",
            severity: "warning",
            classification: "judgment-guided",
            rationale: "Needs review.",
            assertion: "The proposal is plausible.",
            scope: ["source"],
            remediation: "Review the proposal.",
            limitations: ["Not verified."],
            evidence: { classification: "inferred-hypothesis", sourceId: "proposal" },
          },
        ],
      }),
    );
    await expect(loadSkill(directory)).rejects.toThrow(/proposal-only/);
    await rm(directory, { recursive: true, force: true });
  });
});
