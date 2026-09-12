import { randomUUID } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rotateMindPackageKey, signMindPackage, verifyMindPackage } from "@lending-mind/sdk";
import { PromotionProposalSchema } from "@lending-mind/skill";
import { Command } from "commander";
import {
  activateMind,
  decideProposal,
  ensureGitignore,
  evaluate,
  installEnforcedHook,
  installPackage,
  instructions,
  listPackages,
  loadMind,
  promoteProposal,
  resolveMindPath,
  shareMind,
  submitProposal,
  validate,
  writeJson,
} from "./runtime.js";

export const EXIT = { ok: 0, policy: 1, usage: 2, runtime: 3 } as const;

function json(value: unknown) {
  console.log(JSON.stringify(value));
}

export function createProgram() {
  const program = new Command()
    .name("lmp")
    .description("Lending-Mind offline CLI")
    .version("0.1.0");
  program.exitOverride();
  program
    .command("init")
    .option("--force")
    .option("--install-baseline")
    .option("--baseline", "alias for --install-baseline")
    .option("--install-hooks")
    .action(async (options) => {
      const path = resolve(".lending-mind/config.json");
      if (!options.force) {
        try {
          await readFile(path);
          return;
        } catch {
          /* initialize */
        }
      }
      await mkdir(resolve(".lending-mind"), { recursive: true });
      await ensureGitignore();
      await writeFile(
        path,
        `${JSON.stringify({ $schema: "https://lmp-six.vercel.app/schema/workspace-config-v1.json", version: 1, defaultMind: "lmp:mind:baseline", defaultMode: "advisory", excludedPaths: ["generated/**", "vendor/**"], commandPolicy: { allowPackageScripts: false, timeoutMs: 120000 }, artifactPolicy: { directory: ".lending-mind/artifacts", includeSourceCode: false, redactCommandOutput: true }, registry: { mode: "local", remoteEnabled: false } }, null, 2)}\n`,
      );
      if (options.installBaseline || options.baseline) {
        await mkdir(resolve(".lending-mind/skills"), { recursive: true });
        await cp(
          fileURLToPath(new URL("../profiles/baseline", import.meta.url)),
          resolve(".lending-mind/skills/baseline"),
          {
            recursive: true,
            force: false,
            errorOnExist: false,
          },
        );
      }
      if (options.installHooks) {
        const hook = resolve(".git/hooks/pre-commit");
        if (!options.force) {
          try {
            await readFile(hook);
            throw new Error("hook exists; use --force");
          } catch (error) {
            if (error instanceof Error && error.message.includes("hook exists")) throw error;
          }
        }
        await writeFile(hook, "#!/bin/sh\nlmp evaluate --mode audit\n");
      }
    });
  const skill = program.command("skill");
  skill.command("validate <path>").action(async (path) => {
    const result = await validate(path);
    if (!result.valid)
      throw Object.assign(new Error(result.diagnostics.map((d) => d.message).join("; ")), {
        exitCode: EXIT.policy,
      });
    json(result);
  });
  skill
    .command("compile <path>")
    .option("--out <file>")
    .action(async (path, options) => {
      const result = await validate(path);
      if (!result.valid || !result.package) throw new Error("invalid mind package");
      const text = instructions(result.package, "json");
      options.out ? await writeFile(resolve(options.out), `${text}\n`) : console.log(text);
    });
  skill
    .command("sign <path>")
    .requiredOption("--private-key <path>")
    .action(async (path, options) => {
      json(await signMindPackage(resolve(path), resolve(options.privateKey)));
    });
  skill
    .command("rotate-key <path>")
    .requiredOption("--current-private-key <path>")
    .requiredOption("--output-key-dir <path>")
    .description("Rotate a verified package signer through an authenticated key handoff")
    .action(async (path, options) => {
      json(
        await rotateMindPackageKey(
          resolve(path),
          resolve(options.currentPrivateKey),
          resolve(options.outputKeyDir),
        ),
      );
    });
  skill
    .command("verify <path>")
    .option("--public-key <path>")
    .action(async (path, options) => {
      const result = await validate(path);
      json(
        result.valid
          ? await verifyMindPackage(
              resolve(path),
              options.publicKey ? resolve(options.publicKey) : undefined,
            )
          : { signatureStatus: "invalid", diagnostics: result.diagnostics },
      );
    });
  const registry = program.command("registry");
  registry.command("install <path>").action(async (path) => json(await installPackage(path)));
  program
    .command("use <mind>")
    .description("Activate a locally available Mind profile")
    .option("--json")
    .action(async (mind, options) => {
      const result = await activateMind(mind);
      options.json
        ? json(result)
        : console.log(`✨ Active profile shifted to ${result.id}@${result.version}`);
    });
  program
    .command("self-govern")
    .description(
      "Activate a profile, enforce it against this workspace, and optionally install the commit gate",
    )
    .option("--mind <mind>", "Profile to activate", "linux-kernel")
    .option("--workspace <path>", ".")
    .option("--artifact-dir <path>", ".lending-mind/artifacts")
    .option("--install-hook")
    .option("--json")
    .action(async (options) => {
      const workspace = resolve(options.workspace);
      const projectRoot = process.cwd();
      const activated = await activateMind(options.mind, projectRoot);
      const artifact = await evaluate(
        await loadMind(activated.path, projectRoot),
        workspace,
        "enforced",
        { artifactDir: options.artifactDir, mindPath: activated.path },
      );
      const hook = options.installHook
        ? await installEnforcedHook(projectRoot, options.mind)
        : undefined;
      const result = {
        profile: { id: activated.id, version: activated.version, path: activated.path },
        mode: "enforced",
        artifact,
        hook,
      };
      options.json ? json(result) : console.log(`${artifact.summary.status}: ${activated.id}`);
      if (["fail", "blocked", "error"].includes(artifact.summary.status))
        throw Object.assign(new Error("self-governance evaluation failed"), {
          exitCode: EXIT.policy,
        });
    });
  program
    .command("share <path>")
    .description("Sign a Mind package and prepare it for registry contribution")
    .option("--private-key <path>")
    .option("--out <directory>")
    .option("--json")
    .action(async (path, options) => {
      const result = await shareMind(path, { privateKey: options.privateKey, output: options.out });
      options.json
        ? json(result)
        : console.log(`✅ Signed ${result.digest}\n📦 ${result.nextStep}`);
    });
  registry.command("list").action(async () => json(await listPackages()));
  registry
    .command("pull <id>")
    .option("--version <version>")
    .action(async (id, options) => {
      const items = await listPackages();
      const found = items.find(
        (item) => item && item.id === id && (!options.version || item.version === options.version),
      );
      if (!found) throw new Error("mind package not found");
      json(found);
    });
  program
    .command("evaluate")
    .option("--mind <mind>")
    .option("--workspace <path>", ".")
    .option("--mode <mode>", "advisory")
    .option("--json")
    .option("--artifact-dir <path>")
    .option("--offline")
    .option("--run-commands")
    .action(async (options) => {
      if (options.runCommands && options.mode === "audit")
        throw Object.assign(new Error("audit never runs commands"), { exitCode: EXIT.usage });
      const mindPath = options.mind ? await resolveMindPath(options.mind) : undefined;
      const artifact = await evaluate(
        await loadMind(options.mind),
        resolve(options.workspace),
        options.mode,
        { artifactDir: options.artifactDir, runCommands: options.runCommands === true, mindPath },
      );
      options.json
        ? json(artifact)
        : console.log(
            `${artifact.summary.status}: ${artifact.summary.hardViolationCount} violation(s)`,
          );
      if (
        options.mode === "enforced" &&
        (artifact.summary.status === "fail" ||
          artifact.summary.status === "blocked" ||
          artifact.summary.status === "error")
      )
        throw Object.assign(new Error("enforced evaluation failed"), { exitCode: EXIT.policy });
    });
  program
    .command("agent")
    .command("instructions")
    .option("--mind <mind>")
    .option("--format <format>", "markdown")
    .action(async (options) =>
      console.log(instructions(await loadMind(options.mind), options.format)),
    );
  program.command("doctor").action(() =>
    json({
      node: process.version,
      supported: Number(process.versions.node.split(".")[0]) >= 22,
      offline: true,
    }),
  );
  const artifact = program.command("artifact");
  artifact
    .command("list")
    .option("--dir <dir>", ".lending-mind/artifacts")
    .action(async (options) => {
      try {
        const entries = await (await import("node:fs/promises")).readdir(resolve(options.dir));
        json(entries.filter((entry) => entry.endsWith(".json")));
      } catch {
        json([]);
      }
    });
  artifact
    .command("show <path>")
    .action(async (path) => json(JSON.parse(await readFile(resolve(path), "utf8"))));
  artifact
    .command("promote <path>")
    .option("--out <file>")
    .action(async (path, options) => {
      const source = JSON.parse(await readFile(resolve(path), "utf8"));
      const proposal = PromotionProposalSchema.parse({
        proposalId: `proposal-${randomUUID()}`,
        profileId: source.mind?.id ?? "unknown",
        profileVersion: source.mind?.version ?? "unknown",
        selectedArtifacts: [resolve(path)],
        candidateChanges: [],
        rationale:
          "Evidence selected for human review; no profile mutation is performed automatically.",
        expectedBenefit:
          "Use observed evaluation evidence to propose a versioned policy improvement.",
        falsePositiveRisk: "Requires fixture and benchmark review before acceptance.",
        requiredVersionBump: "minor",
        requiredTests: ["Add positive and negative fixtures for every candidate rule."],
        benchmarkPlan: ["Compare the current and proposed profile on identical pinned fixtures."],
        approver: null,
        status: "draft",
        createdAt: new Date().toISOString(),
      });
      options.out ? await writeJson(resolve(options.out), proposal) : json(proposal);
    });
  const proposal = program.command("proposal");
  proposal
    .command("submit <path>")
    .option("--json")
    .action(async (path, options) => {
      const result = await submitProposal(path);
      options.json ? json(result) : console.log(`📝 Submitted ${result.proposalId} for review`);
    });
  proposal
    .command("approve <path>")
    .requiredOption("--approver <id>")
    .requiredOption("--reason <reason>")
    .option("--json")
    .action(async (path, options) => {
      const result = await decideProposal(path, "accepted", options.approver, options.reason);
      options.json ? json(result) : console.log(`✅ Accepted ${result.proposalId}`);
    });
  proposal
    .command("reject <path>")
    .requiredOption("--approver <id>")
    .requiredOption("--reason <reason>")
    .option("--json")
    .action(async (path, options) => {
      const result = await decideProposal(path, "rejected", options.approver, options.reason);
      options.json ? json(result) : console.log(`⛔ Rejected ${result.proposalId}`);
    });
  proposal
    .command("promote <path>")
    .requiredOption("--source <directory>")
    .requiredOption("--version <version>")
    .requiredOption("--out <directory>")
    .requiredOption("--promoter <id>")
    .option("--json")
    .action(async (path, options) => {
      const result = await promoteProposal(path, {
        source: options.source,
        version: options.version,
        output: options.out,
        promoter: options.promoter,
      });
      options.json
        ? json(result)
        : console.log(`📦 Promoted ${result.packageId}@${result.version}; sign before publishing`);
    });
  return program;
}

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  if (Number(process.versions.node.split(".")[0]) < 22) {
    console.error("lmp requires Node.js 22 or newer");
    return EXIT.runtime;
  }
  try {
    await createProgram().parseAsync(["node", "lmp", ...argv]);
    return EXIT.ok;
  } catch (error) {
    const commanderUsage = error instanceof Error && error.name === "CommanderError";
    const code = commanderUsage
      ? EXIT.usage
      : typeof error === "object" && error && "exitCode" in error
        ? Number(error.exitCode)
        : EXIT.runtime;
    console.error(error instanceof Error ? error.message : String(error));
    return code;
  }
}
