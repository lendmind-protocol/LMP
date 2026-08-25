import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { signMindPackage, verifyMindPackage } from "@lending-mind/core";
import { Command } from "commander";
import {
  evaluate,
  installPackage,
  instructions,
  listPackages,
  loadMind,
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
      await writeFile(
        path,
        `${JSON.stringify({ $schema: "https://lendingmind.dev/schemas/workspace-config-v1.json", version: 1, defaultMind: "lmp:skill:baseline", defaultMode: "advisory", excludedPaths: ["generated/**", "vendor/**"], commandPolicy: { allowPackageScripts: false, timeoutMs: 120000 }, artifactPolicy: { directory: ".lending-mind/artifacts", includeSourceCode: false, redactCommandOutput: true }, registry: { mode: "local", remoteEnabled: false } }, null, 2)}\n`,
      );
      if (options.installBaseline) {
        await mkdir(resolve(".lending-mind/skills"), { recursive: true });
        await cp(resolve("skills/baseline"), resolve(".lending-mind/skills/baseline"), {
          recursive: true,
          force: false,
          errorOnExist: false,
        });
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
      const artifact = await evaluate(
        await loadMind(options.mind),
        resolve(options.workspace),
        options.mode,
      );
      if (options.artifactDir)
        await writeJson(resolve(options.artifactDir, `${artifact.runId}.json`), artifact);
      options.json
        ? json(artifact)
        : console.log(
            `${artifact.summary.status}: ${artifact.summary.hardViolationCount} violation(s)`,
          );
      if (options.mode === "enforced" && artifact.summary.status === "fail")
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
      const proposal = {
        artifactId: source.runId ?? source.id,
        candidateChanges: [],
        rationale: "Human review required",
        benchmarkRequirements: [],
      };
      options.out ? await writeJson(resolve(options.out), proposal) : json(proposal);
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
