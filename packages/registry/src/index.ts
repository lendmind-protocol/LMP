import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { computePackageDigest, signEd25519, verifyEd25519 } from "@lending-mind/sdk";
import { validateMindPackage } from "@lending-mind/skill";

export interface PackageSignature {
  algorithm: "ed25519";
  value: string;
  publicKey: string;
}

export interface LocalPackageMetadata {
  id: string;
  version: string;
  digest: string;
  installedAt: string;
  signature?: PackageSignature;
}

export interface InstallOptions {
  privateKey?: Parameters<typeof signEd25519>[1];
  publicKey?: string;
}

export interface OciRegistryOptions {
  registry: string;
  repository: string;
  token?: string;
  username?: string;
  password?: string;
  fetch?: typeof globalThis.fetch;
}

export interface OciPackageMetadata extends LocalPackageMetadata {
  ociDigest: string;
  registry: string;
  repository: string;
}

export interface RegistryPackageFile {
  path: string;
  url: string;
  digest: string;
}

export interface RegistryIndexEntry {
  id: string;
  version: string;
  manifestUrl?: string;
  ipfsCid?: string | null;
  digest?: string;
  signature?: string;
  publicKey?: string;
  packageFiles?: RegistryPackageFile[];
}

export interface StaticRegistryClientOptions {
  registryUrl: string;
  trustedPublicKey: string;
  ipfsGateways?: string[];
  fetch?: typeof globalThis.fetch;
}

export interface StaticSyncMetadata extends LocalPackageMetadata {
  source: string;
  provenance: { sourceCount: number; digests: string[] };
}

export interface ProvenanceSourceVerification {
  title: string;
  url: string;
  expectedDigest: string;
  verified: boolean;
  status?: number;
  actualDigest?: string;
  error?: string;
}

interface OciDescriptor {
  mediaType: string;
  digest: string;
  size: number;
  annotations?: Record<string, string>;
}

interface OciManifest {
  schemaVersion: 2;
  mediaType: string;
  config: OciDescriptor;
  layers: OciDescriptor[];
}

const ociManifestMediaType = "application/vnd.oci.image.manifest.v1+json";
const packageConfigMediaType = "application/vnd.lending-mind.package.config.v1+json";
const packageLayerMediaType = "application/vnd.lending-mind.package.file.v1+json";

const metadataFile = ".lmp-registry.json";

function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value))
    throw new Error(`Invalid ${label}; expected a sha256 digest`);
}

function digestMatches(expected: string, actual: string): boolean {
  return (
    expected.replace(/^sha256:/, "").toLowerCase() === actual.replace(/^sha256:/, "").toLowerCase()
  );
}

function validateTransportUrl(value: string, label: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    throw new Error(`${label} must use HTTPS (loopback HTTP is allowed only for local tests)`);
}

function validateIpfsGateway(value: string): void {
  if (!value.includes("{cid}")) throw new Error("IPFS gateway must contain a {cid} placeholder");
  validateTransportUrl(value.replace("{cid}", "cid"), "IPFS gateway");
}

function validatePackageRelativePath(value: string): void {
  if (!value || value.startsWith("/") || value.includes("\\") || value.split("/").includes(".."))
    throw new Error(`Package file path is unsafe: ${value}`);
  if (value === "mind.json") throw new Error("packageFiles must not replace the signed manifest");
}

function publicKeyBytes(value: string): Buffer {
  const normalized = value.trim().replace(/^0x/, "");
  if (/^[0-9a-f]{64}$/i.test(normalized)) return Buffer.from(normalized, "hex");
  return createPublicKey(value).export({ type: "spki", format: "der" }).subarray(-32);
}

function verifyManifestSignature(
  payload: Uint8Array,
  signature: string,
  publicKey: string,
): boolean {
  try {
    const key = publicKeyBytes(publicKey);
    const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), key]);
    return cryptoVerify(
      null,
      payload,
      createPublicKey({ key: spki, format: "der", type: "spki" }),
      Buffer.from(signature.trim().replace(/^0x/, ""), "hex"),
    );
  } catch {
    return false;
  }
}

export function verifyProvenance(value: unknown): { sourceCount: number; digests: string[] } {
  const provenance = (value as { provenance?: { sources?: unknown[] } } | undefined)?.provenance;
  if (!provenance || !Array.isArray(provenance.sources) || provenance.sources.length === 0)
    throw new Error("package provenance is required for registry ingestion");
  const digests: string[] = [];
  for (const source of provenance.sources) {
    if (!source || typeof source !== "object")
      throw new Error("package provenance source is invalid");
    const record = source as Record<string, unknown>;
    if (
      typeof record.url !== "string" ||
      typeof record.title !== "string" ||
      typeof record.licenseNote !== "string"
    )
      throw new Error("package provenance source must include title, url, and licenseNote");
    validateTransportUrl(record.url, "provenance source URL");
    if (
      typeof record.contentDigest !== "string" ||
      !/^sha256:[0-9a-f]{64}$/.test(record.contentDigest)
    )
      throw new Error(`provenance source ${record.title} must include a SHA-256 content digest`);
    digests.push(record.contentDigest);
  }
  return { sourceCount: digests.length, digests };
}

/** Fetch and byte-verify every declared provenance source without mutating the package. */
export async function verifyProvenanceSources(
  value: unknown,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<ProvenanceSourceVerification[]> {
  const provenance = (value as { provenance?: { sources?: unknown[] } } | undefined)?.provenance;
  if (!provenance || !Array.isArray(provenance.sources) || provenance.sources.length === 0)
    throw new Error("package provenance is required for source verification");
  return Promise.all(
    provenance.sources.map(async (source): Promise<ProvenanceSourceVerification> => {
      if (!source || typeof source !== "object")
        throw new Error("package provenance source is invalid");
      const record = source as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title : "untitled source";
      const url = typeof record.url === "string" ? record.url : "";
      const expectedDigest = typeof record.contentDigest === "string" ? record.contentDigest : "";
      try {
        if (!url || !expectedDigest) throw new Error("source title, URL, and digest are required");
        validateTransportUrl(url, "provenance source URL");
        assertDigest(expectedDigest, `provenance source ${title} digest`);
        const response = await fetchImpl(url);
        const bytes = Buffer.from(await response.arrayBuffer());
        const actualDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
        if (!response.ok) throw new Error(`source returned HTTP ${response.status}`);
        return {
          title,
          url,
          expectedDigest,
          actualDigest,
          status: response.status,
          verified: digestMatches(expectedDigest, actualDigest),
          ...(digestMatches(expectedDigest, actualDigest)
            ? {}
            : { error: "source content digest mismatch" }),
        };
      } catch (error) {
        return {
          title,
          url,
          expectedDigest,
          verified: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
}

/** Require byte-verified provenance before a caller treats a package as source-backed. */
export async function assertVerifiedProvenanceSources(
  value: unknown,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<ProvenanceSourceVerification[]> {
  const results = await verifyProvenanceSources(value, fetchImpl);
  const failures = results.filter((result) => !result.verified);
  if (failures.length)
    throw new Error(
      `provenance source verification failed: ${failures
        .map((failure) => `${failure.title}: ${failure.error ?? "digest mismatch"}`)
        .join("; ")}`,
    );
  return results;
}

type Semver = { major: number; minor: number; patch: number; prerelease: string[] };

function parseVersion(value: string): Semver {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      value,
    );
  if (!match) throw new Error(`Invalid semantic version: ${value}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? [],
  };
}

function compareVersion(left: Semver, right: Semver): number {
  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  if (!left.prerelease.length && right.prerelease.length) return 1;
  if (left.prerelease.length && !right.prerelease.length) return -1;
  for (
    let index = 0;
    index < Math.max(left.prerelease.length, right.prerelease.length);
    index += 1
  ) {
    const a = left.prerelease[index];
    const b = right.prerelease[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    const aNumber = /^\d+$/.test(a);
    const bNumber = /^\d+$/.test(b);
    if (aNumber && bNumber) return Number(a) - Number(b);
    if (aNumber !== bNumber) return aNumber ? -1 : 1;
    return a < b ? -1 : 1;
  }
  return 0;
}

function satisfiesVersion(version: string, specification: string): boolean {
  const candidate = parseVersion(version);
  if (specification === "latest" || specification === "*") return !candidate.prerelease.length;
  if (/^\d+\.\d+\.\d+$/.test(specification))
    return compareVersion(candidate, parseVersion(specification)) === 0;
  const operator = specification[0];
  if (operator !== "^" && operator !== "~")
    throw new Error(`Unsupported version range: ${specification}`);
  const base = parseVersion(specification.slice(1));
  if (candidate.prerelease.length || compareVersion(candidate, base) < 0) return false;
  if (operator === "~") return candidate.major === base.major && candidate.minor === base.minor;
  if (base.major > 0) return candidate.major === base.major;
  if (base.minor > 0) return candidate.major === 0 && candidate.minor === base.minor;
  return candidate.major === 0 && candidate.minor === 0 && candidate.patch === base.patch;
}

function selectVersion(versions: string[], specification: string): string {
  const matches = versions.filter((version) => {
    try {
      return satisfiesVersion(version, specification);
    } catch {
      return false;
    }
  });
  if (!matches.length) throw new Error(`No installed version satisfies ${specification}`);
  return matches.sort((left, right) => compareVersion(parseVersion(right), parseVersion(left)))[0];
}

function safePart(value: string, label: string): string {
  if (!value || value === "." || value === ".." || /[\\/\0]/.test(value))
    throw new Error(`Unsafe ${label}`);
  return value;
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}

async function rejectSymlinks(root: string): Promise<void> {
  const resolvedRoot = await realpath(root);
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlinks are not allowed: ${path}`);
      if (entry.isDirectory()) await visit(path);
    }
  }
  await visit(resolvedRoot);
}

export class StaticRegistryClient {
  private readonly registryUrl: string;
  private readonly trustedPublicKey: string;
  private readonly ipfsGateways: string[];
  private readonly request: typeof globalThis.fetch;

  constructor(options: StaticRegistryClientOptions) {
    validateTransportUrl(options.registryUrl, "static registry URL");
    this.registryUrl = options.registryUrl;
    this.trustedPublicKey = options.trustedPublicKey;
    publicKeyBytes(options.trustedPublicKey);
    this.ipfsGateways = options.ipfsGateways ?? ["https://ipfs.io/ipfs/{cid}"];
    for (const gateway of this.ipfsGateways) validateIpfsGateway(gateway);
    this.request = options.fetch ?? globalThis.fetch;
  }

  async sync(mindId: string, destination: string): Promise<StaticSyncMetadata> {
    const indexResponse = await this.http(this.registryUrl);
    const index = (await indexResponse.json()) as { schemaVersion?: unknown; entries?: unknown };
    if (index.schemaVersion !== "1" || !Array.isArray(index.entries))
      throw new Error("static registry index is invalid");
    const entry = index.entries.find((candidate): candidate is RegistryIndexEntry =>
      Boolean(
        candidate &&
          typeof candidate === "object" &&
          ((candidate as RegistryIndexEntry).id === mindId ||
            (candidate as RegistryIndexEntry).id?.endsWith(`:${mindId}`)),
      ),
    );
    if (!entry) throw new Error(`mind profile '${mindId}' was not found in ${this.registryUrl}`);
    if (
      typeof entry.id !== "string" ||
      typeof entry.version !== "string" ||
      typeof entry.digest !== "string" ||
      typeof entry.signature !== "string" ||
      typeof entry.publicKey !== "string"
    )
      throw new Error(
        "static registry entry must provide identity, digest, signature, and public key",
      );
    if (
      publicKeyBytes(entry.publicKey).toString("hex") !==
      publicKeyBytes(this.trustedPublicKey).toString("hex")
    )
      throw new Error("static registry public key does not match the configured trust anchor");

    const candidates = entry.manifestUrl ? [entry.manifestUrl] : [];
    if (entry.ipfsCid) {
      if (!/^[A-Za-z0-9]+$/.test(entry.ipfsCid))
        throw new Error("static registry IPFS CID is invalid");
      candidates.push(
        ...this.ipfsGateways.map((gateway) => gateway.replace("{cid}", entry.ipfsCid as string)),
      );
    }
    if (!candidates.length) throw new Error("registry entry has neither manifestUrl nor ipfsCid");

    let manifestBytes: Buffer | undefined;
    let source: string | undefined;
    const failures: string[] = [];
    for (const candidate of candidates) {
      try {
        validateTransportUrl(candidate, "manifest URL");
        const response = await this.http(candidate);
        const bytes = Buffer.from(await response.arrayBuffer());
        const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
        if (!digestMatches(entry.digest, digest)) throw new Error("manifest digest mismatch");
        if (!verifyManifestSignature(bytes, entry.signature, entry.publicKey))
          throw new Error("manifest signature verification failed");
        manifestBytes = bytes;
        source = candidate;
        break;
      } catch (error) {
        failures.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!manifestBytes || !source)
      throw new Error(`all static profile sources failed verification: ${failures.join("; ")}`);

    const temporary = await mkdtemp(join(tmpdir(), "lmp-static-sync-"));
    try {
      await writeFile(join(temporary, "mind.json"), manifestBytes, { flag: "wx" });
      for (const file of entry.packageFiles ?? []) {
        validatePackageRelativePath(file.path);
        validateTransportUrl(file.url, "package file URL");
        const response = await this.http(file.url);
        const bytes = Buffer.from(await response.arrayBuffer());
        const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
        if (!digestMatches(file.digest, digest))
          throw new Error(`package file digest mismatch: ${file.path}`);
        const target = resolve(temporary, file.path);
        if (!inside(temporary, target))
          throw new Error(`package file path escapes staging directory: ${file.path}`);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, bytes, { flag: "wx" });
      }
      const validation = await validateMindPackage(temporary);
      if (!validation.valid || !validation.package)
        throw new Error(validation.diagnostics.map((diagnostic) => diagnostic.message).join("; "));
      if (validation.package.id !== entry.id || validation.package.version !== entry.version)
        throw new Error("static profile identity does not match the selected registry entry");
      const provenance = verifyProvenance(validation.package);
      if (entry.packageFiles === undefined)
        throw new Error("complete packageFiles are required to activate a static registry package");
      const installed = await new LocalRegistryClient(destination).install(temporary);
      return { ...installed, source, provenance };
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }

  private async http(url: string): Promise<Response> {
    const response = await this.request(url);
    if (!response.ok) throw new Error(`registry request failed (${response.status}): ${url}`);
    return response;
  }
}

export async function syncLocalProfile(
  registryRoot: string,
  mindId: string,
  destination: string,
): Promise<LocalPackageMetadata> {
  safePart(mindId, "mind selector");
  const source = join(registryRoot, mindId);
  try {
    await access(join(source, "mind.json"));
  } catch {
    throw new Error(`mind profile '${mindId}' was not found in ${registryRoot}`);
  }
  return new LocalRegistryClient(destination).install(source);
}

export class LocalRegistryClient {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async install(source: string, options: InstallOptions = {}): Promise<LocalPackageMetadata> {
    const sourcePath = resolve(source);
    const validation = await validateMindPackage(sourcePath);
    if (!validation.valid || !validation.package)
      throw new Error(validation.diagnostics.map((d) => d.message).join("; "));
    verifyProvenance(validation.package);
    await rejectSymlinks(sourcePath);
    const pkg = validation.package;
    const id = safePart(pkg.id, "package id");
    const version = safePart(pkg.version, "package version");
    const digest = await computePackageDigest(sourcePath);
    const signature = options.privateKey
      ? {
          algorithm: "ed25519" as const,
          value: signEd25519(digest, options.privateKey),
          publicKey: options.publicKey ?? "",
        }
      : undefined;
    if (signature && !signature.publicKey) throw new Error("publicKey is required when signing");
    const destination = join(this.root, id, version);
    if (!inside(this.root, destination)) throw new Error("Unsafe package path");
    let existing: LocalPackageMetadata | undefined;
    try {
      existing = JSON.parse(
        await readFile(join(destination, metadataFile), "utf8"),
      ) as LocalPackageMetadata;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
        throw new Error(`Package ${id}@${version} has incomplete registry metadata`, {
          cause: error,
        });
    }
    if (existing) {
      if (existing.digest !== digest) throw new Error(`Package ${id}@${version} is immutable`);
      if ((await computePackageDigest(destination)) !== existing.digest)
        throw new Error(`Package ${id}@${version} failed stored integrity verification`);
      return existing;
    }
    await mkdir(this.root, { recursive: true });
    await cp(sourcePath, destination, { recursive: true, errorOnExist: true, force: false });
    const metadata: LocalPackageMetadata = {
      id,
      version,
      digest,
      installedAt: new Date().toISOString(),
      ...(signature && { signature }),
    };
    await writeFile(join(destination, metadataFile), JSON.stringify(metadata, null, 2));
    return metadata;
  }

  async list(): Promise<LocalPackageMetadata[]> {
    const result: LocalPackageMetadata[] = [];
    try {
      await access(this.root);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return result;
      throw error;
    }
    for (const idEntry of await readdir(this.root, { withFileTypes: true })) {
      if (!idEntry.isDirectory() || idEntry.isSymbolicLink()) continue;
      for (const versionEntry of await readdir(join(this.root, idEntry.name), {
        withFileTypes: true,
      })) {
        if (!versionEntry.isDirectory() || versionEntry.isSymbolicLink()) continue;
        const metadataPath = join(this.root, idEntry.name, versionEntry.name, metadataFile);
        try {
          result.push(JSON.parse(await readFile(metadataPath, "utf8")) as LocalPackageMetadata);
        } catch (error) {
          throw new Error(`Local registry entry is incomplete or invalid: ${metadataPath}`, {
            cause: error,
          });
        }
      }
    }
    return result;
  }

  async resolve(id: string, version: string): Promise<LocalPackageMetadata> {
    const safeId = safePart(id, "package id");
    const selected = selectVersion(
      (await this.list()).filter((entry) => entry.id === safeId).map((entry) => entry.version),
      version,
    );
    const metadata = await this.metadata(safeId, selected);
    return metadata;
  }

  async pull(id: string, version: string, destination: string): Promise<LocalPackageMetadata> {
    const metadata = await this.resolve(id, version);
    if (!(await this.verify(id, version)))
      throw new Error(`Package ${id}@${version} failed digest or signature verification`);
    const source = join(
      this.root,
      safePart(id, "package id"),
      safePart(version, "package version"),
    );
    const target = resolve(destination);
    await cp(source, target, { recursive: true, force: false, errorOnExist: true });
    return metadata;
  }

  async verify(id: string, version: string): Promise<boolean> {
    const metadata = await this.resolve(id, version);
    const directory = join(
      this.root,
      safePart(id, "package id"),
      safePart(version, "package version"),
    );
    const digest = await computePackageDigest(directory);
    if (digest !== metadata.digest) return false;
    if (!metadata.signature) return true;
    try {
      return verifyEd25519(digest, metadata.signature.value, metadata.signature.publicKey);
    } catch {
      return false;
    }
  }

  private async metadata(id: string, version: string): Promise<LocalPackageMetadata> {
    safePart(id, "package id");
    safePart(version, "package version");
    try {
      const metadata = JSON.parse(
        await readFile(join(this.root, id, version, metadataFile), "utf8"),
      ) as LocalPackageMetadata;
      if (metadata.id !== id || metadata.version !== version)
        throw new Error(`Package metadata does not match ${id}@${version}`);
      assertDigest(metadata.digest, "package digest");
      if (
        metadata.signature &&
        (metadata.signature.algorithm !== "ed25519" ||
          !metadata.signature.value ||
          !metadata.signature.publicKey)
      )
        throw new Error(`Package ${id}@${version} has an invalid signature record`);
      return metadata;
    } catch {
      throw new Error(`Package ${id}@${version} is not installed`);
    }
  }
}

export class OciRegistryClient {
  private readonly baseUrl: string;
  private readonly repository: string;
  private readonly token?: string;
  private readonly username?: string;
  private readonly password?: string;
  private readonly request: typeof globalThis.fetch;

  constructor(options: OciRegistryOptions) {
    if (!options.registry) throw new Error("OCI registry is required");
    this.baseUrl = options.registry.replace(/\/$/, "");
    this.repository = options.repository
      .split("/")
      .map((part) => safePart(part, "OCI repository segment"))
      .join("/");
    this.token = options.token;
    this.username = options.username;
    this.password = options.password;
    if ((this.username && !this.password) || (!this.username && this.password))
      throw new Error("OCI username and password must be provided together");
    this.request = options.fetch ?? globalThis.fetch;
  }

  async list(): Promise<string[]> {
    const response = await this.http(`/v2/${this.repository}/tags/list`);
    const payload = (await response.json()) as { tags?: unknown };
    if (!Array.isArray(payload.tags) || !payload.tags.every((tag) => typeof tag === "string"))
      throw new Error("OCI tag response is invalid");
    return payload.tags;
  }

  async resolve(
    version: string,
  ): Promise<{ version: string; digest: string; manifest: OciManifest }> {
    const tags = await this.list();
    const tag = selectVersion(tags, version);
    const response = await this.http(
      `/v2/${this.repository}/manifests/${encodeURIComponent(tag)}`,
      {
        headers: {
          Accept: `${ociManifestMediaType}, application/vnd.docker.distribution.manifest.v2+json`,
        },
      },
    );
    const manifest = (await response.json()) as OciManifest;
    assertManifest(manifest);
    const digest = response.headers.get("docker-content-digest") ?? sha256Json(manifest);
    assertDigest(digest, "OCI manifest digest");
    return { version: tag, digest, manifest };
  }

  async install(source: string): Promise<OciPackageMetadata> {
    const sourcePath = resolve(source);
    const validation = await validateMindPackage(sourcePath);
    if (!validation.valid || !validation.package)
      throw new Error(validation.diagnostics.map((diagnostic) => diagnostic.message).join("; "));
    verifyProvenance(validation.package);
    await rejectSymlinks(sourcePath);
    const files = await packageFiles(sourcePath);
    const blobs: OciDescriptor[] = [];
    for (const file of files) {
      const bytes = await readFile(file.absolutePath);
      const digest = sha256Bytes(bytes);
      await this.pushBlob(digest, bytes);
      blobs.push({
        mediaType: packageLayerMediaType,
        digest,
        size: bytes.byteLength,
        annotations: { "org.opencontainers.image.title": file.relativePath },
      });
    }
    const config = Buffer.from(
      JSON.stringify({ id: validation.package.id, version: validation.package.version }),
    );
    const configDigest = sha256Bytes(config);
    await this.pushBlob(configDigest, config);
    const manifest: OciManifest = {
      schemaVersion: 2,
      mediaType: ociManifestMediaType,
      config: { mediaType: packageConfigMediaType, digest: configDigest, size: config.byteLength },
      layers: blobs,
    };
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    const tag = safePart(validation.package.version, "OCI version");
    const response = await this.http(
      `/v2/${this.repository}/manifests/${encodeURIComponent(tag)}`,
      {
        method: "PUT",
        headers: { "Content-Type": ociManifestMediaType },
        body: manifestBytes,
      },
    );
    const ociDigest = response.headers.get("docker-content-digest") ?? sha256Bytes(manifestBytes);
    return {
      id: validation.package.id,
      version: validation.package.version,
      digest: await computePackageDigest(sourcePath),
      installedAt: new Date().toISOString(),
      ociDigest,
      registry: this.baseUrl,
      repository: this.repository,
    };
  }

  async pull(version: string, destination: string): Promise<OciPackageMetadata> {
    const resolved = await this.resolve(version);
    const target = resolve(destination);
    await mkdir(target, { recursive: true });
    const configResponse = await this.http(
      `/v2/${this.repository}/blobs/${resolved.manifest.config.digest}`,
    );
    const configBytes = Buffer.from(await configResponse.arrayBuffer());
    if (sha256Bytes(configBytes) !== resolved.manifest.config.digest)
      throw new Error("OCI config digest mismatch");
    const config = JSON.parse(configBytes.toString("utf8")) as { id?: unknown; version?: unknown };
    if (typeof config.id !== "string" || typeof config.version !== "string")
      throw new Error("OCI package config is invalid");
    for (const layer of resolved.manifest.layers) {
      const relativePath = layer.annotations?.["org.opencontainers.image.title"];
      if (!relativePath || relativePath.startsWith("/") || relativePath.split("/").includes(".."))
        throw new Error("OCI package layer has an unsafe path");
      const response = await this.http(`/v2/${this.repository}/blobs/${layer.digest}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (sha256Bytes(bytes) !== layer.digest)
        throw new Error(`OCI layer digest mismatch: ${relativePath}`);
      const output = resolve(target, relativePath);
      if (!inside(target, output)) throw new Error("OCI package layer escapes destination");
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, bytes, { flag: "wx" });
    }
    const validation = await validateMindPackage(target);
    if (!validation.valid || !validation.package)
      throw new Error("pulled OCI package failed schema validation");
    verifyProvenance(validation.package);
    if (validation.package.id !== config.id || validation.package.version !== config.version)
      throw new Error("OCI package config does not match its manifest");
    const digest = await computePackageDigest(target);
    return {
      id: validation.package.id,
      version: validation.package.version,
      digest,
      installedAt: new Date().toISOString(),
      ociDigest: resolved.digest,
      registry: this.baseUrl,
      repository: this.repository,
    };
  }

  async verify(version: string): Promise<boolean> {
    const temporary = await mkdtemp(join(tmpdir(), "lmp-oci-verify-"));
    try {
      const metadata = await this.pull(version, temporary);
      const signaturePath = join(temporary, "signatures", "manifest.json");
      try {
        const signature = JSON.parse(await readFile(signaturePath, "utf8")) as {
          digest: string;
          signature: string;
        };
        const publicKey = await readFile(join(temporary, "signatures", "public-key.pem"), "utf8");
        return (
          signature.digest === metadata.digest &&
          verifyEd25519(signature.digest, signature.signature, publicKey)
        );
      } catch {
        try {
          const payload = await readFile(join(temporary, "mind.json"));
          const signatureText = (
            await readFile(join(temporary, "signatures", "manifest.sig"), "utf8")
          )
            .trim()
            .replace(/^0x/, "");
          const publicKeyText = (
            await readFile(join(temporary, "signatures", "public-key.hex"), "utf8")
          )
            .trim()
            .replace(/^0x/, "");
          if (!/^[0-9a-f]{128}$/i.test(signatureText) || !/^[0-9a-f]{64}$/i.test(publicKeyText))
            return false;
          const spki = Buffer.concat([
            Buffer.from("302a300506032b6570032100", "hex"),
            Buffer.from(publicKeyText, "hex"),
          ]);
          return cryptoVerify(
            null,
            payload,
            createPublicKey({ key: spki, format: "der", type: "spki" }),
            Buffer.from(signatureText, "hex"),
          );
        } catch {
          return false;
        }
      }
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }

  private async pushBlob(digest: string, bytes: Uint8Array): Promise<void> {
    const start = await this.http(`/v2/${this.repository}/blobs/uploads/`, { method: "POST" });
    const location = start.headers.get("location");
    if (!location) throw new Error("OCI registry did not return an upload location");
    const upload = new URL(location, this.baseUrl);
    upload.searchParams.set("digest", digest);
    await this.http(upload.toString(), {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: Buffer.from(bytes),
    });
  }

  private async http(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.username && this.password)
      headers.set(
        "Authorization",
        `Basic ${Buffer.from(`${this.username}:${this.password}`).toString("base64")}`,
      );
    else if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const response = await this.request(url, { ...init, headers });
    if (!response.ok) throw new Error(`OCI request failed (${response.status}): ${url}`);
    return response;
  }
}

async function packageFiles(
  root: string,
): Promise<{ relativePath: string; absolutePath: string }[]> {
  const files: { relativePath: string; absolutePath: string }[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === ".lmp-registry.json" || entry.name.endsWith(".private.pem")) continue;
      if (entry.isSymbolicLink())
        throw new Error(`Symlinks are not allowed: ${join(directory, entry.name)}`);
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile())
        files.push({ relativePath: relative(root, path).split(sep).join("/"), absolutePath: path });
    }
  }
  await visit(root);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function sha256Bytes(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function sha256Json(value: unknown): string {
  return sha256Bytes(Buffer.from(JSON.stringify(value)));
}

function assertManifest(value: OciManifest): asserts value is OciManifest {
  if (value?.schemaVersion !== 2 || !value.config || !Array.isArray(value.layers))
    throw new Error("OCI manifest is invalid");
}
