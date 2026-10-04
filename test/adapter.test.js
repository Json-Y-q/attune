import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, parseAdapterText, rewrite } from '../docs/js/adapter.js';
import { EN_ANSWER } from './samples.js';

const settings = { amount: 2, pace: 2, style: 'bullets' };

test('no adapter -> rule-based result, no error', async () => {
  const r = await rewrite(EN_ANSWER, settings);
  assert.equal(r.source, 'rules');
  assert.equal(r.error, undefined);
  assert.ok(r.blocks.length > 0);
});

test('working adapter is used and receives prompt + settings', async () => {
  let seen;
  const adapter = { name: 'mock', rewrite: async (req) => { seen = req; return '- one\n- two\n\nplain line'; } };
  const r = await rewrite(EN_ANSWER, settings, adapter);
  assert.equal(r.source, 'mock');
  assert.deepEqual(r.blocks.map((b) => b.type), ['li', 'li', 'p']);
  assert.equal(seen.settings, settings);
  assert.match(seen.systemPrompt, /bullet/);
});

test('adapter failure, timeout, empty output, bad shape -> fallback to rules', async () => {
  const bad = [
    { rewrite: async () => { throw new Error('boom'); } },
    { rewrite: () => new Promise(() => {}) },
    { rewrite: async () => '   ' },
    { rewrite: async () => 42 },
    {},
  ];
  for (const adapter of bad) {
    const r = await rewrite(EN_ANSWER, settings, adapter, { timeoutMs: 20 });
    assert.equal(r.source, 'rules');
    assert.ok(typeof r.error === 'string');
    assert.ok(r.blocks.length > 0);
  }
});

test('system prompt reflects settings and carries no profile/biometric data', () => {
  const p = buildSystemPrompt({ amount: 1, pace: 1, style: 'chunks' });
  assert.match(p, /2-3 sentences/);
  assert.match(p, /simple words/);
  assert.doesNotMatch(p, /hrv|profile/i);
});

test('parseAdapterText handles bullet markers', () => {
  assert.deepEqual(parseAdapterText('* a\n• b\nc'), [
    { type: 'li', text: 'a' }, { type: 'li', text: 'b' }, { type: 'p', text: 'c' },
  ]);
});
