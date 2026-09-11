import { sign } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json.js";
import {
  createKeyPair,
  generateEd25519KeyPair,
  rotateMindPackageKey,
  sha256,
  signEd25519,
  signMindPackage,
  verifyEd25519,
  verifyMindPackage,
} from "./crypto.js";

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

  it("verifies Rust-compatible detached hexadecimal Ed25519 assets", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-crypto-"));
    await mkdir(join(directory, "signatures"));
    const keys = generateEd25519KeyPair();
    const manifest = Buffer.from('{"id":"lmp:test","version":"1.0.0"}');
    const signature = sign(null, manifest, keys.privateKey);
    const publicKey = keys.publicKey.export({ type: "spki", format: "der" }).subarray(-32);
    const hex = (value: Uint8Array) => `0x${Buffer.from(value).toString("hex")}`;
    await writeFile(join(directory, "mind.json"), manifest);
    await writeFile(join(directory, "signatures", "manifest.sig"), `${hex(signature)}\n`);
    await writeFile(join(directory, "signatures", "public-key.hex"), `${hex(publicKey)}\n`);
    await expect(verifyMindPackage(directory)).resolves.toMatchObject({
      signatureStatus: "verified",
    });
    await rm(directory, { recursive: true, force: true });
  });

  it("verifies the committed Rust-signed baseline profile", async () => {
    const profilePath = resolve(process.cwd(), "../../skills/baseline");
    await expect(verifyMindPackage(profilePath)).resolves.toMatchObject({
      signatureStatus: "verified",
    });
  });

  it("rotates a signer through an authenticated old-key handoff", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lmp-rotation-"));
    const oldKeyDirectory = join(directory, "old");
    const oldKeys = await createKeyPair(oldKeyDirectory);
    const packagePath = join(directory, "package");
    await mkdir(packagePath);
    await writeFile(
      join(packagePath, "mind.json"),
      '{"id":"lmp:mind:rotation","version":"1.0.0"}\n',
    );
    await mkdir(join(packagePath, "signatures"));
    await writeFile(
      join(packagePath, "signatures", "public-key.pem"),
      await readFile(oldKeys.publicPath, "utf8"),
    );
    await signMindPackage(packagePath, oldKeys.privatePath);
    const rotated = await rotateMindPackageKey(
      packagePath,
      oldKeys.privatePath,
      join(directory, "new"),
    );
    expect(rotated.revokedPublicKey).toContain("BEGIN PUBLIC KEY");
    await expect(verifyMindPackage(packagePath)).resolves.toMatchObject({
      signatureStatus: "verified",
    });
    const rotationPath = join(packagePath, "signatures", "key-rotation.json");
    const rotation = JSON.parse(await readFile(rotationPath, "utf8")) as { proofHex: string };
    await writeFile(
      rotationPath,
      JSON.stringify({ ...rotation, proofHex: `${rotation.proofHex}x` }),
    );
    await expect(verifyMindPackage(packagePath)).resolves.toMatchObject({
      signatureStatus: "invalid",
    });
    await rm(directory, { recursive: true, force: true });
  });
});
