#!/usr/bin/env node
/**
 * Attune MCP middleware — local prototype.
 * Tools: report_load, get_adaptation, get_loop_status, record_suggestion.
 * Transports: stdio (default) or Streamable HTTP bound to 127.0.0.1 (`--http`), token required.
 * Not deployed anywhere, not submitted to any marketplace, makes no outbound network calls.
 * Exposing the HTTP port publicly (e.g. a tunnel for grok.com connectors) is the user's explicit choice; see README.
 * Hand-rolled JSON-RPC (MCP-shaped) to avoid an SDK dependency for this prototype.
 */
import { createInterface } from 'node:readline';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docsJs = join(root, 'docs', 'js');

// Dynamic import of stamped modules — Node 18+ tolerates ?v= query on file URLs inconsistently,
// so we import via a small loader that strips query from the resolver by reading entry files that
// re-export through relative paths. Prefer direct imports of our unstamped-friendly adapt path:
const adaptUrl = pathToFileURL(join(docsJs, 'adapt.js')).href;
const labelsUrl = pathToFileURL(join(docsJs, 'labels.js')).href;
const loopUrl = pathToFileURL(join(docsJs, 'loop.js')).href;
const suggestUrl = pathToFileURL(join(docsJs, 'suggest.js')).href;

const { getAdaptation } = await import(adaptUrl);
const { newSuggestState, canSuggest, markShown, recordOutcome } = await import(suggestUrl);
const { makeLabel, appendLabel, exportLabelsJSON } = await import(labelsUrl);
const { analyzeLoop, parseConversation } = await import(loopUrl);

const labels = [];
let sessionId = `mcp_${Date.now().toString(36)}`;
const sessionStart = Date.now();
let suggestState = newSuggestState(); // in memory: same daily cap + backoff as the site and extension

// Short descriptions keep tools/list small; `verbose: true` on any tool returns the full JSON payload.
const V = { type: 'boolean' }; // verbose: full JSON instead of item: value lines
const CONV = { type: 'string', description: 'You:/AI: lines' };
const TOOLS = [
  {
    name: 'report_load',
    description: 'Log self-reported load; returns reply guidance.',
    inputSchema: { type: 'object', properties: { level: { type: 'string', enum: ['calm', 'rising', 'high', 'overloaded'] }, recentTurns: { type: 'number' }, note: { type: 'string' }, lang: { type: 'string', enum: ['en', 'ko'] }, verbose: V } },
  },
  {
    name: 'get_adaptation',
    description: 'Load (+chat) → reply guidance, params, optional action suggestion.',
    inputSchema: { type: 'object', properties: { loadIndex: { type: 'number' }, overloaded: { type: 'boolean' }, lang: { type: 'string', enum: ['en', 'ko'] }, conversation: CONV, turns: { type: 'array' }, verbose: V } },
  },
  {
    name: 'record_suggestion',
    description: 'Log answer to a suggestion; applies daily cap + backoff.',
    inputSchema: { type: 'object', properties: { outcome: { type: 'string', enum: ['accept', 'reject', 'ignore'] }, verbose: V }, required: ['outcome'] },
  },
  {
    name: 'get_loop_status',
    description: 'Detect a looping chat (local rules).',
    inputSchema: { type: 'object', properties: { conversation: CONV, turns: { type: 'array' }, verbose: V } },
  },
];

/* ---------- compact item-value text (default) ---------- */
const kv = (pairs) => pairs.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}: ${v}`).join('\n');
const text = (t) => ({ content: [{ type: 'text', text: t }] });
const json = (o) => text(JSON.stringify(o, null, 2));
const paramsLine = (p) => [p.structure, p.summary_sentences ? `summary ${p.summary_sentences}` : null, p.keep_full_details ? 'full kept' : null, `pace ${p.pace}`, `tone ${p.tone}`, `amount ${p.amount}`, p.max_options ? `options ≤${p.max_options}` : null].filter(Boolean).join(' · ');
const loopLine = (l) => (l && l.detected ? `${l.type} ${l.confidence}` : 'none');
const gateLine = (g) => (g.ok ? `ok ${g.remaining} left` : `${g.reason}${g.until ? ` until ${new Date(g.until).toISOString().slice(0, 16)}Z` : ''}`);
const evLine = (ev) => ev.map((e) => `${e.key}(${Object.entries(e.params || {}).map(([k, v]) => `${k}=${v}`).join(',')})`).join('; ');

function ok(id, result) {
  return { jsonrpc: '2.0', id, result };
}
function err(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function resolveTurns(args = {}) {
  if (Array.isArray(args.turns) && args.turns.length) return args.turns;
  if (typeof args.conversation === 'string' && args.conversation.trim()) {
    return parseConversation(args.conversation) || [];
  }
  return [];
}

function callTool(name, args = {}) {
  if (name === 'report_load') {
    const level = args.level || 'overloaded';
    const label = makeLabel({
      sessionId,
      recentTurns: args.recentTurns ?? 0,
      source: 'mcp',
      kind: 'load',
      level,
      signals: { level, overloaded: level === 'overloaded' },
      note: args.note || '',
      origin: 'manual',
      sessionStart,
    });
    const next = appendLabel(labels, label); labels.length = 0; labels.push(...next);
    const turns = resolveTurns(args);
    const adaptation = getAdaptation({
      overloaded: level === 'overloaded',
      loadIndex: level === 'overloaded' ? 90 : level === 'rising' ? 55 : level === 'high' ? 80 : 20,
      turns,
      lang: args.lang === 'ko' ? 'ko' : 'en',
      short: !args.verbose,
    });
    if (args.verbose) return json({ label, adaptation, systemContext: adaptation.context, params: adaptation.params, labelCount: labels.length });
    return text(kv([
      ['level', label.level], ['label', `${label.id} ${label.ts.slice(0, 16)}Z turns ${label.recentTurns}`],
      ['context', adaptation.context], ['params', paramsLine(adaptation.params)],
      ['loop', adaptation.loop ? loopLine(adaptation.loop) : null], ['labels', labels.length],
    ]));
  }
  if (name === 'get_adaptation') {
    const turns = resolveTurns(args);
    const adapt = getAdaptation({
      loadIndex: args.loadIndex,
      overloaded: Boolean(args.overloaded),
      turns,
      lang: args.lang === 'ko' ? 'ko' : 'en',
      short: !args.verbose,
    });
    // Automatic suggestion line: only when the shared policy allows it (daily cap, backoff, on/off).
    const gate = canSuggest(suggestState, Date.now());
    if (adapt.suggestion && gate.ok) suggestState = markShown(suggestState, Date.now());
    const out = { ...adapt, suggestion: gate.ok ? adapt.suggestion : null, suggestionGate: gate };
    if (args.verbose) return json(out);
    return text(kv([
      ['level', out.level], ['loop', out.loop ? loopLine(out.loop) : null], ['context', out.context],
      ['params', paramsLine(out.params)], ['suggestion', out.suggestion], ['gate', gateLine(gate)],
    ]));
  }
  if (name === 'record_suggestion') {
    const outcome = ['accept', 'reject', 'ignore'].includes(args.outcome) ? args.outcome : null;
    if (!outcome) throw new Error('outcome must be accept | reject | ignore');
    suggestState = recordOutcome(suggestState, outcome, Date.now());
    const label = makeLabel({ sessionId, source: 'mcp', kind: 'suggest', level: 'rising', origin: 'auto', outcome, sessionStart, signals: {} });
    const next = appendLabel(labels, label); labels.length = 0; labels.push(...next);
    const gate = canSuggest(suggestState, Date.now());
    if (args.verbose) return json({ outcome, gate, declineStreak: suggestState.declineStreak, labelCount: labels.length });
    return text(kv([['outcome', outcome], ['gate', gateLine(gate)], ['streak', suggestState.declineStreak], ['labels', labels.length]]));
  }
  if (name === 'get_loop_status') {
    const turns = resolveTurns(args);
    const analysis = turns.length ? analyzeLoop(turns) : { detected: false, tooFew: true, type: null, confidence: 0, evidence: [] };
    const full = {
      detected: analysis.detected,
      type: analysis.type,
      confidence: analysis.confidence,
      evidence: analysis.evidence,
      exportHint: labels.length ? 'in-memory labels present (stdio session only)' : null,
    };
    if (args.verbose) return json(full);
    return text(kv([['loop', loopLine(full)], ['evidence', full.evidence.length ? evLine(full.evidence) : null], ['labels', labels.length || null]]));
  }
  throw new Error(`unknown tool: ${name}`);
}

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'attune-load-local', version: '0.2.0' };

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    const asked = params?.protocolVersion;
    return ok(id, {
      protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
  }
  if (typeof method === 'string' && method.startsWith('notifications/')) return null;
  if (method === 'initialized') return null;
  if (method === 'tools/list') return ok(id, { tools: TOOLS });
  if (method === 'tools/call') {
    try {
      return ok(id, callTool(params?.name, params?.arguments || {}));
    } catch (e) {
      return err(id, -32000, String(e.message || e));
    }
  }
  if (method === 'ping') return ok(id, {});
  return err(id, -32601, `Method not found: ${method}`);
}

const argVal = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
};

/* ---------- Streamable HTTP transport (opt-in, loopback only) ---------- */
// Spec shape: single endpoint; POST JSON-RPC → application/json reply; notifications → 202; GET → 405 (no server stream).
// Binds 127.0.0.1 only. A bearer token is required (header `Authorization: Bearer <t>` or path `/mcp/<t>` for UIs that cannot set headers).
function makeHttpHandler(secret) {
  const sessions = new Set();
  const same = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
  const authorized = (req, pathToken) => {
    if (!secret) return true;
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ') && same(h.slice(7).trim(), secret)) return true;
    return pathToken != null && same(pathToken, secret);
  };
  const send = (res, code, body, headers = {}) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
    res.end(body == null ? '' : JSON.stringify(body));
  };
  return (req, res) => {
    const url = new URL(req.url, 'http://local');
    const m = url.pathname.match(/^\/mcp(?:\/([A-Za-z0-9_-]{8,128}))?\/?$/);
    if (url.pathname === '/healthz') return send(res, 200, { ok: true, server: SERVER_INFO });
    if (!m) return send(res, 404, { error: 'not found' });
    // DNS-rebinding guard: browsers send Origin; only allow none or grok.com.
    const origin = req.headers.origin;
    if (origin && !/^https:\/\/(?:[a-z0-9-]+\.)*grok\.com$/.test(origin)) return send(res, 403, { error: 'origin not allowed' });
    if (!authorized(req, m[1] ?? null)) return send(res, 401, { error: 'unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
    if (req.method === 'GET') return send(res, 405, { error: 'no server-initiated stream' }, { Allow: 'POST, DELETE' });
    if (req.method === 'DELETE') { sessions.delete(req.headers['mcp-session-id']); return send(res, 200, { ok: true }); }
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' }, { Allow: 'POST, DELETE' });
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { raw += c; if (raw.length > 1_000_000) req.destroy(); });
    req.on('end', async () => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return send(res, 400, err(null, -32700, 'Parse error')); }
      const batch = Array.isArray(msg) ? msg : [msg];
      const out = [];
      let sid = req.headers['mcp-session-id'] || null;
      for (const one of batch) {
        if (one?.method === 'initialize') { sid = randomBytes(12).toString('hex'); sessions.add(sid); }
        const r = await handle(one || {});
        if (r) out.push(r);
      }
      const headers = sid ? { 'Mcp-Session-Id': sid } : {};
      if (!out.length) { res.writeHead(202, headers); return res.end(); }
      return send(res, 200, Array.isArray(msg) ? out : out[0], headers);
    });
  };
}

function startHttp({ port = 3001, host = '127.0.0.1', token = null, allowNoToken = false, log = (m) => console.error(m) } = {}) {
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('HTTP transport binds loopback only (127.0.0.1). Use a tunnel if you decide to expose it.');
  const secret = token || (allowNoToken ? null : randomBytes(24).toString('base64url'));
  const server = createServer(makeHttpHandler(secret));
  server.listen(port, host, () => {
    const p = server.address().port;
    log(`attune MCP (Streamable HTTP) on http://${host}:${p}/mcp — loopback only`);
    if (secret) log(`token required. Local URL with token: http://${host}:${p}/mcp/${secret}`);
    else log('WARNING: running without a token (--no-token). Do not tunnel this.');
  });
  return { server, token: secret };
}

if (process.argv.includes('--self-test')) {
  // Self-test hook (no MCP client needed)
  const a = callTool('report_load', { level: 'overloaded', recentTurns: 3, verbose: true });
  const b = callTool('get_adaptation', { overloaded: true, loadIndex: 80, verbose: true });
  const c = callTool('get_loop_status', { verbose: true, conversation: 'You: how?\nAI: try A\nYou: how?\nAI: try A\nYou: still how?\nAI: try A again\nYou: same problem\nAI: try A' });
  console.error(JSON.stringify({ ok: true, tools: TOOLS.map((t) => t.name), sample: { report: JSON.parse(a.content[0].text).label.level || JSON.parse(a.content[0].text).label.kind, hasAdaptation: Boolean(JSON.parse(a.content[0].text).systemContext), level: JSON.parse(b.content[0].text).level, loopKeys: Object.keys(JSON.parse(c.content[0].text)) } }));
  process.exit(0);
} else if (process.argv.includes('--http-self-test')) {
  // Exercise the Streamable HTTP handler with in-memory request/response objects (no socket is opened).
  const { EventEmitter } = await import('node:events');
  const handler = makeHttpHandler('selftesttoken1234');
  const call = (method, path, body, headers = {}) => new Promise((resolve) => {
    const req = new EventEmitter();
    Object.assign(req, { method, url: path, headers, setEncoding() {}, destroy() {} });
    const res = { code: 0, headers: {}, body: '', writeHead(c, h = {}) { this.code = c; this.headers = h; }, end(b = '') { this.body = b; resolve(this); } };
    handler(req, res);
    if (body != null) req.emit('data', JSON.stringify(body));
    req.emit('end');
  });
  const auth = { authorization: 'Bearer selftesttoken1234' };
  const r = {};
  r.noAuth = (await call('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })).code;
  const init = await call('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, auth);
  r.init = init.code; r.session = Boolean(init.headers['Mcp-Session-Id']); r.version = JSON.parse(init.body).result.protocolVersion;
  r.notify = (await call('POST', '/mcp/selftesttoken1234', { jsonrpc: '2.0', method: 'notifications/initialized' })).code;
  const list = await call('POST', '/mcp/selftesttoken1234', { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  r.tools = JSON.parse(list.body).result.tools.map((t) => t.name);
  r.get = (await call('GET', '/mcp', null, auth)).code;
  r.badOrigin = (await call('POST', '/mcp', { jsonrpc: '2.0', id: 3, method: 'ping' }, { ...auth, origin: 'https://evil.example' })).code;
  r.grokOrigin = (await call('POST', '/mcp', { jsonrpc: '2.0', id: 3, method: 'ping' }, { ...auth, origin: 'https://grok.com' })).code;
  r.loopbackOnly = (() => { try { startHttp({ host: '0.0.0.0', token: 'x' }); return false; } catch { return true; } })();
  console.error(JSON.stringify(r));
  process.exit(0);
} else if (process.argv.includes('--http')) {
  startHttp({
    port: Number(argVal('--port', process.env.ATTUNE_MCP_PORT || 3001)),
    host: argVal('--host', '127.0.0.1'),
    token: argVal('--token', process.env.ATTUNE_MCP_TOKEN || null),
    allowNoToken: process.argv.includes('--no-token'),
  });
} else {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try { msg = JSON.parse(trimmed); } catch { return; }
    const res = await handle(msg);
    if (res) process.stdout.write(JSON.stringify(res) + '\n');
  });
}
