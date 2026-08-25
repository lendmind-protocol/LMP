import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json.js";
import { generateEd25519KeyPair, sha256, signEd25519, verifyEd25519 } from "./crypto.js";

describe("canonical package crypto", () => {
  it("canonicalizes key order and signs only the untampered payload", () => {
    const payload = { z: 1, a: { y: true, x: "ok" } } as const;
    expect(canonicalJson(payload)).toBe('{"a":{"x":"ok","y":true},"z":1}');
    expect(sha256(payload)).toMatch(/^sha256:[0-9a-f]{64}$/);
    const keys = generateEd25519KeyPair();
    const signature = signEd25519(payload, keys.privateKey);
    expect(verifyEd25519({ a: payload.a, z: 1 }, signature, keys.publicKey)).toBe(true);
    expect(verifyEd25519({ ...payload, z: 2 }, signature, keys.publicKey)).toBe(false);
  });
});
