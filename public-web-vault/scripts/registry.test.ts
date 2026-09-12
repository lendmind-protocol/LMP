import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
interface ValidatorResult {
  stdout: string;
  stderr: string;
  code: string | number;
}

function runValidator(path: string): Promise<ValidatorResult> {
  return new Promise<ValidatorResult>((resolveResult, reject) => {
    execFile(process.execPath, [validator, path], (error, stdout, stderr) => {
      if (!error) return resolveResult({ stdout, stderr, code: 0 });
      resolveResult({ stdout, stderr, code: error.code ?? 1 });
    });
  });
}
const root = new URL("../..", import.meta.url).pathname;
const validator = join(root, "public-web-vault/scripts/validate-registry.ts");
const sourceRegistry = join(root, "public-web-vault/registry.json");

test("validates the generated vault and all production package signatures", async () => {
  const { stdout } = await run(process.execPath, [validator, sourceRegistry]);
  const result = JSON.parse(stdout);
  assert.deepEqual(result, {
    status: "verified",
    production: 11,
    drafts: 56,
    total: 67,
    errors: [],
  });
});

test("rejects a corrupted registry with duplicate keys", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lmp-vault-corrupt-"));
  const target = join(directory, "registry.json");
  const registry = JSON.parse(await readFile(sourceRegistry, "utf8"));
  registry.draftMinds[0].mindKey = registry.production[0].mindKey;
  await writeFile(target, `${JSON.stringify(registry)}\n`);
  const result = await runValidator(target);
  assert.notEqual(result.code, 0);
  assert.match(result.stdout, /duplicate or missing mindKey/);
});

test("rejects a production entry when its package is unavailable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lmp-vault-missing-package-"));
  const target = join(directory, "registry.json");
  const registry = JSON.parse(await readFile(sourceRegistry, "utf8"));
  registry.production[0].packagePath = "registry/minds/does-not-exist";
  await writeFile(target, `${JSON.stringify(registry)}\n`);
  const result = await runValidator(target);
  assert.notEqual(result.code, 0);
  assert.match(result.stdout, /package unavailable/);
});

test("keeps the committed registry as the validator source of truth", async () => {
  await cp(sourceRegistry, join(await mkdtemp(join(tmpdir(), "lmp-vault-copy-")), "registry.json"));
  assert.ok(sourceRegistry.endsWith("public-web-vault/registry.json"));
});
