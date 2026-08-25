import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface InitializeOptions {
  directory?: string;
}

export const defaultMind = {
  id: "lmp:mind:local-baseline",
  version: "1.0.0",
  name: "Local baseline",
} as const;

export async function initializeLendingMind(options: InitializeOptions = {}): Promise<string> {
  const directory = resolve(options.directory ?? process.cwd());
  const stateDirectory = join(directory, ".lending-mind");
  await mkdir(stateDirectory, { recursive: true });
  const manifest = join(stateDirectory, "mind.json");
  try {
    await writeFile(manifest, `${JSON.stringify(defaultMind, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return manifest;
}

export const createLendingMind = initializeLendingMind;
