if (Number(process.versions.node.split(".")[0]) < 22) {
  console.error("lmp requires Node.js 22 or newer");
  process.exitCode = 3;
} else {
  const { runCli } = await import("./index.js");
  process.exitCode = await runCli();
}
