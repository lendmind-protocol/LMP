import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initializeLendingMind } from "./index.js";

describe("initializeLendingMind", () => {
  it("creates a local manifest without telemetry or git hooks", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-create-"));
    const manifest = await initializeLendingMind({ directory });
    expect(JSON.parse(await readFile(manifest, "utf8"))).toMatchObject({
      id: "lmp:mind:local-baseline",
    });
    await expect(stat(join(directory, ".lmp_telemetry"))).rejects.toThrow();
    await expect(initializeLendingMind({ directory })).resolves.toBe(manifest);
    await rm(directory, { recursive: true, force: true });
  });
});
