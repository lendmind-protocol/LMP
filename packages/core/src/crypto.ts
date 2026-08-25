import {
  type KeyObject,
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
  generateKeyPairSync,
} from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { canonicalJson } from "./canonical-json.js";
import type { JsonValue } from "./types.js";

function bytesOf(payload: string | Uint8Array | JsonValue): Buffer {
  return typeof payload === "string"
    ? Buffer.from(payload)
    : payload instanceof Uint8Array
      ? Buffer.from(payload)
      : Buffer.from(canonicalJson(payload));
}

export function sha256(payload: string | Uint8Array | JsonValue): string {
  const bytes = bytesOf(payload);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function generateEd25519KeyPair(): { publicKey: KeyObject; privateKey: KeyObject } {
  return generateKeyPairSync("ed25519");
}

export function signEd25519(
  payload: string | Uint8Array | JsonValue,
  privateKey: KeyObject | string,
): string {
  const bytes = bytesOf(payload);
  return cryptoSign(null, bytes, privateKey).toString("base64url");
}

export function verifyEd25519(
  payload: string | Uint8Array | JsonValue,
  signature: string,
  publicKey: KeyObject | string,
): boolean {
  const bytes = bytesOf(payload);
  try {
    return cryptoVerify(null, bytes, publicKey, Buffer.from(signature, "base64"));
  } catch {
    return cryptoVerify(null, bytes, publicKey, Buffer.from(signature, "base64url"));
  }
}

async function manifestFiles(packagePath: string): Promise<Record<string, string>> {
  const root = resolve(packagePath);
  const files: Record<string, string> = {};
  async function visit(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", ".lending-mind", ".DS_Store", "signatures"].includes(entry.name))
        continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (
        entry.isFile() &&
        !entry.name.endsWith(".private.pem") &&
        !entry.name.endsWith(".key")
      )
        files[relative(root, path).split("\\").join("/")] = sha256(await readFile(path));
    }
  }
  await visit(root);
  return files;
}

export async function computePackageDigest(packagePath: string): Promise<string> {
  return sha256(await manifestFiles(packagePath));
}

export async function createKeyPair(outputDir: string) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  await mkdir(outputDir, { recursive: true });
  const privatePath = join(outputDir, "private-key.pem");
  const publicPath = join(outputDir, "public-key.pem");
  await writeFile(privatePath, privateKey, { mode: 0o600 });
  await writeFile(publicPath, publicKey);
  return { privatePath, publicPath };
}

export async function signMindPackage(packagePath: string, privateKeyPath: string) {
  const digestValue = await computePackageDigest(packagePath);
  const signature = signEd25519(digestValue, createPrivateKey(await readFile(privateKeyPath)));
  await mkdir(join(packagePath, "signatures"), { recursive: true });
  await writeFile(
    join(packagePath, "signatures", "manifest.json"),
    `${JSON.stringify({ digest: digestValue, signature, algorithm: "Ed25519" }, null, 2)}\n`,
  );
  await writeFile(join(packagePath, "signatures", "manifest.sig"), `${signature}\n`);
  return { digest: digestValue, signature };
}

export async function verifyMindPackage(packagePath: string, publicKeyPath?: string) {
  const digestValue = await computePackageDigest(packagePath);
  const metadataPath = join(packagePath, "signatures", "manifest.json");
  try {
    await readFile(metadataPath, "utf8");
  } catch {
    try {
      const marker = (
        await readFile(join(packagePath, "signatures", "manifest.sig"), "utf8")
      ).trim();
      if (marker === "UNSIGNED")
        return { digest: digestValue, signatureStatus: "unsigned" } as const;
      return { digest: digestValue, signatureStatus: "invalid" } as const;
    } catch {
      return { digest: digestValue, signatureStatus: "unsigned" } as const;
    }
  }
  try {
    const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
      digest: string;
      signature: string;
    };
    const keyPath = publicKeyPath ?? join(packagePath, "signatures", "public-key.pem");
    const valid =
      metadata.digest === digestValue &&
      verifyEd25519(digestValue, metadata.signature, createPublicKey(await readFile(keyPath)));
    return { digest: digestValue, signatureStatus: valid ? "verified" : "invalid" } as const;
  } catch {
    return { digest: digestValue, signatureStatus: "invalid" } as const;
  }
}

export const digest = sha256;
export const sign = signEd25519;
export const verify = verifyEd25519;
