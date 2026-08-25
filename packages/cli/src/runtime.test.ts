import { describe, expect, it } from "vitest";
import { instructions } from "./runtime.js";

describe("CLI runtime", () => {
  it("produces deterministic visible instructions", () => {
    const mind = { id: "lmp:test", version: "1", rules: [] };
    expect(instructions(mind, "json")).toContain('"mind": "lmp:test"');
    expect(instructions(mind)).toContain("relevant checks");
  });
});
