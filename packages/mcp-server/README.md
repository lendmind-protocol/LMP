# `@lending-mind/mcp`

Compatibility transport for the Rust `lmp-mcp` server. It maintains one local
JSON-RPC session, forwards notifications correctly, and preserves request
correlation for agent hosts that launch the Node entry point.
