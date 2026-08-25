import type { JsonValue } from "./types.js";

const SENSITIVE_KEY =
  /pass(word)?|secret|token|api[_-]?key|private[_-]?key|authorization|credential/i;

export function redactSecrets<T extends JsonValue>(value: T, replacement = "[REDACTED]"): T {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, replacement)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? replacement : redactSecrets(item, replacement),
      ]),
    ) as T;
  }
  return value;
}

export const redact = redactSecrets;
