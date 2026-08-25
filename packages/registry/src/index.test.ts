import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateEd25519KeyPair } from "@lending-mind/core";
import { describe, expect, it } from "vitest";
import { LocalRegistryClient, OciRegistryClient } from "./index.js";

describe("LocalRegistryClient", () => {
  it("installs, lists, resolves, pulls and verifies immutable packages", async () => {
    const root = await mkdtemp(join(tmpdir(), "lmp-registry-"));
    const source = await mkdtemp(join(tmpdir(), "lmp-package-"));
    await writeFile(
      join(source, "mind.json"),
      JSON.stringify({ id: "lmp:test", version: "1.0.0" }),
    );
    const keys = generateEd25519KeyPair();
    const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
    const registry = new LocalRegistryClient(root);
    const metadata = await registry.install(source, { privateKey: keys.privateKey, publicKey });
    expect(metadata.signature?.algorithm).toBe("ed25519");
    expect(await registry.list()).toHaveLength(1);
    expect(await registry.resolve("lmp:test", "1.0.0")).toMatchObject({ digest: metadata.digest });
    expect(await registry.verify("lmp:test", "1.0.0")).toBe(true);
    const destination = join(root, "pulled");
    await registry.pull("lmp:test", "1.0.0", destination);
    await writeFile(
      join(source, "mind.json"),
      JSON.stringify({ id: "lmp:test", version: "1.0.0", changed: true }),
    );
    await expect(registry.install(source)).rejects.toThrow("immutable");
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  });

  it("rejects traversal and OCI use explicitly", async () => {
    const root = await mkdtemp(join(tmpdir(), "lmp-registry-"));
    const registry = new LocalRegistryClient(root);
    await expect(registry.resolve("../escape", "1.0.0")).rejects.toThrow("Unsafe package id");
    expect(() => new OciRegistryClient().list()).toThrow("OCI registry support is not implemented");
    await rm(root, { recursive: true, force: true });
  });
});
