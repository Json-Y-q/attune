# Attune MCP middleware (local prototype)

**Label: local prototype / not for remote deploy / not submitted to any marketplace.**

## Tools
| Tool | Purpose |
|---|---|
| `report_load` | Record a self-reported load event; returns adaptation context |
| `get_adaptation` | Conversation context + load → system-context string + soft `max_tokens` / pace / tone |
| `get_loop_status` | Rule-based loop detection (reuses `docs/js/loop.js`) |

## Run (stdio only)
```bash
node mcp/server.mjs
# or
node mcp/server.mjs --self-test
```

Point a local MCP client at `node /path/to/cogfit-mvp/mcp/server.mjs` with transport **stdio**.

## Scope vs 08 review
Document 08 deferred MCP/SDK. This folder is the approved narrow reading of Sehan’s 2026-10 direction: **vendor-neutral local prototype only**. Public listing, remote hosting, SDK packaging and pricing stay deferred — see `/workspace/cogload-startup/11_피드백루프_MCP_방향.md`.

## Dependencies
None (hand-rolled JSON-RPC). Reuses `docs/js/adapt.js`, `labels.js`, `loop.js`.

