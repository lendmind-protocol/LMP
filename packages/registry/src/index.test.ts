import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash, sign as cryptoSign } from "node:crypto";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateEd25519KeyPair } from "@lending-mind/sdk";
import { describe, expect, it } from "vitest";
import {
  assertVerifiedProvenanceSources,
  LocalRegistryClient,
  OciRegistryClient,
  StaticRegistryClient,
  syncLocalProfile,
  verifyProvenanceSources,
} from "./index.js";

function packageManifest(id: string, version: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    version,
    provenance: {
      sources: [
        {
          title: "Test source",
          url: "https://example.test/source",
          licenseNote: "Test-only public reference",
          evidenceTier: "primary",
          rights: "public-documentation",
          sourceType: "documentation",
          accessMethod: "public-http",
          contentDigest: `sha256:${"a".repeat(64)}`,
          retentionPolicy: "metadata-only",
          allowedUse: "test-verification",
        },
      ],
      attributionRequired: true,
    },
    ...extra,
  };
}

describe("LocalRegistryClient", () => {
  it("verifies provenance by comparing fetched source bytes to the declared digest", async () => {
    const body = Buffer.from("canonical source\n");
    const digest = `sha256:${createHash("sha256").update(body).digest("hex")}`;
    const packageValue = packageManifest("lmp:source-verification", "1.0.0");
    packageValue.provenance.sources[0].url = "http://127.0.0.1/source";
    packageValue.provenance.sources[0].contentDigest = digest;
    const fetchImpl: typeof globalThis.fetch = async () =>
      new Response(body, { status: 200 });
    await expect(assertVerifiedProvenanceSources(packageValue, fetchImpl)).resolves.toMatchObject([
      { verified: true, actualDigest: digest, status: 200 },
    ]);
    packageValue.provenance.sources[0].contentDigest = `sha256:${"0".repeat(64)}`;
    await expect(verifyProvenanceSources(packageValue, fetchImpl)).resolves.toMatchObject([
      { verified: false, error: "source content digest mismatch" },
    ]);
    await expect(assertVerifiedProvenanceSources(packageValue, fetchImpl)).rejects.toThrow(
      /provenance source verification failed/,
    );
  });

  it("installs, lists, resolves, pulls and verifies immutable packages", async () => {
    const root = await mkdtemp(join(tmpdir(), "lmp-registry-"));
    const source = await mkdtemp(join(tmpdir(), "lmp-package-"));
    await writeFile(
      join(source, "mind.json"),
      JSON.stringify(packageManifest("lmp:test", "1.0.0")),
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
      JSON.stringify(packageManifest("lmp:test", "1.0.0", { changed: true })),
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
      await writeFile(join(source, "mind.json"), JSON.stringify(packageManifest("lmp:range", version)));
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
      JSON.stringify(packageManifest("lmp:tamper", "1.0.0")),
    );
    const registry = new LocalRegistryClient(root);
    await registry.install(source);
    await writeFile(
      join(root, "lmp:tamper", "1.0.0", "mind.json"),
      JSON.stringify(packageManifest("lmp:tamper", "1.0.0", { changed: true })),
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
      JSON.stringify(packageManifest("lmp:oci-test", "1.0.0")),
    );
    const keys = generateEd25519KeyPair();
    const signedManifestBytes = await readFile(join(source, "mind.json"));
    const signatureHex = cryptoSign(null, signedManifestBytes, keys.privateKey).toString("hex");
    const publicKeyHex = keys.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
    await mkdir(join(source, "signatures"), { recursive: true });
    await writeFile(join(source, "signatures", "manifest.sig"), `0x${signatureHex}\n`);
    await writeFile(join(source, "signatures", "public-key.hex"), `0x${publicKeyHex}\n`);

    const blobs = new Map<string, Buffer>();
    let manifestBytes: Buffer | undefined;
    const server = createServer(async (request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      if (url.pathname.endsWith("/blobs/uploads/") && request.method === "POST") {
        response.writeHead(202, { location: "/upload/1" }).end();
        return;
      }
      if (url.pathname === "/upload/1" && request.method === "PUT") {
        const digest = url.searchParams.get("digest");
        if (!digest) { response.writeHead(400).end("digest required"); return; }
        blobs.set(digest, body);
        response.writeHead(201, { "docker-content-digest": digest }).end();
        return;
      }
      if (url.pathname.endsWith("/manifests/1.0.0") && request.method === "PUT") {
        manifestBytes = body;
        const digest = `sha256:${createHash("sha256").update(body).digest("hex")}`;
        response.writeHead(201, { "docker-content-digest": digest }).end();
        return;
      }
      if (url.pathname.endsWith("/tags/list")) {
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ name: "lmp/minds", tags: ["1.0.0"] }));
        return;
      }
      if (url.pathname.endsWith("/manifests/1.0.0") && manifestBytes) {
        response.writeHead(200, {
          "content-type": "application/vnd.oci.image.manifest.v1+json",
          "docker-content-digest": `sha256:${createHash("sha256").update(manifestBytes).digest("hex")}`,
        }).end(manifestBytes);
        return;
      }
      if (url.pathname.includes("/blobs/")) {
        const blob = blobs.get(url.pathname.split("/blobs/")[1]);
        if (blob) { response.writeHead(200).end(blob); return; }
      }
      response.writeHead(404).end("not found");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    try {
      const registry = new OciRegistryClient({
        registry: `http://127.0.0.1:${address.port}`,
        repository: "lmp/minds",
      });
      const published = await registry.install(source);
      expect(published.ociDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(await registry.list()).toEqual(["1.0.0"]);
      const pulled = await registry.pull("1.0.0", join(destination, "package"));
      expect(pulled.id).toBe("lmp:oci-test");
      expect(await registry.verify("1.0.0")).toBe(true);
      expect(await readFile(join(destination, "package", "mind.json"), "utf8")).toContain("lmp:oci-test");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(source, { recursive: true, force: true });
      await rm(destination, { recursive: true, force: true });
    }
  });

  it("syncs a complete package through a real local HTTP IPFS gateway and preserves provenance", async () => {
    const source = join(process.cwd(), "../create-lmp/profiles/tj-ponytail");
    const profileFiles = [
      "SKILL.md", "guidance.md", "evidence.json", "release.json", "evidence/README.md",
      "rules/manifest.json", "rules/commands.json", "rules/complexity.json", "rules/dependencies.json",
      "rules/typescript.json", "signatures/manifest.sig", "signatures/public-key.hex",
    ];
    const manifest = await readFile(join(source, "mind.json"));
    const signature = (await readFile(join(source, "signatures/manifest.sig"), "utf8")).trim();
    const publicKey = (await readFile(join(source, "signatures/public-key.hex"), "utf8")).trim();
    const packageFiles = await Promise.all(profileFiles.map(async (path) => {
      const bytes = await readFile(join(source, path));
      return { path, url: "PLACEHOLDER", digest: createHash("sha256").update(bytes).digest("hex") };
    }));
    const server = createServer(async (request, response) => {
      const path = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
      if (path === "/ipfs/testcid") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(manifest);
        return;
      }
      const relative = path.replace(/^\/files\//, "");
      const file = relative === "mind.json" ? join(source, relative) : join(source, relative);
      if (relative === "mind.json" || profileFiles.includes(relative)) {
        response.writeHead(200);
        response.end(await readFile(file));
        return;
      }
      if (path === "/registry.json") {
        const entry = {
          id: "lmp:mind:tj-ponytail",
          version: "1.0.0",
          ipfsCid: "testcid",
          digest: createHash("sha256").update(manifest).digest("hex"),
          signature,
          publicKey,
          packageFiles: packageFiles.map((file) => ({ ...file, url: `http://127.0.0.1:${(server.address() as { port: number }).port}/files/${file.path}` })),
        };
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ schemaVersion: "1", entries: [entry] }));
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    const root = await mkdtemp(join(tmpdir(), "lmp-static-sync-"));
    try {
      const client = new StaticRegistryClient({
        registryUrl: `http://127.0.0.1:${address.port}/registry.json`,
        trustedPublicKey: publicKey,
        ipfsGateways: [`http://127.0.0.1:${address.port}/ipfs/{cid}`],
      });
      const metadata = await client.sync("tj-ponytail", root);
      expect(metadata.provenance.sourceCount).toBe(1);
      const installedManifest = join(root, "lmp:mind:tj-ponytail", "1.0.0", "mind.json");
      expect(await readFile(installedManifest, "utf8")).toContain("tj-ponytail");
      await writeFile(installedManifest, "tampered\n");
      await expect(client.sync("tj-ponytail", root)).rejects.toThrow(/stored integrity/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });

  it("blocks local synchronization when provenance is absent", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "lmp-local-source-"));
    const destination = await mkdtemp(join(tmpdir(), "lmp-local-destination-"));
    await mkdir(join(sourceRoot, "missing-provenance"), { recursive: true });
    await writeFile(join(sourceRoot, "missing-provenance", "mind.json"), JSON.stringify({ id: "lmp:missing", version: "1.0.0" }));
    await expect(syncLocalProfile(sourceRoot, "missing-provenance", destination)).rejects.toThrow(/provenance/);
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(destination, { recursive: true, force: true });
  });
});
