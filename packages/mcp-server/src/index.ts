import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { type MindPackage, sha256, verifyMindPackage } from "@lending-mind/core";
import { evaluate as evaluateWorkspace } from "@lending-mind/evaluator";
import { MindPackageSchema, validateMindPackage } from "@lending-mind/skill-schema";

type Request = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
const tools = [
  {
    name: "lmp_list_minds",
    description: "List locally installed minds.",
    inputSchema: {
      type: "object",
      properties: { includeLocalWorkspace: { type: "boolean" } },
      required: ["includeLocalWorkspace"],
      additionalProperties: false,
    },
  },
  {
    name: "lmp_get_instructions",
    description: "Get deterministic mind instructions.",
    inputSchema: {
      type: "object",
      properties: {
        mind: { type: "string" },
        workspace: { type: "string" },
        format: { enum: ["markdown", "json"] },
      },
      required: ["mind", "workspace", "format"],
      additionalProperties: false,
    },
  },
  {
    name: "lmp_evaluate_workspace",
    description: "Evaluate a workspace without commands by default.",
    inputSchema: {
      type: "object",
      properties: {
        mind: { type: "string" },
        workspace: { type: "string" },
        mode: { enum: ["advisory", "enforced", "audit"] },
        runCommands: { type: "boolean" },
      },
      required: ["mind", "workspace", "mode", "runCommands"],
      additionalProperties: false,
    },
  },
  {
    name: "lmp_verify_mind",
    description: "Validate a mind package.",
    inputSchema: {
      type: "object",
      properties: { packagePath: { type: "string" } },
      required: ["packagePath"],
      additionalProperties: false,
    },
  },
  {
    name: "lmp_get_artifact",
    description: "Read an evaluation artifact.",
    inputSchema: {
      type: "object",
      properties: { artifactPath: { type: "string" } },
      required: ["artifactPath"],
      additionalProperties: false,
    },
  },
];
const error = (id: unknown, code: number, message: string, data?: unknown) => ({
  jsonrpc: "2.0",
  id,
  error: { code, message, ...(data === undefined ? {} : { data }) },
});
const result = (id: unknown, value: unknown) => ({ jsonrpc: "2.0", id, result: value });
function safePath(value: unknown): string {
  if (typeof value !== "string" || !value) throw new InputError("path is required");
  const candidate = resolve(value);
  const roots = [
    resolve(process.cwd()),
    resolve(process.env.LMP_REGISTRY ?? ".lending-mind/registry"),
  ];
  if (
    !roots.some((root) => {
      const remainder = relative(root, candidate);
      return remainder === "" || (!remainder.startsWith("..") && !remainder.startsWith("/"));
    })
  )
    throw new InputError("path must be inside the configured workspace or registry root");
  return candidate;
}
const instruction = (mind: MindPackage, format: string) =>
  format === "json"
    ? JSON.stringify({
        mind: mind.id,
        version: mind.version,
        checklist: [
          "Follow the mind package guidance.",
          "Run the relevant checks before reporting completion.",
        ],
      })
    : `# ${mind.name ?? mind.id}\n\n- Follow the mind package guidance.\n- Run the relevant checks before reporting completion.`;
async function mind(input: string) {
  const value = JSON.parse(await readFile(safePath(input), "utf8"));
  return MindPackageSchema.parse(value) as MindPackage;
}
async function call(name: string, args: Record<string, unknown>) {
  if (name === "lmp_verify_mind") {
    const packagePath = safePath(args.packagePath);
    const v = await validateMindPackage(packagePath);
    const verification = v.package
      ? await verifyMindPackage(packagePath)
      : { signatureStatus: "invalid" };
    return {
      digest: v.package ? sha256(v.package as unknown as Parameters<typeof sha256>[0]) : null,
      signatureStatus: verification.signatureStatus,
      diagnostics: v.diagnostics.map((d) => ({
        code: "INVALID",
        message: d.message,
        file: d.path,
      })),
    };
  }
  if (name === "lmp_get_artifact")
    return JSON.parse(await readFile(safePath(args.artifactPath), "utf8"));
  if (name === "lmp_list_minds") {
    const minds = ["skills/baseline/mind.json", "skills/typescript-minimal/mind.json"];
    if (args.includeLocalWorkspace) minds.push(".lending-mind/mind.json");
    return { minds };
  }
  if (typeof args.mind !== "string" || typeof args.workspace !== "string")
    throw new InputError("mind and workspace are required");
  const loaded = await mind(args.mind);
  if (name === "lmp_get_instructions")
    return { content: instruction(loaded, String(args.format)), format: args.format };
  if (name === "lmp_evaluate_workspace") {
    if (args.runCommands && args.mode === "audit")
      throw new InputError("audit never runs commands");
    const workspace = safePath(args.workspace);
    const report = await evaluateWorkspace({
      directory: workspace,
      packageDirectory: safePath(args.mind),
      mode: args.mode as "advisory" | "enforced" | "audit",
      runCommands: Boolean(args.runCommands),
      commands: [],
    });
    return {
      artifact: report.artifact,
      summary: (report.artifact as { summary: unknown }).summary,
    };
  }
  throw new InputError("Unknown tool");
}
class InputError extends Error {}
export async function handle(request: Request) {
  if (request.jsonrpc !== "2.0" || request.id === undefined || typeof request.method !== "string")
    return error(request.id, -32600, "Invalid Request");
  if (request.method === "initialize")
    return result(request.id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "lending-mind-mcp", version: "0.1.0" },
    });
  if (request.method === "tools/list") return result(request.id, { tools });
  if (request.method !== "tools/call") return error(request.id, -32601, "Method not found");
  const params = request.params as { name?: unknown; arguments?: unknown } | undefined;
  const tool = tools.find((candidate) => candidate.name === params?.name);
  if (!tool) return error(request.id, -32601, "Method not found");
  if (!params?.arguments || typeof params.arguments !== "object")
    return error(request.id, -32602, "Invalid tool input", {
      issues: ["arguments must be an object"],
    });
  try {
    return result(request.id, await call(tool.name, params.arguments as Record<string, unknown>));
  } catch (e) {
    return error(request.id, -32602, "Invalid tool input", {
      issues: [e instanceof Error ? e.message : String(e)],
    });
  }
}

export async function serve(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
) {
  let buffer = "";
  for await (const chunk of input) {
    buffer += String(chunk);
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let response: Awaited<ReturnType<typeof handle>>;
      try {
        response = await handle(JSON.parse(line));
      } catch {
        response = error(null, -32600, "Invalid Request");
      }
      output.write(`${JSON.stringify(response)}\n`);
      newline = buffer.indexOf("\n");
    }
  }
}
