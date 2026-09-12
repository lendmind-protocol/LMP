import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageRoot = fileURLToPath(new URL(".", import.meta.url));

test("forwards the public npx launcher to the scoped CLI", async () => {
  const result = await execFileAsync(process.execPath, [
    join(packageRoot, "bin.ts"),
    "--help",
  ]).catch((error) => error);
  assert.equal(result.code, 2);
  assert.match(result.stdout, /Usage: lmp/);
});

test("runs the documented init command in a clean project", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "lmp-npx-init-"));
  try {
    const result = await execFileAsync(
      process.execPath,
      [join(packageRoot, "bin.ts"), "init", "--baseline"],
      { cwd: workspace },
    );
    assert.equal(result.stderr, "");
    const config = JSON.parse(await readFile(join(workspace, ".lending-mind/config.json"), "utf8"));
    assert.equal(config.defaultMind, "lmp:mind:baseline");
    assert.match(
      await readFile(join(workspace, ".lending-mind/skills/baseline/mind.json"), "utf8"),
      /lmp:mind:baseline/,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("plain init leaves a clean project immediately evaluable", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "lmp-npx-plain-init-"));
  try {
    const result = await execFileAsync(process.execPath, [join(packageRoot, "bin.ts"), "init"], {
      cwd: workspace,
    });
    assert.equal(result.stderr, "");
    assert.match(
      await readFile(join(workspace, ".lending-mind/skills/baseline/mind.json"), "utf8"),
      /lmp:mind:baseline/,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
