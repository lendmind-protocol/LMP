import { spawn } from "node:child_process";
import { createPrivateKey, createPublicKey } from "node:crypto";
import {
  access,
  appendFile,
  chmod,
  cp,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  type MindPackage,
  computePackageDigest,
  createKeyPair,
  sha256,
  signMindPackage,
  verifyMindPackage,
} from "@lending-mind/sdk";
import {
  EvaluationArtifactSchema,
  MindPackageSchema,
  PromotionProposalSchema,
  PromotionRecordSchema,
  validateMindPackage,
} from "@lending-mind/skill";
type PromotionProposal = {
  proposalId: string;
  profileId: string;
  profileVersion: string;
  selectedArtifacts: string[];
  candidateChanges: unknown[];
  rationale: string;
  expectedBenefit: string;
  falsePositiveRisk: string;
  requiredVersionBump: "patch" | "minor" | "major";
  requiredTests: string[];
  benchmarkPlan: string[];
  approver: string | null;
  status: "draft" | "under-review" | "accepted" | "rejected" | "superseded";
  createdAt: string;
  decisionReason?: string;
};

export type Mode = "advisory" | "enforced" | "audit";
type RuntimeArtifact = {
  runId: string;
  summary: {
    status: string;
    hardViolationCount: number;
    warningCount?: number;
    informationalCount?: number;
  };
  [key: string]: unknown;
};
export const root = (cwd = process.cwd()) => join(cwd, ".lending-mind");
export const registryRoot = (cwd = process.cwd()) => join(root(cwd), "registry");
export const proposalRoot = (cwd = process.cwd()) => join(root(cwd), "proposals");

const gitignoreBlock = `# Lending-Mind Protocol local state (generated; do not commit)
.lending-mind/
.lmp_telemetry/
lmp_test_bed/
.lmp-qualification-docker/
private-key.pem
*.private.pem
`;

export async function ensureGitignore(cwd = process.cwd()): Promise<boolean> {
  const path = join(cwd, ".gitignore");
  let current = "";
  try {
    current = await readFile(path, "utf8");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const lines = current.split(/\r?\n/);
  const required = gitignoreBlock
    .trimEnd()
    .split("\n")
    .filter((entry) => !entry.startsWith("# "));
  if (required.every((entry) => lines.includes(entry))) return false;
  const prefix = current && !current.endsWith("\n") ? `${current}\n` : current;
  await writeFile(path, `${prefix}${prefix ? "\n" : ""}${gitignoreBlock}`);
  return true;
}

export async function loadMind(
  input: string | undefined,
  cwd = process.cwd(),
): Promise<MindPackage> {
  const candidate = await resolveMindInputPath(input, cwd);
  const value = JSON.parse(await readFile(candidate, "utf8"));
  return MindPackageSchema.parse(value) as MindPackage;
}

async function resolveMindInputPath(input: string | undefined, cwd: string): Promise<string> {
  let selected = input;
  if (!selected) {
    try {
      const config = JSON.parse(
        await readFile(resolve(cwd, ".lending-mind/config.json"), "utf8"),
      ) as { defaultMind?: string };
      selected = config.defaultMind;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  if (selected?.startsWith("lmp:")) {
    const packagePath = await resolveMindPath(selected, cwd);
    return (await stat(packagePath)).isDirectory() ? join(packagePath, "mind.json") : packagePath;
  }
  const resolved = resolve(cwd, selected ?? join("profiles", "baseline", "mind.json"));
  try {
    return (await stat(resolved)).isDirectory() ? join(resolved, "mind.json") : resolved;
  } catch {
    return resolved;
  }
}

export async function resolveMindPath(id: string, cwd = process.cwd()): Promise<string> {
  const alias = id.split(":").pop() ?? id;
  const candidates = [
    resolve(cwd, id),
    resolve(cwd, "profiles", id),
    resolve(cwd, "profiles", alias),
    resolve(cwd, "registry", "definitions", id),
    resolve(cwd, "registry", "definitions", `${id}.json`),
    resolve(cwd, "packages", "create-lmp", "profiles", id),
    resolve(cwd, "packages", "create-lmp", "profiles", alias),
    resolve(cwd, ".lending-mind", "skills", id),
    resolve(cwd, ".lending-mind", "skills", alias),
    resolve(cwd, ".lending-mind", "registry", id),
    resolve(cwd, ".lending-mind", "registry", id.replaceAll(":", "%3A")),
  ];
  for (const candidate of candidates) {
    try {
      const candidateType = await stat(candidate);
      if (candidateType.isDirectory()) {
        await access(join(candidate, "mind.json"));
      }
      return candidate;
    } catch {
      /* continue through local registry locations and ignore non-profile directories */
    }
  }
  throw new Error(`mind profile '${id}' was not found in the local registry`);
}

export function digestMind(mind: MindPackage): string {
  return sha256(mind as unknown as Parameters<typeof sha256>[0]);
}

export async function validate(path: string) {
  return validateMindPackage(resolve(path));
}

export function instructions(mind: MindPackage, format: "markdown" | "json" = "markdown") {
  const result = {
    mind: mind.id,
    version: mind.version,
    checklist: [
      "Follow the mind package guidance.",
      "Run the relevant checks before reporting completion.",
      "Keep changes minimal and reviewable.",
    ],
  };
  return format === "json"
    ? JSON.stringify(result, null, 2)
    : `# ${mind.name ?? mind.id}\n\n- ${result.checklist.join("\n- ")}`;
}

export async function evaluate(
  mind: MindPackage,
  workspace: string,
  mode: Mode,
  options: { artifactDir?: string; runCommands?: boolean; mindPath?: string } = {},
): Promise<RuntimeArtifact> {
  const candidates = [
    process.env.LMP_RUST_BIN,
    resolve(process.cwd(), "target/debug/lmp"),
    resolve(process.cwd(), "target/release/lmp"),
  ].filter((value): value is string => Boolean(value));
  let binary: string | undefined;
  for (const candidate of candidates) {
    try {
      await access(candidate);
      binary = candidate;
      break;
    } catch {
      /* try the next Rust build */
    }
  }
  if (!binary)
    throw new Error("Rust LMP runtime not found; build the workspace or set LMP_RUST_BIN");
  const mindPath = options.mindPath ?? (await resolveMindPath(mind.id));
  const args = [
    "evaluate",
    "--mind",
    resolve(mindPath),
    "--workspace",
    resolve(workspace),
    "--mode",
    mode,
    "--json",
  ];
  if (options.artifactDir) args.push("--artifact-dir", resolve(options.artifactDir));
  const output = await new Promise<string>((resolveOutput, reject) => {
    const child = spawn(binary, args, { cwd: process.cwd(), shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && !stdout.trim()) {
        const detail = stderr.trim();
        reject(
          new Error(
            detail
              ? `${detail} (Rust evaluator exited with code ${code})`
              : `Rust evaluator exited with code ${code}`,
          ),
        );
        return;
      }
      resolveOutput(stdout);
    });
  });
  return JSON.parse(output) as RuntimeArtifact;
}

export { computePackageDigest, signMindPackage, verifyMindPackage };

export async function installPackage(path: string, cwd = process.cwd()) {
  const result = await validate(path);
  if (!result.valid || !result.package)
    throw new Error(result.diagnostics.map((d) => `${d.path}: ${d.message}`).join("; "));
  const destination = join(
    registryRoot(cwd),
    encodeURIComponent(result.package.id),
    result.package.version,
  );
  await mkdir(destination, { recursive: true });
  await cp(resolve(path), destination, { recursive: true, force: false, errorOnExist: false });
  return {
    id: result.package.id,
    version: result.package.version,
    digest: digestMind(result.package),
    path: destination,
  };
}

export async function activateMind(id: string, cwd = process.cwd()) {
  const source = await resolveMindPath(id, cwd);
  const installed = await installPackage(source, cwd);
  const configPath = join(root(cwd), "config.json");
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
  } catch {
    /* create a compatible config for projects that have not run init */
  }
  config.version ??= 1;
  config.defaultMode ??= "advisory";
  config.defaultMind = installed.path;
  config.defaultMindId = installed.id;
  await mkdir(root(cwd), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return installed;
}

export async function installEnforcedHook(
  cwd = process.cwd(),
  mind = "linux-kernel",
): Promise<string> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(mind))
    throw new Error("self-governance mind must be a kebab-case profile name");
  const gitDirectory = join(cwd, ".git");
  try {
    await stat(gitDirectory);
  } catch {
    throw new Error(`cannot install self-governance hook: ${gitDirectory} is missing`);
  }
  const hook = join(gitDirectory, "hooks", "pre-commit");
  await mkdir(join(gitDirectory, "hooks"), { recursive: true });
  await writeFile(
    hook,
    `#!/bin/sh
set -eu
root="$(git rev-parse --show-toplevel)"
if [ -f "$root/packages/lmp/bin.ts" ]; then
exec node "$root/packages/lmp/bin.ts" self-govern --mind ${mind} --workspace . --artifact-dir .lending-mind/artifacts
fi
exec npx --no-install lmp self-govern --mind ${mind} --workspace . --artifact-dir .lending-mind/artifacts
`,
  );
  await chmod(hook, 0o755);
  return hook;
}

export async function shareMind(
  path: string,
  options: { privateKey?: string; output?: string } = {},
) {
  const source = resolve(path);
  const destination = resolve(options.output ?? path);
  if (destination !== source) await cp(source, destination, { recursive: true, force: false });
  const privateKey =
    options.privateKey ?? join(process.cwd(), ".lmp_telemetry", "crypto_vault", "private-key.pem");
  try {
    await access(privateKey);
  } catch {
    await createKeyPair(join(process.cwd(), ".lmp_telemetry", "crypto_vault"));
  }
  const signed = await signMindPackage(destination, privateKey);
  const publicKey = createPublicKey(createPrivateKey(await readFile(privateKey))).export({
    type: "spki",
    format: "pem",
  });
  await writeFile(join(destination, "signatures", "public-key.pem"), publicKey);
  return {
    path: destination,
    digest: signed.digest,
    signatureStatus: "verified",
    remoteStatus: "not-configured",
    nextStep: "Submit the signed package in a pull request to the community registry.",
  };
}

export async function listPackages(cwd = process.cwd()) {
  try {
    const ids = await readdir(registryRoot(cwd));
    return (
      await Promise.all(
        ids.map(async (id) => {
          const versions = await readdir(join(registryRoot(cwd), id));
          return Promise.all(
            versions.map(async (version) => {
              const result = await validate(join(registryRoot(cwd), id, version));
              if (!result.package) return undefined;
              const signature = await verifyMindPackage(join(registryRoot(cwd), id, version));
              return {
                id: result.package.id,
                version,
                digest: digestMind(result.package),
                signatureStatus: signature.signatureStatus,
                installedAt: null,
                provenance: "local",
              };
            }),
          );
        }),
      )
    )
      .flat()
      .filter(Boolean);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

export async function writeJson(path: string, value: unknown) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

const proposalTransitions: Record<PromotionProposal["status"], PromotionProposal["status"][]> = {
  draft: ["under-review"],
  "under-review": ["accepted", "rejected"],
  accepted: ["superseded"],
  rejected: [],
  superseded: [],
};

async function readProposal(path: string): Promise<PromotionProposal> {
  return PromotionProposalSchema.parse(
    JSON.parse(await readFile(resolve(path), "utf8")),
  ) as PromotionProposal;
}

async function assertPromotionEvidence(proposal: PromotionProposal, proposalPath: string) {
  if (!proposal.expectedBenefit.trim())
    throw new Error("accepted proposals require a non-empty expectedBenefit");
  if (!proposal.falsePositiveRisk.trim())
    throw new Error("accepted proposals require a non-empty falsePositiveRisk");
  if (proposal.candidateChanges.length === 0)
    throw new Error("accepted proposals must contain at least one candidate change");
  if (proposal.requiredTests.length === 0 || proposal.requiredTests.some((test) => !test.trim()))
    throw new Error("accepted proposals require non-empty requiredTests");
  if (proposal.benchmarkPlan.length === 0 || proposal.benchmarkPlan.some((step) => !step.trim()))
    throw new Error("accepted proposals require a non-empty benchmarkPlan");

  const proposalDirectory = resolve(proposalPath, "..");
  for (const selectedArtifact of proposal.selectedArtifacts) {
    if (
      isAbsolute(selectedArtifact) ||
      /^[A-Za-z]:[\\/]/.test(selectedArtifact) ||
      selectedArtifact.startsWith("\\\\") ||
      selectedArtifact.split(/[\\/]/).some((part) => part === "..")
    ) {
      throw new Error(
        `selected evidence must stay inside the proposal directory: ${selectedArtifact}`,
      );
    }
    const artifactPath = resolve(proposalDirectory, selectedArtifact);
    const relativeArtifactPath = relative(proposalDirectory, artifactPath);
    if (
      relativeArtifactPath === ".." ||
      relativeArtifactPath.startsWith(`..${sep}`) ||
      isAbsolute(relativeArtifactPath)
    ) {
      throw new Error(
        `selected evidence must stay inside the proposal directory: ${selectedArtifact}`,
      );
    }
    const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as unknown;
    const parsed = EvaluationArtifactSchema.safeParse(artifact);
    if (!parsed.success)
      throw new Error(`selected evidence is not a valid evaluation artifact: ${selectedArtifact}`);
    if (
      parsed.data.mind.id !== proposal.profileId ||
      parsed.data.mind.version !== proposal.profileVersion
    )
      throw new Error(
        `selected evidence does not match ${proposal.profileId}@${proposal.profileVersion}`,
      );
    if (parsed.data.state === "blocked" || parsed.data.state === "evaluation_error")
      throw new Error(`selected evidence cannot be ${parsed.data.state}: ${selectedArtifact}`);
    await stat(artifactPath);
  }
}

async function appendProposalAudit(path: string, event: Record<string, unknown>) {
  await appendFile(`${resolve(path)}.audit.jsonl`, `${JSON.stringify(event)}\n`, { flag: "a" });
}

function releaseVersion(value: string): [number, number, number] {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) throw new Error(`invalid release version: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isLaterReleaseVersion(candidate: string, current: string): boolean {
  const next = releaseVersion(candidate);
  const previous = releaseVersion(current);
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] !== previous[index]) return next[index] > previous[index];
  }
  return false;
}

function satisfiesVersionBump(
  candidate: string,
  current: string,
  required: PromotionProposal["requiredVersionBump"],
): boolean {
  const next = releaseVersion(candidate);
  const previous = releaseVersion(current);
  if (required === "major") return next[0] > previous[0];
  if (required === "minor") return next[0] === previous[0] && next[1] > previous[1];
  return next[0] === previous[0] && next[1] === previous[1] && next[2] > previous[2];
}

export async function promoteProposal(
  path: string,
  options: { source: string; version: string; output: string; promoter: string },
) {
  if (!options.promoter.trim()) throw new Error("promoter is required");
  const proposalPath = resolve(path);
  const proposal = await readProposal(proposalPath);
  if (proposal.status !== "accepted")
    throw new Error(`proposal ${proposal.proposalId} must be accepted before promotion`);
  if (!isLaterReleaseVersion(options.version, proposal.profileVersion))
    throw new Error(
      `promotion version ${options.version} must be greater than ${proposal.profileVersion}`,
    );
  if (!satisfiesVersionBump(options.version, proposal.profileVersion, proposal.requiredVersionBump))
    throw new Error(
      `promotion version ${options.version} does not satisfy the required ${proposal.requiredVersionBump} version bump`,
    );

  const source = resolve(options.source);
  const validation = await validateMindPackage(source);
  if (!validation.valid || !validation.package)
    throw new Error(validation.diagnostics.map((diagnostic) => diagnostic.message).join("; "));
  if (
    validation.package.id !== proposal.profileId ||
    validation.package.version !== proposal.profileVersion
  ) {
    throw new Error(`promotion source must be ${proposal.profileId}@${proposal.profileVersion}`);
  }

  const output = resolve(options.output);
  try {
    await access(output);
    throw new Error(`promotion output already exists: ${output}`);
  } catch (error) {
    if (error instanceof Error && !error.message.startsWith("promotion output already exists:")) {
      const code = "code" in error ? error.code : undefined;
      if (code !== "ENOENT") throw error;
    } else if (error instanceof Error) {
      throw error;
    }
  }

  await cp(source, output, {
    recursive: true,
    errorOnExist: true,
    force: false,
    filter: (candidate) => {
      const parts = candidate.split(sep);
      return !parts.includes("signatures") && !candidate.endsWith(".sig");
    },
  });
  const mindPath = join(output, "mind.json");
  const promotedMind = JSON.parse(await readFile(mindPath, "utf8")) as Record<string, unknown>;
  promotedMind.version = options.version;
  await writeFile(mindPath, `${JSON.stringify(promotedMind, null, 2)}\n`);
  const releasePath = join(output, "release.json");
  const releaseMetadata = JSON.parse(await readFile(releasePath, "utf8")) as Record<
    string,
    unknown
  >;
  releaseMetadata.version = options.version;
  await writeFile(releasePath, `${JSON.stringify(releaseMetadata, null, 2)}\n`);
  const promotedValidation = await validateMindPackage(output);
  if (!promotedValidation.valid || !promotedValidation.package)
    throw new Error(
      promotedValidation.diagnostics.map((diagnostic) => diagnostic.message).join("; "),
    );
  const record = PromotionRecordSchema.parse({
    packageId: proposal.profileId,
    version: options.version,
    digest: digestMind(promotedValidation.package),
    from: proposal.profileVersion,
    to: options.version,
    promotedAt: new Date().toISOString(),
    promotedBy: options.promoter.trim(),
    reason: proposal.decisionReason ?? proposal.rationale,
  });
  await writeJson(join(output, "promotion-record.json"), record);
  await writeJson(
    proposalPath,
    PromotionProposalSchema.parse({
      ...proposal,
      status: "superseded",
      decisionReason: `${proposal.decisionReason ?? proposal.rationale} (promoted to ${options.version})`,
    }),
  );
  await appendProposalAudit(proposalPath, {
    event: "promoted",
    proposalId: proposal.proposalId,
    status: proposal.status,
    actor: options.promoter.trim(),
    from: proposal.profileVersion,
    to: options.version,
    output,
    at: new Date().toISOString(),
  });
  return {
    ...record,
    path: output,
    signatureStatus: "requires-resigning" as const,
    nextStep: "Sign the new package before submitting it to a trusted registry.",
  };
}

export async function submitProposal(path: string, cwd = process.cwd()) {
  const proposal = await readProposal(path);
  const proposalPath = resolve(path);
  if (!proposalTransitions[proposal.status].includes("under-review")) {
    throw new Error(`proposal ${proposal.proposalId} cannot be submitted from ${proposal.status}`);
  }
  const next = PromotionProposalSchema.parse({
    ...proposal,
    status: "under-review",
    approver: null,
  }) as PromotionProposal;
  await writeJson(proposalPath, next);
  await appendProposalAudit(proposalPath, {
    event: "submitted",
    proposalId: next.proposalId,
    status: next.status,
    actor: "local-cli",
    at: new Date().toISOString(),
  });
  return { ...next, path: proposalPath, auditPath: `${proposalPath}.audit.jsonl`, cwd };
}

export async function decideProposal(
  path: string,
  decision: "accepted" | "rejected",
  approver: string,
  reason: string,
) {
  if (!approver.trim()) throw new Error("approver is required");
  if (!reason.trim()) throw new Error("decision reason is required");
  const proposal = await readProposal(path);
  if (!proposalTransitions[proposal.status].includes(decision)) {
    throw new Error(
      `proposal ${proposal.proposalId} cannot transition from ${proposal.status} to ${decision}`,
    );
  }
  if (decision === "accepted") await assertPromotionEvidence(proposal, resolve(path));
  const next = PromotionProposalSchema.parse({
    ...proposal,
    status: decision,
    approver: approver.trim(),
    decisionReason: reason.trim(),
  }) as PromotionProposal;
  await writeJson(resolve(path), next);
  await appendProposalAudit(resolve(path), {
    event: decision,
    proposalId: next.proposalId,
    status: next.status,
    actor: next.approver,
    reason: next.decisionReason,
    at: new Date().toISOString(),
  });
  return { ...next, path: resolve(path), auditPath: `${resolve(path)}.audit.jsonl` };
}
