import { chmod, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { executeToolPlan, normalizeToolResult, planToolAdapters } from "./tool-adapters.js";

describe("tool adapters", () => {
  it("detects configured tools without installing or executing them", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-adapters-"));
    await writeFile(join(directory, "tsconfig.json"), "{}\n");
    const plan = await planToolAdapters(directory);
    const typescript = plan.detections.find((tool) => tool.adapterId === "typescript");
    expect(typescript).toMatchObject({
      configured: true,
      capabilities: ["typecheck", "typescript-ast"],
    });
    expect(plan.plans.filter((item) => item.adapterId === "typescript").length).toBeLessThanOrEqual(
      1,
    );
    expect(
      plan.skipped.some((tool) => tool.adapterId === "typescript") ||
        plan.plans.some((item) => item.adapterId === "typescript"),
    ).toBe(true);
  });

  it("creates an explicit plan only for an installed configured tool", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-adapters-installed-"));
    await writeFile(join(directory, "tsconfig.json"), "{}\n");
    const executable = join(directory, "node_modules", ".bin");
    await mkdir(executable, { recursive: true });
    const tsc = join(executable, "tsc");
    await writeFile(tsc, "#!/bin/sh\nexit 0\n");
    await chmod(tsc, 0o755);
    const plan = await planToolAdapters(directory);
    expect(plan.plans).toHaveLength(1);
    expect(plan.plans[0]).toMatchObject({ adapterId: "typescript", command: ["tsc", "--noEmit"] });
  });

  it("requires explicit authorization and normalizes the result", async () => {
    const result = await executeToolPlan(
      {
        adapterId: "typescript",
        command: ["tsc", "--noEmit"],
        cwd: process.cwd(),
        capabilities: [],
        detection: {
          adapterId: "typescript",
          configured: true,
          installed: true,
          executable: "tsc",
          capabilities: [],
          reason: "test",
        },
      },
      { authorize: false },
    );
    expect(result.allowed).toBe(false);
    expect(normalizeToolResult(result)).toMatchObject({
      ruleId: "tool.typescript",
      passed: false,
      severity: "error",
    });
  });

  it("executes the detected binary only after authorization and redacts output", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-adapters-exec-"));
    const executableDirectory = join(directory, "node_modules", ".bin");
    await mkdir(executableDirectory, { recursive: true });
    const executable = join(executableDirectory, "tsc");
    await writeFile(
      executable,
      "#!/bin/sh\nprintf 'token=abc123\\nmarker=%s\\n' \"${LMP_TEST_MARKER:-missing}\"\n",
    );
    await chmod(executable, 0o755);
    const previousMarker = process.env.LMP_TEST_MARKER;
    process.env.LMP_TEST_MARKER = "should-not-leak";
    try {
      const result = await executeToolPlan(
        {
          adapterId: "typescript",
          command: ["tsc", "--noEmit"],
          cwd: directory,
          capabilities: ["typecheck"],
          detection: {
            adapterId: "typescript",
            configured: true,
            installed: true,
            executable,
            capabilities: ["typecheck"],
            reason: "test",
          },
        },
        { authorize: true },
      );
      expect(result).toMatchObject({
        allowed: true,
        exitCode: 0,
        timedOut: false,
        output: "token=[REDACTED]\nmarker=missing\n",
      });
      expect(normalizeToolResult(result).passed).toBe(true);
    } finally {
      process.env.LMP_TEST_MARKER = previousMarker;
    }
  });

  it("rejects forged executables and workspace escapes before spawning", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-adapters-boundary-"));
    const outside = await mkdtemp(join(tmpdir(), "lmp-adapters-outside-"));
    const basePlan = {
      adapterId: "typescript" as const,
      command: ["tsc", "--noEmit"],
      cwd: outside,
      capabilities: ["typecheck"],
      detection: {
        adapterId: "typescript" as const,
        configured: true,
        installed: true,
        executable: "/usr/bin/evil-tool",
        capabilities: ["typecheck"],
        reason: "test",
      },
    };
    const result = await executeToolPlan(basePlan, {
      authorize: true,
      workspaceRoot: directory,
    });
    expect(result).toMatchObject({
      allowed: false,
      exitCode: null,
      output: "Execution plan is outside the approved workspace boundary.",
    });

    const forged = await executeToolPlan(
      {
        ...basePlan,
        cwd: directory,
        detection: { ...basePlan.detection, executable: "/usr/bin/evil-tool" },
      },
      { authorize: true, workspaceRoot: directory },
    );
    expect(forged).toMatchObject({
      allowed: false,
      exitCode: null,
      output: "Execution plan executable does not match its adapter.",
    });

    const forgedExecutablePath = await executeToolPlan(
      {
        ...basePlan,
        cwd: directory,
        detection: { ...basePlan.detection, executable: "/tmp/tsc" },
      },
      { authorize: true, workspaceRoot: directory },
    );
    expect(forgedExecutablePath).toMatchObject({
      allowed: false,
      exitCode: null,
      output: "Execution plan executable does not match the discovered workspace tool.",
    });

    const forgedArguments = await executeToolPlan(
      {
        ...basePlan,
        cwd: directory,
        detection: { ...basePlan.detection, executable: "tsc" },
        command: ["tsc", "--noEmit", "--project", "/outside"],
      },
      { authorize: true, workspaceRoot: directory },
    );
    expect(forgedArguments).toMatchObject({
      allowed: false,
      exitCode: null,
      output: "Execution plan arguments are not an approved adapter command.",
    });

    const linked = join(directory, "linked-workspace");
    await symlink(outside, linked, "dir");
    const symlinkEscape = await executeToolPlan(
      {
        ...basePlan,
        cwd: linked,
        detection: { ...basePlan.detection, executable: "tsc" },
      },
      { authorize: true, workspaceRoot: directory },
    );
    expect(symlinkEscape).toMatchObject({
      allowed: false,
      exitCode: null,
      output: "Execution plan is outside the approved workspace boundary.",
    });
  });

  it("rejects unbounded or invalid execution timeouts before spawning", async () => {
    const result = await executeToolPlan(
      {
        adapterId: "typescript",
        command: ["tsc", "--noEmit"],
        cwd: process.cwd(),
        capabilities: [],
        detection: {
          adapterId: "typescript",
          configured: true,
          installed: true,
          executable: "tsc",
          capabilities: [],
          reason: "test",
        },
      },
      { authorize: true, timeoutMs: 120_001 },
    );
    expect(result).toMatchObject({
      allowed: false,
      exitCode: null,
      output: "Execution timeout must be between 1 and 120000 ms.",
    });
  });
});
