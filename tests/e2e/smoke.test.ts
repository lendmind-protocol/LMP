import { describe, expect, it } from "vitest";

describe("Lending-Mind MVP", () => {
  it("validates a canonical bundled skill", async () => {
    const { validateMindPackage } = await import("@lending-mind/skill-schema");
    expect((await validateMindPackage("skills/typescript-minimal")).valid).toBe(true);
  });
});
