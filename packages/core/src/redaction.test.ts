import { expect, it } from "vitest";
import { redactSecrets, redactText } from "./redaction.js";

it("redacts sensitive fields without mutating the input", () => {
  const input = { token: "secret", nested: { value: 1 }, list: [{ password: "pw" }] };
  expect(redactSecrets(input)).toEqual({
    token: "[REDACTED]",
    nested: { value: 1 },
    list: [{ password: "[REDACTED]" }],
  });
  expect(input.token).toBe("secret");
});

it("preserves boolean policy fields whose names contain pass", () => {
  expect(redactSecrets({ passed: false, pass: true, password: "secret" })).toEqual({
    passed: false,
    pass: true,
    password: "[REDACTED]",
  });
});

it("redacts credential-like values in command output", () => {
  expect(redactText("token=abc123 authorization: BearerXYZ api_key: secret-value")).toBe(
    "token=[REDACTED] authorization: [REDACTED] api_key: [REDACTED]",
  );
});
