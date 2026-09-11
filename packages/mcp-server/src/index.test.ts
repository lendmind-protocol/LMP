import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { handle, serve } from "./index.js";

describe("MCP stdio protocol", () => {
  it("implements initialize and the declared tool surface", async () => {
    const initialized = await handle({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(initialized).toMatchObject({
      result: { protocolVersion: "2025-06-18", capabilities: { tools: {} } },
    });
    const listed = await handle({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const tools = (listed as { result: { tools: Array<{ name: string }> } }).result.tools;
    expect(tools.length).toBeGreaterThanOrEqual(5);
    expect(tools.map((tool) => tool.name)).toContain("lmp_validate_mind");
  });

  it("returns standard errors and never enables commands implicitly", async () => {
    expect(await handle({ jsonrpc: "1.0", id: 1, method: "tools/list" })).toMatchObject({
      error: { code: -32600 },
    });
    expect(
      await handle({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "missing", arguments: {} },
      }),
    ).toMatchObject({ error: { code: -32602 } });
  });

  it("keeps one stdio session and does not answer notifications", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const lines: string[] = [];
    output.on("data", (chunk) =>
      lines.push(...chunk.toString().trim().split("\n").filter(Boolean)),
    );
    const running = serve(input, output);
    input.end(
      `${[
        JSON.stringify({ jsonrpc: "2.0", id: 10, method: "initialize", params: {} }),
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
        JSON.stringify({ jsonrpc: "2.0", id: 11, method: "tools/list", params: {} }),
      ].join("\n")}\n`,
    );
    await running;
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({
      id: 10,
      result: { protocolVersion: "2025-06-18" },
    });
    expect(JSON.parse(lines[1])).toMatchObject({ id: 11, result: { tools: expect.any(Array) } });
  });

  it("rejects duplicate in-flight request ids instead of losing a response", async () => {
    const [first, second] = await Promise.all([
      handle({ jsonrpc: "2.0", id: 12, method: "initialize", params: {} }),
      handle({ jsonrpc: "2.0", id: 12, method: "tools/list", params: {} }),
    ]);

    expect([first, second].filter((response) => response.error)).toHaveLength(1);
    expect([first, second]).toContainEqual(
      expect.objectContaining({
        id: 12,
        error: { code: -32600, message: "A request with this id is already in flight" },
      }),
    );
    expect([first, second].filter((response) => response.result)).toHaveLength(1);
  });
});
