use lmp_core::{compiler, crypto::package_signature_status, evaluator};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    io::{self, BufRead, BufWriter, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
    thread,
};

#[derive(Deserialize)]
struct Request {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}
#[derive(Serialize)]
struct Response {
    jsonrpc: &'static str,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<Value>,
}
struct ServerState {
    initialized: bool,
}
fn ok(id: Value, result: Value) -> Response {
    Response {
        jsonrpc: "2.0",
        id,
        result: Some(result),
        error: None,
    }
}
fn err(id: Value, code: i32, message: &str) -> Response {
    Response {
        jsonrpc: "2.0",
        id,
        result: None,
        error: Some(json!({"code":code,"message":message})),
    }
}
fn tool_result(id: Value, value: Value) -> Response {
    ok(
        id,
        json!({
            "content": [{"type":"text","text":serde_json::to_string(&value).unwrap_or_default()}],
            "structuredContent": value,
            "isError": false
        }),
    )
}
fn tool_error(id: Value, message: &str) -> Response {
    ok(
        id,
        json!({
            "content": [{"type":"text","text":message}],
            "isError": true
        }),
    )
}
fn tools() -> Value {
    json!({"tools":[
        {"name":"lmp_list_minds","description":"List locally available mind packages.","inputSchema":{"type":"object","additionalProperties":false,"properties":{"includeLocalWorkspace":{"type":"boolean"}}}},
        {"name":"lmp_get_instructions","description":"Compile visible instructions from a local Mind Package.","inputSchema":{"type":"object","additionalProperties":false,"required":["mind"],"properties":{"mind":{"type":"string"}}}},
        {"name":"lmp_get_context","description":"Return typed, privacy-preserving context for a Mind and workspace.","inputSchema":{"type":"object","additionalProperties":false,"required":["mind","workspace"],"properties":{"mind":{"type":"string"},"workspace":{"type":"string"}}}},
        {"name":"lmp_validate_mind","description":"Validate a local Mind Package manifest.","inputSchema":{"type":"object","additionalProperties":false,"required":["mind"],"properties":{"mind":{"type":"string"}}}},
        {"name":"lmp_explain_rule","description":"Explain a rule from a local Mind Package without changing policy.","inputSchema":{"type":"object","additionalProperties":false,"required":["mind","ruleId"],"properties":{"mind":{"type":"string"},"ruleId":{"type":"string"}}}},
        {"name":"lmp_evaluate_workspace","description":"Evaluate a workspace without executing commands.","inputSchema":{"type":"object","additionalProperties":false,"required":["mind","workspace","mode"],"properties":{"mind":{"type":"string"},"workspace":{"type":"string"},"mode":{"type":"string","enum":["advisory","enforced","audit"]},"changedOnly":{"type":"boolean"},"base":{"type":"string"}}}},
        {"name":"enforce_architectural_axioms","description":"Run enforced evaluation for an agent change and return the acceptance artifact.","inputSchema":{"type":"object","additionalProperties":false,"required":["mind","workspace"],"properties":{"mind":{"type":"string"},"workspace":{"type":"string"},"changedOnly":{"type":"boolean"},"base":{"type":"string"}}}},
        {"name":"lmp_verify_mind","description":"Validate a local Mind Package manifest and report its digest.","inputSchema":{"type":"object","additionalProperties":false,"required":["packagePath"],"properties":{"packagePath":{"type":"string"}}}},
        {"name":"lmp_get_artifact","description":"Read an evaluation artifact from the configured local artifact directory.","inputSchema":{"type":"object","additionalProperties":false,"required":["artifactPath"],"properties":{"artifactPath":{"type":"string"}}}},
        {"name":"lmp_get_loop_status","description":"Read the state and evidence summary of an evaluation artifact.","inputSchema":{"type":"object","additionalProperties":false,"required":["artifactPath"],"properties":{"artifactPath":{"type":"string"}}}}
    ]})
}
fn configured_root() -> PathBuf {
    std::env::var_os("LMP_WORKSPACE_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}
fn safe_local_path(value: &str) -> Result<PathBuf, String> {
    let root = configured_root();
    let candidate = PathBuf::from(value);
    let candidate = if candidate.is_absolute() {
        candidate
    } else {
        root.join(candidate)
    };
    let root = root
        .canonicalize()
        .map_err(|e| format!("workspace root is unavailable: {e}"))?;
    let candidate = candidate
        .canonicalize()
        .map_err(|e| format!("path is unavailable: {e}"))?;
    if candidate.starts_with(&root) {
        Ok(candidate)
    } else {
        Err("path must be inside the configured workspace root".into())
    }
}
fn call(name: &str, args: &Value) -> Result<Value, String> {
    let path = |key: &str| {
        args.get(key)
            .and_then(Value::as_str)
            .map(PathBuf::from)
            .ok_or_else(|| format!("{key} is required"))
    };
    match name {
        "lmp_list_minds" => {
            let root = configured_root();
            let mut minds = Vec::new();
            for relative in [
                "skills/baseline/mind.json",
                "skills/typescript-minimal/mind.json",
                ".lending-mind/mind.json",
            ] {
                if root.join(relative).is_file() {
                    minds.push(relative);
                }
            }
            if !args
                .get("includeLocalWorkspace")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            {
                minds.retain(|path| !path.starts_with(".lending-mind/"));
            }
            Ok(json!({"minds": minds}))
        }
        "lmp_get_instructions" => {
            let mind = safe_local_path(path("mind")?.to_str().ok_or("mind is not valid UTF-8")?)?;
            Ok(json!({"content": compiler::compile(&mind).map_err(|e|e.to_string())?.instructions}))
        }
        "lmp_get_context" => {
            let mind = safe_local_path(path("mind")?.to_str().ok_or("mind is not valid UTF-8")?)?;
            let workspace = safe_local_path(
                path("workspace")?
                    .to_str()
                    .ok_or("workspace is not valid UTF-8")?,
            )?;
            let compiled = compiler::compile(&mind).map_err(|e| e.to_string())?;
            let workspace_hash = lmp_core::crypto::MindPackageVerifier::compute_sha256(
                workspace.to_string_lossy().as_bytes(),
            );
            let instruction_hash = lmp_core::crypto::MindPackageVerifier::compute_sha256(
                compiled.instructions.as_bytes(),
            );
            Ok(json!({
                "mind": {"id": compiled.mind.id, "version": compiled.mind.version, "digest": compiled.digest, "signatureStatus": package_signature_status(&mind).map_err(|e| e.to_string())?},
                "workspace": {"pathHash": format!("sha256:{workspace_hash}"), "rooted": true},
                "instructionsDigest": format!("sha256:{instruction_hash}"),
                "capabilities": {"evaluation": true, "commands": false, "network": false, "deployment": false}
            }))
        }
        "lmp_validate_mind" => {
            let mind = safe_local_path(path("mind")?.to_str().ok_or("mind is not valid UTF-8")?)?;
            lmp_core::validate_package_dir(&mind).map_err(|e| e.to_string())?;
            Ok(json!({"valid":true}))
        }
        "lmp_explain_rule" => {
            let mind = safe_local_path(path("mind")?.to_str().ok_or("mind is not valid UTF-8")?)?;
            let rule_id = args
                .get("ruleId")
                .and_then(Value::as_str)
                .ok_or_else(|| "ruleId is required".to_string())?;
            let compiled = compiler::compile(&mind).map_err(|e| e.to_string())?;
            let matches = compiled
                .rules
                .iter()
                .filter(|rule| {
                    rule.get("ruleId").and_then(Value::as_str) == Some(rule_id)
                        || rule.get("id").and_then(Value::as_str) == Some(rule_id)
                        || rule.to_string().contains(rule_id)
                })
                .cloned()
                .collect::<Vec<_>>();
            Ok(
                json!({"ruleId": rule_id, "matched": !matches.is_empty(), "rules": matches, "guidance": compiled.guidance}),
            )
        }
        "lmp_verify_mind" => {
            let package = safe_local_path(
                args.get("packagePath")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "packagePath is required".to_string())?,
            )?;
            let compiled = compiler::compile(&package).map_err(|e| e.to_string())?;
            Ok(
                json!({"digest": compiled.digest, "signatureStatus": package_signature_status(&package).map_err(|e| e.to_string())?, "diagnostics":[]}),
            )
        }
        "lmp_get_artifact" => {
            let artifact = safe_local_path(
                args.get("artifactPath")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "artifactPath is required".to_string())?,
            )?;
            let value: Value =
                serde_json::from_slice(&std::fs::read(artifact).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            Ok(value)
        }
        "lmp_get_loop_status" => {
            let artifact = safe_local_path(
                args.get("artifactPath")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "artifactPath is required".to_string())?,
            )?;
            let value: Value =
                serde_json::from_slice(&std::fs::read(artifact).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            let object = value
                .as_object()
                .ok_or_else(|| "artifact must be a JSON object".to_string())?;
            Ok(json!({
                "artifactVersion": object.get("artifactVersion"),
                "runId": object.get("runId"),
                "state": object.get("state"),
                "summary": object.get("summary"),
                "skippedChecks": object.get("skippedChecks"),
                "loopTransitions": object.get("loopTransitions"),
                "limitations": object.get("limitations"),
                "immutableEvidence": true
            }))
        }
        "lmp_evaluate_workspace" => {
            let mind = safe_local_path(path("mind")?.to_str().ok_or("mind is not valid UTF-8")?)?;
            let workspace = safe_local_path(
                path("workspace")?
                    .to_str()
                    .ok_or("workspace is not valid UTF-8")?,
            )?;
            let mode = args
                .get("mode")
                .and_then(Value::as_str)
                .ok_or_else(|| "mode is required".to_string())?;
            if !["advisory", "enforced", "audit"].contains(&mode) {
                return Err("invalid mode".into());
            }
            let options = evaluator::EvaluationOptions {
                changed_only: args
                    .get("changedOnly")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                git_base: args.get("base").and_then(Value::as_str),
                ..Default::default()
            };
            Ok(
                evaluator::evaluate_with_options(&mind, &workspace, mode, None, options)
                    .map_err(|e| e.to_string())?
                    .artifact,
            )
        }
        "enforce_architectural_axioms" => {
            let mind = safe_local_path(path("mind")?.to_str().ok_or("mind is not valid UTF-8")?)?;
            let workspace = safe_local_path(
                path("workspace")?
                    .to_str()
                    .ok_or("workspace is not valid UTF-8")?,
            )?;
            let options = evaluator::EvaluationOptions {
                changed_only: args
                    .get("changedOnly")
                    .and_then(Value::as_bool)
                    .unwrap_or(true),
                git_base: args.get("base").and_then(Value::as_str),
                ..Default::default()
            };
            Ok(
                evaluator::evaluate_with_options(&mind, &workspace, "enforced", None, options)
                    .map_err(|e| e.to_string())?
                    .artifact,
            )
        }
        _ => Err("unknown tool".into()),
    }
}

fn validate_tool_arguments(name: &str, args: &Value) -> Result<(), String> {
    let (allowed, required): (&[&str], &[&str]) = match name {
        "lmp_list_minds" => (&["includeLocalWorkspace"], &[]),
        "lmp_get_instructions" | "lmp_validate_mind" => (&["mind"], &["mind"]),
        "lmp_get_context" => (&["mind", "workspace"], &["mind", "workspace"]),
        "lmp_explain_rule" => (&["mind", "ruleId"], &["mind", "ruleId"]),
        "lmp_evaluate_workspace" => (
            &["mind", "workspace", "mode", "changedOnly", "base"],
            &["mind", "workspace", "mode"],
        ),
        "enforce_architectural_axioms" => (
            &["mind", "workspace", "changedOnly", "base"],
            &["mind", "workspace"],
        ),
        "lmp_verify_mind" => (&["packagePath"], &["packagePath"]),
        "lmp_get_artifact" => (&["artifactPath"], &["artifactPath"]),
        "lmp_get_loop_status" => (&["artifactPath"], &["artifactPath"]),
        _ => return Err("unknown tool".into()),
    };
    let Some(object) = args.as_object() else {
        return Err("tool arguments must be an object".into());
    };
    for key in object.keys() {
        if !allowed.contains(&key.as_str()) {
            return Err(format!("unexpected argument: {key}"));
        }
    }
    for key in required {
        if !args.get(key).is_some() {
            return Err(format!("{key} is required"));
        }
    }
    for key in allowed {
        if let Some(value) = args.get(key) {
            let valid = match *key {
                "includeLocalWorkspace" => value.is_boolean(),
                "changedOnly" => value.is_boolean(),
                "mode" => value
                    .as_str()
                    .map(|mode| ["advisory", "enforced", "audit"].contains(&mode))
                    .unwrap_or(false),
                _ => value.is_string(),
            };
            if !valid {
                return Err(format!("{key} has an invalid type or value"));
            }
        }
    }
    Ok(())
}

fn handle(request: Request, state: &mut ServerState) -> Option<Response> {
    let id = request.id.clone().unwrap_or(Value::Null);
    if request.jsonrpc != "2.0" {
        return request.id.map(|_| err(id, -32600, "Invalid Request"));
    }
    match request.method.as_str() {
        "initialize" => {
            if let Some(params) = request.params.as_ref() {
                if !params.is_object() {
                    return request
                        .id
                        .map(|_| err(id, -32602, "initialize params must be an object"));
                }
            }
            let requested = request
                .params
                .as_ref()
                .and_then(|params| params.get("protocolVersion"))
                .and_then(Value::as_str);
            if let Some(version) = requested {
                if version != "2025-06-18" {
                    return request
                        .id
                        .map(|_| err(id, -32602, "Unsupported protocol version"));
                }
            }
            state.initialized = true;
            request.id.map(|_| ok(
                id,
                json!({"protocolVersion":"2025-06-18","capabilities":{"tools":{}},"serverInfo":{"name":"lending-mind-mcp","version":env!("CARGO_PKG_VERSION")}}),
            ))
        }
        "notifications/initialized" => {
            state.initialized = true;
            None
        }
        "tools/list" => {
            if !state.initialized {
                return request
                    .id
                    .map(|_| err(id, -32002, "Server is not initialized"));
            }
            request.id.map(|_| ok(id, tools()))
        }
        "tools/call" => {
            if !state.initialized {
                return request
                    .id
                    .map(|_| err(id, -32002, "Server is not initialized"));
            }
            let Some(params) = request.params.filter(Value::is_object) else {
                return request
                    .id
                    .map(|_| err(id, -32602, "Invalid tool call parameters"));
            };
            let Some(name) = params.get("name").and_then(Value::as_str) else {
                return request.id.map(|_| err(id, -32602, "tool name is required"));
            };
            let arguments = params
                .get("arguments")
                .cloned()
                .unwrap_or_else(|| json!({}));
            if !arguments.is_object() {
                return request
                    .id
                    .map(|_| err(id, -32602, "tool arguments must be an object"));
            }
            if let Err(message) = validate_tool_arguments(name, &arguments) {
                return request.id.map(|_| err(id, -32602, &message));
            }
            match call(name, &arguments) {
                Ok(value) => request.id.map(|_| tool_result(id, value)),
                Err(message) => request.id.map(|_| tool_error(id, &message)),
            }
        }
        _ => request.id.map(|_| err(id, -32601, "Method not found")),
    }
}

#[cfg(test)]
fn response_for_line(line: &str) -> Response {
    let mut state = ServerState { initialized: true };
    match serde_json::from_str::<Request>(line) {
        Ok(request) => handle(request, &mut state)
            .unwrap_or_else(|| err(Value::Null, -32600, "Notification has no response")),
        Err(_) => err(Value::Null, -32600, "Invalid Request"),
    }
}

fn process_line(line: &str, state: &mut ServerState) -> Option<Response> {
    match serde_json::from_str::<Request>(line) {
        Ok(request) => handle(request, state),
        Err(_) => Some(err(Value::Null, -32600, "Invalid Request")),
    }
}

fn is_accepted_initialize(line: &str) -> bool {
    let Ok(request) = serde_json::from_str::<Request>(line) else {
        return false;
    };
    if request.jsonrpc != "2.0" || request.method != "initialize" || request.id.is_none() {
        return false;
    }
    match request.params.as_ref() {
        None => true,
        Some(params) if params.is_object() => params
            .get("protocolVersion")
            .and_then(Value::as_str)
            .map(|version| version == "2025-06-18")
            .unwrap_or(true),
        Some(_) => false,
    }
}

fn main() -> anyhow::Result<()> {
    let stdin = io::stdin();
    let output = Arc::new(Mutex::new(BufWriter::new(io::stdout())));
    let mut initialized = false;
    let mut workers = Vec::new();
    for line in stdin.lock().lines() {
        let line = line?;
        if is_accepted_initialize(&line) {
            initialized = true;
        }
        let state = ServerState { initialized };
        let output = Arc::clone(&output);
        workers.push(thread::spawn(move || -> anyhow::Result<()> {
            let mut state = state;
            if let Some(response) = process_line(&line, &mut state) {
                let mut output = output
                    .lock()
                    .map_err(|_| anyhow::anyhow!("output lock poisoned"))?;
                serde_json::to_writer(&mut *output, &response)?;
                output.write_all(b"\n")?;
                output.flush()?;
            }
            Ok(())
        }));
        if workers.len() >= 4 {
            workers
                .remove(0)
                .join()
                .map_err(|_| anyhow::anyhow!("MCP worker panicked"))??;
        }
    }
    for worker in workers {
        worker
            .join()
            .map_err(|_| anyhow::anyhow!("MCP worker panicked"))??;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;
    use std::sync::Arc;
    use std::thread;

    const IMPLEMENTED_TOOLS: &[&str] = &[
        "lmp_list_minds",
        "lmp_get_instructions",
        "lmp_get_context",
        "lmp_validate_mind",
        "lmp_explain_rule",
        "lmp_evaluate_workspace",
        "enforce_architectural_axioms",
        "lmp_verify_mind",
        "lmp_get_artifact",
        "lmp_get_loop_status",
    ];

    fn error_code(response: &Response) -> i64 {
        response
            .error
            .as_ref()
            .and_then(|error| error.get("code"))
            .and_then(Value::as_i64)
            .expect("response should contain an error code")
    }

    #[test]
    fn advertised_tools_match_implemented_tools() {
        let tool_manifest = tools();
        let advertised = tool_manifest["tools"]
            .as_array()
            .expect("tools should be an array")
            .iter()
            .map(|tool| tool["name"].as_str().expect("tool name should be a string"))
            .collect::<BTreeSet<_>>();
        let implemented = IMPLEMENTED_TOOLS.iter().copied().collect::<BTreeSet<_>>();
        assert_eq!(advertised, implemented);

        for tool in tool_manifest["tools"].as_array().unwrap() {
            assert_eq!(tool["inputSchema"]["type"], "object");
            assert_eq!(tool["inputSchema"]["additionalProperties"], false);
        }
    }

    #[test]
    fn malformed_tool_calls_are_rejected_without_panicking() {
        let cases = [
            r#"{"jsonrpc":"2.0","id":1,"method":"tools/call"}"#,
            r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":[]}"#,
            r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"arguments":{}}}"#,
            r#"{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"lmp_list_minds","arguments":[]}}"#,
            r#"{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"lmp_list_minds","arguments":{"unexpected":true}}}"#,
            r#"{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"lmp_evaluate_workspace","arguments":{"mind":"mind","workspace":"workspace"}}}"#,
        ];
        for case in cases {
            assert_eq!(error_code(&response_for_line(case)), -32602);
        }
    }

    #[test]
    fn argument_validator_rejects_non_object_values_directly() {
        let error = validate_tool_arguments("lmp_list_minds", &json!([])).unwrap_err();
        assert_eq!(error, "tool arguments must be an object");
    }

    #[test]
    fn malformed_json_does_not_stop_following_requests() {
        let responses = [
            response_for_line("not json"),
            response_for_line(
                r#"{"jsonrpc":"2.0","id":"second","method":"initialize","params":{}}"#,
            ),
            response_for_line(
                r#"{"jsonrpc":"2.0","id":"third","method":"tools/list","params":{}}"#,
            ),
        ];
        assert_eq!(error_code(&responses[0]), -32600);
        assert_eq!(responses[1].id, "second");
        assert!(responses[1].result.is_some());
        assert_eq!(responses[2].id, "third");
        assert!(responses[2].result.is_some());
    }

    #[test]
    fn independent_requests_can_be_handled_concurrently() {
        let request = Arc::new(r#"{"jsonrpc":"2.0","id":7,"method":"initialize","params":{}}"#);
        let workers = (0..8)
            .map(|_| {
                let request = Arc::clone(&request);
                thread::spawn(move || response_for_line(&request))
            })
            .collect::<Vec<_>>();
        for worker in workers {
            let response = worker.join().expect("request handler should not panic");
            assert_eq!(response.id, 7);
            assert!(response.result.is_some());
            assert!(response.error.is_none());
        }
    }

    #[test]
    fn lifecycle_notifications_and_tool_results_follow_mcp_shape() {
        let mut state = ServerState { initialized: false };
        assert!(process_line(
            r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#,
            &mut state
        )
        .is_none());
        let initialize = process_line(
            r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}"#,
            &mut state,
        )
        .expect("initialize response");
        assert!(initialize.result.is_some());
        let call = process_line(
            r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"lmp_list_minds","arguments":{}}}"#,
            &mut state,
        )
        .expect("tool response");
        let result = call.result.expect("MCP tool result");
        assert_eq!(result["isError"], false);
        assert!(result["content"].is_array());
        assert!(result["structuredContent"].is_object());
    }

    #[test]
    fn rejected_initialization_cannot_unlock_the_tool_surface() {
        let unsupported = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"older"}}"#;
        let mut state = ServerState { initialized: false };
        let response = process_line(unsupported, &mut state).expect("initialize response");
        assert_eq!(error_code(&response), -32602);
        assert!(!state.initialized);

        let tools = process_line(
            r#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#,
            &mut state,
        )
        .expect("tools response");
        assert_eq!(error_code(&tools), -32002);
        assert!(!is_accepted_initialize(unsupported));
        assert!(is_accepted_initialize(
            r#"{"jsonrpc":"2.0","id":3,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}"#
        ));
    }

    #[test]
    fn malformed_initialize_params_are_rejected_without_state_mutation() {
        let mut state = ServerState { initialized: false };
        let response = process_line(
            r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":[]}"#,
            &mut state,
        )
        .expect("initialize response");
        assert_eq!(error_code(&response), -32602);
        assert!(!state.initialized);
    }

    #[test]
    fn changed_scope_arguments_are_typed_and_unknown_arguments_are_rejected() {
        let valid = serde_json::json!({"mind":"mind","workspace":".","mode":"enforced","changedOnly":true,"base":"HEAD~1"});
        validate_tool_arguments("lmp_evaluate_workspace", &valid).unwrap();
        let invalid = serde_json::json!({"mind":"mind","workspace":".","mode":"enforced","changedOnly":"yes"});
        assert!(validate_tool_arguments("lmp_evaluate_workspace", &invalid).is_err());
    }
}
