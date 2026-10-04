import test from 'node:test';
import assert from 'node:assert/strict';
import { DigitSpanSession, buildProfile, levelFromScore, scoreDigitSpan, summarizeReaction, validateProfile } from '../docs/js/profile.js';

const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('levelFromScore maps 0-100 onto 1-5', () => {
  assert.deepEqual([0, 12, 13, 50, 87, 88, 100].map(levelFromScore), [1, 1, 2, 3, 4, 5, 5]);
});

test('scoreDigitSpan bounds', () => {
  assert.equal(scoreDigitSpan(0), 0);
  assert.equal(scoreDigitSpan(3), 0);
  assert.equal(scoreDigitSpan(6), 50);
  assert.equal(scoreDigitSpan(12), 100);
});

test('digit span: climbs on success, stops after two misses at one length', () => {
  const s = new DigitSpanSession({ rng: seq([0.11, 0.35, 0.72]) });
  assert.equal(s.sequence.length, 3);
  assert.equal(s.answer(s.sequence).correct, true);
  assert.equal(s.sequence.length, 4);
  assert.equal(s.answer(s.sequence).correct, true);
  assert.equal(s.sequence.length, 5);
  assert.equal(s.answer('0').done, false); // 1st miss
  assert.equal(s.sequence.length, 5);
  assert.equal(s.answer('0').done, true); // 2nd miss
  assert.deepEqual(s.result(), { maxSpan: 4, trials: 4 });
  assert.throws(() => s.answer('1'));
});

test('digit span: no repeated adjacent digits; ignores non-digit input', () => {
  const s = new DigitSpanSession({ rng: () => 0.5 }); // would be 555 without the guard
  assert.ok(!/(\d)\1/.test(s.sequence));
  assert.equal(s.answer(s.sequence.split('').join(' ')).correct, true);
});

test('digit span: ends at max length', () => {
  const s = new DigitSpanSession({ start: 8, max: 9 });
  s.answer(s.sequence);
  assert.equal(s.answer(s.sequence).done, true);
  assert.equal(s.result().maxSpan, 9);
});

test('summarizeReaction: fast steady vs slow lapsing', () => {
  const fast = summarizeReaction(Array(12).fill(260));
  assert.equal(fast.lapses, 0);
  assert.ok(fast.score >= 95);
  const slow = summarizeReaction([400, 420, 450, 500, 600, 700, 650, 720, 800, 900, 750, 820]);
  assert.ok(slow.lapses >= 6);
  assert.ok(slow.driftPct > 0);
  assert.ok(slow.score < 20);
  assert.throws(() => summarizeReaction([300, 300]), RangeError);
});

const raw = (over = {}) => ({
  digitSpan: { maxSpan: 6, trials: 6 },
  reaction: Array(12).fill(300),
  reading: { volume: 3, structure: 'bullets', pace: 3 },
  ...over,
});

test('buildProfile produces a valid profile with levels and baseline', () => {
  const p = buildProfile(raw(), { now: new Date('2026-01-02T00:00:00Z') });
  assert.equal(p.createdAt, '2026-01-02T00:00:00.000Z');
  assert.equal(p.levels.style, 'bullets');
  assert.ok(p.levels.amount >= 1 && p.levels.amount <= 5);
  assert.ok(p.baseline.fatigueLimitMin >= 20 && p.baseline.fatigueLimitMin <= 60);
  assert.equal(p.baseline.hrvMs, null);
  assert.deepEqual(validateProfile(p), { ok: true, errors: [] });
  assert.match(p.notice, /Not a medical device/);
});

test('buildProfile: stated preference shifts levels', () => {
  const lo = buildProfile(raw({ reading: { volume: 1, structure: 'chunks', pace: 1 } }));
  const hi = buildProfile(raw({ reading: { volume: 5, structure: 'prose', pace: 5 } }));
  assert.ok(hi.levels.amount > lo.levels.amount);
  assert.ok(hi.levels.pace > lo.levels.pace);
});

test('buildProfile rejects bad choices; validateProfile rejects junk', () => {
  assert.throws(() => buildProfile(raw({ reading: { volume: 2, structure: 'bullets', pace: 3 } })), RangeError);
  assert.throws(() => buildProfile(raw({ reading: { volume: 3, structure: 'poem', pace: 3 } })), RangeError);
  assert.equal(validateProfile(null).ok, false);
  assert.equal(validateProfile({ version: 1, levels: { amount: 9 } }).ok, false);
});
