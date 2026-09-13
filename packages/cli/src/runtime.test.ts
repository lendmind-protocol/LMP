import { chmod, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKeyPair } from "@lending-mind/sdk";
import { describe, expect, it } from "vitest";
import { createMediatedWriteAdapter, hostBoundarySupport } from "./host-boundaries.js";
import { runCli } from "./index.js";
import {
  activateMind,
  createEvaluatedMediatedWriteAdapter,
  decideProposal,
  ensureGitignore,
  evaluate,
  installEnforcedHook,
  installPackage,
  instructions,
  listPackages,
  loadMind,
  promoteProposal,
  resolveDefaultMode,
  shareMind,
  submitProposal,
} from "./runtime.js";

describe("CLI runtime", () => {
  it("blocks mediated writes unless authorization passes before persistence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-mediated-write-"));
    const target = join(directory, "change.ts");
    try {
      await writeFile(target, "const original = true;\n");
      let observed = "";
      const adapter = createMediatedWriteAdapter({
        workspaceRoot: directory,
        authorize: async (request) => {
          observed = await readFile(request.path, "utf8");
          return { status: "deny", reason: "policy finding" };
        },
      });
      await expect(
        adapter.write({ path: "change.ts", content: "const unsafe = true;\n" }),
      ).rejects.toThrow(/policy finding/);
      expect(observed).toBe("const original = true;\n");
      await expect(readFile(target, "utf8")).resolves.toBe("const original = true;\n");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails closed on authorization errors, path escapes, and symlinks", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-mediated-write-fail-closed-"));
    const outside = await mkdtemp(join(tmpdir(), "lmp-mediated-write-outside-"));
    try {
      const target = join(directory, "change.ts");
      await writeFile(target, "original\n");
      const failing = createMediatedWriteAdapter({
        workspaceRoot: directory,
        authorize: () => {
          throw new Error("evaluator unavailable");
        },
      });
      await expect(failing.write({ path: "change.ts", content: "new\n" })).rejects.toThrow(
        /failed closed/,
      );
      await expect(readFile(target, "utf8")).resolves.toBe("original\n");

      const outsideAdapter = createMediatedWriteAdapter({
        workspaceRoot: directory,
        authorize: () => ({ status: "pass" }),
      });
      await expect(
        outsideAdapter.write({ path: "../outside-write/x", content: "x" }),
      ).rejects.toThrow(/outside/);

      const link = join(directory, "link.ts");
      await import("node:fs/promises").then(({ symlink }) => symlink(target, link));
      await expect(failing.write({ path: "link.ts", content: "changed\n" })).rejects.toThrow(
        /symbolic-link/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("commits a mediated write atomically only after an exact pass", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-mediated-write-pass-"));
    try {
      const adapter = createMediatedWriteAdapter({
        workspaceRoot: directory,
        authorize: (request) => ({
          status: request.content.toString().includes("approved") ? "pass" : "deny",
        }),
      });
      await expect(
        adapter.write({ path: "new.ts", content: "approved\n" }),
      ).resolves.toBeUndefined();
      await expect(readFile(join(directory, "new.ts"), "utf8")).resolves.toBe("approved\n");
      await expect(adapter.write({ path: "new.ts", content: "rejected\n" })).rejects.toThrow(
        /authorization did not pass/,
      );
      await expect(readFile(join(directory, "new.ts"), "utf8")).resolves.toBe("approved\n");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reports supported boundaries without claiming unsupported host interception", () => {
    expect(hostBoundarySupport("git")).toMatchObject({
      supported: true,
      boundary: "git-pre-commit",
    });
    expect(hostBoundarySupport("mediated-write")).toMatchObject({
      supported: true,
      boundary: "mediated-write",
    });
    expect(hostBoundarySupport("editor-filesystem")).toMatchObject({
      supported: false,
      boundary: null,
    });
  });

  it("evaluates a candidate snapshot before committing an agent write", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-evaluated-write-"));
    const evaluator = join(directory, "fake-lmp");
    const previous = process.env.LMP_RUST_BIN;
    try {
      await writeFile(join(directory, "existing.ts"), "original\n");
      await writeFile(
        evaluator,
        `#!/bin/sh
workspace=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--workspace" ]; then workspace="$2"; shift 2; else shift; fi
done
if grep -q approved "$workspace/change.ts"; then
  printf '%s\\n' '{"summary":{"status":"pass","hardViolationCount":0}}'
else
  printf '%s\\n' '{"summary":{"status":"needs_revision","hardViolationCount":1}}'
fi
`,
      );
      await chmod(evaluator, 0o755);
      process.env.LMP_RUST_BIN = evaluator;
      const adapter = createEvaluatedMediatedWriteAdapter({
        workspaceRoot: directory,
        mind: { id: "lmp:mind:test", version: "1", rules: [] },
        mindPath: directory,
      });
      await expect(
        adapter.write({ path: "change.ts", content: "approved\n" }),
      ).resolves.toBeUndefined();
      await expect(readFile(join(directory, "change.ts"), "utf8")).resolves.toBe("approved\n");
      await expect(adapter.write({ path: "change.ts", content: "rejected\n" })).rejects.toThrow(
        /evaluator returned needs_revision/,
      );
      await expect(readFile(join(directory, "change.ts"), "utf8")).resolves.toBe("approved\n");
    } finally {
      if (previous === undefined) process.env.LMP_RUST_BIN = undefined;
      else process.env.LMP_RUST_BIN = previous;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("exposes the enforced agent write command as a process boundary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-agent-write-command-"));
    const originalCwd = process.cwd();
    const previous = process.env.LMP_RUST_BIN;
    try {
      const mindPath = join(directory, "mind.json");
      const evaluator = join(directory, "fake-lmp");
      await writeFile(mindPath, JSON.stringify({ id: "lmp:mind:test", version: "1", rules: [] }));
      await writeFile(
        evaluator,
        '#!/bin/sh\nprintf \'%s\\n\' \'{"summary":{"status":"pass","hardViolationCount":0}}\'\n',
      );
      await chmod(evaluator, 0o755);
      process.env.LMP_RUST_BIN = evaluator;
      process.chdir(directory);
      expect(
        await runCli([
          "agent",
          "write",
          "change.ts",
          "--mind",
          mindPath,
          "--workspace",
          directory,
          "--content",
          "approved\n",
        ]),
      ).toBe(0);
      await expect(readFile(join(directory, "change.ts"), "utf8")).resolves.toBe("approved\n");
    } finally {
      process.chdir(originalCwd);
      if (previous === undefined) process.env.LMP_RUST_BIN = undefined;
      else process.env.LMP_RUST_BIN = previous;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not turn a rejected Rust evaluation into a successful runtime result", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-cli-runtime-exit-"));
    const evaluator = join(directory, "fake-lmp");
    const previous = process.env.LMP_RUST_BIN;
    try {
      await writeFile(evaluator, "#!/bin/sh\nprintf 'runtime failed\\n' >&2\nexit 1\n");
      await chmod(evaluator, 0o755);
      process.env.LMP_RUST_BIN = evaluator;
      await expect(
        evaluate({ id: "lmp:mind:test", version: "1", rules: [] }, directory, "enforced", {
          mindPath: directory,
        }),
      ).rejects.toThrow(/runtime failed/);
    } finally {
      if (previous === undefined) process.env.LMP_RUST_BIN = undefined;
      else process.env.LMP_RUST_BIN = previous;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects even when a failed evaluator emitted a JSON artifact", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-cli-runtime-json-exit-"));
    const evaluator = join(directory, "fake-lmp");
    const previous = process.env.LMP_RUST_BIN;
    try {
      await writeFile(
        evaluator,
        '#!/bin/sh\nprintf \'{"summary":{"status":"needs_revision"}}\\n\'\nexit 1\n',
      );
      await chmod(evaluator, 0o755);
      process.env.LMP_RUST_BIN = evaluator;
      await expect(
        evaluate({ id: "lmp:mind:test", version: "1", rules: [] }, directory, "enforced", {
          mindPath: directory,
        }),
      ).rejects.toThrow(/Rust evaluator exited with code 1/);
    } finally {
      if (previous === undefined) process.env.LMP_RUST_BIN = undefined;
      else process.env.LMP_RUST_BIN = previous;
      await rm(directory, { recursive: true, force: true });
    }
  });

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

  it("honors the configured evaluation mode and defaults safely without configuration", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-cli-default-mode-"));
    try {
      await expect(resolveDefaultMode(directory)).resolves.toBe("advisory");
      await mkdir(join(directory, ".lending-mind"), { recursive: true });
      await writeFile(
        join(directory, ".lending-mind/config.json"),
        JSON.stringify({ defaultMode: "enforced" }),
      );
      await expect(resolveDefaultMode(directory)).resolves.toBe("enforced");
      await writeFile(
        join(directory, ".lending-mind/config.json"),
        JSON.stringify({ defaultMode: "audit" }),
      );
      await expect(resolveDefaultMode(directory)).resolves.toBe("audit");
    } finally {
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

  it("installs enforced onboarding by default in a Git workspace", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-cli-enforced-init-"));
    const originalCwd = process.cwd();
    try {
      process.chdir(directory);
      await mkdir(join(directory, ".git"), { recursive: true });
      expect(await runCli(["init", "--install-baseline"])).toBe(0);
      await expect(
        readFile(join(directory, ".git", "hooks", "pre-commit"), "utf8"),
      ).resolves.toContain("self-govern --mind baseline");
      await expect(
        readFile(join(directory, ".lending-mind", "config.json"), "utf8"),
      ).resolves.toContain('"defaultMode": "enforced"');
    } finally {
      process.chdir(originalCwd);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("installs an executable enforced self-governance hook", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-cli-self-governance-"));
    try {
      await mkdir(join(directory, ".git"), { recursive: true });
      const hook = await installEnforcedHook(directory);
      const hookContents = await readFile(hook, "utf8");
      expect(hookContents).toContain('root="$(git rev-parse --show-toplevel)"');
      expect(hookContents).toContain('exec node "$root/packages/lmp/bin.ts"');
      expect(hookContents).toContain("self-govern --mind linux-kernel --workspace .");
      expect((await stat(hook)).mode & 0o111).not.toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("refuses to overwrite an existing non-LMP pre-commit hook", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-cli-hook-conflict-"));
    try {
      const hook = join(directory, ".git/hooks/pre-commit");
      await mkdir(join(directory, ".git/hooks"), { recursive: true });
      await writeFile(hook, "#!/bin/sh\necho existing\n");
      await expect(installEnforcedHook(directory)).rejects.toThrow("existing non-LMP");
      await expect(readFile(hook, "utf8")).resolves.toContain("echo existing");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps a generated enforced hook aligned when the active Mind changes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-cli-mind-switch-"));
    const originalCwd = process.cwd();
    try {
      process.chdir(directory);
      await mkdir(join(directory, ".git", "hooks"), { recursive: true });
      await writeFile(
        join(directory, ".lending-mind", "config.json"),
        JSON.stringify({
          version: 1,
          defaultMode: "enforced",
          enforcementBoundary: "git-pre-commit",
        }),
      ).catch(async () => {
        await mkdir(join(directory, ".lending-mind"), { recursive: true });
        await writeFile(
          join(directory, ".lending-mind", "config.json"),
          JSON.stringify({
            version: 1,
            defaultMode: "enforced",
            enforcementBoundary: "git-pre-commit",
          }),
        );
      });
      await installEnforcedHook(directory, "baseline");
      const profile = join(directory, "mind");
      await mkdir(profile, { recursive: true });
      await writeFile(
        join(profile, "mind.json"),
        JSON.stringify({ id: "lmp:mind:next", version: "1.0.0", rules: [] }),
      );
      await activateMind(profile, directory);
      await expect(readFile(join(directory, ".git/hooks/pre-commit"), "utf8")).resolves.toContain(
        "self-govern --mind next",
      );
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
      await cp(join(process.cwd(), "..", "..", "profiles", "baseline"), source, {
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
