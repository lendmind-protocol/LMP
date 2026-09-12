#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

if (Number(process.versions.node.split(".")[0]) < 22) {
  console.error("lmp requires Node.js 22 or newer");
  process.exit(3);
}

const require = createRequire(import.meta.url);
const cli = require.resolve("@lending-mind/lmp/dist/bin.js");
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
