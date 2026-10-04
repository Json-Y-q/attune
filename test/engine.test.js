import test from 'node:test';
import assert from 'node:assert/strict';
import { THRESHOLDS, computeSettings, hrvDeviation } from '../docs/js/engine.js';
import { SAMPLE_PROFILE } from '../docs/js/profile.js';

const P = (levels = {}, baseline = {}) => ({
  ...SAMPLE_PROFILE,
  levels: { amount: 4, pace: 4, style: 'summary', ...levels },
  baseline: { capacityScore: 60, fatigueLimitMin: 40, hrvMs: 60, ...baseline },
});

test('no condition: settings equal the profile levels', () => {
  const s = computeSettings(P());
  assert.equal(s.amount, 4);
  assert.equal(s.pace, 4);
  assert.equal(s.style, 'summary');
  assert.equal(s.step, 0);
  assert.equal(s.breakAdvice, 'none');
  assert.equal(s.loadIndex, null);
  assert.deepEqual(s.reasons, []);
});

test('hrvDeviation is relative to baseline', () => {
  assert.equal(hrvDeviation(30, 60), -0.5);
  assert.ok(Math.abs(hrvDeviation(66, 60) - 0.1) < 1e-9);
});

test('HRV within normal range / small dip: unchanged', () => {
  assert.equal(computeSettings(P(), { hrvMs: 60 }).step, 0);
  assert.equal(computeSettings(P(), { hrvMs: 50 }).step, 0); // -16.7%
});

test('HRV >= 20% below baseline lowers output by exactly one level (amount, pace, style)', () => {
  const s = computeSettings(P(), { hrvMs: 48 }); // -20%
  assert.equal(s.step, 1);
  assert.equal(s.amount, 3);
  assert.equal(s.pace, 3);
  assert.equal(s.style, 'bullets'); // summary -> bullets
  assert.deepEqual(s.reasons, ['hrv_drop_1']);
});

test('HRV >= 40% below baseline lowers two levels, floors at 1 / chunks', () => {
  const s = computeSettings(P({ amount: 2, pace: 1, style: 'bullets' }), { hrvMs: 30 });
  assert.equal(s.step, 2);
  assert.equal(s.amount, 1);
  assert.equal(s.pace, 1);
  assert.equal(s.style, 'chunks');
});

test('HRV above baseline never raises the level', () => {
  const s = computeSettings(P(), { hrvMs: 90 });
  assert.equal(s.amount, 4);
  assert.ok(s.hrvDeviation > 0);
});

test('condition baseline overrides profile baseline; default used when none', () => {
  assert.equal(computeSettings(P(), { hrvMs: 40, baselineHrvMs: 40 }).step, 0);
  const noBase = P({}, { hrvMs: null });
  assert.equal(computeSettings(noBase, { hrvMs: 38 }).step, 1); // default 50 ms -> -24%
});

test('load threshold triggers break advice; "now" forces lite mode', () => {
  const soon = computeSettings(P(), { hrvMs: 60, sessionMinutes: 24 }); // 36
  assert.equal(soon.breakAdvice, 'none');
  const s2 = computeSettings(P(), { hrvMs: 60, sessionMinutes: 36 }); // 54
  assert.equal(s2.breakAdvice, 'soon');
  assert.equal(s2.amount, 4);
  const now = computeSettings(P(), { hrvMs: 36, sessionMinutes: 60 }); // 60 (time) + 40 (HRV -40%) = 100
  assert.equal(now.breakAdvice, 'now');
  assert.equal(now.amount, 1);
  assert.ok(now.reasons.includes('break_now_lite'));
  assert.ok(now.loadIndex >= THRESHOLDS.breakNow);
});

test('session time alone caps at soon, never now', () => {
  // time load maxes at 60 (< 75): time alone gives "soon", never "now"
  const s = computeSettings(P(), { sessionMinutes: 500 });
  assert.equal(s.loadIndex, 60);
  assert.equal(s.breakAdvice, 'soon');
});

test('delivery follows pace', () => {
  assert.equal(computeSettings(P({ pace: 1 })).delivery, 'step');
  assert.equal(computeSettings(P({ pace: 3 })).delivery, 'stream');
  assert.equal(computeSettings(P({ pace: 5 })).delivery, 'instant');
});

test('invalid inputs: bad profile throws; bad condition values are ignored', () => {
  assert.throws(() => computeSettings({}), TypeError);
  const s = computeSettings(P(), { hrvMs: -5, sessionMinutes: NaN, baselineHrvMs: 'x' });
  assert.equal(s.step, 0);
  assert.equal(s.loadIndex, null);
});

test('computeSettings does not mutate its inputs', () => {
  const p = P();
  const c = { hrvMs: 30, sessionMinutes: 90 };
  const before = JSON.stringify([p, c]);
  computeSettings(p, c);
  assert.equal(JSON.stringify([p, c]), before);
});
