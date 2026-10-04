import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences, selectKeySentences, transform, toPlainText, AMOUNT } from '../docs/js/transform.js';
import { EN_ANSWER, KO_ANSWER } from './samples.js';

test('splitSentences: EN, KO, decimals and abbreviations', () => {
  assert.equal(splitSentences(EN_ANSWER).length, 11);
  assert.equal(splitSentences(KO_ANSWER).length, 12);
  assert.deepEqual(splitSentences('Pi is 3.14 today. Use e.g. this one.'), ['Pi is 3.14 today.', 'Use e.g. this one.']);
  assert.deepEqual(splitSentences('これは。それは。'), ['これは。', 'それは。']);
  assert.deepEqual(splitSentences('  \n '), []);
});

test('selectKeySentences keeps first, preserves order, honours count', () => {
  const s = splitSentences(EN_ANSWER);
  const idx = selectKeySentences(s, 4);
  assert.equal(idx.length, 4);
  assert.equal(idx[0], 0);
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
  assert.equal(selectKeySentences(s, 99).length, s.length);
});

test('amount levels are monotonic in output size', () => {
  for (const text of [EN_ANSWER, KO_ANSWER]) {
    const words = [1, 2, 3, 4, 5].map((amount) => transform(text, { amount, style: 'prose' }).stats.outputWords);
    for (let i = 1; i < words.length; i++) assert.ok(words[i] >= words[i - 1], words.join());
    assert.ok(words[0] < words[4] / 2);
  }
});

test('level 5 + prose keeps every sentence', () => {
  const r = transform(EN_ANSWER, { amount: 5, style: 'prose' });
  assert.equal(r.stats.keptSentences, r.stats.inputSentences);
  assert.equal(r.stats.outputWords, r.stats.inputWords);
});

test('level 1 is at most 3 sentences and starts with the first sentence', () => {
  const r = transform(EN_ANSWER, { amount: 1, style: 'bullets' });
  assert.ok(r.stats.keptSentences <= AMOUNT[1].max);
  assert.ok(r.blocks[0].text.startsWith('Sleep affects memory'));
});

test('styles produce the expected block types', () => {
  const t = (style, amount = 3) => transform(EN_ANSWER, { amount, style }).blocks;
  assert.ok(t('bullets').every((b) => b.type === 'li'));
  assert.equal(t('summary')[0].type, 'tldr');
  assert.ok(t('summary').slice(1).every((b) => b.type === 'p'));
  const chunks = t('chunks');
  assert.ok(chunks.every((b) => b.type === 'chunk' && b.total === chunks.length));
  assert.deepEqual(chunks.map((b) => b.index), chunks.map((_, i) => i + 1));
  assert.ok(t('prose').every((b) => b.type === 'p'));
});

test('chunks: one sentence per chunk below level 4', () => {
  const r = transform(EN_ANSWER, { amount: 3, style: 'chunks' });
  assert.equal(r.blocks.length, r.stats.keptSentences);
});

test('long sentences are soft-split in bullet mode', () => {
  const long = 'First part of a long idea that goes on and on for quite a while; second part continues with even more words to pass the limit of one hundred and forty characters easily.';
  const r = transform(long, { amount: 5, style: 'bullets' });
  assert.equal(r.blocks.length, 2);
});

test('empty and single-sentence input do not crash', () => {
  assert.deepEqual(transform('', { amount: 3, style: 'summary' }).blocks, []);
  assert.equal(transform('Just one.', { amount: 1, style: 'chunks' }).blocks.length, 1);
});

test('unknown amount falls back to level 3', () => {
  const a = transform(EN_ANSWER, { amount: 99, style: 'prose' }).stats;
  const b = transform(EN_ANSWER, { amount: 3, style: 'prose' }).stats;
  assert.deepEqual(a, b);
});

test('toPlainText renders labels', () => {
  const txt = toPlainText(transform(EN_ANSWER, { amount: 1, style: 'summary' }).blocks);
  assert.match(txt, /^TL;DR: Sleep affects memory/);
  assert.match(toPlainText(transform(EN_ANSWER, { amount: 2, style: 'bullets' }).blocks), /^- /);
  assert.match(toPlainText(transform(EN_ANSWER, { amount: 2, style: 'chunks' }).blocks), /^\[1\/\d+\]/);
});
