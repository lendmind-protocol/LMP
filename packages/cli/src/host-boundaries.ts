import { lstat, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

/** A host boundary is a capability, not a claim about every host integration. */
export type HostBoundary = "git-pre-commit" | "mediated-write";

export type WriteRequest = { path: string; content: string | Uint8Array };
export type WriteDecision = { status: "pass" | "deny"; reason?: string };
export type MediatedWriteAdapterOptions = {
  workspaceRoot: string;
  authorize: (request: WriteRequest) => Promise<WriteDecision> | WriteDecision;
};

export class WriteBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteBoundaryError";
  }
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

/**
 * Adapter for hosts that explicitly route a proposed write through LMP.
 * This is not a filesystem hook. Authorization is fail-closed: only an exact
 * `pass` decision permits the atomic write.
 */
export function createMediatedWriteAdapter(options: MediatedWriteAdapterOptions) {
  const workspaceRoot = resolve(options.workspaceRoot);
  return {
    boundary: "mediated-write" as const,
    async write(request: WriteRequest): Promise<void> {
      if (!request || typeof request.path !== "string" || request.path.length === 0)
        throw new WriteBoundaryError("mediated write requires a target path");
      if (typeof request.content !== "string" && !(request.content instanceof Uint8Array))
        throw new WriteBoundaryError("mediated write content must be text or bytes");

      const target = resolve(workspaceRoot, request.path);
      const parent = dirname(target);
      const [rootReal, parentReal] = await Promise.all([
        realpath(workspaceRoot).catch(() => null),
        realpath(parent).catch(() => null),
      ]);
      if (!rootReal || !parentReal || !isWithin(rootReal, parentReal))
        throw new WriteBoundaryError("mediated write target is outside the workspace boundary");
      const existing = await lstat(target).catch(() => null);
      if (existing?.isSymbolicLink())
        throw new WriteBoundaryError("mediated write refuses symbolic-link targets");

      let decision: WriteDecision;
      try {
        decision = await options.authorize({ ...request, path: target });
      } catch (error) {
        throw new WriteBoundaryError(
          `mediated write authorization failed closed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (!decision || decision.status !== "pass")
        throw new WriteBoundaryError(
          `mediated write denied${decision?.reason ? `: ${decision.reason}` : ": authorization did not pass"}`,
        );

      const temporary = `${target}.lmp-write-${process.pid}-${Date.now()}`;
      try {
        await writeFile(temporary, request.content, { flag: "wx" });
        await rename(temporary, target);
      } catch (error) {
        await unlink(temporary).catch(() => {});
        throw new WriteBoundaryError(
          `mediated write could not be committed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}

/** Explicit capability reporting prevents callers from overclaiming coverage. */
export function hostBoundarySupport(host: string): {
  boundary: HostBoundary | null;
  supported: boolean;
  reason: string;
} {
  if (host === "git")
    return {
      boundary: "git-pre-commit",
      supported: true,
      reason: "The generated hook evaluates the staged commit before Git creates the commit.",
    };
  if (host === "mediated-write")
    return {
      boundary: "mediated-write",
      supported: true,
      reason:
        "Only writes explicitly routed through the LMP adapter are checked before persistence.",
    };
  return {
    boundary: null,
    supported: false,
    reason:
      "This host has no LMP write interception boundary; writes are unsupported and unguarded by LMP.",
  };
}
