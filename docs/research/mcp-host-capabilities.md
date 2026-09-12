# MCP host capabilities research

## Question

Does MCP provide a universal documented pre-write hook that lets a server block
every editor or agent filesystem write before persistence?

## Primary source URL/repository

- [MCP lifecycle specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/lifecycle)
- [MCP tools specification](https://modelcontextprotocol.io/specification/2025-03-26/server/tools)

## Source version/date/commit

Model Context Protocol specification version 2025-03-26; reviewed on
2026-09-12; repository behavior is evaluated at the current working-tree
revision.

## What the source proves

MCP defines JSON-RPC lifecycle, capability negotiation, tools, errors, and
request cancellation semantics.

## What it does not prove

The protocol does not define a universal host filesystem interception contract.

## Implementation implication

LMP exposes bounded guidance and evaluation tools, plus daemon and Git hooks;
it must not claim universal pre-write interception.

## Chosen decision

Keep host integration explicit and fail closed at supported boundaries.

## Rejected alternatives

Calling MCP a filesystem firewall was rejected because the specification does
not establish that capability.

## Test plan

Exercise initialization, tool schemas, malformed requests, errors, cancellation,
and concurrent requests in the Rust MCP tests.

## Known limitation

Host-specific interoperability and pre-write enforcement require separate
documented host extensions.
