import { describe, expect, it } from "vitest";
import { handle } from "./index.js";

describe("MCP stdio protocol", () => {
  it("implements initialize and the five tools", async () => {
    const initialized = await handle({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(initialized).toMatchObject({
      result: { protocolVersion: "2025-06-18", capabilities: { tools: {} } },
    });
    const listed = await handle({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect((listed as { result: { tools: unknown[] } }).result.tools).toHaveLength(5);
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
    ).toMatchObject({ error: { code: -32601 } });
  });
});
