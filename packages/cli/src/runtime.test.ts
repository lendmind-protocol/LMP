import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKeyPair } from "@lending-mind/sdk";
import { describe, expect, it } from "vitest";
import { runCli } from "./index.js";
import {
  decideProposal,
  ensureGitignore,
  installPackage,
  instructions,
  listPackages,
  loadMind,
  promoteProposal,
  shareMind,
  submitProposal,
} from "./runtime.js";

describe("CLI runtime", () => {
  it("produces deterministic visible instructions", () => {
    const mind = { id: "lmp:test", version: "1", rules: [] };
    expect(instructions(mind, "json")).toContain('"mind": "lmp:test"');
    expect(instructions(mind)).toContain("relevant checks");
  });

  it("adds local state ignores without overwriting existing project rules", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-cli-"));
    try {
      await writeFile(join(directory, ".gitignore"), "dist/\n");
      expect(await ensureGitignore(directory)).toBe(true);
      expect(await ensureGitignore(directory)).toBe(false);
      const content = await readFile(join(directory, ".gitignore"), "utf8");
      expect(content).toContain("dist/");
      expect(content).toContain(".lending-mind/");
      expect(content).toContain("private-key.pem");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("repairs a partial generated ignore block instead of treating it as complete", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-cli-gitignore-partial-"));
    try {
      await writeFile(
        join(directory, ".gitignore"),
        "dist/\n# Lending-Mind Protocol local state (generated; do not commit)\n.lending-mind/\n.lmp_telemetry/\n",
      );
      expect(await ensureGitignore(directory)).toBe(true);
      const content = await readFile(join(directory, ".gitignore"), "utf8");
      expect(content).toContain("lmp_test_bed/");
      expect(content).toContain(".lmp-qualification-docker/");
      expect(content).toContain("*.private.pem");
      expect(await ensureGitignore(directory)).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("runs the public init, use, and share workflow in an isolated workspace", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-cli-workflow-"));
    const originalCwd = process.cwd();
    try {
      process.chdir(directory);
      await writeFile(join(directory, ".gitignore"), "dist/\n");
      expect(await runCli(["init", "--install-baseline"])).toBe(0);
      expect(await readFile(join(directory, ".lending-mind", "config.json"), "utf8")).toContain(
        '"defaultMind": "lmp:mind:baseline"',
      );

      const profile = join(directory, "registry", "definitions", "tj-ponytail");
      await mkdir(join(directory, "registry", "definitions"), { recursive: true });
      await cp(join(originalCwd, "..", "..", "registry", "definitions", "tj-ponytail"), profile, {
        recursive: true,
      });
      const signing = join(directory, "signing");
      const { privatePath } = await createKeyPair(signing);
      const shared = join(directory, "shared-mind");

      expect(await runCli(["use", "tj-ponytail", "--json"])).toBe(0);
      expect(
        JSON.parse(await readFile(join(directory, ".lending-mind", "config.json"), "utf8")),
      ).toMatchObject({
        defaultMindId: "lmp:mind:tj-ponytail",
      });
      expect(
        await runCli(["share", profile, "--private-key", privatePath, "--out", shared, "--json"]),
      ).toBe(0);
      expect(await readFile(join(shared, "signatures", "public-key.pem"), "utf8")).toContain(
        "BEGIN PUBLIC KEY",
      );
      expect(
        JSON.parse(await readFile(join(shared, "signatures", "manifest.json"), "utf8")),
      ).toMatchObject({
        algorithm: "Ed25519",
      });
    } finally {
      process.chdir(originalCwd);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("resolves the baseline installed by init for the first evaluation load", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-cli-default-mind-"));
    const originalCwd = process.cwd();
    try {
      process.chdir(directory);
      expect(await runCli(["init", "--install-baseline"])).toBe(0);
      await expect(loadMind(undefined, directory)).resolves.toMatchObject({
        id: "lmp:mind:baseline",
      });
    } finally {
      process.chdir(originalCwd);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("supports the roadmap-compatible init --baseline alias", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-cli-baseline-alias-"));
    const originalCwd = process.cwd();
    try {
      process.chdir(directory);
      expect(await runCli(["init", "--baseline"])).toBe(0);
      await expect(loadMind(undefined, directory)).resolves.toMatchObject({
        id: "lmp:mind:baseline",
      });
    } finally {
      process.chdir(originalCwd);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reports the actual local package signature state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-cli-"));
    const packagePath = join(directory, "mind");
    try {
      await writeFile(join(directory, ".gitignore"), "");
      await mkdir(packagePath, { recursive: true });
      await writeFile(
        join(packagePath, "mind.json"),
        JSON.stringify({ id: "lmp:skill:test", version: "1.0.0", rules: [{ id: "minimal" }] }),
      );
      const unsigned = await installPackage(packagePath, directory);
      expect((await listPackages(directory))[0]).toMatchObject({
        id: unsigned.id,
        signatureStatus: "unsigned",
      });

      const signingDir = join(directory, "signing");
      const { privatePath } = await createKeyPair(signingDir);
      const signedSource = join(directory, "signed");
      await mkdir(signedSource, { recursive: true });
      await writeFile(
        join(signedSource, "mind.json"),
        JSON.stringify({ id: "lmp:skill:signed", version: "1.0.0", rules: [{ id: "minimal" }] }),
      );
      await shareMind(signedSource, { privateKey: privatePath });
      await installPackage(signedSource, directory);
      expect(
        (await listPackages(directory)).find((entry) => entry?.id === "lmp:skill:signed"),
      ).toMatchObject({ signatureStatus: "verified" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("requires explicit proposal review and records an append-only decision audit", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-cli-proposal-"));
    const proposalPath = join(directory, "proposal.json");
    try {
      await writeFile(
        proposalPath,
        JSON.stringify({
          proposalId: "proposal-1",
          profileId: "lmp:mind:test",
          profileVersion: "1.0.0",
          selectedArtifacts: ["artifacts/run.json"],
          candidateChanges: [{ ruleId: "new-rule", severity: "warning" }],
          rationale: "Observed repeatable false positives.",
          expectedBenefit: "Reduce repeatable architectural violations.",
          falsePositiveRisk: "A narrow fixture review is required before promotion.",
          requiredVersionBump: "minor",
          requiredTests: ["positive and negative fixtures"],
          benchmarkPlan: ["compare pinned fixtures"],
          approver: null,
          status: "draft",
          createdAt: "2026-09-11T00:00:00.000Z",
        }),
      );
      await mkdir(join(directory, "artifacts"), { recursive: true });
      await writeFile(
        join(directory, "artifacts/run.json"),
        JSON.stringify({
          artifactVersion: "1.0",
          runId: "run-1",
          createdAt: "2026-09-11T00:00:00.000Z",
          workspace: { pathHash: `sha256:${"a".repeat(64)}`, gitHead: null, dirty: false },
          mind: {
            id: "lmp:mind:test",
            version: "1.0.0",
            contentDigest: `sha256:${"b".repeat(64)}`,
            signatureStatus: "verified",
          },
          mode: "audit",
          state: "needs_revision",
          summary: {
            status: "warning",
            hardViolationCount: 1,
            warningCount: 0,
            informationalCount: 0,
          },
          checks: [],
          skippedChecks: [],
          loopTransitions: [],
          commands: [],
          limitations: ["fixture evidence"],
          environment: {},
          privacy: { sourceCodeIncluded: false, rawPathsIncluded: false, networkUsed: false },
        }),
      );
      await expect(
        decideProposal(proposalPath, "accepted", "maintainer", "not submitted"),
      ).rejects.toThrow(/cannot transition/);
      await expect(submitProposal(proposalPath, directory)).resolves.toMatchObject({
        status: "under-review",
      });
      await expect(
        decideProposal(proposalPath, "accepted", "maintainer", "fixtures and benchmark reviewed"),
      ).resolves.toMatchObject({ status: "accepted", approver: "maintainer" });
      const audit = await readFile(`${proposalPath}.audit.jsonl`, "utf8");
      expect(audit).toContain('"event":"submitted"');
      expect(audit).toContain('"event":"accepted"');
      await expect(
        decideProposal(proposalPath, "rejected", "maintainer", "late decision"),
      ).rejects.toThrow(/cannot transition/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("refuses acceptance when selected evidence is missing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-cli-proposal-gate-"));
    const proposalPath = join(directory, "proposal.json");
    try {
      await writeFile(
        proposalPath,
        JSON.stringify({
          proposalId: "proposal-gate",
          profileId: "lmp:mind:test",
          profileVersion: "1.0.0",
          selectedArtifacts: ["missing.json"],
          candidateChanges: [{ ruleId: "rule" }],
          rationale: "Evidence must be checked before acceptance.",
          expectedBenefit: "Reduce repeatable architectural violations.",
          falsePositiveRisk: "A narrow fixture review is required before promotion.",
          requiredVersionBump: "minor",
          requiredTests: ["add a regression fixture"],
          benchmarkPlan: ["run the pinned benchmark"],
          approver: null,
          status: "under-review",
          createdAt: "2026-09-11T00:00:00.000Z",
        }),
      );
      await expect(
        decideProposal(proposalPath, "accepted", "maintainer", "attempted without evidence"),
      ).rejects.toThrow(/ENOENT|evaluation artifact/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("refuses proposal evidence paths that escape the proposal directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-cli-proposal-path-"));
    const proposalPath = join(directory, "proposals/proposal.json");
    try {
      await mkdir(join(directory, "proposals"), { recursive: true });
      await writeFile(
        proposalPath,
        JSON.stringify({
          proposalId: "proposal-path",
          profileId: "lmp:mind:test",
          profileVersion: "1.0.0",
          selectedArtifacts: ["../outside.json"],
          candidateChanges: [{ ruleId: "rule" }],
          rationale: "Evidence paths must remain scoped.",
          expectedBenefit: "Reduce repeatable architectural violations.",
          falsePositiveRisk: "A narrow fixture review is required before promotion.",
          requiredVersionBump: "minor",
          requiredTests: ["add a regression fixture"],
          benchmarkPlan: ["run the pinned benchmark"],
          approver: null,
          status: "under-review",
          createdAt: "2026-09-11T00:00:00.000Z",
        }),
      );
      await expect(
        decideProposal(proposalPath, "accepted", "maintainer", "attempted traversal"),
      ).rejects.toThrow(/stay inside the proposal directory/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("refuses Windows absolute evidence paths on every host", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-cli-proposal-drive-"));
    const proposalPath = join(directory, "proposal.json");
    try {
      await writeFile(
        proposalPath,
        JSON.stringify({
          proposalId: "proposal-drive",
          profileId: "lmp:mind:test",
          profileVersion: "1.0.0",
          selectedArtifacts: ["C:\\outside.json"],
          candidateChanges: [{ ruleId: "rule" }],
          rationale: "Evidence paths must remain scoped.",
          expectedBenefit: "Reduce repeatable architectural violations.",
          falsePositiveRisk: "A narrow fixture review is required before promotion.",
          requiredVersionBump: "minor",
          requiredTests: ["add a regression fixture"],
          benchmarkPlan: ["run the pinned benchmark"],
          approver: null,
          status: "under-review",
          createdAt: "2026-09-11T00:00:00.000Z",
        }),
      );
      await expect(
        decideProposal(proposalPath, "accepted", "maintainer", "attempted drive escape"),
      ).rejects.toThrow(/stay inside the proposal directory/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("creates an explicit semvered promotion without carrying stale signatures", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-cli-promotion-"));
    const proposalPath = join(directory, "proposal.json");
    const source = join(directory, "source");
    const output = join(directory, "promoted");
    try {
      await cp(join(process.cwd(), "..", "..", "skills", "baseline"), source, {
        recursive: true,
      });
      await writeFile(
        proposalPath,
        JSON.stringify({
          proposalId: "proposal-promotion",
          profileId: "lmp:mind:baseline",
          profileVersion: "1.0.0",
          selectedArtifacts: ["artifact.json"],
          candidateChanges: [{ ruleId: "explicit-rule" }],
          rationale: "Promote a reviewed profile change.",
          expectedBenefit: "Reduce repeatable architectural violations.",
          falsePositiveRisk: "A narrow fixture review is required before promotion.",
          requiredVersionBump: "minor",
          requiredTests: ["run the profile fixtures"],
          benchmarkPlan: ["compare pinned baseline and candidate"],
          approver: null,
          status: "under-review",
          createdAt: "2026-09-11T00:00:00.000Z",
        }),
      );
      await writeFile(
        join(directory, "artifact.json"),
        JSON.stringify({
          artifactVersion: "1.0",
          runId: "run-promotion",
          createdAt: "2026-09-11T00:00:00.000Z",
          workspace: { pathHash: `sha256:${"a".repeat(64)}`, gitHead: null, dirty: false },
          mind: {
            id: "lmp:mind:baseline",
            version: "1.0.0",
            contentDigest: `sha256:${"b".repeat(64)}`,
            signatureStatus: "verified",
          },
          mode: "audit",
          state: "pass",
          summary: {
            status: "pass",
            hardViolationCount: 0,
            warningCount: 0,
            informationalCount: 0,
          },
          checks: [],
          skippedChecks: [],
          loopTransitions: [],
          commands: [],
          limitations: ["fixture evidence"],
          environment: {},
          privacy: { sourceCodeIncluded: false, rawPathsIncluded: false, networkUsed: false },
        }),
      );
      await decideProposal(proposalPath, "accepted", "maintainer", "fixtures reviewed");
      await expect(
        promoteProposal(proposalPath, {
          source,
          version: "1.0.1",
          output: join(directory, "patch-below-required-minor"),
          promoter: "release-maintainer",
        }),
      ).rejects.toThrow(/required minor version bump/);
      const result = await promoteProposal(proposalPath, {
        source,
        version: "1.1.0",
        output,
        promoter: "release-maintainer",
      });
      expect(result).toMatchObject({
        packageId: "lmp:mind:baseline",
        from: "1.0.0",
        to: "1.1.0",
        signatureStatus: "requires-resigning",
      });
      expect(JSON.parse(await readFile(join(output, "mind.json"), "utf8")).version).toBe("1.1.0");
      expect(JSON.parse(await readFile(join(output, "release.json"), "utf8")).version).toBe(
        "1.1.0",
      );
      expect(
        JSON.parse(await readFile(join(output, "promotion-record.json"), "utf8")),
      ).toMatchObject({
        packageId: "lmp:mind:baseline",
        version: "1.1.0",
      });
      await expect(
        promoteProposal(proposalPath, {
          source,
          version: "1.1.0",
          output: join(directory, "second"),
          promoter: "release-maintainer",
        }),
      ).rejects.toThrow(/must be accepted/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
