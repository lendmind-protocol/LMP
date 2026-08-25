if (Number(process.versions.node.split(".")[0]) < 22) {
  console.error("lending-mind-mcp requires Node.js 22 or newer");
  process.exitCode = 3;
} else {
  const { serve } = await import("./index.js");
  await serve();
}
