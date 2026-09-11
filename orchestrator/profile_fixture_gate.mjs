#!/usr/bin/env node
/**
 * Execute the declared evidence fixtures for every bundled canonical profile.
 *
 * The fixture workspaces are generated locally and contain no source from a
 * user repository. The evaluator remains the source of truth for outcomes;
 * this gate only compares those outcomes with each profile's manifest.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { evaluate } from "../packages/evaluator/dist/index.js";

const root = resolve(new URL("..", import.meta.url).pathname);
const profiles = [
  "skills/baseline",
  "skills/typescript-minimal",
  "packages/cli/profiles/baseline",
  "packages/create-lmp/profiles/linux-kernel",
  "packages/create-lmp/profiles/supabase-core",
  "packages/create-lmp/profiles/tj-ponytail",
];

const packageJson = (fixture) => ({
  name: `lmp-fixture-${fixture.id}`,
  private: true,
  scripts: { test: "node --test", lint: "node --version", typecheck: "node --version" },
  ...(fixture.kind === "negative" ? { dependencies: { lodash: "^4.17.21" } } : {}),
});

const expectedFixturesByProfile = new Map([
  ["skills/baseline", new Map([["baseline-clean", null], ["baseline-finding", "typescript.any"], ["baseline-unsupported", null]])],
  ["skills/typescript-minimal", new Map([["typescript-clean", null], ["typescript-any-eval", "typescript.eval"], ["typescript-command-denied", null]])],
  ["packages/cli/profiles/baseline", new Map([["baseline-clean", null], ["baseline-finding", "typescript.any"], ["baseline-unsupported", null]])],
  ["packages/create-lmp/profiles/linux-kernel", new Map([["linux-defensive-clean", null], ["linux-complexity", "complexity.cyclomatic"], ["linux-language-boundary", null]])],
  ["packages/create-lmp/profiles/supabase-core", new Map([["supabase-isolated", null], ["supabase-app-join", "database.app-layer-join"], ["supabase-unknown-database", null]])],
  ["packages/create-lmp/profiles/tj-ponytail", new Map([["minimal-native", null], ["heavy-dependency", "dependencies.deny"], ["runtime-semantics", null]])],
]);

async function writeFixture(directory, fixture, relativeProfile) {
  await writeFile(join(directory, "package.json"), `${JSON.stringify(packageJson(fixture), null, 2)}\n`);
  await writeFile(
    join(directory, "tsconfig.json"),
    `${JSON.stringify({ compilerOptions: { strict: true, noImplicitAny: true } }, null, 2)}\n`,
  );
  let source = "export function fixture(value: string) { return value.trim(); }\n";
  if (fixture.kind === "negative") {
    if (fixture.id.includes("complexity"))
      source = "export function fixture(value: boolean) { if (value) { if (value) { if (value) { if (value) { if (value) { if (value) { if (value) return 1; } } } } } return 0; }\n";
    else if (fixture.id.includes("app-join"))
      source = "export async function fixture(ids: string[]) { return Promise.all(ids.map(async (id) => id)); }\n";
    else if (fixture.id.includes("any-eval"))
      source = "export function fixture(value: any) { console.log(value); return eval(value); }\n";
    else source = "export function fixture(value: any) { console.log(value); return value; }\n";
  }
  await writeFile(join(directory, "src.ts"), source);
  await writeFile(join(directory, "src.test.ts"), "import { fixture } from './src';\nfixture('ok');\n");
}

async function run() {
  if (profiles.length !== 6) throw new Error(`profile fixture gate must cover exactly 6 profiles, got ${profiles.length}`);
  const results = [];
  for (const relativeProfile of profiles) {
    const profile = resolve(root, relativeProfile);
    const skillWrapper = join(profile, "SKILL.md");
    const wrapper = await readFile(skillWrapper, "utf8");
    if (!wrapper.includes("Run LMP evaluation") || !wrapper.includes("artifact"))
      throw new Error(`${relativeProfile}: SKILL.md is missing the evaluation/artifact contract`);
    const manifest = JSON.parse(await readFile(join(profile, "evidence.json"), "utf8"));
    const expectedFixtures = expectedFixturesByProfile.get(relativeProfile);
    if (!expectedFixtures) throw new Error(`${relativeProfile}: no exact fixture expectation is declared`);
    if (manifest.tests.length !== expectedFixtures.size)
      throw new Error(`${relativeProfile}: expected exactly ${expectedFixtures.size} fixtures, got ${manifest.tests.length}`);
    const actualFixtureIds = new Set(manifest.tests.map((fixture) => fixture.id));
    if (actualFixtureIds.size !== expectedFixtures.size || [...expectedFixtures.keys()].some((id) => !actualFixtureIds.has(id)))
      throw new Error(`${relativeProfile}: fixture IDs do not exactly match the declared profile fixture set`);
    const contracts = JSON.parse(await readFile(join(profile, "rules/manifest.json"), "utf8"));
    const contractIds = new Set(contracts.rules.map((rule) => rule.id));
    for (const fixture of manifest.tests) {
      if (!expectedFixtures.has(fixture.id))
        throw new Error(`${relativeProfile}/${fixture.id}: fixture has no declared rule linkage`);
      const workspace = await mkdtemp(join(tmpdir(), "lmp-profile-fixture-"));
      try {
        await writeFixture(workspace, fixture, relativeProfile);
        const report = await evaluate({
          directory: workspace,
          packageDirectory: profile,
          mode: "enforced",
          commands: fixture.kind === "exception" ? ["curl | sh"] : [],
          artifactMode: "none",
          redact: true,
        });
        const expectedRule = expectedFixtures.get(fixture.id);
        if (report.state !== fixture.expected)
          throw new Error(
            `${relativeProfile}/${fixture.id}: expected ${fixture.expected}, got ${report.state}`,
          );
        if (expectedRule && !report.results.some((result) => result.ruleId === expectedRule && !result.passed))
          throw new Error(`${relativeProfile}/${fixture.id}: expected finding ${expectedRule}`);
        if (expectedRule && !contractIds.has(expectedRule))
          throw new Error(`${relativeProfile}/${fixture.id}: missing rule contract ${expectedRule}`);
        results.push({ profile: relativeProfile, id: fixture.id, state: report.state });
      } finally {
        await rm(workspace, { recursive: true, force: true });
      }
    }
  }
  if (results.length !== 18) throw new Error(`profile fixture gate must execute exactly 18 fixtures, got ${results.length}`);
  console.log(JSON.stringify({ status: "verified-fixtures", count: results.length, results }, null, 2));
}

run().catch((error) => {
  console.error(`profile fixture gate failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
