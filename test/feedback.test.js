// Mascot load input, hover preview, labels, extension instant-attach, MCP report_load bundle. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { SAMPLE_PROFILE } from '../docs/js/profile.js';
import { newSession, reportLoad, effective, userTurn } from '../docs/js/partner.js';
import {
  makeLabel, appendLabel, exportLabelsJSON, LABEL_SCHEMA_VERSION, newSessionId,
  poseForLevel, LOAD_LEVELS, deltasForLevel,
} from '../docs/js/labels.js';
import { getAdaptation } from '../docs/js/adapt.js';
import { PREVIEW } from '../docs/js/loadui.js';
import { STRINGS } from '../docs/js/i18n.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('labels: source=mascot and level field on schema', () => {
  const a = makeLabel({ sessionId: 's1', level: 'rising', source: 'mascot', recentTurns: 2 });
  assert.equal(a.v, LABEL_SCHEMA_VERSION);
  assert.equal(a.source, 'mascot');
  assert.equal(a.level, 'rising');
  assert.equal(a.signals.level, 'rising');
  assert.deepEqual([...LOAD_LEVELS], ['calm', 'rising', 'overloaded']);
  assert.equal(poseForLevel('overloaded').zone, 'high');
  assert.equal(poseForLevel('rising').face, 'tense');
  assert.equal(poseForLevel('calm').puff, 1);
});

test('reportLoad: three faces change reply mode at once, density steps one level per turn; calm restores softly', () => {
  let st = newSession({ profile: SAMPLE_PROFILE });
  const baseAmt = effective(st).amount;
  const baseSpeech = effective(st).speech;
  const r1 = reportLoad(st, 'rising');
  st = r1.state;
  assert.equal(r1.decision.rule, 'E3');
  assert.ok(effective(st).amount <= baseAmt);
  assert.equal(st.adjust.chip, 'lighter');
  const r2 = reportLoad(st, 'overloaded');
  st = r2.state;
  assert.ok(effective(st).amount < baseAmt || effective(st).speech < baseSpeech);
  assert.equal(st.adjust.chip, 'short');
  assert.equal(st.adjust.amountDelta, -2, 'rising (-1) → overloaded: one more level now');
  assert.equal(st.adjust.paceDelta, -1, 'pace: first step only (soft)');
  st = userTurn(st, { text: 'ok, go on', gapSec: 20 }).state;
  assert.equal(st.adjust.paceDelta, -2, 'second pace step on the next turn');
  // From calm straight to overloaded: density also moves one level per turn.
  let s2 = reportLoad(newSession({ profile: SAMPLE_PROFILE }), 'overloaded').state;
  assert.equal(s2.adjust.amountDelta, -1);
  s2 = userTurn(s2, { text: 'next', gapSec: 20 }).state;
  assert.equal(s2.adjust.amountDelta, -2);
  st = reportLoad(st, 'calm').state;
  assert.equal(st.adjust.chip, null);
  assert.equal(st.adjust.amountDelta, -1, 'calm also eases back one level at a time');
  st = userTurn(st, { text: 'thanks', gapSec: 20 }).state;
  assert.equal(st.adjust.amountDelta, 0);
  assert.equal(st.adjust.paceDelta, 0);
  assert.equal(st.target, null);
});

test('hover preview map: Long/Normal/Short line counts; preview helpers do not mutate session', () => {
  assert.equal(PREVIEW.calm.lines, 5);
  assert.equal(PREVIEW.rising.lines, 3);
  assert.equal(PREVIEW.overloaded.lines, 1);
  assert.equal(PREVIEW.calm.key, 'ld_prev_long');
  assert.equal(PREVIEW.rising.key, 'ld_prev_normal');
  assert.equal(PREVIEW.overloaded.key, 'ld_prev_short');
  // showPreview/paintPreview must not write labels or call reportLoad; applyLevel alone mutates
  const js = read('../docs/js/loadui.js');
  const showStart = js.indexOf('function showPreview');
  const showEnd = js.indexOf('function hidePreview', showStart);
  const showBody = js.slice(showStart, showEnd);
  assert.match(showBody, /paintPreview/);
  assert.doesNotMatch(showBody, /reportLoad|makeLabel|writeLabels|setSession/);
  assert.match(js, /mouseenter[\s\S]{0,80}showPreview/);
  assert.match(js, /function applyLevel[\s\S]*reportLoad[\s\S]*makeLabel/);
  // applying is click/keydown on faces — not hover
  assert.match(js, /opt\.addEventListener\('click', \(\) => applyLevel/);
});

test('loadui: 3-face picker, a11y button, no legacy overload button', () => {
  const js = read('../docs/js/loadui.js');
  assert.match(js, /mountMascotLoad/);
  assert.match(js, /LOAD_LEVELS\.map|ld-face-/);
  assert.match(js, /setAttribute\('role', 'button'\)/);
  assert.match(js, /aria-label/);
  assert.match(js, /keydown/);
  assert.match(js, /Enter|Space|ArrowRight/);
  assert.doesNotMatch(js, /ld-overload|I'm overloaded|mountLoadButton/);
  const html = read('../docs/conversation.html');
  assert.match(html, /ld-mascot-host/);
  assert.doesNotMatch(html, /id="ld-overload"|ld_btn/);
  const conv = read('../docs/js/conversation.js');
  assert.match(conv, /mountMascotLoad/);
  assert.match(conv, /onChange:[\s\S]*produceReply/); // immediate regen
});

test('deltasForLevel matches partner chips for each face', () => {
  assert.equal(deltasForLevel('overloaded').chip, 'short');
  assert.equal(deltasForLevel('rising').chip, 'lighter');
  assert.equal(deltasForLevel('calm').chip, null);
});

test('landing: consolidated flow + live mascot host; no webp duplicate', () => {
  const html = read('../docs/index.html');
  assert.match(html, /fb-live-host/);
  assert.match(html, /fb_s1_t/);
  assert.doesNotMatch(html, /feedback-loop\.webp|fb_s5_/);
  assert.ok((html.match(/data-fb-step=/g) || []).length === 4);
  const land = read('../docs/js/landing.js');
  assert.match(land, /mountMascotLoad/);
  assert.match(land, /renderLiveAnswer|typeLive/);
});

test('extension: instant apply default ON, chip Undo, no confirm, no auto-send', () => {
  const bg = read('../extension/background.js');
  const ct = read('../extension/content.js');
  const lib = read('../extension/lib/labels.js');
  assert.match(bg, /instantApply:\s*true/);
  assert.match(bg, /pendingPrefix/);
  assert.match(bg, /clear_pending/);
  assert.match(ct, /tempoloon-undo|Undo/);
  assert.match(ct, /record_load/);
  assert.doesNotMatch(ct, /\bconfirm\s*\(/);
  assert.doesNotMatch(ct, /\.click\(\)|requestSubmit|form\.submit|dispatchEvent\([^\)]*submit/);
  assert.match(lib, /prefixForLevel|rewritePrompt/);
  // empty composer fills rewrite text but still does not send
  assert.match(ct, /rewrite your last answer|Please rewrite/);
  assert.match(ct, /insertAtStart/); // one-line insert at the start of the composer (0.3.1), never a send
});

test('extension prefixForLevel: overloaded/rising nonempty, calm empty', async () => {
  const { prefixForLevel } = await import('../extension/lib/labels.js');
  assert.equal(prefixForLevel('calm'), '');
  assert.ok(prefixForLevel('rising').length > 20);
  assert.ok(prefixForLevel('overloaded').length > 20);
  assert.match(prefixForLevel('overloaded'), /short|cognitive load/i);
});

test('mcp report_load returns label + systemContext + params in one call', () => {
  const r = spawnSync(process.execPath, ['mcp/server.mjs', '--self-test'], {
    cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const j = JSON.parse((r.stderr || '').trim().split('\n').pop());
  assert.ok(j.ok);
  assert.equal(j.sample.hasAdaptation, true);
  // live invoke report_load via stdin JSON-RPC
  const proc = spawnSync(process.execPath, ['mcp/server.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
    input: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'report_load', arguments: { level: 'overloaded', recentTurns: 2, verbose: true } } }) + '\n',
    timeout: 5000,
  });
  assert.equal(proc.status, 0, proc.stderr);
  const line = proc.stdout.trim().split('\n').find((l) => l.includes('systemContext'));
  assert.ok(line, proc.stdout);
  const body = JSON.parse(line);
  const payload = JSON.parse(body.result.content[0].text);
  assert.equal(payload.label.level, 'overloaded');
  assert.ok(payload.systemContext.length > 10);
  assert.equal(payload.params.structure, 'summary_then_details');
  assert.equal(payload.params.summary_sentences, 1);
  assert.equal(payload.params.keep_full_details, true);
  assert.ok(payload.adaptation);
});

test('dead overload-button i18n keys removed; mascot keys present EN/KO', () => {
  assert.equal('ld_btn' in STRINGS.en, false);
  assert.equal('ld_btn' in STRINGS.ko, false);
  assert.equal('fb_s5_t' in STRINGS.en, false);
  for (const k of ['ld_mascot_label', 'ld_prev_long', 'ld_prev_normal', 'ld_prev_short', 'ld_lv_calm', 'ld_lv_rising', 'ld_lv_overloaded', 'fb_why']) {
    assert.equal(typeof STRINGS.en[k], 'string', k);
    assert.equal(typeof STRINGS.ko[k], 'string', k);
  }
  const enKeys = Object.keys(STRINGS.en).sort();
  assert.deepEqual(Object.keys(STRINGS.ko).sort(), enKeys);
});

test('no network in mascot load stack modules', () => {
  for (const f of ['labels', 'loadui', 'adapt', 'partner']) {
    const src = read(`../docs/js/${f}.js`);
    assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/, f);
  }
});
