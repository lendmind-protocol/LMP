use lmp_core::{ast::audit_source, load_mind};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
struct McpRequest {
    jsonrpc: String,
    id: serde_json::Value,
    method: String,
    params: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct McpResponse {
    jsonrpc: String,
    id: serde_json::Value,
    result: serde_json::Value,
}

fn profile_path(alias: &str) -> PathBuf {
    PathBuf::from(format!("./registry/definitions/{alias}.json"))
}

fn audit_workspace(workspace: &Path, mind_alias: &str) -> anyhow::Result<(usize, Vec<String>)> {
    let mind = load_mind(&profile_path(mind_alias))?;
    let mut checked = 0;
    let mut violations = Vec::new();
    let mut entries = vec![workspace.to_path_buf()];

    while let Some(path) = entries.pop() {
        if path.is_dir() {
            entries.extend(
                fs::read_dir(path)?
                    .filter_map(Result::ok)
                    .map(|entry| entry.path()),
            );
        } else if path.extension().is_some_and(|ext| ext == "rs") {
            checked += 1;
            let source = fs::read_to_string(&path)?;
            for violation in audit_source(
                &source,
                mind.telemetry_metrics.max_cyclomatic_complexity,
                &mind.telemetry_metrics.forbidden_ast_nodes,
            )? {
                violations.push(format!("{}: {violation}", path.display()));
            }
        }
    }
    Ok((checked, violations))
}

fn handle(request: McpRequest) -> McpResponse {
    let result = match request.method.as_str() {
        "tools/list" => serde_json::json!({"tools": [{
            "name": "enforce_architectural_axioms",
            "description": "Audits Rust files in a workspace against a registry mind profile.",
            "inputSchema": {"type": "object", "properties": {
                "workspace_path": {"type": "string"}, "mind_alias": {"type": "string"}
            }, "required": ["workspace_path", "mind_alias"]}
        }]}),
        "tools/call" => {
            let arguments = request
                .params
                .as_ref()
                .and_then(|params| params.get("arguments"));
            let workspace = arguments
                .and_then(|args| args.get("workspace_path"))
                .and_then(|v| v.as_str());
            let alias = arguments
                .and_then(|args| args.get("mind_alias"))
                .and_then(|v| v.as_str());
            match (workspace, alias) {
                (Some(workspace), Some(alias)) => {
                    match audit_workspace(Path::new(workspace), alias) {
                        Ok((checked, violations)) => {
                            serde_json::json!({"content": [{"type": "text", "text": format!("Audited {checked} Rust file(s) with {alias}: {} violation(s).{}", violations.len(), if violations.is_empty() { String::new() } else { format!("\\n{}", violations.join("\\n")) })}], "isError": !violations.is_empty()})
                        }
                        Err(error) => {
                            serde_json::json!({"content": [{"type": "text", "text": error.to_string()}], "isError": true})
                        }
                    }
                }
                _ => {
                    serde_json::json!({"content": [{"type": "text", "text": "workspace_path and mind_alias are required"}], "isError": true})
                }
            }
        }
        _ => serde_json::json!({"error": {"code": -32601, "message": "Method not found"}}),
    };
    McpResponse {
        jsonrpc: request.jsonrpc,
        id: request.id,
        result,
    }
}

fn main() -> anyhow::Result<()> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    for line in stdin.lock().lines() {
        let request: McpRequest = serde_json::from_str(&line?)?;
        serde_json::to_writer(&mut stdout, &handle(request))?;
        stdout.write_all(b"\n")?;
        stdout.flush()?;
    }
    Ok(())
}
