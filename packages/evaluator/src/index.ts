import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { type InstructionBundle, compileSkill } from "@lending-mind/internal-skill-compiler";
import {
  type EvaluationState,
  type JsonValue,
  type RuleResult,
  redactSecrets,
  sha256,
} from "@lending-mind/sdk";
import { EvaluationArtifactSchema } from "@lending-mind/skill";
import { type Node, Project, type SourceFile, SyntaxKind } from "ts-morph";
import { createSanitizedToolEnvironment, planToolAdapters } from "./tool-adapters.js";

export * from "./tool-adapters.js";

export type ArtifactMode = "none" | "summary" | "full";
export interface EvaluationOptions {
  directory: string;
  packageDirectory?: string;
  tsconfig?: string;
  exclusions?: string[];
  allowedCommands?: string[];
  commands?: string[];
  artifactMode?: ArtifactMode;
  redact?: boolean;
  mode?: "advisory" | "enforced" | "audit";
  runCommands?: boolean;
  artifactDir?: string;
  autonomyPolicy?: AutonomyPolicy;
}
export interface DependencyReport {
  dependencies: string[];
  devDependencies: string[];
  prohibited: string[];
}
export interface FunctionMetric {
  name: string;
  file: string;
  exported: boolean;
  lines: number;
  branches: number;
  complexity: number;
}
export interface AstReport {
  files: number;
  functions: number;
  branches: number;
  complexity: number;
  excluded: string[];
  functionsByFile: FunctionMetric[];
  languages: string[];
  parser: "ts-morph/typescript-compiler-api";
  version: "compiler-configured";
}
export interface EvaluationReport {
  package: InstructionBundle;
  passed: boolean;
  results: RuleResult[];
  dependency: DependencyReport;
  ast: AstReport;
  commands: CommandResult[];
  state: EvaluationState;
  artifactPath?: string;
  artifact?: JsonValue;
}
export interface CommandResult {
  command: string;
  allowed: boolean;
  exitCode?: number;
  output?: string;
  timedOut?: boolean;
}

export type RemediationState =
  | "initialized"
  | "evaluating"
  | "needs_remediation"
  | "remediating"
  | "passed"
  | "escalated";

export type RemediationEvent =
  | { type: "start_evaluation" }
  | {
      type: "evaluation";
      result: "pass" | "needs_revision" | "blocked" | "error";
      findingIds?: string[];
      securityError?: boolean;
      regression?: boolean;
    }
  | { type: "start_remediation" }
  | { type: "remediation_completed" }
  | { type: "human_attested" }
  | { type: "human_rejected"; reason: string };

export interface RemediationPolicy {
  maxAttempts: number;
  repeatedFindingLimit: number;
}

export interface RemediationTransition {
  state: RemediationState;
  attempt: number;
  findingFingerprint: string | null;
  reason: string;
}

export interface RemediationRun {
  state: RemediationState;
  attempt: number;
  policy: RemediationPolicy;
  findingFingerprint: string | null;
  repeatedFindingCount: number;
  history: RemediationTransition[];
}

const defaultRemediationPolicy: RemediationPolicy = {
  maxAttempts: 3,
  repeatedFindingLimit: 2,
};

function findingFingerprint(ids: string[] = []) {
  return [...new Set(ids)].sort().join(",") || null;
}

function remediationTransition(
  run: RemediationRun,
  state: RemediationState,
  reason: string,
  fingerprint = run.findingFingerprint,
): RemediationRun {
  const next = { ...run, state, findingFingerprint: fingerprint };
  return {
    ...next,
    history: [
      ...run.history,
      { state, attempt: next.attempt, findingFingerprint: fingerprint, reason },
    ],
  };
}

export function createRemediationRun(policy: Partial<RemediationPolicy> = {}): RemediationRun {
  const resolved = { ...defaultRemediationPolicy, ...policy };
  if (!Number.isInteger(resolved.maxAttempts) || resolved.maxAttempts < 1)
    throw new Error("maxAttempts must be a positive integer");
  if (!Number.isInteger(resolved.repeatedFindingLimit) || resolved.repeatedFindingLimit < 2)
    throw new Error("repeatedFindingLimit must be at least 2");
  return {
    state: "initialized",
    attempt: 0,
    policy: resolved,
    findingFingerprint: null,
    repeatedFindingCount: 0,
    history: [],
  };
}

/** Advance a bounded remediation lifecycle without turning unavailable evidence into pass. */
export function advanceRemediation(run: RemediationRun, event: RemediationEvent): RemediationRun {
  if (event.type === "start_evaluation") {
    if (run.state !== "initialized" && run.state !== "remediating")
      throw new Error(`cannot start evaluation from ${run.state}`);
    return remediationTransition(run, "evaluating", "evaluation started");
  }
  if (event.type === "evaluation") {
    if (run.state !== "evaluating") throw new Error(`cannot record evaluation from ${run.state}`);
    const fingerprint = findingFingerprint(event.findingIds);
    if (event.result === "pass")
      return remediationTransition(run, "passed", "evaluation passed", null);
    if (
      event.securityError ||
      event.regression ||
      event.result === "blocked" ||
      event.result === "error"
    )
      return remediationTransition(
        run,
        "escalated",
        event.securityError
          ? "security error requires human review"
          : event.regression
            ? "regression requires human review"
            : `evaluation ${event.result} requires human review`,
        fingerprint,
      );
    const repeated =
      fingerprint !== null && fingerprint === run.findingFingerprint
        ? run.repeatedFindingCount + 1
        : 1;
    const next = { ...run, repeatedFindingCount: repeated, findingFingerprint: fingerprint };
    if (next.attempt >= next.policy.maxAttempts)
      return remediationTransition(
        next,
        "escalated",
        "remediation retry budget exhausted",
        fingerprint,
      );
    if (repeated >= next.policy.repeatedFindingLimit)
      return remediationTransition(
        next,
        "escalated",
        "same finding repeated without progress",
        fingerprint,
      );
    return remediationTransition(
      next,
      "needs_remediation",
      "evaluation requires remediation",
      fingerprint,
    );
  }
  if (event.type === "start_remediation") {
    if (run.state !== "needs_remediation")
      throw new Error(`cannot start remediation from ${run.state}`);
    return remediationTransition(
      { ...run, attempt: run.attempt + 1 },
      "remediating",
      "remediation started",
    );
  }
  if (event.type === "remediation_completed") {
    if (run.state !== "remediating")
      throw new Error(`cannot complete remediation from ${run.state}`);
    return remediationTransition(
      run,
      "evaluating",
      "remediation completed; re-evaluation required",
    );
  }
  if (event.type === "human_attested") {
    if (run.state !== "passed") throw new Error(`cannot attest from ${run.state}`);
    return remediationTransition(run, "passed", "human attested passing evidence");
  }
  if (run.state !== "escalated") throw new Error(`cannot reject from ${run.state}`);
  return remediationTransition(run, "escalated", `human rejected: ${event.reason}`);
}

export type AutonomyLevel = "A0" | "A1" | "A2" | "A3" | "A4" | "A5" | "A6";
export type AuthorizedAction =
  | "observe"
  | "propose"
  | "workspace_write"
  | "run_command"
  | "install_package"
  | "network"
  | "deploy";

export interface AutonomyPolicy {
  maxLevel: AutonomyLevel;
  allowCommands: boolean;
  allowPackageInstall: boolean;
  allowNetwork: boolean;
  allowDeployment: boolean;
}

export interface AuthorizationDecision {
  allowed: boolean;
  requiredLevel: AutonomyLevel;
  reason: string;
}

const autonomyRank: Record<AutonomyLevel, number> = {
  A0: 0,
  A1: 1,
  A2: 2,
  A3: 3,
  A4: 4,
  A5: 5,
  A6: 6,
};
const actionLevel: Record<AuthorizedAction, AutonomyLevel> = {
  observe: "A0",
  propose: "A1",
  workspace_write: "A2",
  run_command: "A3",
  install_package: "A4",
  network: "A5",
  deploy: "A6",
};

/** Resolve one explicit action against the profile/host autonomy ceiling. */
export function authorizeAction(
  policy: AutonomyPolicy,
  action: AuthorizedAction,
): AuthorizationDecision {
  const requiredLevel = actionLevel[action];
  const ceilingAllows = autonomyRank[policy.maxLevel] >= autonomyRank[requiredLevel];
  const capabilityAllows = {
    observe: true,
    propose: true,
    workspace_write: true,
    run_command: policy.allowCommands,
    install_package: policy.allowPackageInstall,
    network: policy.allowNetwork,
    deploy: policy.allowDeployment,
  }[action];
  if (!ceilingAllows)
    return {
      allowed: false,
      requiredLevel,
      reason: `${action} requires ${requiredLevel}; policy ceiling is ${policy.maxLevel}`,
    };
  if (!capabilityAllows)
    return {
      allowed: false,
      requiredLevel,
      reason: `${action} is not enabled by the explicit capability policy`,
    };
  return { allowed: true, requiredLevel, reason: `${action} authorized at ${requiredLevel}` };
}

const normalizePath = (value: string) => value.split("\\").join("/");
const isExcluded = (path: string, exclusions: string[]) => {
  const normalized = normalizePath(path);
  return exclusions.some((value) => {
    const candidate = normalizePath(value).replace(/\/$/, "");
    return (
      normalized === candidate ||
      normalized.startsWith(`${candidate}/`) ||
      basename(normalized) === candidate
    );
  });
};
const isTestPath = (path: string) =>
  /(^|\/)(test|tests|__tests__|fixtures?)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/.test(path);
const isWithin = (root: string, candidate: string) => {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
};

async function gitMetadata(directory: string): Promise<{ gitHead: string | null; dirty: boolean }> {
  const run = (args: string[]) =>
    new Promise<string | null>((resolveResult) => {
      const child = spawn("git", args, {
        cwd: directory,
        shell: false,
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5_000,
      });
      let output = "";
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.on("close", (code) => resolveResult(code === 0 ? output.trim() : null));
      child.on("error", () => resolveResult(null));
    });
  const gitHead = await run(["rev-parse", "HEAD"]);
  const status = await run(["status", "--porcelain"]);
  return { gitHead, dirty: status !== null && status.length > 0 };
}

function projectFor(directory: string, tsconfig = "tsconfig.json"): Project {
  try {
    return new Project({
      tsConfigFilePath: resolve(directory, tsconfig),
      skipAddingFilesFromTsConfig: false,
    });
  } catch {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true, noEmit: true },
    });
    project.addSourceFilesAtPaths([
      `${directory}/**/*.ts`,
      `${directory}/**/*.tsx`,
      `${directory}/**/*.js`,
      `${directory}/**/*.jsx`,
      `${directory}/**/*.mts`,
      `${directory}/**/*.cts`,
    ]);
    return project;
  }
}

function sourceFiles(directory: string, tsconfig: string | undefined, exclusions: string[]) {
  const project = projectFor(directory, tsconfig);
  const included: SourceFile[] = [];
  const excluded: string[] = [];
  for (const file of project.getSourceFiles()) {
    const path = normalizePath(relative(directory, file.getFilePath()));
    if (
      isExcluded(path, exclusions) ||
      path
        .split("/")
        .some((part) => ["node_modules", "dist", "build", "coverage", ".git"].includes(part))
    )
      excluded.push(path);
    else included.push(file);
  }
  return { included, excluded: excluded.sort() };
}

export async function inspectDependencies(
  directory: string,
  prohibited: string[] = [],
  productionOnly = false,
): Promise<DependencyReport> {
  let manifest: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } = {};
  try {
    manifest = JSON.parse(
      await readFile(resolve(directory, "package.json"), "utf8"),
    ) as typeof manifest;
  } catch {
    /* package.json is optional */
  }
  const dependencies = Object.keys(manifest.dependencies ?? {}).sort();
  const devDependencies = Object.keys(manifest.devDependencies ?? {}).sort();
  const candidates = productionOnly ? dependencies : [...dependencies, ...devDependencies];
  return {
    dependencies,
    devDependencies,
    prohibited: [...new Set(candidates.filter((name) => prohibited.includes(name)))].sort(),
  };
}

export async function readTsConfig(
  directory: string,
  file = "tsconfig.json",
): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(directory, file), "utf8")) as Record<string, unknown>;
}

const functionKinds = [
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.Constructor,
];
const branchKinds = [
  SyntaxKind.IfStatement,
  SyntaxKind.ForStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.CaseClause,
  SyntaxKind.CatchClause,
  SyntaxKind.ConditionalExpression,
];
const isFunction = (node: Node) => functionKinds.includes(node.getKind() as SyntaxKind);
const nameOf = (node: Node) =>
  (node as Node & { getName?: () => string | undefined }).getName?.() ?? "<anonymous>";
const exportedFunction = (node: Node) => {
  const direct = (node as Node & { isExported?: () => boolean }).isExported;
  if (direct) return direct.call(node);
  return node.getFirstAncestorByKind(SyntaxKind.VariableStatement)?.isExported() ?? false;
};
const branchesFor = (root: Node) => {
  let branches = 0;
  root.forEachDescendant((child) => {
    if (child !== root && isFunction(child)) return;
    if (
      branchKinds.includes(child.getKind() as SyntaxKind) &&
      child.getFirstAncestor((ancestor) => isFunction(ancestor)) === root
    )
      branches++;
    if (
      child.isKind(SyntaxKind.BinaryExpression) &&
      ["&&", "||", "??"].includes(child.getOperatorToken().getText()) &&
      child.getFirstAncestor((ancestor) => isFunction(ancestor)) === root
    )
      branches++;
  });
  return branches;
};

export function analyzeAst(
  directory: string,
  tsconfig = "tsconfig.json",
  exclusions: string[] = [],
): AstReport {
  const { included, excluded } = sourceFiles(directory, tsconfig, exclusions);
  const functionsByFile: FunctionMetric[] = [];
  const languages = new Set<string>();
  let branches = 0;
  for (const file of included) {
    const extension = file.getExtension().toLowerCase();
    languages.add(
      ["js", "jsx", "mjs", "cjs", "mts", "cts"].includes(extension) ? "javascript" : "typescript",
    );
    file.forEachDescendant((node) => {
      if (!isFunction(node)) return;
      const count = branchesFor(node);
      const metric = {
        name: nameOf(node),
        file: normalizePath(relative(directory, file.getFilePath())),
        exported: exportedFunction(node),
        lines: node.getEndLineNumber() - node.getStartLineNumber() + 1,
        branches: count,
        complexity: count + 1,
      };
      functionsByFile.push(metric);
      branches += count;
    });
  }
  return {
    files: included.length,
    functions: functionsByFile.length,
    branches,
    complexity: functionsByFile.reduce((sum, item) => sum + item.complexity, 0),
    excluded,
    functionsByFile,
    languages: [...languages].sort(),
    parser: "ts-morph/typescript-compiler-api",
    version: "compiler-configured",
  };
}

function finding(
  directory: string,
  ruleId: string,
  file: SourceFile,
  node: Node,
  message: string,
  severity: "info" | "warning" | "error",
  remediation: string,
  evidence: JsonValue = {},
): RuleResult {
  return {
    ruleId,
    passed: false,
    severity,
    message,
    remediation,
    file: normalizePath(relative(directory, file.getFilePath())),
    line: node.getStartLineNumber(),
    column: node.getStartLinePos() + 1,
    evidence,
  };
}

function sourceFindings(
  directory: string,
  tsconfig: string | undefined,
  exclusions: string[],
  policy: Record<string, unknown>,
): RuleResult[] {
  const { included } = sourceFiles(directory, tsconfig, exclusions);
  const severity = (
    policy.severity === "warning" || policy.severity === "info"
      ? policy.severity
      : Object.entries(policy).some(([key, value]) => key.startsWith("error") && value === true)
        ? "error"
        : "warning"
  ) as "info" | "warning" | "error";
  const enabled = (errorKey: string, warningKey: string, fallback = true) =>
    policy[errorKey] === true ||
    policy[warningKey] === true ||
    (policy[errorKey] === undefined && policy[warningKey] === undefined && fallback);
  const findings: RuleResult[] = [];
  for (const file of included) {
    const path = normalizePath(relative(directory, file.getFilePath()));
    if (isTestPath(path)) continue;
    file.forEachDescendant((node) => {
      if (node.isKind(SyntaxKind.AnyKeyword) && enabled("errorAny", "warnAny"))
        findings.push(
          finding(
            directory,
            "typescript.any",
            file,
            node,
            "Explicit any type detected.",
            severity,
            "Use a precise type or unknown with a narrowing boundary.",
          ),
        );
      if (node.isKind(SyntaxKind.CallExpression)) {
        const expression = node.getExpression().getText();
        if (enabled("errorAppLayerJoin", "warnAppLayerJoin", false) && expression === "Promise.all")
          findings.push(
            finding(
              directory,
              "database.app-layer-join",
              file,
              node,
              "Application-layer fan-out join detected.",
              severity,
              "Move the isolation and join policy to the database boundary.",
            ),
          );
        if (
          enabled("errorEval", "warnEval") &&
          ["eval", "global.eval", "globalThis.eval"].includes(expression)
        )
          findings.push(
            finding(
              directory,
              "typescript.eval",
              file,
              node,
              "Dynamic code execution detected.",
              severity,
              "Replace eval with a typed dispatch table or parser.",
            ),
          );
        if (enabled("errorDynamicRequire", "warnDynamicRequire") && expression === "require") {
          const argument = node.getArguments()[0];
          if (
            argument &&
            ![SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral].includes(
              argument.getKind() as SyntaxKind,
            )
          )
            findings.push(
              finding(
                directory,
                "typescript.dynamic-require",
                file,
                node,
                "Dynamic require detected.",
                severity,
                "Use a static import or a literal module specifier.",
              ),
            );
        }
        if (
          enabled("errorConsoleLog", "warnConsoleLog") &&
          /^(console)\.(log|debug|info)$/.test(expression)
        )
          findings.push(
            finding(
              directory,
              "typescript.console",
              file,
              node,
              "Console output detected.",
              severity,
              "Use the project’s structured logging boundary.",
            ),
          );
      }
      if (
        node.isKind(SyntaxKind.CatchClause) &&
        enabled("errorEmptyCatch", "warnEmptyCatch") &&
        node.getBlock().getStatements().length === 0
      )
        findings.push(
          finding(
            directory,
            "typescript.empty-catch",
            file,
            node,
            "Empty catch block detected.",
            severity,
            "Handle, rethrow, or explicitly record the ignored error.",
          ),
        );
    });
  }
  return findings;
}

export function assertAllowedCommand(command: string, allowlist: string[]): void {
  const normalized = command.trim().replace(/\s+/g, " ");
  if (
    !normalized ||
    !allowlist.some((allowed) => normalized === allowed.trim().replace(/\s+/g, " "))
  )
    throw new Error(`Command is not allowlisted: ${normalized}`);
}

export async function runAllowedCommand(
  command: string,
  allowlist: string[],
  cwd = process.cwd(),
  timeout = 120_000,
  redact = true,
  autonomyPolicy?: AutonomyPolicy,
  workspaceRoot = cwd,
): Promise<CommandResult> {
  if (autonomyPolicy) {
    const decision = authorizeAction(autonomyPolicy, "run_command");
    if (!decision.allowed) throw new Error(decision.reason);
  }
  assertAllowedCommand(command, allowlist);
  if (!isAbsolute(cwd) || !isAbsolute(workspaceRoot))
    throw new Error("Command working directory and workspace root must be absolute paths.");
  const workingDirectory = resolve(cwd);
  const rootDirectory = resolve(workspaceRoot);
  if (
    !(await stat(workingDirectory)
      .then((value) => value.isDirectory())
      .catch(() => false))
  )
    throw new Error("Command working directory does not exist.");
  const [realWorkingDirectory, realRootDirectory] = await Promise.all([
    realpath(workingDirectory).catch(() => null),
    realpath(rootDirectory).catch(() => null),
  ]);
  if (
    !realWorkingDirectory ||
    !realRootDirectory ||
    !isWithin(realRootDirectory, realWorkingDirectory)
  )
    throw new Error("Command working directory is outside the approved workspace boundary.");
  const parts = command.trim().split(/\s+/);
  const executable = parts.shift();
  if (!executable) throw new Error("Command cannot be empty");
  return await new Promise((done) => {
    const child = spawn(executable, parts, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
      env: createSanitizedToolEnvironment({ NODE_ENV: "test" }),
    });
    let output = "";
    const append = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > 16_384) output = `${output.slice(0, 16_384)}\n[output truncated]`;
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (error) =>
      done({
        command,
        allowed: true,
        exitCode: 1,
        output: redact ? String(redactSecrets(output || error.message)) : output || error.message,
      }),
    );
    child.on("close", (exitCode, signal) =>
      done({
        command,
        allowed: true,
        exitCode: exitCode ?? 1,
        timedOut: signal === "SIGTERM",
        output: redact ? String(redactSecrets(output)) : output,
      }),
    );
  });
}

const simpleResult = (
  ruleId: string,
  passed: boolean,
  severity: "info" | "warning" | "error",
  message: string,
  evidence: JsonValue = {},
): RuleResult => ({ ruleId, passed, severity, message, evidence });

const normalizeFinding = (result: RuleResult): RuleResult => ({
  ...result,
  rationale:
    result.rationale ??
    `The active Mind declares ${result.ruleId} as an observable policy check; this result records the selected scope's evidence.`,
  remediation:
    result.remediation ??
    (result.passed
      ? "No remediation is required for this check."
      : "Review the active Mind rule and revise the selected change before re-evaluating."),
  limitations: result.limitations ?? [
    "This finding is bounded to the selected workspace scope and configured evaluator.",
  ],
});

export async function evaluate(options: EvaluationOptions): Promise<EvaluationReport> {
  const selectedMode = options.mode ?? "advisory";
  const directory = resolve(options.directory);
  const toolAdapters = await planToolAdapters(directory);
  const bundle = await compileSkill(options.packageDirectory ?? directory);
  const policies = bundle.policies;
  const dependencyPolicy = policies.dependencies ?? policies.dependencyPolicy ?? {};
  const strings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((item: unknown): item is string => typeof item === "string")
      : [];
  const denied = strings(dependencyPolicy.deny);
  const dependency = await inspectDependencies(
    directory,
    denied,
    dependencyPolicy.productionOnly === true,
  );
  const ast = analyzeAst(directory, options.tsconfig, options.exclusions);
  const results: RuleResult[] = sourceFindings(
    directory,
    options.tsconfig,
    options.exclusions ?? [],
    policies.typescript ?? policies.typescriptPolicy ?? {},
  );
  const sourceViolationCount = results.length;
  results.push(
    simpleResult(
      "typescript.ast",
      sourceViolationCount === 0,
      (policies.typescript ?? policies.typescriptPolicy)?.severity === "warning"
        ? "warning"
        : "error",
      sourceViolationCount === 0
        ? "AST source-policy checks passed."
        : `${sourceViolationCount} AST source-policy violation(s) detected.`,
      { violations: sourceViolationCount },
    ),
  );
  const dependencySeverity = dependencyPolicy.severity === "warning" ? "warning" : "error";
  results.push(
    simpleResult(
      "dependencies.deny",
      dependency.prohibited.length === 0,
      dependencySeverity,
      dependency.prohibited.length
        ? `Prohibited dependencies: ${dependency.prohibited.join(", ")}`
        : "No prohibited dependencies detected.",
      {
        prohibited: dependency.prohibited,
        productionOnly: dependencyPolicy.productionOnly === true,
      },
    ),
  );
  const complexityPolicy = policies.complexity ?? policies.complexityPolicy ?? {};
  const maxComplexity =
    typeof complexityPolicy.maxCyclomatic === "number" ? complexityPolicy.maxCyclomatic : undefined;
  const maxExported =
    typeof complexityPolicy.maxExportedCyclomatic === "number"
      ? complexityPolicy.maxExportedCyclomatic
      : maxComplexity;
  const maxLines =
    typeof complexityPolicy.maxFunctionLines === "number"
      ? complexityPolicy.maxFunctionLines
      : undefined;
  const complexitySeverity = complexityPolicy.severity === "warning" ? "warning" : "error";
  for (const metric of ast.functionsByFile) {
    const limit = metric.exported ? maxExported : maxComplexity;
    if (limit !== undefined && metric.complexity > limit)
      results.push({
        ...simpleResult(
          "complexity.cyclomatic",
          false,
          complexitySeverity,
          `${metric.name} complexity ${metric.complexity} exceeds ${limit}.`,
          metric as unknown as JsonValue,
        ),
        file: metric.file,
      });
    if (maxLines !== undefined && metric.lines > maxLines)
      results.push({
        ...simpleResult(
          "complexity.function-lines",
          false,
          complexitySeverity,
          `${metric.name} has ${metric.lines} lines; maximum is ${maxLines}.`,
          metric as unknown as JsonValue,
        ),
        file: metric.file,
      });
  }
  if (maxComplexity !== undefined || maxExported !== undefined) {
    const passedComplexity = ast.functionsByFile.every(
      (metric) =>
        metric.complexity <=
        (metric.exported
          ? (maxExported ?? Number.POSITIVE_INFINITY)
          : (maxComplexity ?? Number.POSITIVE_INFINITY)),
    );
    const observed = ast.functionsByFile.map((metric) => metric.complexity);
    results.push(
      simpleResult(
        "complexity.cyclomatic.summary",
        passedComplexity,
        complexitySeverity,
        passedComplexity
          ? "Cyclomatic complexity limits passed."
          : "One or more functions exceed the cyclomatic complexity limit.",
        {
          maximumObserved: observed.length ? Math.max(...observed) : 0,
          functionCount: observed.length,
        },
      ),
    );
  }
  if (maxLines !== undefined) {
    const maximumObserved = ast.functionsByFile.length
      ? Math.max(...ast.functionsByFile.map((metric) => metric.lines))
      : 0;
    results.push(
      simpleResult(
        "complexity.function-lines.summary",
        maximumObserved <= maxLines,
        complexitySeverity,
        maximumObserved <= maxLines
          ? "Function length limits passed."
          : "One or more functions exceed the function length limit.",
        { maximumObserved, limit: maxLines },
      ),
    );
  }
  const tsPolicy = policies.typescript ?? policies.typescriptPolicy ?? {};
  if (tsPolicy.strict === true || tsPolicy.noImplicitAny === true) {
    let config: Record<string, unknown> = {};
    try {
      config = await readTsConfig(directory, options.tsconfig);
    } catch {
      /* represented as policy failures */
    }
    const compiler = (config.compilerOptions ?? {}) as Record<string, unknown>;
    if (tsPolicy.strict === true && compiler.strict !== true)
      results.push(
        simpleResult("typescript.strict", false, "error", "compilerOptions.strict must be true."),
      );
    if (tsPolicy.noImplicitAny === true && compiler.noImplicitAny !== true)
      results.push(
        simpleResult(
          "typescript.noImplicitAny",
          false,
          "error",
          "compilerOptions.noImplicitAny must be true.",
        ),
      );
  }
  if (tsPolicy.requireTestFile === true && ast.files > 0) {
    const hasTestFile = sourceFiles(
      directory,
      options.tsconfig,
      options.exclusions ?? [],
    ).included.some((file) => isTestPath(normalizePath(relative(directory, file.getFilePath()))));
    if (!hasTestFile)
      results.push(
        simpleResult(
          "typescript.requireTestFile",
          false,
          "error",
          "At least one test file is required for a source workspace.",
        ),
      );
  }
  let manifest: { scripts?: Record<string, string> } = {};
  try {
    manifest = JSON.parse(
      await readFile(resolve(directory, "package.json"), "utf8"),
    ) as typeof manifest;
  } catch {
    /* package.json is optional */
  }
  const commandPolicy = policies.commands ?? policies.commandPolicy ?? {};
  if (manifest.scripts)
    for (const script of strings(commandPolicy.requiredScripts))
      if (!manifest.scripts[script])
        results.push(
          simpleResult(
            `commands.required.${script}`,
            false,
            "error",
            `Missing required package script: ${script}.`,
          ),
        );
  const commands: CommandResult[] = [];
  if (options.runCommands !== false && selectedMode !== "audit")
    for (const command of options.commands ?? []) {
      try {
        const allow = options.allowedCommands ?? strings(commandPolicy.allow);
        commands.push(
          await runAllowedCommand(
            command,
            allow,
            directory,
            typeof commandPolicy.timeoutMs === "number" ? commandPolicy.timeoutMs : 120_000,
            options.redact ?? true,
            options.autonomyPolicy,
            directory,
          ),
        );
      } catch (error) {
        results.push(
          simpleResult(
            "commands.allowlist",
            false,
            "error",
            error instanceof Error ? error.message : String(error),
            { command },
          ),
        );
      }
    }
  const normalizedResults = results.map(normalizeFinding);
  const hardErrors = normalizedResults.filter(
    (item) => !item.passed && item.severity === "error",
  ).length;
  const warnings = normalizedResults.filter(
    (item) => !item.passed && item.severity === "warning",
  ).length;
  const passed = selectedMode === "enforced" ? hardErrors === 0 : true;
  const boundaryBlocked =
    bundle.signatureStatus === "invalid" ||
    normalizedResults.some((item) => item.ruleId === "commands.allowlist");
  const state: EvaluationState = boundaryBlocked
    ? "blocked"
    : hardErrors > 0 || warnings > 0
      ? "needs_revision"
      : "pass";
  const git = await gitMetadata(directory);
  const runId = randomUUID();
  const limitations = [
    "Static and configured checks provide evidence about this evaluation only; they do not prove universal code quality.",
    "Architecture, semantic correctness, security, and production behavior may require independent human or tool review.",
  ];
  const skippedChecks = [
    {
      checkId: "behavioral.docker",
      reason:
        "Docker execution is an explicit orchestrator gate, not part of this static evaluator run.",
    },
    ...(selectedMode === "audit" || options.runCommands === false
      ? [
          {
            checkId: "commands.execution",
            reason: "Command execution is disabled for this evaluation.",
          },
        ]
      : []),
    ...toolAdapters.skipped.map((tool) => ({
      checkId: `tool.${tool.adapterId}`,
      reason: tool.reason,
    })),
  ];
  const loopTransitions = [
    { state: "evaluating", event: "evaluation_started", attempt: 0 },
    { state, event: "evaluation_completed", attempt: 0 },
  ];
  const artifact = {
    artifactVersion: "1.0",
    runId,
    createdAt: new Date().toISOString(),
    workspace: { pathHash: sha256(directory), gitHead: git.gitHead, dirty: git.dirty },
    mind: {
      id: bundle.package.id,
      version: bundle.package.version,
      contentDigest: bundle.digest,
      signatureStatus: bundle.signatureStatus,
    },
    mode: selectedMode,
    state,
    summary: {
      status:
        state === "blocked"
          ? "blocked"
          : state === "pass"
            ? "pass"
            : hardErrors > 0
              ? "fail"
              : "warning",
      score: hardErrors === 0 ? 1 : 0,
      hardViolationCount: hardErrors,
      warningCount: warnings,
      informationalCount: normalizedResults.filter(
        (item) => !item.passed && item.severity === "info",
      ).length,
    },
    checks:
      options.artifactMode === "summary"
        ? normalizedResults.map(
            ({ ruleId, passed: ok, severity, message, rationale, remediation, limitations }) => ({
              ruleId,
              passed: ok,
              severity,
              message,
              rationale,
              remediation,
              limitations,
            }),
          )
        : normalizedResults,
    analysis: {
      languages: ast.languages,
      parsers: [ast.parser],
      versions: [ast.version],
      checkedFiles: ast.files,
    },
    skippedChecks,
    loopTransitions,
    commands,
    limitations,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      lmpVersion: "0.1.0",
      toolAdapters: toolAdapters.detections,
    },
    privacy: { sourceCodeIncluded: false, rawPathsIncluded: false, networkUsed: false },
  } as unknown as JsonValue;
  const safeArtifact = (options.redact ?? true) ? redactSecrets(artifact) : artifact;
  let artifactPath: string | undefined;
  if ((options.artifactMode ?? "summary") !== "none") {
    const artifactDir = resolve(options.artifactDir ?? `${directory}/.lending-mind/artifacts`);
    await mkdir(artifactDir, { recursive: true });
    artifactPath = resolve(artifactDir, `${runId}.json`);
    (safeArtifact as { artifactPath?: string }).artifactPath = normalizePath(
      relative(directory, artifactPath),
    );
    EvaluationArtifactSchema.parse(safeArtifact);
    await writeFile(artifactPath, `${JSON.stringify(safeArtifact, null, 2)}\n`);
  }
  return {
    package: bundle,
    passed,
    results: normalizedResults,
    dependency,
    ast,
    commands,
    state,
    artifactPath,
    artifact: safeArtifact,
  };
}

export const evaluateProject = evaluate;
export const analyzeDependencies = inspectDependencies;
