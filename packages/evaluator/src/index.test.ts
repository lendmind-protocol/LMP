import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  advanceRemediation,
  analyzeAst,
  assertAllowedCommand,
  authorizeAction,
  createRemediationRun,
  evaluate,
  inspectDependencies,
  runAllowedCommand,
} from "./index.js";

describe("evaluator", () => {
  it("runs a bounded remediation loop and escalates repeated findings", () => {
    let run = createRemediationRun({ maxAttempts: 3, repeatedFindingLimit: 2 });
    run = advanceRemediation(run, { type: "start_evaluation" });
    run = advanceRemediation(run, {
      type: "evaluation",
      result: "needs_revision",
      findingIds: ["dependency.prohibited"],
    });
    run = advanceRemediation(run, { type: "start_remediation" });
    run = advanceRemediation(run, { type: "remediation_completed" });
    run = advanceRemediation(run, { type: "evaluation", result: "pass" });
    expect(run.state).toBe("passed");

    let stalled = createRemediationRun();
    stalled = advanceRemediation(stalled, { type: "start_evaluation" });
    stalled = advanceRemediation(stalled, {
      type: "evaluation",
      result: "needs_revision",
      findingIds: ["rule-1"],
    });
    stalled = advanceRemediation(stalled, { type: "start_remediation" });
    stalled = advanceRemediation(stalled, { type: "remediation_completed" });
    stalled = advanceRemediation(stalled, {
      type: "evaluation",
      result: "needs_revision",
      findingIds: ["rule-1"],
    });
    expect(stalled.state).toBe("escalated");
    expect(stalled.history.at(-1)?.reason).toContain("same finding");
  });

  it("escalates security errors and never converts them to pass", () => {
    let run = advanceRemediation(createRemediationRun(), { type: "start_evaluation" });
    run = advanceRemediation(run, {
      type: "evaluation",
      result: "error",
      securityError: true,
    });
    expect(run.state).toBe("escalated");
    expect(() => advanceRemediation(run, { type: "human_attested" })).toThrow(/cannot attest/);
  });

  it("enforces independent A0-A6 authorization ceilings", () => {
    const offline: import("./index.js").AutonomyPolicy = {
      maxLevel: "A2",
      allowCommands: false,
      allowPackageInstall: false,
      allowNetwork: false,
      allowDeployment: false,
    };
    expect(authorizeAction(offline, "observe").allowed).toBe(true);
    expect(authorizeAction(offline, "workspace_write").allowed).toBe(true);
    expect(authorizeAction(offline, "run_command")).toMatchObject({
      allowed: false,
      requiredLevel: "A3",
    });
    const release: import("./index.js").AutonomyPolicy = {
      maxLevel: "A6",
      allowCommands: true,
      allowPackageInstall: true,
      allowNetwork: true,
      allowDeployment: true,
    };
    expect(authorizeAction(release, "deploy").allowed).toBe(true);
  });

  it("applies the autonomy ceiling before an allowlisted command can spawn", async () => {
    await expect(
      runAllowedCommand("node --version", ["node --version"], process.cwd(), 5_000, true, {
        maxLevel: "A2",
        allowCommands: false,
        allowPackageInstall: false,
        allowNetwork: false,
        allowDeployment: false,
      }),
    ).rejects.toThrow(/requires A3/);
  });

  it("rejects an allowlisted command whose working directory escapes the approved root", async () => {
    const outside = await mkdtemp(join(tmpdir(), "lmp-command-outside-"));
    await expect(
      runAllowedCommand(
        "node --version",
        ["node --version"],
        outside,
        5_000,
        true,
        {
          maxLevel: "A6",
          allowCommands: true,
          allowPackageInstall: true,
          allowNetwork: true,
          allowDeployment: true,
        },
        process.cwd(),
      ),
    ).rejects.toThrow(/outside the approved workspace boundary/);
    await rm(outside, { recursive: true, force: true });
  });

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

  it("enforces the explicit Supabase application-layer join rule", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-supabase-join-"));
    await writeFile(
      join(directory, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { strict: true } }),
    );
    await writeFile(
      join(directory, "src.ts"),
      "export async function load(ids: string[]) { return Promise.all(ids.map(async (id) => id)); }\n",
    );
    await writeFile(join(directory, "src.test.ts"), "");
    const report = await evaluate({
      directory,
      packageDirectory: resolve(
        dirname(new URL(import.meta.url).pathname),
        "../../../packages/create-lmp/profiles/supabase-core",
      ),
      mode: "enforced",
      artifactMode: "none",
      runCommands: false,
    });
    expect(
      report.results.some((item) => item.ruleId === "database.app-layer-join" && !item.passed),
    ).toBe(true);
    expect(report.state).toBe("needs_revision");
    await rm(directory, { recursive: true, force: true });
  });

  it("rejects commands outside the allowlist", () => {
    expect(() => assertAllowedCommand("rm -rf .", ["pnpm"])).toThrow(/not allowlisted/);
  });

  it("evaluates a real OSS production-source snapshot and persists evidence", async () => {
    const repository = resolve(dirname(new URL(import.meta.url).pathname), "../../..");
    const fixture = join(repository, "test-fixtures/oss/express-utils");
    const artifactDir = await mkdtemp(join(tmpdir(), "lmp-artifacts-"));
    const report = await evaluate({
      directory: fixture,
      packageDirectory: join(repository, "skills/baseline"),
      artifactDir,
      mode: "enforced",
      artifactMode: "full",
      runCommands: false,
    });
    expect(report.passed).toBe(true);
    expect(report.ast.functions).toBeGreaterThan(0);
    expect(report.artifact).toMatchObject({
      analysis: {
        languages: ["typescript"],
        parsers: ["ts-morph/typescript-compiler-api"],
        versions: ["compiler-configured"],
      },
    });
    expect(report.artifact).toMatchObject({
      mode: "enforced",
      privacy: { sourceCodeIncluded: false },
    });
    await rm(artifactDir, { recursive: true, force: true });
  });

  it("uses AST nodes, not comments or string contents, for source findings", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-ast-"));
    await writeFile(
      join(directory, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, noImplicitAny: true },
        include: ["src.ts", "src.test.ts"],
      }),
    );
    await writeFile(
      join(directory, "src.ts"),
      "// eval(any) and console.log()\nconst text = 'require(value)';\nexport const ok: string = text;",
    );
    await writeFile(join(directory, "src.test.ts"), "import { ok } from './src';\nvoid ok;");
    const report = await evaluate({
      directory,
      packageDirectory: resolve(
        dirname(new URL(import.meta.url).pathname),
        "../../../skills/typescript-minimal",
      ),
      mode: "enforced",
      artifactMode: "none",
      runCommands: false,
    });
    expect(
      report.results
        .filter((item) => !item.passed && item.ruleId.startsWith("typescript."))
        .map((item) => item.ruleId),
    ).toEqual([]);
    await rm(directory, { recursive: true, force: true });
  });

  it("returns needs_revision with bounded, schema-valid evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-state-"));
    const artifactDir = await mkdtemp(join(tmpdir(), "lmp-state-artifacts-"));
    const packageDirectory = resolve(
      dirname(new URL(import.meta.url).pathname),
      "../../../skills/typescript-minimal",
    );
    await writeFile(
      join(directory, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, noImplicitAny: true },
        include: ["src.ts", "src.test.ts"],
      }),
    );
    await writeFile(
      join(directory, "src.ts"),
      "export function unsafe(value: any) { return value; }\n",
    );
    await writeFile(
      join(directory, "src.test.ts"),
      "import { unsafe } from './src';\nvoid unsafe('ok');\n",
    );
    const report = await evaluate({
      directory,
      packageDirectory,
      mode: "advisory",
      artifactMode: "full",
      artifactDir,
      runCommands: false,
    });
    expect(report.state).toBe("needs_revision");
    expect(report.artifact).toMatchObject({
      state: "needs_revision",
      workspace: { gitHead: null, dirty: false },
      privacy: { sourceCodeIncluded: false, rawPathsIncluded: false, networkUsed: false },
    });
    await rm(directory, { recursive: true, force: true });
    await rm(artifactDir, { recursive: true, force: true });
  });

  it("blocks evaluation when the Mind signature is invalid", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-blocked-"));
    const packageRoot = await mkdtemp(join(tmpdir(), "lmp-invalid-mind-"));
    const packageDirectory = join(packageRoot, "baseline");
    const sourcePackage = resolve(
      dirname(new URL(import.meta.url).pathname),
      "../../../skills/baseline",
    );
    await cp(sourcePackage, packageDirectory, { recursive: true });
    const manifestPath = join(packageDirectory, "signatures/manifest.sig");
    await writeFile(manifestPath, "invalid\n");
    await writeFile(join(directory, "src.ts"), "export const value = 1;\n");
    const report = await evaluate({
      directory,
      packageDirectory,
      mode: "enforced",
      artifactMode: "summary",
      runCommands: false,
    });
    expect(report.state).toBe("blocked");
    expect(report.artifact).toMatchObject({
      state: "blocked",
      mind: { signatureStatus: "invalid" },
    });
    await rm(directory, { recursive: true, force: true });
    await rm(packageRoot, { recursive: true, force: true });
  });
});
