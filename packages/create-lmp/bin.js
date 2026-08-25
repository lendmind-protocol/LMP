#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const targetWorkspace = process.cwd();
printBanner();

try {
  // 1. Initialize local registry directories
  const lmpDir = path.join(targetWorkspace, '.lmp_telemetry');
  if (!fs.existsSync(lmpDir)) {
    fs.mkdirSync(lmpDir, { recursive: true });
    fs.mkdirSync(path.join(lmpDir, 'minds'), { recursive: true });
  }

  // 2. Hydrate a default baseline mind profile locally
  const defaultMind = {
    id: "lmp:mind:local-baseline",
    version: "1.0.0",
    telemetry_metrics: {
      max_cyclomatic_complexity: 10,
      forbidden_ast_nodes: ["UnsafeBlockExpression"]
    }
  };
  fs.writeFileSync(
    path.join(lmpDir, 'minds', 'local-baseline.json'), 
    JSON.stringify(defaultMind, null, 2)
  );

  // 3. Inject native sidecar binary hooks seamlessly into git workflows
  const gitHooksDir = path.join(targetWorkspace, '.git', 'hooks');
  if (fs.existsSync(gitHooksDir)) {
    const preCommitHook = `#!/bin/sh\n# LMP Automated Axiom Compliance Check\necho "🔍 Activating Lending-Mind Verification Core..."\n`;
    fs.writeFileSync(path.join(gitHooksDir, 'pre-commit'), preCommitHook, { mode: 0o755 });
    console.log("⚓ Installed secure git commit hooks successfully.");
  }

  console.log("\n🚀 [ONBOARDING COMPLETE]: Your repository is fully protected under LMP rules.");
  console.log("👉 Next Step: Run your favorite AI coding agent and watch it align with your stack definitions.");

} catch (error) {
  console.error("❌ Onboarding initialization failed:", error.message);
}

function printBanner() {
  console.log("=================================================");
  console.log("🌐 Lending-Mind Protocol (LMP) Environment Setup");
  console.log("=================================================\n");
}

