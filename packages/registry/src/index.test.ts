import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { sign as cryptoSign } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateEd25519KeyPair } from "@lending-mind/sdk";
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
    expect((await registry.resolve("lmp:test", "^1.0.0")).version).toBe("1.0.0");
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

  it("rejects traversal and invalid OCI configuration", async () => {
    const root = await mkdtemp(join(tmpdir(), "lmp-registry-"));
    const registry = new LocalRegistryClient(root);
    await expect(registry.resolve("../escape", "1.0.0")).rejects.toThrow("Unsafe package id");
    expect(() => new OciRegistryClient({ registry: "", repository: "minds" })).toThrow(
      "OCI registry is required",
    );
    await rm(root, { recursive: true, force: true });
  });

  it("selects the highest installed version for a supported range", async () => {
    const root = await mkdtemp(join(tmpdir(), "lmp-registry-"));
    const source = await mkdtemp(join(tmpdir(), "lmp-package-"));
    const registry = new LocalRegistryClient(root);
    for (const version of ["1.0.0", "1.2.0", "2.0.0"]) {
      await writeFile(join(source, "mind.json"), JSON.stringify({ id: "lmp:range", version }));
      await registry.install(source);
    }
    expect((await registry.resolve("lmp:range", "^1.0.0")).version).toBe("1.2.0");
    expect((await registry.resolve("lmp:range", "~1.0.0")).version).toBe("1.0.0");
    await expect(registry.resolve("lmp:range", "^3.0.0")).rejects.toThrow(
      "No installed version satisfies ^3.0.0",
    );
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  });

  it("does not silently hide an incomplete local registry entry", async () => {
    const root = await mkdtemp(join(tmpdir(), "lmp-registry-"));
    await mkdir(join(root, "lmp:test", "1.0.0"), { recursive: true });
    const registry = new LocalRegistryClient(root);
    await expect(registry.list()).rejects.toThrow("incomplete or invalid");
    await rm(root, { recursive: true, force: true });
  });

  it("fails closed when a stored package changes after installation", async () => {
    const root = await mkdtemp(join(tmpdir(), "lmp-registry-"));
    const source = await mkdtemp(join(tmpdir(), "lmp-package-"));
    await writeFile(
      join(source, "mind.json"),
      JSON.stringify({ id: "lmp:tamper", version: "1.0.0" }),
    );
    const registry = new LocalRegistryClient(root);
    await registry.install(source);
    await writeFile(
      join(root, "lmp:tamper", "1.0.0", "mind.json"),
      JSON.stringify({ id: "lmp:tamper", version: "1.0.0", changed: true }),
    );
    await expect(registry.pull("lmp:tamper", "1.0.0", join(root, "pulled"))).rejects.toThrow(
      /failed digest or signature verification/,
    );
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  });

  it("publishes, pulls, and verifies an OCI package through the distribution contract", async () => {
    const source = await mkdtemp(join(tmpdir(), "lmp-oci-source-"));
    const destination = await mkdtemp(join(tmpdir(), "lmp-oci-destination-"));
    await writeFile(
      join(source, "mind.json"),
      JSON.stringify({ id: "lmp:oci-test", version: "1.0.0" }),
    );
    const keys = generateEd25519KeyPair();
    const manifestBytes = await readFile(join(source, "mind.json"));
    const signatureHex = cryptoSign(null, manifestBytes, keys.privateKey).toString("hex");
    const publicKeyHex = keys.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
    await mkdir(join(source, "signatures"), { recursive: true });
    await writeFile(join(source, "signatures", "manifest.sig"), `0x${signatureHex}\n`);
    await writeFile(join(source, "signatures", "public-key.hex"), `0x${publicKeyHex}\n`);

    const blobs = new Map<string, Uint8Array>();
    let manifest: Record<string, unknown> | undefined;
    const manifestDigest = `sha256:${"a".repeat(64)}`;
    const fakeFetch: typeof fetch = async (input, init = {}) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      const body = init.body
        ? Buffer.from(await new Response(init.body).arrayBuffer())
        : Buffer.alloc(0);
      if (url.pathname.endsWith("/blobs/uploads/"))
        return new Response(null, { status: 202, headers: { location: "/upload/1" } });
      if (url.pathname === "/upload/1" && init.method === "PUT") {
        const digest = url.searchParams.get("digest");
        if (!digest) return new Response("digest required", { status: 400 });
        blobs.set(digest, body);
        return new Response(null, { status: 201, headers: { "docker-content-digest": digest } });
      }
      if (url.pathname.endsWith("/manifests/1.0.0") && init.method === "PUT") {
        manifest = JSON.parse(body.toString("utf8"));
        return new Response(null, {
          status: 201,
          headers: { "docker-content-digest": manifestDigest },
        });
      }
      if (url.pathname.endsWith("/tags/list"))
        return Response.json({ name: "lmp/minds", tags: ["1.0.0"] });
      if (url.pathname.endsWith("/manifests/1.0.0"))
        return Response.json(manifest, { headers: { "docker-content-digest": manifestDigest } });
      if (url.pathname.includes("/blobs/")) {
        const blob = blobs.get(url.pathname.split("/blobs/")[1]);
        return blob ? new Response(Buffer.from(blob)) : new Response("not found", { status: 404 });
      }
      return new Response("not found", { status: 404 });
    };

    const registry = new OciRegistryClient({
      registry: "https://registry.test",
      repository: "lmp/minds",
      fetch: fakeFetch,
    });
    const published = await registry.install(source);
    expect(published.ociDigest).toBe(manifestDigest);
    expect(await registry.list()).toEqual(["1.0.0"]);
    const pulled = await registry.pull("1.0.0", join(destination, "package"));
    expect(pulled.id).toBe("lmp:oci-test");
    expect(await registry.verify("1.0.0")).toBe(true);
    expect(await readFile(join(destination, "package", "mind.json"), "utf8")).toContain(
      "lmp:oci-test",
    );
    await rm(source, { recursive: true, force: true });
    await rm(destination, { recursive: true, force: true });
  });
});
