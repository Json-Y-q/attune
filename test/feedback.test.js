import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { SAMPLE_PROFILE } from '../docs/js/profile.js';
import { newSession, reportLoad, reportOverload, effective } from '../docs/js/partner.js';
import {
  makeLabel, appendLabel, exportLabelsJSON, LABEL_SCHEMA_VERSION, newSessionId,
  poseForLevel, LOAD_LEVELS,
} from '../docs/js/labels.js';
import { getAdaptation } from '../docs/js/adapt.js';
import { PREVIEW, paintPreview } from '../docs/js/loadui.js';

test('labels: mascot source + level field', () => {
  const a = makeLabel({ sessionId: 's1', level: 'rising', source: 'mascot', recentTurns: 2 });
  assert.equal(a.v, LABEL_SCHEMA_VERSION);
  assert.equal(a.source, 'mascot');
  assert.equal(a.level, 'rising');
  assert.equal(a.signals.level, 'rising');
  assert.ok(LOAD_LEVELS.includes('overloaded'));
  assert.equal(poseForLevel('overloaded').zone, 'high');
  assert.equal(poseForLevel('calm').face, 'calm');
});

test('reportLoad levels change density; calm restores', () => {
  let st = newSession({ profile: SAMPLE_PROFILE });
  const base = effective(st).amount;
  st = reportLoad(st, 'rising').state;
  assert.ok(effective(st).amount <= base);
  assert.equal(st.adjust.chip, 'lighter');
  st = reportLoad(st, 'overloaded').state;
  assert.ok(effective(st).amount <= 3);
  assert.equal(st.adjust.chip, 'short');
  st = reportLoad(st, 'calm').state;
  assert.equal(st.adjust.chip, null);
  assert.equal(reportOverload(newSession({ profile: SAMPLE_PROFILE })).decision.rule, 'E3');
});

test('preview map: Long/Normal/Short lines without applying', () => {
  assert.equal(PREVIEW.calm.lines, 5);
  assert.equal(PREVIEW.rising.lines, 3);
  assert.equal(PREVIEW.overloaded.lines, 1);
  // paintPreview is DOM-only; ensure pure map stays stable for hover-only UX
  assert.match(PREVIEW.overloaded.key, /short/);
});

test('loadui: no overload button id required; mascot host API present', () => {
  const js = readFileSync(new URL('../docs/js/loadui.js', import.meta.url), 'utf8');
  assert.match(js, /mountMascotLoad/);
  assert.match(js, /role:\s*'button'|setAttribute\('role', 'button'\)/);
  assert.match(js, /paintPreview|ld-preview/);
  assert.match(js, /mouseenter/);
  assert.doesNotMatch(js, /ld-overload/);
  const html = readFileSync(new URL('../docs/conversation.html', import.meta.url), 'utf8');
  assert.match(html, /ld-mascot-host/);
  assert.doesNotMatch(html, /id="ld-overload"/);
});

test('landing flow is consolidated (no duplicate 5-card+webp pair)', () => {
  const html = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
  assert.match(html, /fb-live-host/);
  assert.match(html, /fb_s1_t/);
  assert.doesNotMatch(html, /feedback-loop\.webp/);
  assert.ok((html.match(/data-fb-step=/g) || []).length <= 4);
});

test('extension: instant apply default, chip undo, no confirm required', () => {
  const bg = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
  const ct = readFileSync(new URL('../extension/content.js', import.meta.url), 'utf8');
  assert.match(bg, /instantApply:\s*true/);
  assert.match(bg, /pendingPrefix/);
  assert.match(ct, /attune-undo|Undo/);
  assert.match(ct, /record_load/);
  assert.doesNotMatch(ct, /\bconfirm\s*\(/);
});

test('mcp report_load returns adaptation in one call', () => {
  const r = spawnSync(process.execPath, ['mcp/server.mjs', '--self-test'], {
    cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const j = JSON.parse((r.stderr || '').trim().split('\n').pop());
  assert.ok(j.ok);
  assert.equal(j.sample.hasAdaptation, true);
});

test('getAdaptation still pure / no network helpers in labels', () => {
  const a = getAdaptation({ overloaded: true, loadIndex: 90 });
  assert.ok(a.params.max_tokens <= 256);
  const src = readFileSync(new URL('../docs/js/labels.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest/);
});
