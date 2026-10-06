# Attune MCP middleware (local prototype)

**Label: local prototype. Not deployed anywhere, not submitted to any marketplace. Makes no outbound network calls.**

## Tools
| Tool | Purpose |
|---|---|
| `report_load` | Record a self-reported load event (calm / rising / high / overloaded); returns the adaptation bundle |
| `get_adaptation` | Load + optional conversation → system-context text, soft params (`structure: summary_then_details`, `summary_sentences`, `keep_full_details`, pace, tone) and an action-only `suggestion` line when the daily cap / backoff allow it |
| `record_suggestion` | Record the answer to an automatic suggestion (`accept` / `reject` / `ignore`); same 2–3 per day cap and 1/3/7-day backoff as the site |
| `get_loop_status` | Rule-based loop detection (reuses `docs/js/loop.js`) |

Labels and suggestion state live in memory for the life of the process.

## Transport 1 — stdio (default, local clients)
```bash
node mcp/server.mjs              # stdio
node mcp/server.mjs --self-test  # prints a JSON summary to stderr
```
Point a local MCP client at `node /path/to/attune/mcp/server.mjs` with transport **stdio**.

## Transport 2 — Streamable HTTP (opt-in, loopback only)
```bash
node mcp/server.mjs --http --port 3001                    # prints a random token
ATTUNE_MCP_TOKEN=<long-random> node mcp/server.mjs --http # or bring your own token
```
- Binds **127.0.0.1 only** (other hosts are refused). Endpoint: `POST /mcp` (JSON-RPC, JSON reply), notifications → `202`, `GET` → `405` (no server stream), `DELETE` ends a session. `GET /healthz` for a quick check.
- **Token required** by default: `Authorization: Bearer <token>` or, for UIs that cannot set headers, the token as the last path segment: `/mcp/<token>`. `--no-token` exists for loopback-only debugging; never tunnel it.
- Browser `Origin` headers other than `*.grok.com` are rejected (DNS-rebinding guard).

Local check:
```bash
curl -s -X POST http://127.0.0.1:3001/mcp/<token> -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Connecting grok.com (Bring Your Own MCP) — test procedure
What xAI documents (checked 2026-10-07, docs.x.ai/grok/connectors and /grok/connectors/custom-mcp-tunneling):
- grok.com/connectors → **New Connector → Custom** → paste the MCP server URL → finish any auth the server asks for (OAuth or API key). Grok then discovers the tools.
- The URL must be **public HTTPS**. `localhost`, `127.0.0.1` and private ranges are rejected, so a local server needs a tunnel.
- Transports: Streamable HTTP or SSE. **Cloudflare quick tunnels do not support SSE** (use ngrok for SSE). This server speaks Streamable HTTP, so a Cloudflare quick tunnel works.
- Free tunnel URLs change on restart. Then remove the old connector and add a new one.
- Business/Enterprise workspaces: an admin must first add the connector in console.x.ai.

Steps (only after deciding to expose it; see "Decision" below):
1. `ATTUNE_MCP_TOKEN=$(openssl rand -hex 24) node mcp/server.mjs --http --port 3001`, and keep it running.
2. In a second terminal: `cloudflared tunnel --url http://localhost:3001`, then copy the `https://<random>.trycloudflare.com` URL.
3. Check it: `curl -s -X POST https://<random>.trycloudflare.com/mcp/$ATTUNE_MCP_TOKEN -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`
4. grok.com/connectors → New Connector → Custom → URL `https://<random>.trycloudflare.com/mcp/<token>`. If the dialog offers a header or API-key field, you can use `https://<random>.trycloudflare.com/mcp` with `Bearer <token>` instead. Which auth fields the custom-connector dialog shows is not confirmed in xAI's docs; the path token works either way.
5. In a Grok chat, ask it to use the Attune tools, e.g. "call get_adaptation with overloaded=true".
6. When done: stop `cloudflared` (Ctrl-C), stop the server, and remove the connector on grok.com.

## Decision needed before step 2 (remote exposure)
A tunnel makes this local process reachable from the internet for as long as it runs. Anyone holding the URL **and** token can call the four tools, and Grok will send conversation snippets you pass to `get_adaptation` / `get_loop_status` through the tunnel provider to your machine. No data is stored on disk. Running the tunnel is Sehan's call. This repo never starts one, and nothing is deployed.

## Scope vs 08 review
Document 08 deferred MCP/SDK. This folder is the approved narrow reading of Sehan’s 2026-10 direction: **vendor-neutral local prototype only**. Public listing, hosted deployment, SDK packaging and pricing stay deferred; see `/workspace/cogload-startup/11_피드백루프_MCP_방향.md`.

## Dependencies
None (hand-rolled JSON-RPC over `node:readline` / `node:http`). Reuses `docs/js/adapt.js`, `labels.js`, `loop.js`, `suggest.js`.
