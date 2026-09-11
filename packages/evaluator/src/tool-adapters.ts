import { spawn } from "node:child_process";
import { access, readFile, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { type RuleResult, redactText } from "@lending-mind/sdk";

export type ToolAdapterId =
  | "typescript"
  | "biome"
  | "eslint"
  | "semgrep"
  | "codeql"
  | "opa"
  | "docker";

export interface ToolDetection {
  adapterId: ToolAdapterId;
  configured: boolean;
  installed: boolean;
  executable: string | null;
  capabilities: string[];
  reason: string;
}

export interface ToolPlan {
  adapterId: ToolAdapterId;
  command: string[];
  cwd: string;
  capabilities: string[];
  detection: ToolDetection;
}

export interface ToolExecutionResult {
  adapterId: ToolAdapterId;
  command: string[];
  allowed: boolean;
  exitCode: number | null;
  timedOut: boolean;
  output: string;
}

type AdapterDefinition = {
  id: ToolAdapterId;
  executable: string;
  capabilities: string[];
  configured: (files: Set<string>, packageJson: Record<string, unknown>) => boolean;
  command: (files: Set<string>) => string[] | null;
};

const DEFAULT_TOOL_TIMEOUT_MS = 120_000;
const MAX_TOOL_TIMEOUT_MS = 120_000;

/**
 * Do not expose the evaluator host's complete environment to repository tools.
 * Tool execution is explicitly authorized, but inherited credentials and
 * provider tokens are still outside the tool's workspace contract.
 */
export function createSanitizedToolEnvironment(
  extra: Record<string, string> = {},
): Record<string, string> {
  const allowedKeys = [
    "PATH",
    "Path",
    "PATHEXT",
    "SYSTEMROOT",
    "SYSTEMDRIVE",
    "TEMP",
    "TMP",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "CI",
  ];
  const environment: Record<string, string> = {};
  for (const key of allowedKeys) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  environment.NO_COLOR = "1";
  return { ...environment, ...extra };
}

const packageNames = (packageJson: Record<string, unknown>) =>
  new Set(
    Object.keys({
      ...(packageJson.dependencies as Record<string, unknown> | undefined),
      ...(packageJson.devDependencies as Record<string, unknown> | undefined),
    }),
  );

const definitions: AdapterDefinition[] = [
  {
    id: "typescript",
    executable: "tsc",
    capabilities: ["typecheck", "typescript-ast"],
    configured: (files, packageJson) =>
      files.has("tsconfig.json") || packageNames(packageJson).has("typescript"),
    command: (files) => (files.has("tsconfig.json") ? ["tsc", "--noEmit"] : null),
  },
  {
    id: "biome",
    executable: "biome",
    capabilities: ["lint", "format"],
    configured: (files, packageJson) =>
      [...files].some((file) => file === "biome.json" || file === "biome.jsonc") ||
      packageNames(packageJson).has("@biomejs/biome"),
    command: (files) =>
      [...files].some((file) => file === "biome.json" || file === "biome.jsonc")
        ? ["biome", "check", "."]
        : null,
  },
  {
    id: "eslint",
    executable: "eslint",
    capabilities: ["lint"],
    configured: (files, packageJson) =>
      [...files].some(
        (file) =>
          file.startsWith("eslint.config.") ||
          file === ".eslintrc" ||
          file.startsWith(".eslintrc."),
      ) || packageNames(packageJson).has("eslint"),
    command: (files) =>
      [...files].some(
        (file) =>
          file.startsWith("eslint.config.") ||
          file === ".eslintrc" ||
          file.startsWith(".eslintrc."),
      )
        ? ["eslint", "."]
        : null,
  },
  {
    id: "semgrep",
    executable: "semgrep",
    capabilities: ["security", "pattern-analysis"],
    configured: (files) =>
      [...files].some((file) => file === ".semgrep.yml" || file === ".semgrep/semgrep.yml"),
    command: (files) => {
      const config = [...files].find(
        (file) => file === ".semgrep.yml" || file === ".semgrep/semgrep.yml",
      );
      return config ? ["semgrep", "scan", "--config", config, "."] : null;
    },
  },
  {
    id: "codeql",
    executable: "codeql",
    capabilities: ["security", "dataflow"],
    configured: (files) => [...files].some((file) => file.startsWith(".github/codeql/")),
    command: () => null,
  },
  {
    id: "opa",
    executable: "opa",
    capabilities: ["policy", "authorization"],
    configured: (files) => [...files].some((file) => file.endsWith(".rego")),
    command: () => null,
  },
  {
    id: "docker",
    executable: "docker",
    capabilities: ["sandbox", "isolated-execution"],
    configured: (files) => files.has("Dockerfile") || files.has("orchestrator/Dockerfile"),
    command: () => null,
  },
];

async function readWorkspaceShape(directory: string) {
  const packageJson: Record<string, unknown> = await readFile(
    join(directory, "package.json"),
    "utf8",
  )
    .then((value) => JSON.parse(value) as Record<string, unknown>)
    .catch(() => ({}));
  const files = new Set<string>();
  for (const candidate of [
    "tsconfig.json",
    "biome.json",
    "biome.jsonc",
    "eslint.config.js",
    "eslint.config.mjs",
    ".eslintrc",
    ".eslintrc.json",
    ".eslintrc.js",
    ".semgrep.yml",
    ".semgrep/semgrep.yml",
    "Dockerfile",
    "orchestrator/Dockerfile",
    ".github/codeql/config.yml",
    "policy.rego",
  ]) {
    if (
      await access(join(directory, candidate))
        .then(() => true)
        .catch(() => false)
    )
      files.add(candidate);
  }
  return { files, packageJson };
}

async function executableOnPath(executable: string, directory: string) {
  const local = join(directory, "node_modules", ".bin", executable);
  if (
    await access(local)
      .then(() => true)
      .catch(() => false)
  )
    return local;
  const search = process.platform === "win32" ? "where" : "which";
  return await new Promise<string | null>((resolve) => {
    const child = spawn(search, [executable], {
      cwd: directory,
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("close", (code) =>
      resolve(code === 0 ? output.trim().split(/\r?\n/)[0] || null : null),
    );
    child.on("error", () => resolve(null));
  });
}

export async function detectToolAdapters(directory: string): Promise<ToolDetection[]> {
  const shape = await readWorkspaceShape(directory);
  return await Promise.all(
    definitions.map(async (definition) => {
      const configured = definition.configured(shape.files, shape.packageJson);
      const executable = configured
        ? await executableOnPath(definition.executable, directory)
        : null;
      return {
        adapterId: definition.id,
        configured,
        installed: executable !== null,
        executable,
        capabilities: definition.capabilities,
        reason: !configured
          ? "No supported local configuration was detected."
          : executable === null
            ? `${definition.executable} is configured but unavailable; LMP will not install it.`
            : "Configured tool detected and available for explicit approval.",
      } satisfies ToolDetection;
    }),
  );
}

export async function planToolAdapters(
  directory: string,
): Promise<{ detections: ToolDetection[]; plans: ToolPlan[]; skipped: ToolDetection[] }> {
  const shape = await readWorkspaceShape(directory);
  const detections = await detectToolAdapters(directory);
  const plans: ToolPlan[] = [];
  for (const detection of detections) {
    if (!detection.configured || !detection.installed) continue;
    const definition = definitions.find((item) => item.id === detection.adapterId);
    const command = definition?.command(shape.files);
    if (command)
      plans.push({
        adapterId: detection.adapterId,
        command,
        cwd: directory,
        capabilities: detection.capabilities,
        detection,
      });
  }
  return {
    detections,
    plans,
    skipped: detections.filter(
      (item) =>
        item.configured &&
        (!item.installed ||
          !definitions
            .find((definition) => definition.id === item.adapterId)
            ?.command(shape.files)),
    ),
  };
}

export function normalizeToolResult(result: ToolExecutionResult): RuleResult {
  const passed = result.allowed && result.exitCode === 0 && !result.timedOut;
  return {
    ruleId: `tool.${result.adapterId}`,
    passed,
    severity: passed ? "info" : "error",
    message: passed
      ? `${result.adapterId} completed successfully.`
      : `${result.adapterId} did not complete successfully.`,
    evidence: {
      command: result.command.join(" "),
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      output: result.output,
    },
    remediation: passed
      ? undefined
      : `Run the configured ${result.adapterId} check explicitly and review its output.`,
    limitations: [
      "The adapter reports the external tool result; it does not reinterpret that tool's complete security or quality model.",
    ],
  };
}

export async function executeToolPlan(
  plan: ToolPlan,
  options: {
    authorize: boolean;
    timeoutMs?: number;
    redact?: boolean;
    workspaceRoot?: string;
  },
): Promise<ToolExecutionResult> {
  const invalidPlan = (output: string): ToolExecutionResult => ({
    adapterId: plan.adapterId,
    command: plan.command,
    allowed: false,
    exitCode: null,
    timedOut: false,
    output,
  });
  if (!options.authorize) {
    return invalidPlan("Execution requires explicit authorization.");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TOOL_TIMEOUT_MS) {
    return invalidPlan(`Execution timeout must be between 1 and ${MAX_TOOL_TIMEOUT_MS} ms.`);
  }
  const definition = definitions.find((item) => item.id === plan.adapterId);
  if (!definition || plan.detection.adapterId !== plan.adapterId) {
    return invalidPlan("Execution plan adapter identity is invalid.");
  }
  if (
    plan.command.length === 0 ||
    plan.command[0] !== definition.executable ||
    plan.command.some((part) => part.includes("\0"))
  ) {
    return invalidPlan("Execution plan command is not an approved adapter command.");
  }
  if (!isApprovedCommand(plan.adapterId, plan.command)) {
    return invalidPlan("Execution plan arguments are not an approved adapter command.");
  }
  const workingDirectory = resolve(plan.cwd);
  const workspaceRoot = options.workspaceRoot ? resolve(options.workspaceRoot) : null;
  if (!isAbsolute(plan.cwd)) {
    return invalidPlan("Execution plan is outside the approved workspace boundary.");
  }
  if (
    !(await stat(workingDirectory)
      .then((value) => value.isDirectory())
      .catch(() => false))
  ) {
    return invalidPlan("Execution plan working directory does not exist.");
  }
  if (workspaceRoot) {
    const [realWorkingDirectory, realWorkspaceRoot] = await Promise.all([
      realpath(workingDirectory).catch(() => null),
      realpath(workspaceRoot).catch(() => null),
    ]);
    if (
      !realWorkingDirectory ||
      !realWorkspaceRoot ||
      !isWithin(realWorkspaceRoot, realWorkingDirectory)
    ) {
      return invalidPlan("Execution plan is outside the approved workspace boundary.");
    }
  }
  if (plan.detection.executable && basename(plan.detection.executable) !== definition.executable) {
    return invalidPlan("Execution plan executable does not match its adapter.");
  }
  const discoveredExecutable = await executableOnPath(definition.executable, workingDirectory);
  if (!discoveredExecutable || plan.detection.executable !== discoveredExecutable) {
    return invalidPlan("Execution plan executable does not match the discovered workspace tool.");
  }
  const [executable, ...args] = plan.command;
  return await new Promise((resolve) => {
    const resolvedExecutable = plan.detection.executable ?? executable;
    const child = spawn(resolvedExecutable, args, {
      cwd: workingDirectory,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      env: createSanitizedToolEnvironment(),
    });
    let output = "";
    const append = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > 16_384) output = `${output.slice(0, 16_384)}\n[output truncated]`;
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (error) =>
      resolve({
        adapterId: plan.adapterId,
        command: plan.command,
        allowed: true,
        exitCode: 1,
        timedOut: false,
        output: options.redact === false ? error.message : redactText(error.message),
      }),
    );
    child.on("close", (exitCode, signal) =>
      resolve({
        adapterId: plan.adapterId,
        command: plan.command,
        allowed: true,
        exitCode,
        timedOut: signal === "SIGTERM",
        output: options.redact === false ? output : redactText(output),
      }),
    );
  });
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function isApprovedCommand(adapterId: ToolAdapterId, command: string[]): boolean {
  if (adapterId === "typescript") return command.length === 2 && command[1] === "--noEmit";
  if (adapterId === "biome")
    return command.length === 3 && command[1] === "check" && command[2] === ".";
  if (adapterId === "eslint") return command.length === 2 && command[1] === ".";
  if (adapterId === "semgrep") {
    return (
      command.length === 5 &&
      command[1] === "scan" &&
      command[2] === "--config" &&
      [".semgrep.yml", ".semgrep/semgrep.yml"].includes(command[3]) &&
      command[4] === "."
    );
  }
  return false;
}
