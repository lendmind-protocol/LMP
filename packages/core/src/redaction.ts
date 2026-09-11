import type { JsonValue } from "./types.js";

const SENSITIVE_KEY =
  /password|passphrase|secret|token|api[_-]?key|private[_-]?key|authorization|credential/i;

const SENSITIVE_TEXT =
  /((?:pass(?:word|phrase)?|secret|token|api[_-]?key|private[_-]?key|authorization|credential)\s*[=:]\s*)([^\s,;]+)/gi;

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

/** Redact credential-like values in human-readable command output. */
export function redactText(value: string, replacement = "[REDACTED]"): string {
  return value.replace(SENSITIVE_TEXT, `$1${replacement}`);
}

export const redact = redactSecrets;
