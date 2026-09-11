#!/usr/bin/env node

/**
 * Run a release-shaped local evaluator flow:
 * failing candidate -> bounded remediation -> passing candidate.
 *
 * This produces local evidence only. It never represents a human review,
 * external deployment, or production-wide quality claim.
 */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  advanceRemediation,
  authorizeAction,
  createRemediationRun,
  evaluate,
} from "../packages/evaluator/dist/index.js";

const root = resolve(new URL("..", import.meta.url).pathname);
const profile = join(root, "skills/typescript-minimal");
const outputDir = join(root, "lmp-test-results/evaluator-integration");
const summaryPath = join(root, "lmp-test-results/evaluator-integration-summary.json");

const writeWorkspace = async (directory, source) => {
  await writeFile(
    join(directory, "package.json"),
    `${JSON.stringify({ name: "lmp-evaluator-integration", private: true }, null, 2)}\n`,
  );
  await writeFile(
    join(directory, "tsconfig.json"),
    `${JSON.stringify({ compilerOptions: { strict: true, noImplicitAny: true } }, null, 2)}\n`,
  );
  await writeFile(join(directory, "src.ts"), `${source}\n`);
  await writeFile(join(directory, "src.test.ts"), "import { fixture } from './src';\nfixture('ok');\n");
};

const requireState = (report, expected, label) => {
  if (report.state !== expected)
    throw new Error(`${label}: expected ${expected}, received ${report.state}`);
};

const main = async () => {
  const workspace = await mkdtemp(join(tmpdir(), "lmp-evaluator-integration-"));
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  try {
    await writeWorkspace(workspace, "export function fixture(value: any) { return value; }");
    const failing = await evaluate({
      directory: workspace,
      packageDirectory: profile,
      mode: "enforced",
      artifactMode: "full",
      artifactDir: outputDir,
      runCommands: false,
    });
    requireState(failing, "needs_revision", "failing candidate");
    if (!failing.artifactPath || !failing.artifact) throw new Error("failing artifact missing");

    let remediation = createRemediationRun({ maxAttempts: 3, repeatedFindingLimit: 2 });
    remediation = advanceRemediation(remediation, { type: "start_evaluation" });
    remediation = advanceRemediation(remediation, {
      type: "evaluation",
      result: "needs_revision",
      findingIds: failing.results.filter((item) => !item.passed).map((item) => item.ruleId),
    });
    remediation = advanceRemediation(remediation, { type: "start_remediation" });
    await writeWorkspace(workspace, "export function fixture(value: string) { return value.trim(); }");
    remediation = advanceRemediation(remediation, { type: "remediation_completed" });
    const passing = await evaluate({
      directory: workspace,
      packageDirectory: profile,
      mode: "enforced",
      artifactMode: "full",
      artifactDir: outputDir,
      runCommands: false,
    });
    requireState(passing, "pass", "remediated candidate");
    remediation = advanceRemediation(remediation, { type: "evaluation", result: "pass" });

    const offline = {
      maxLevel: "A2",
      allowCommands: false,
      allowPackageInstall: false,
      allowNetwork: false,
      allowDeployment: false,
    };
    const release = {
      maxLevel: "A6",
      allowCommands: true,
      allowPackageInstall: true,
      allowNetwork: true,
      allowDeployment: true,
    };
    const denied = authorizeAction(offline, "deploy");
    const allowed = authorizeAction(release, "deploy");
    if (denied.allowed || !allowed.allowed) throw new Error("authorization boundary failed");

    const evidence = {
      artifactVersion: "1.0",
      status: "verified-local-integration",
      scope: "TypeScript evaluator, remediation state machine, and A0-A6 authorization",
      profile: "skills/typescript-minimal",
      stages: {
        failingCandidate: { state: failing.state, artifactPath: failing.artifactPath },
        remediation: { state: remediation.state, transitions: remediation.history.length },
        passingCandidate: { state: passing.state, artifactPath: passing.artifactPath },
        authorization: {
          deniedDeploymentAt: offline.maxLevel,
          allowedDeploymentAt: release.maxLevel,
        },
      },
      limitations: [
        "This is local deterministic evidence against a bundled profile and fixture workspace.",
        "It does not replace independent review, external deployment, or a human adoption pilot.",
      ],
    };
    await writeFile(summaryPath, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(`evaluator integration evidence failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
