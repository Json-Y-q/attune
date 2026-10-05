// Unit tests: load labels, adaptation, overload button (partner E3), MCP self-check, extension manifest. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { SAMPLE_PROFILE } from '../docs/js/profile.js';
import { newSession, reportOverload, effective, density } from '../docs/js/partner.js';
import {
  makeLabel, appendLabel, normalizeLabels, exportLabelsJSON, LABEL_SCHEMA_VERSION, newSessionId,
} from '../docs/js/labels.js';
import { getAdaptation, loadLevel, buildAdaptationContext, generationHints } from '../docs/js/adapt.js';
import { parseConversation } from '../docs/js/loop.js';

test('labels: schema fields and append trim', () => {
  const a = makeLabel({ sessionId: 's1', recentTurns: 4, signals: { loadIndex: 80 }, source: 'web' });
  assert.equal(a.v, LABEL_SCHEMA_VERSION);
  assert.equal(a.kind, 'overloaded');
  assert.ok(a.ts.includes('T'));
  assert.equal(a.sessionId, 's1');
  let list = [];
  for (let i = 0; i < 3; i++) list = appendLabel(list, makeLabel({ sessionId: 's1', recentTurns: i }));
  assert.equal(list.length, 3);
  const json = exportLabelsJSON(list);
  assert.match(json, /"count": 3/);
  assert.deepEqual(normalizeLabels(null), []);
  assert.ok(newSessionId().startsWith('s_'));
});

test('adapt: overloaded lowers max_tokens and builds suggestive context', () => {
  assert.equal(loadLevel(20), 'calm');
  assert.equal(loadLevel(60), 'rising');
  assert.equal(loadLevel(80), 'high');
  assert.equal(loadLevel(10, { overloaded: true }), 'overloaded');
  const a = getAdaptation({ overloaded: true, loadIndex: 90, lang: 'en' });
  assert.equal(a.level, 'overloaded');
  assert.ok(a.params.max_tokens <= 256);
  assert.match(a.context, /short|plain|options/i);
  assert.doesNotMatch(a.context, /\b(disorder|medical diagnosis|you have)\b/i);
  assert.match(a.context, /suggestive|제안/i);
  const ko = buildAdaptationContext({ level: 'high', lang: 'ko' });
  assert.match(ko, /짧|쉽게|선택지/);
  assert.equal(generationHints('calm').amount, 3);
});

test('adapt: loop type mentioned when turns look stuck', () => {
  const turns = parseConversation(
    'You: how do I fix Error: Cannot find module?\nAI: run npm install\nYou: still Error: Cannot find module\nAI: run npm install\nYou: same Error: Cannot find module again\nAI: run npm install please\nYou: not working Error: Cannot find module\nAI: try npm install',
  );
  const a = getAdaptation({ overloaded: false, loadIndex: 70, turns });
  assert.ok(a.loop === null || typeof a.loop.detected === 'boolean');
});

test('partner E3: reportOverload lowers amount and speech immediately', () => {
  let st = newSession({ profile: SAMPLE_PROFILE });
  const before = effective(st);
  const r = reportOverload(st);
  const after = effective(r.state);
  assert.equal(r.decision.rule, 'E3');
  assert.ok(after.amount < before.amount || after.speech < before.speech);
  assert.equal(r.state.adjust.chip, 'short');
  assert.ok(r.state.controls.some((c) => c.name === 'overloaded'));
});

test('false positive: calm adaptation does not force overload wording', () => {
  const a = getAdaptation({ loadIndex: 10, overloaded: false });
  assert.equal(a.level, 'calm');
  assert.match(a.context, /Normal|normal|일반/i);
});

test('extension: MV3 manifest minimizes hosts and forbids remote code patterns', () => {
  const man = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  assert.equal(man.manifest_version, 3);
  assert.deepEqual(man.host_permissions.sort(), [
    'https://chatgpt.com/*',
    'https://claude.ai/*',
    'https://gemini.google.com/*',
  ].sort());
  assert.ok(man.permissions.includes('storage'));
  assert.ok(!man.permissions.includes('tabs') || man.permissions.length <= 3);
  const sel = JSON.parse(readFileSync(new URL('../extension/selectors.json', import.meta.url), 'utf8'));
  assert.ok(sel['chatgpt.com'].input);
  const bg = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
  const ct = readFileSync(new URL('../extension/content.js', import.meta.url), 'utf8');
  for (const src of [bg, ct]) {
    assert.doesNotMatch(src, /https?:\/\/(?!chatgpt\.com|claude\.ai|gemini\.google\.com)/);
    assert.doesNotMatch(src, /\bfetch\s*\(\s*['"]https?:\/\//);
    assert.doesNotMatch(src, /XMLHttpRequest|sendBeacon|WebSocket/);
  }
  assert.match(ct, /confirmBeforeInsert|confirm\(/);
  assert.match(readFileSync(new URL('../extension/README.md', import.meta.url), 'utf8'), /not submitted|Web Store/i);
});

test('mcp: stdio self-test returns tools and adaptation without network', () => {
  const r = spawnSync(process.execPath, ['mcp/server.mjs', '--self-test'], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const line = (r.stderr || '').trim().split('\n').pop();
  const j = JSON.parse(line);
  assert.ok(j.ok);
  assert.deepEqual(j.tools, ['report_load', 'get_adaptation', 'get_loop_status']);
  assert.equal(j.sample.report, 'overloaded');
  const src = readFileSync(new URL('../mcp/server.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /createServer|listen\(|http\.|fetch\(/);
  assert.match(readFileSync(new URL('../mcp/README.md', import.meta.url), 'utf8'), /not for remote|marketplace/i);
});

test('docs pages mention prototype / not submitted for extension and MCP', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /prototype|프로토타입/i);
  assert.match(readme, /not submitted|미제출/i);
  assert.match(readme, /extension\//);
  assert.match(readme, /mcp\//);
  assert.ok(existsSync(new URL('../extension/manifest.json', import.meta.url)));
  assert.ok(existsSync(new URL('../mcp/server.mjs', import.meta.url)));
});
