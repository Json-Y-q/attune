#!/usr/bin/env node
/**
 * Attune MCP middleware — local stdio prototype only.
 * Tools: report_load, get_adaptation, get_loop_status.
 * No remote transport, no marketplace submit, no network calls.
 * Hand-rolled JSON-RPC (MCP-shaped) to avoid an SDK dependency for this prototype.
 */
import { createInterface } from 'node:readline';
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

const { getAdaptation } = await import(adaptUrl);
const { makeLabel, appendLabel, exportLabelsJSON } = await import(labelsUrl);
const { analyzeLoop, parseConversation } = await import(loopUrl);

const labels = [];
let sessionId = `mcp_${Date.now().toString(36)}`;

const TOOLS = [
  {
    name: 'report_load',
    description: 'Record a self-reported cognitive-load event (button press). Local only.',
    inputSchema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['calm', 'rising', 'high', 'overloaded'], description: 'Self-reported load' },
        recentTurns: { type: 'number' },
        note: { type: 'string' },
      },
    },
  },
  {
    name: 'get_adaptation',
    description: 'Given load + optional conversation turns, return a system-context phrase and soft generation params (max_tokens / pace / tone).',
    inputSchema: {
      type: 'object',
      properties: {
        loadIndex: { type: 'number' },
        overloaded: { type: 'boolean' },
        lang: { type: 'string', enum: ['en', 'ko'] },
        conversation: { type: 'string', description: 'Optional pasted dialogue (You:/AI: lines)' },
        turns: { type: 'array', description: 'Optional [{role,text}] turns' },
      },
    },
  },
  {
    name: 'get_loop_status',
    description: 'Rule-based local loop detection on provided turns or pasted text. No network.',
    inputSchema: {
      type: 'object',
      properties: {
        conversation: { type: 'string' },
        turns: { type: 'array' },
      },
    },
  },
];

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
      kind: level === 'overloaded' ? 'overloaded' : 'adaptation',
      signals: { level, overloaded: level === 'overloaded' },
      note: args.note || '',
    });
    const next = appendLabel(labels, label); labels.length = 0; labels.push(...next);
    const adapt = getAdaptation({ overloaded: level === 'overloaded', loadIndex: level === 'high' ? 80 : level === 'rising' ? 55 : level === 'overloaded' ? 90 : 20, lang: 'en' });
    return { content: [{ type: 'text', text: JSON.stringify({ label, adaptation: adapt, labelCount: labels.length }, null, 2) }] };
  }
  if (name === 'get_adaptation') {
    const turns = resolveTurns(args);
    const adapt = getAdaptation({
      loadIndex: args.loadIndex,
      overloaded: Boolean(args.overloaded),
      turns,
      lang: args.lang === 'ko' ? 'ko' : 'en',
    });
    return { content: [{ type: 'text', text: JSON.stringify(adapt, null, 2) }] };
  }
  if (name === 'get_loop_status') {
    const turns = resolveTurns(args);
    const analysis = turns.length ? analyzeLoop(turns) : { detected: false, tooFew: true, type: null, confidence: 0, evidence: [] };
    return { content: [{ type: 'text', text: JSON.stringify({
      detected: analysis.detected,
      type: analysis.type,
      confidence: analysis.confidence,
      evidence: analysis.evidence,
      exportHint: labels.length ? 'in-memory labels present (stdio session only)' : null,
    }, null, 2) }] };
  }
  throw new Error(`unknown tool: ${name}`);
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'attune-load-local', version: '0.1.0' },
    });
  }
  if (method === 'notifications/initialized' || method === 'initialized') return null;
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

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try { msg = JSON.parse(trimmed); } catch { return; }
  const res = await handle(msg);
  if (res) process.stdout.write(JSON.stringify(res) + '\n');
});

// Self-test hook when run with --self-test (no MCP client needed)
if (process.argv.includes('--self-test')) {
  const a = callTool('report_load', { level: 'overloaded', recentTurns: 3 });
  const b = callTool('get_adaptation', { overloaded: true, loadIndex: 80 });
  const c = callTool('get_loop_status', { conversation: 'You: how?\nAI: try A\nYou: how?\nAI: try A\nYou: still how?\nAI: try A again\nYou: same problem\nAI: try A' });
  console.error(JSON.stringify({ ok: true, tools: TOOLS.map((t) => t.name), sample: { report: JSON.parse(a.content[0].text).label.kind, level: JSON.parse(b.content[0].text).level, loopKeys: Object.keys(JSON.parse(c.content[0].text)) } }));
  process.exit(0);
}
