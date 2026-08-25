import { access, cp, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { sha256, signEd25519, verifyEd25519 } from "@lending-mind/core";
import { validateMindPackage } from "@lending-mind/skill-schema";

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

const metadataFile = ".lmp-registry.json";

function safePart(value: string, label: string): string {
  if (!value || value === "." || value === ".." || /[\\/\0]/.test(value))
    throw new Error(`Unsafe ${label}`);
  return value;
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}

async function manifestBytes(directory: string): Promise<Uint8Array> {
  for (const name of ["mind.json", "package.json"]) {
    try {
      return await readFile(join(directory, name));
    } catch {
      /* try next */
    }
  }
  throw new Error("mind.json or package.json is required");
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
    await rejectSymlinks(sourcePath);
    const pkg = validation.package;
    const id = safePart(pkg.id, "package id");
    const version = safePart(pkg.version, "package version");
    const bytes = await manifestBytes(sourcePath);
    const digest = sha256(bytes);
    const signature = options.privateKey
      ? {
          algorithm: "ed25519" as const,
          value: signEd25519(bytes, options.privateKey),
          publicKey: options.publicKey ?? "",
        }
      : undefined;
    if (signature && !signature.publicKey) throw new Error("publicKey is required when signing");
    const destination = join(this.root, id, version);
    if (!inside(this.root, destination)) throw new Error("Unsafe package path");
    try {
      const existing = JSON.parse(
        await readFile(join(destination, metadataFile), "utf8"),
      ) as LocalPackageMetadata;
      if (existing.digest !== digest) throw new Error(`Package ${id}@${version} is immutable`);
      return existing;
    } catch (error) {
      if (error instanceof Error && error.message.includes("is immutable")) throw error;
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
    } catch {
      return result;
    }
    for (const idEntry of await readdir(this.root, { withFileTypes: true })) {
      if (!idEntry.isDirectory() || idEntry.isSymbolicLink()) continue;
      for (const versionEntry of await readdir(join(this.root, idEntry.name), {
        withFileTypes: true,
      })) {
        if (!versionEntry.isDirectory() || versionEntry.isSymbolicLink()) continue;
        try {
          result.push(
            JSON.parse(
              await readFile(
                join(this.root, idEntry.name, versionEntry.name, metadataFile),
                "utf8",
              ),
            ) as LocalPackageMetadata,
          );
        } catch {
          /* ignore incomplete entries */
        }
      }
    }
    return result;
  }

  async resolve(id: string, version: string): Promise<LocalPackageMetadata> {
    const metadata = await this.metadata(id, version);
    return metadata;
  }

  async pull(id: string, version: string, destination: string): Promise<LocalPackageMetadata> {
    const metadata = await this.resolve(id, version);
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
    const bytes = await manifestBytes(directory);
    if (sha256(bytes) !== metadata.digest) return false;
    if (!metadata.signature) return true;
    try {
      return verifyEd25519(bytes, metadata.signature.value, metadata.signature.publicKey);
    } catch {
      return false;
    }
  }

  private async metadata(id: string, version: string): Promise<LocalPackageMetadata> {
    safePart(id, "package id");
    safePart(version, "package version");
    try {
      return JSON.parse(
        await readFile(join(this.root, id, version, metadataFile), "utf8"),
      ) as LocalPackageMetadata;
    } catch {
      throw new Error(`Package ${id}@${version} is not installed`);
    }
  }
}

export class OciRegistryClient {
  private unavailable(): never {
    throw new Error("OCI registry support is not implemented");
  }
  install(..._args: unknown[]): never {
    return this.unavailable();
  }
  list(..._args: unknown[]): never {
    return this.unavailable();
  }
  resolve(..._args: unknown[]): never {
    return this.unavailable();
  }
  pull(..._args: unknown[]): never {
    return this.unavailable();
  }
  verify(..._args: unknown[]): never {
    return this.unavailable();
  }
}
