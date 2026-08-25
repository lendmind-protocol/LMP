import { expect, it } from "vitest";
import { redactSecrets } from "./redaction.js";

it("redacts sensitive fields without mutating the input", () => {
  const input = { token: "secret", nested: { value: 1 }, list: [{ password: "pw" }] };
  expect(redactSecrets(input)).toEqual({
    token: "[REDACTED]",
    nested: { value: 1 },
    list: [{ password: "[REDACTED]" }],
  });
  expect(input.token).toBe("secret");
});
