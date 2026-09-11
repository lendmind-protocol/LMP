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

function decodeHex(value: string, label: string): Buffer {
  const normalized = value.trim().replace(/^0x/, "");
  if (!/^[0-9a-f]+$/i.test(normalized) || normalized.length % 2 !== 0)
    throw new Error(`${label} must be an even-length hexadecimal value`);
  return Buffer.from(normalized, "hex");
}

function verifyDetachedHex(payload: Uint8Array, signatureText: string, publicKeyText: string) {
  const signature = decodeHex(signatureText, "signature");
  const publicKey = decodeHex(publicKeyText, "public key");
  if (signature.length !== 64) throw new Error("signature must contain 64 bytes");
  if (publicKey.length !== 32) throw new Error("public key must contain 32 bytes");
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), publicKey]);
  return cryptoVerify(
    null,
    Buffer.from(payload),
    createPublicKey({ key: spki, format: "der", type: "spki" }),
    signature,
  );
}

async function manifestFiles(packagePath: string): Promise<Record<string, string>> {
  const root = resolve(packagePath);
  const files: Record<string, string> = {};
  async function visit(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (
        [
          "node_modules",
          ".git",
          ".lending-mind",
          ".DS_Store",
          ".lmp-registry.json",
          "signatures",
        ].includes(entry.name)
      )
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

export interface KeyRotationRecord {
  version: 1;
  algorithm: "Ed25519";
  previousPublicKey: string;
  newPublicKey: string;
  previousPublicKeyHex: string;
  newPublicKeyHex: string;
  proof: string;
  proofHex: string;
  rotatedAt: string;
}

function publicKeyHex(publicKey: KeyObject | string): string {
  const der = createPublicKey(publicKey).export({ type: "spki", format: "der" });
  return `0x${der.subarray(-32).toString("hex")}`;
}

function signHexPayload(payload: string, privateKey: KeyObject): string {
  return `0x${cryptoSign(null, Buffer.from(payload), privateKey).toString("hex")}`;
}

/**
 * Rotate a package signer without silently trusting an unrelated new key.
 * The previous private key signs the exact new public-key PEM. The package is
 * then re-signed by the new key and the old key is returned for explicit
 * revocation by the registry or deployment owner.
 */
export async function rotateMindPackageKey(
  packagePath: string,
  currentPrivateKeyPath: string,
  nextKeyDirectory: string,
): Promise<{
  digest: string;
  signature: string;
  rotation: KeyRotationRecord;
  revokedPublicKey: string;
}> {
  const currentPrivateKey = createPrivateKey(await readFile(currentPrivateKeyPath));
  const previousPublicKey = createPublicKey(currentPrivateKey)
    .export({
      type: "spki",
      format: "pem",
    })
    .toString();
  const previousPublicKeyHex = publicKeyHex(currentPrivateKey);
  const currentPublicKeyPath = join(packagePath, "signatures", "public-key.pem");
  const currentVerification = await verifyMindPackage(packagePath, currentPublicKeyPath);
  if (currentVerification.signatureStatus !== "verified")
    throw new Error("key rotation requires a currently verified package");
  const installedPublicKey = await readFile(currentPublicKeyPath, "utf8");
  if (installedPublicKey !== previousPublicKey)
    throw new Error("current private key does not match the package signer");

  const next = await createKeyPair(resolve(nextKeyDirectory));
  const newPublicKey = await readFile(next.publicPath, "utf8");
  const newPublicKeyHex = publicKeyHex(newPublicKey);
  const rotation: KeyRotationRecord = {
    version: 1,
    algorithm: "Ed25519",
    previousPublicKey,
    newPublicKey,
    previousPublicKeyHex,
    newPublicKeyHex,
    proof: signEd25519(newPublicKey, currentPrivateKey),
    proofHex: signHexPayload(newPublicKeyHex, currentPrivateKey),
    rotatedAt: new Date().toISOString(),
  };
  await mkdir(join(packagePath, "signatures"), { recursive: true });
  await writeFile(
    join(packagePath, "signatures", "key-rotation.json"),
    `${JSON.stringify(rotation, null, 2)}\n`,
  );
  await writeFile(currentPublicKeyPath, newPublicKey);
  await writeFile(join(packagePath, "signatures", "public-key.hex"), `${newPublicKeyHex}\n`);
  const signed = await signMindPackage(packagePath, next.privatePath);
  return {
    ...signed,
    rotation,
    revokedPublicKey: previousPublicKey,
  };
}

async function verifyKeyRotationRecord(
  packagePath: string,
  currentPublicKeyText: string,
): Promise<boolean> {
  let rotation: KeyRotationRecord;
  try {
    rotation = JSON.parse(
      await readFile(join(packagePath, "signatures", "key-rotation.json"), "utf8"),
    ) as KeyRotationRecord;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
  }
  try {
    const currentHex = currentPublicKeyText.includes("BEGIN PUBLIC KEY")
      ? publicKeyHex(currentPublicKeyText)
      : currentPublicKeyText.trim();
    return (
      rotation.version === 1 &&
      rotation.algorithm === "Ed25519" &&
      (rotation.newPublicKey === currentPublicKeyText ||
        rotation.newPublicKeyHex.toLowerCase() === currentHex.toLowerCase()) &&
      verifyEd25519(rotation.newPublicKey, rotation.proof, rotation.previousPublicKey) &&
      rotation.newPublicKeyHex.toLowerCase() === currentHex.toLowerCase() &&
      verifyDetachedHex(
        Buffer.from(rotation.newPublicKeyHex),
        rotation.proofHex,
        rotation.previousPublicKeyHex,
      )
    );
  } catch {
    return false;
  }
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
      try {
        const publicKey = await readFile(
          publicKeyPath ?? join(packagePath, "signatures", "public-key.hex"),
          "utf8",
        );
        const manifest = await readFile(join(packagePath, "mind.json"));
        const valid = verifyDetachedHex(manifest, marker, publicKey);
        const rotationValid = valid && (await verifyKeyRotationRecord(packagePath, publicKey));
        return {
          digest: digestValue,
          signatureStatus: rotationValid ? "verified" : "invalid",
        } as const;
      } catch {
        return { digest: digestValue, signatureStatus: "invalid" } as const;
      }
    } catch {
      return { digest: digestValue, signatureStatus: "unsigned" } as const;
    }
  }
  try {
    const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
      digest: string;
      signature: string;
    };
    const detachedSignature = (
      await readFile(join(packagePath, "signatures", "manifest.sig"), "utf8")
    ).trim();
    if (detachedSignature !== metadata.signature)
      return { digest: digestValue, signatureStatus: "invalid" } as const;
    const keyPath = publicKeyPath ?? join(packagePath, "signatures", "public-key.pem");
    const valid =
      metadata.digest === digestValue &&
      verifyEd25519(digestValue, metadata.signature, createPublicKey(await readFile(keyPath)));
    if (!valid) return { digest: digestValue, signatureStatus: "invalid" } as const;
    const currentPublicKey = await readFile(keyPath, "utf8");
    if (!(await verifyKeyRotationRecord(packagePath, currentPublicKey)))
      return { digest: digestValue, signatureStatus: "invalid" } as const;
    return { digest: digestValue, signatureStatus: "verified" } as const;
  } catch {
    return { digest: digestValue, signatureStatus: "invalid" } as const;
  }
}

export const digest = sha256;
export const sign = signEd25519;
export const verify = verifyEd25519;
