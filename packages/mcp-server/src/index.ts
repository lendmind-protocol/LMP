import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";

/** Compatibility transport only; Rust lmp-mcp owns MCP semantics. */
type Request = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
type Response = { jsonrpc: "2.0"; id: unknown; result?: unknown; error?: unknown };
const error = (id: unknown, code: number, message: string): Response => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

async function rustServer(): Promise<string> {
  const candidates = [
    process.env.LMP_MCP_BIN,
    resolve(process.cwd(), "target/debug/lmp-mcp"),
    resolve(process.cwd(), "../../target/debug/lmp-mcp"),
    resolve(process.cwd(), "target/release/lmp-mcp"),
    resolve(process.cwd(), "../../target/release/lmp-mcp"),
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* try the next Rust build */
    }
  }
  throw new Error("Rust MCP server not found; build the workspace or set LMP_MCP_BIN");
}

type PendingResponse = {
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
};

class DuplicateRequestIdError extends Error {
  readonly code = -32600;

  constructor() {
    super("A request with this id is already in flight");
    this.name = "DuplicateRequestIdError";
  }
}

class RustMcpSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private buffer = "";
  private readonly pending = new Map<string, PendingResponse>();
  private closed = false;

  private constructor(child: ChildProcessWithoutNullStreams) {
    this.child = child;
    child.stdout.on("data", (chunk) => this.consume(chunk.toString()));
    child.stderr.resume();
    child.on("error", (errorValue) => this.fail(errorValue));
    child.on("close", (code) =>
      this.fail(new Error(`Rust MCP exited with code ${code ?? "unknown"}`)),
    );
  }

  static async create() {
    const binary = await rustServer();
    return new RustMcpSession(spawn(binary, [], { cwd: process.cwd(), shell: false }));
  }

  request(request: Request): Promise<Response> {
    if (this.closed) return Promise.reject(new Error("Rust MCP session is closed"));
    const key = JSON.stringify(request.id);
    if (this.pending.has(key)) return Promise.reject(new DuplicateRequestIdError());
    return new Promise((resolveResponse, reject) => {
      this.pending.set(key, { resolve: resolveResponse, reject });
      this.child.stdin.write(`${JSON.stringify(request)}\n`, (errorValue) => {
        if (errorValue) {
          this.pending.delete(key);
          reject(errorValue);
        }
      });
    });
  }

  notify(request: Request) {
    if (this.closed) return;
    this.child.stdin.write(`${JSON.stringify(request)}\n`);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.child.stdin.end();
    this.child.kill();
    this.fail(new Error("Rust MCP session closed"));
  }

  private consume(chunk: string) {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) {
        try {
          const response = JSON.parse(line) as Response;
          const key = JSON.stringify(response.id);
          this.pending.get(key)?.resolve(response);
          this.pending.delete(key);
        } catch {
          this.fail(new Error("Rust MCP returned invalid JSON"));
        }
      }
      newline = this.buffer.indexOf("\n");
    }
  }

  private fail(errorValue: Error) {
    if (this.closed && this.pending.size === 0) return;
    this.closed = true;
    for (const { reject } of this.pending.values()) reject(errorValue);
    this.pending.clear();
  }
}

let sharedSession: Promise<RustMcpSession> | undefined;
async function getSharedSession() {
  sharedSession ??= RustMcpSession.create().catch((errorValue) => {
    sharedSession = undefined;
    throw errorValue;
  });
  return sharedSession;
}

export async function handle(request: Request, session?: RustMcpSession): Promise<Response> {
  if (request.jsonrpc !== "2.0" || request.id === undefined || typeof request.method !== "string")
    return error(request.id, -32600, "Invalid Request");
  try {
    return await (session ?? (await getSharedSession())).request(request);
  } catch (errorValue) {
    return error(
      request.id,
      errorValue instanceof DuplicateRequestIdError ? errorValue.code : -32000,
      errorValue instanceof Error ? errorValue.message : String(errorValue),
    );
  }
}

export async function serve(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
) {
  const session = await RustMcpSession.create();
  let buffer = "";
  try {
    for await (const chunk of input) {
      buffer += String(chunk);
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          try {
            const request = JSON.parse(line) as Request;
            if (
              request.jsonrpc === "2.0" &&
              request.id === undefined &&
              typeof request.method === "string"
            ) {
              session.notify(request);
              newline = buffer.indexOf("\n");
              continue;
            }
            const response = await handle(request, session);
            output.write(`${JSON.stringify(response)}\n`);
          } catch {
            output.write(`${JSON.stringify(error(null, -32600, "Invalid Request"))}\n`);
          }
        }
        newline = buffer.indexOf("\n");
      }
    }
  } finally {
    session.close();
  }
}
