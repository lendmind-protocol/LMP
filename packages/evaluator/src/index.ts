import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { type JsonValue, type RuleResult, redactSecrets, sha256 } from "@lending-mind/core";
import { type InstructionBundle, compileSkill } from "@lending-mind/skill-compiler";
import { Project, type SourceFile, SyntaxKind } from "ts-morph";

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
}
export interface DependencyReport {
  dependencies: string[];
  devDependencies: string[];
  prohibited: string[];
}
export interface AstReport {
  files: number;
  functions: number;
  branches: number;
  complexity: number;
  excluded: string[];
}
export interface EvaluationReport {
  package: InstructionBundle;
  passed: boolean;
  results: RuleResult[];
  dependency: DependencyReport;
  ast: AstReport;
  commands: CommandResult[];
  artifact?: JsonValue;
}
export interface CommandResult {
  command: string;
  allowed: boolean;
  exitCode?: number;
  output?: string;
}

export async function inspectDependencies(
  directory: string,
  prohibited: string[] = [],
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
  return {
    dependencies,
    devDependencies,
    prohibited: [
      ...new Set([...dependencies, ...devDependencies].filter((name) => prohibited.includes(name))),
    ],
  };
}

export async function readTsConfig(
  directory: string,
  file = "tsconfig.json",
): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(directory, file), "utf8")) as Record<string, unknown>;
}

function complexityOf(file: SourceFile): {
  functions: number;
  branches: number;
  complexity: number;
} {
  let functions = 0;
  let branches = 0;
  file.forEachDescendant((node) => {
    if (
      node.isKind(SyntaxKind.FunctionDeclaration) ||
      node.isKind(SyntaxKind.ArrowFunction) ||
      node.isKind(SyntaxKind.MethodDeclaration)
    )
      functions++;
    if (
      [
        SyntaxKind.IfStatement,
        SyntaxKind.ForStatement,
        SyntaxKind.ForOfStatement,
        SyntaxKind.ForInStatement,
        SyntaxKind.WhileStatement,
        SyntaxKind.DoStatement,
        SyntaxKind.CaseClause,
        SyntaxKind.CatchClause,
        SyntaxKind.ConditionalExpression,
      ].includes(node.getKind())
    )
      branches++;
  });
  return { functions, branches, complexity: 1 + branches };
}

function sourceFindings(
  directory: string,
  tsconfig = "tsconfig.json",
  exclusions: string[] = [],
): RuleResult[] {
  const project = new Project({
    tsConfigFilePath: resolve(directory, tsconfig),
    skipAddingFilesFromTsConfig: false,
  });
  const findings: RuleResult[] = [];
  for (const file of project.getSourceFiles()) {
    const relativePath = relative(directory, file.getFilePath()).split("\\").join("/");
    if (
      exclusions.some(
        (value) =>
          relativePath === value || relativePath.startsWith(`${value.replace(/\/$/, "")}/`),
      ) ||
      /(^|\/)(test|tests|__tests__|generated)(\/|$)/.test(relativePath)
    )
      continue;
    const text = file.getFullText();
    const checks: Array<[string, RegExp, string]> = [
      ["typescript.any", /\bany\b/, "Avoid implicit or explicit any types."],
      ["typescript.eval", /(?:globalThis\.|global\.)?eval\s*\(/, "Do not execute dynamic code."],
      [
        "typescript.dynamic-require",
        /require\s*\((?![\"'`])/,
        "Use static imports or literal requires.",
      ],
      [
        "typescript.console",
        /console\.(?:log|debug|info)\s*\(/,
        "Use structured application logging.",
      ],
      [
        "typescript.empty-catch",
        /catch\s*\([^)]*\)\s*\{\s*\}/,
        "Handle or explicitly document caught errors.",
      ],
    ];
    for (const [id, pattern, remediation] of checks)
      if (pattern.test(text))
        findings.push({
          ruleId: id,
          passed: false,
          severity: "error",
          message: `${id} violation in ${relativePath}`,
          evidence: { file: relativePath },
          remediation,
        } as RuleResult);
  }
  return findings;
}

export function analyzeAst(
  directory: string,
  tsconfig = "tsconfig.json",
  exclusions: string[] = [],
): AstReport {
  const project = new Project({
    tsConfigFilePath: resolve(directory, tsconfig),
    skipAddingFilesFromTsConfig: false,
  });
  const excluded: string[] = [];
  let functions = 0;
  let branches = 0;
  let complexity = 0;
  for (const file of project.getSourceFiles()) {
    const path = relative(directory, file.getFilePath());
    if (
      exclusions.some(
        (value) =>
          path === value ||
          path.startsWith(`${value.replace(/\/$/, "")}/`) ||
          basename(path) === value,
      )
    ) {
      excluded.push(path);
      continue;
    }
    const result = complexityOf(file);
    functions += result.functions;
    branches += result.branches;
    complexity += result.complexity;
  }
  return {
    files: project.getSourceFiles().length - excluded.length,
    functions,
    branches,
    complexity,
    excluded: excluded.sort(),
  };
}

export function assertAllowedCommand(command: string, allowlist: string[]): void {
  const normalized = command.trim().replace(/\s+/g, " ");
  if (!allowlist.some((allowed) => normalized === allowed))
    throw new Error(`Command is not allowlisted: ${normalized}`);
}

export async function runAllowedCommand(
  command: string,
  allowlist: string[],
): Promise<CommandResult> {
  assertAllowedCommand(command, allowlist);
  const parts = command.trim().split(/\s+/);
  const executable = parts.shift();
  if (!executable) throw new Error("Command cannot be empty");
  return await new Promise((resolveResult) => {
    const child = spawn(executable, parts, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", (error) =>
      resolveResult({ command, allowed: true, exitCode: 1, output: error.message }),
    );
    child.on("close", (exitCode) =>
      resolveResult({ command, allowed: true, exitCode: exitCode ?? 1, output }),
    );
  });
}

export async function evaluate(options: EvaluationOptions): Promise<EvaluationReport> {
  const packageDirectory = options.packageDirectory ?? options.directory;
  const bundle = await compileSkill(packageDirectory);
  const dependency = await inspectDependencies(
    options.directory,
    bundle.package.metadata?.prohibitedDependencies as string[] | undefined,
  );
  const ast = analyzeAst(options.directory, options.tsconfig, options.exclusions);
  const commands = [];
  if (options.runCommands !== false && options.mode !== "audit")
    for (const command of options.commands ?? [])
      commands.push(await runAllowedCommand(command, options.allowedCommands ?? []));
  const results: RuleResult[] = [
    ...sourceFindings(options.directory, options.tsconfig, options.exclusions),
    ...bundle.rules.map((rule) => {
      const metric = rule.id.toLowerCase().includes("complex")
        ? ast.complexity
        : rule.id.toLowerCase().includes("dependency")
          ? dependency.prohibited.length
          : 0;
      const limit =
        typeof rule.max === "number"
          ? rule.max
          : rule.id.toLowerCase().includes("complex")
            ? 10
            : 0;
      const passed = rule.id.toLowerCase().includes("dependency")
        ? dependency.prohibited.length === 0
        : metric <= limit;
      return {
        ruleId: rule.id,
        passed,
        severity: rule.severity,
        message: passed ? "passed" : `limit exceeded: ${metric} > ${limit}`,
        evidence: { metric, limit },
      };
    }),
  ];
  const report: EvaluationReport = {
    package: bundle,
    passed: results.every((result) => result.passed),
    results,
    dependency,
    ast,
    commands,
  };
  const selectedMode = options.mode ?? "advisory";
  const errors = results.filter((result) => !result.passed && result.severity === "error").length;
  const warnings = results.filter(
    (result) => !result.passed && result.severity === "warning",
  ).length;
  report.passed = selectedMode === "enforced" ? errors === 0 && warnings === 0 : true;
  report.artifact = {
    artifactVersion: "1.0",
    runId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    workspace: { pathHash: sha256(resolve(options.directory)), gitHead: null, dirty: true },
    mind: {
      id: bundle.package.id,
      version: bundle.package.version,
      contentDigest: bundle.digest,
      signatureStatus: "unsigned",
    },
    mode: selectedMode,
    summary: {
      status: report.passed ? (warnings ? "warning" : "pass") : "fail",
      score: report.passed ? 1 : 0,
      hardViolationCount: errors,
      warningCount: warnings,
    },
    checks: results,
    commands,
    environment: { nodeVersion: process.version, platform: process.platform, lmpVersion: "0.1.0" },
    privacy: { sourceCodeIncluded: false, rawPathsIncluded: false, networkUsed: false },
  } as unknown as JsonValue;
  return ((options.redact ?? true)
    ? redactSecrets(report as unknown as JsonValue)
    : report) as unknown as EvaluationReport;
}

export const evaluateProject = evaluate;
export const analyzeDependencies = inspectDependencies;
