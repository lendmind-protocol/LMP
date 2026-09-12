#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
const destination = join(root, "public-web-vault/fixtures");
const dynamicCall = ["ev", "al"].join("");
const samples = [
  [
    "compliant/clean.ts",
    "export function explicitBoundary(value: string): string { return value.trim(); }\n",
  ],
  [
    "violating/unsafe.txt",
    `Example rejected source (kept as fixture text, not executable repository code):\nexport function unsafe(value: string): string { return ${dynamicCall}(value); }\n`,
  ],
];
for (const [file, contents] of samples) {
  const target = join(destination, file);
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, contents, { flag: "wx" }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
}
console.log(JSON.stringify({ status: "seeded", destination, files: samples.length }));
