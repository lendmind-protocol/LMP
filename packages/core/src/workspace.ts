import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface WorkspaceConfig {
  workspacePath: string;
  registryPath?: string;
  packageId?: string;
  environment?: string;
}

export function workspaceConfig(
  input: Partial<WorkspaceConfig> = {},
  cwd = process.cwd(),
): WorkspaceConfig {
  return { ...input, workspacePath: resolve(cwd, input.workspacePath ?? ".") };
}

export async function readWorkspaceConfig(file: string): Promise<WorkspaceConfig> {
  const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<WorkspaceConfig>;
  if (typeof parsed.workspacePath !== "string") throw new TypeError("workspacePath is required");
  return workspaceConfig(parsed);
}
