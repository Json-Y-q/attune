// Auto-suggestion policy, soft transition, work rhythm, phrase rule, Grok support, MCP HTTP transport. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  newSuggestState, canSuggest, markShown, recordOutcome, resetSuggest, setEnabled, setDailyMax,
  normalizeSuggest, suggestTrigger, suggestKey, DAY_MS, DAILY_MAX_DEFAULT,
} from '../docs/js/suggest.js';
import { softView, stepToward, summarySentences } from '../docs/js/soften.js';
import { splitSentences } from '../docs/js/transform.js';
import { aggregateRhythm, MIN_EVENTS, sessionBin } from '../docs/js/rhythm.js';
import { isDiagnostic, DIAGNOSTIC_PATTERNS, ACTION_EXAMPLES } from '../docs/js/phrases.js';
import { makeLabel } from '../docs/js/labels.js';
import { buildAdaptationContext, getAdaptation, suggestionFor } from '../docs/js/adapt.js';
import { STRINGS } from '../docs/js/i18n.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const T0 = new Date(2026, 9, 5, 10, 0).getTime(); // local Mon 10:00

test('suggest: daily cap default 3, settable to 2, resets next day', () => {
  let st = newSuggestState();
  assert.equal(st.dailyMax, DAILY_MAX_DEFAULT);
  assert.equal(DAILY_MAX_DEFAULT, 3);
  for (let i = 0; i < 3; i++) { assert.equal(canSuggest(st, T0 + i).ok, true); st = markShown(st, T0 + i); }
  assert.deepEqual([canSuggest(st, T0 + 10).ok, canSuggest(st, T0 + 10).reason], [false, 'cap']);
  assert.equal(canSuggest(st, T0 + DAY_MS).ok, true, 'new local day resets the count');
  let two = setDailyMax(newSuggestState(), 2);
  two = markShown(markShown(two, T0), T0);
  assert.equal(canSuggest(two, T0).reason, 'cap');
  assert.equal(setDailyMax(newSuggestState(), 9).dailyMax <= 3, true, 'cap stays within 2–3');
});

test('suggest: backoff 1 / 3 / 7 days on consecutive reject or ignore; accept relaxes', () => {
  let st = recordOutcome(newSuggestState(), 'ignore', T0);
  assert.equal(st.declineStreak, 1);
  assert.equal(st.silentUntil, T0 + 1 * DAY_MS);
  assert.equal(canSuggest(st, T0 + DAY_MS - 1).reason, 'backoff');
  assert.equal(canSuggest(st, T0 + DAY_MS + 1).ok, true);
  st = recordOutcome(st, 'reject', T0 + DAY_MS + 1);
  assert.equal(st.silentUntil, T0 + DAY_MS + 1 + 3 * DAY_MS);
  st = recordOutcome(st, 'ignore', T0 + 5 * DAY_MS);
  assert.equal(st.silentUntil, T0 + 5 * DAY_MS + 7 * DAY_MS);
  st = recordOutcome(st, 'reject', T0 + 13 * DAY_MS);
  assert.equal(st.silentUntil, T0 + 13 * DAY_MS + 7 * DAY_MS, 'stays at 7 days max');
  const acc = recordOutcome(st, 'accept', T0 + 14 * DAY_MS);
  assert.equal(acc.declineStreak, 2, 'accept steps the streak down');
  assert.equal(acc.silentUntil, 0, 'accept lifts the quiet time');
  assert.equal(canSuggest(acc, T0 + 14 * DAY_MS).ok, true);
  assert.equal(recordOutcome(acc, 'reject', T0 + 15 * DAY_MS).silentUntil, T0 + 15 * DAY_MS + 7 * DAY_MS);
});

test('suggest: off and reset learning; storage repair; trigger + action keys', () => {
  const off = setEnabled(newSuggestState(), false);
  assert.equal(canSuggest(off, T0).reason, 'off');
  const learned = recordOutcome(recordOutcome(setDailyMax(off, 2), 'reject', T0), 'reject', T0);
  const r = resetSuggest(learned);
  assert.deepEqual([r.declineStreak, r.silentUntil, r.history.length, r.enabled, r.dailyMax], [0, 0, 0, false, 2]);
  assert.deepEqual(normalizeSuggest('junk'), newSuggestState());
  assert.equal(normalizeSuggest({ declineStreak: 99 }).declineStreak, 3);
  assert.equal(suggestTrigger({ loop: { detected: true } }), 'loop');
  assert.equal(suggestTrigger({ decision: { level: 2, reasons: ['B3'] } }), 'signals');
  assert.equal(suggestTrigger({ loadIndex: 60 }), 'load');
  assert.equal(suggestTrigger({ loadIndex: 10, decision: { level: 1, reasons: [] } }), null);
  assert.equal(suggestKey('loop'), 'sg_loop');
  assert.equal(suggestKey('load'), 'sg_short');
});

test('suggest policy is shared verbatim with the extension', () => {
  assert.equal(read('../extension/lib/suggest.js'), read('../docs/js/suggest.js'));
});

test('soft transition: summary + folded full text is lossless; one step per turn', () => {
  for (const lang of ['en', 'ko']) {
    for (const k of ['cv_ai_1', 'cv_ai_2', 'cv_ai_3', 'sample_answer']) {
      const original = STRINGS[lang][k];
      for (const n of [1, 2]) {
        const v = softView(original, { sentences: n });
        assert.equal(v.full, original, `${lang} ${k}: full text kept byte for byte`);
        const sents = splitSentences(original);
        assert.equal(v.summary, sents.slice(0, n).join(' '));
        for (const s of sents) assert.ok(v.full.includes(s), 'every sentence is still present');
        assert.ok(v.summary.length <= original.length);
      }
    }
  }
  assert.equal(summarySentences(1), 1);
  assert.equal(summarySentences(2), 2);
  assert.equal(stepToward(0, -2), -1);
  assert.equal(stepToward(-1, -2), -2);
  assert.equal(stepToward(-2, 0), -1);
  assert.equal(stepToward(3, 3), 3);
});

test('soft transition is wired: conversation renders <details> with the full original; reduced-motion safe CSS', () => {
  const js = read('../docs/js/conversation.js');
  assert.match(js, /softView\(/);
  assert.match(js, /el\('details', 'cv-soft-full'\)/);
  assert.match(js, /soft_more/);
  const css = read('../docs/css/style.css');
  assert.match(css, /prefers-reduced-motion: no-preference\) \{\s*\.cv-soft \.cv-soft-sum/);
  assert.match(read('../docs/js/landing.js'), /softView\(/);
});

test('rhythm: heatmap, session-minute bins, acceptance rate, sparse threshold', () => {
  const mk = (h, dow, min, extra = {}) => ({ ...makeLabel({ sessionId: 's', level: 'overloaded', now: T0 }), dow, hour: h, sessionMin: min, ...extra });
  const a = aggregateRhythm([mk(14, 2, 25), mk(15, 2, 35)]);
  assert.equal(a.enough, false, 'sparse: show "records build up" instead');
  assert.equal(a.events, 2);
  assert.equal(aggregateRhythm([]).suggest.rate, null);
  const many = [
    mk(14, 2, 25), mk(15, 2, 35), mk(16, 2, 32), mk(9, 4, 5), mk(22, 6, 70),
    { ...mk(10, 1, 12), level: 'calm' }, // calm is not a load event
    { ...mk(14, 2, 31), kind: 'suggest', origin: 'auto', outcome: 'accept' },
    { ...mk(14, 2, 31), kind: 'suggest', origin: 'auto', outcome: 'reject' },
    { ...mk(14, 2, 31), kind: 'suggest', origin: 'auto', outcome: 'ignore' },
  ];
  const b = aggregateRhythm(many);
  assert.equal(b.total, 9);
  assert.equal(b.events, 6, '5 manual heavy presses + 1 accepted auto offer');
  assert.equal(b.enough, true);
  assert.equal(b.heat[2][4], 2, 'Tue 12–15h: 14h press + 14h accept');
  assert.equal(b.heat[2][5], 2, 'Tue 15–18h: 15h + 16h');
  assert.equal(b.heat[4][3], 1);
  assert.equal(b.heat[6][7], 1);
  assert.equal(b.heat[1][3], 0, 'calm press not counted');
  assert.equal(b.heatMax, 2);
  assert.deepEqual(b.peak, { dow: 2, band: 4 });
  assert.deepEqual(b.session, [1, 0, 1, 3, 0, 1]); // 5 | 25 | 31,32,35 | 70
  assert.equal(b.sessionPeak, 3);
  assert.equal(b.medianMin, 31);
  assert.deepEqual(b.suggest, { shown: 3, accept: 1, reject: 1, ignore: 1, rate: 1 / 3 });
  assert.deepEqual([sessionBin(0), sessionBin(9), sessionBin(10), sessionBin(59), sessionBin(600)], [0, 0, 1, 4, 5]);
  // labels carry local time, weekday, session minute, origin, outcome
  const L = makeLabel({ sessionId: 's', level: 'rising', now: T0, sessionStart: T0 - 23 * 60000, origin: 'auto', outcome: 'accept', kind: 'suggest' });
  assert.deepEqual([L.dow, L.hour, L.sessionMin, L.origin, L.outcome, L.kind], [1, 10, 23, 'auto', 'accept', 'suggest']);
  assert.equal(makeLabel({ sessionId: 's' }).origin, 'manual');
});

test('rhythm view: factual copy, sparse message, export + delete, settings', () => {
  const html = read('../docs/conversation.html');
  for (const id of ['rhythm', 'rh-heat', 'rh-session', 'rh-accept', 'rh-sparse', 'rh-export', 'rh-clear', 'sg-enabled', 'sg-max', 'sg-reset']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.equal(STRINGS.ko.rh_h, '작업 리듬');
  assert.match(STRINGS.ko.rh_sparse, /^기록이 더 쌓이면 보여요/);
  assert.match(STRINGS.en.rh_intro, /not a diagnosis/);
  for (const lang of ['en', 'ko']) for (const k of Object.keys(STRINGS[lang]).filter((x) => x.startsWith('rh_'))) {
    const v = STRINGS[lang][k];
    for (const s of Array.isArray(v) ? v : [v]) assert.equal(isDiagnostic(s), false, `${lang} ${k}`);
  }
});

const FORBIDDEN = {
  en: ['You seem tired.', 'You look exhausted.', 'You sound stressed.', "You're overwhelmed.", 'You are confused', 'You must be tired', 'Your load is rising.', 'It looks like you’re struggling', 'you seem a bit tired'],
  ko: ['지친 것 같아요', '피곤해 보여요', '피곤하신 것 같아요', '힘들어 보여요', '지치셨죠?', '스트레스 받으신 것 같아요', '부하가 올라가고 있어요', '이 부분이 헷갈리셨을까요?'],
};

test('phrase rule: EN/KO diagnostic sentences are caught; action suggestions pass', () => {
  for (const lang of ['en', 'ko']) {
    assert.ok(DIAGNOSTIC_PATTERNS[lang].length >= 6);
    for (const s of FORBIDDEN[lang]) assert.equal(isDiagnostic(s), true, s);
    for (const s of ACTION_EXAMPLES[lang]) assert.equal(isDiagnostic(s), false, s);
  }
  for (const s of ['Want a short summary?', '짧게 요약해 줄까요?', '핵심만 먼저 볼까요?', 'See the key point first?']) assert.equal(isDiagnostic(s), false, s);
});

// User sample lines (what the person says) are exempt: they are not system phrasing.
const USER_LINES = /^(cv_u_|cv_b_|sc_|lp_)/;
test('phrase rule: no diagnostic phrasing in any system string (i18n EN/KO)', () => {
  for (const lang of ['en', 'ko']) {
    for (const [k, v] of Object.entries(STRINGS[lang])) {
      if (USER_LINES.test(k)) continue;
      for (const s of Array.isArray(v) ? v : [v]) assert.equal(isDiagnostic(s), false, `${lang}.${k}: ${s}`);
    }
  }
  for (const k of ['sg_short', 'sg_loop', 'pm_r15b', 'break_soon', 'pm_r3']) {
    assert.match(STRINGS.en[k], /\?/, `${k} is phrased as an offer`);
    assert.match(STRINGS.ko[k], /\?/, `${k} ko is phrased as an offer`);
  }
});

test('phrase rule: extension, MCP and adaptation text use action phrasing only', () => {
  const strip = (src) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\bRE\.\w+\s*=.*$/gm, '');
  for (const f of ['../extension/content.js', '../extension/background.js', '../extension/popup.html', '../extension/popup.js', '../extension/lib/labels.js', '../mcp/server.mjs', '../docs/js/partner.js', '../docs/js/loop.js', '../docs/js/adapt.js']) {
    const src = strip(read(f)).replace(/no "you seem tired"|"지친 것 같아요" 금지/g, '');
    assert.equal(isDiagnostic(src), false, f);
  }
  for (const lang of ['en', 'ko']) for (const level of ['calm', 'rising', 'overloaded']) {
    const ctx = buildAdaptationContext({ level, loopType: 'reask', lang });
    assert.equal(isDiagnostic(ctx.replace(/no "you seem tired"|"지친 것 같아요" 금지/g, '')), false);
    const sg = suggestionFor(level, lang);
    if (sg) { assert.equal(isDiagnostic(sg), false); assert.match(sg, /\?$/); }
  }
  const ad = getAdaptation({ overloaded: true, lang: 'ko' });
  assert.match(ad.context, /요약/);
  assert.match(ad.context, /빼지 마세요/);
  assert.equal(ad.params.structure, 'summary_then_details');
});

test('auto suggestions are wired with cap/backoff and recorded as labels; manual mascot stays', () => {
  const js = read('../docs/js/conversation.js');
  assert.match(js, /canSuggest\(readSuggest\(\)/);
  assert.match(js, /recordOutcome\(readSuggest\(\), outcome/);
  assert.match(js, /recordAuto\(p, 'ignore'\)/, 'unanswered offer → ignore on the next turn');
  assert.match(js, /origin: 'auto', outcome/);
  assert.match(js, /mountMascotLoad\(/);
  assert.match(read('../docs/js/loadui.js'), /origin: 'manual'/);
  assert.match(read('../docs/js/loadui.js'), /function offer\(/);
});

test('extension: grok.com supported with minimal permission; suggestion bubble never sends', () => {
  const m = JSON.parse(read('../extension/manifest.json'));
  assert.ok(m.host_permissions.includes('https://grok.com/*'));
  assert.ok(m.content_scripts[0].matches.includes('https://grok.com/*'));
  assert.equal(m.host_permissions.length, 4);
  assert.ok(!m.host_permissions.some((h) => /x\.com|<all_urls>|\*:\/\/\*\//.test(h)));
  const sel = JSON.parse(read('../extension/selectors.json'));
  assert.match(sel['grok.com'].input.join(' '), /Ask Grok anything/);
  const ct = read('../extension/content.js');
  assert.match(ct, /suggest_check/);
  assert.match(ct, /outcome: 'ignore'/);
  assert.doesNotMatch(ct, /\.click\(\)|requestSubmit|form\.submit/);
  const bg = read('../extension/background.js');
  assert.match(bg, /from '\.\/lib\/suggest\.js'/);
  assert.match(read('../extension/README.md'), /Load unpacked/);
  assert.match(read('../extension/README.md'), /grok\.com/);
});

test('MCP: Streamable HTTP handler (in-memory, no socket): token, 202 notifications, 405 GET, origin guard, loopback only', () => {
  const proc = spawnSync(process.execPath, ['mcp/server.mjs', '--http-self-test'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8', timeout: 5000 });
  assert.equal(proc.status, 0, proc.stderr);
  const r = JSON.parse(proc.stderr.trim().split('\n').at(-1));
  assert.deepEqual(
    [r.noAuth, r.init, r.session, r.notify, r.get, r.badOrigin, r.grokOrigin, r.loopbackOnly],
    [401, 200, true, 202, 405, 403, 200, true],
  );
  assert.ok(r.tools.includes('record_suggestion'));
  const readme = read('../mcp/README.md');
  assert.match(readme, /cloudflared tunnel --url http:\/\/localhost:3001/);
  assert.match(readme, /Decision needed/);
});

test('MCP: get_adaptation gives an action-only suggestion; record_suggestion applies backoff', () => {
  const input = [
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_adaptation', arguments: { overloaded: true, verbose: true } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'record_suggestion', arguments: { outcome: 'reject', verbose: true } } },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_adaptation', arguments: { overloaded: true, verbose: true } } },
  ].map((x) => JSON.stringify(x)).join('\n') + '\n';
  const proc = spawnSync(process.execPath, ['mcp/server.mjs'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8', input, timeout: 5000 });
  const out = proc.stdout.trim().split('\n').map((l) => JSON.parse(JSON.parse(l).result.content[0].text));
  assert.equal(out[0].suggestion, 'Want a short summary?');
  assert.equal(isDiagnostic(out[0].suggestion), false);
  assert.equal(out[1].gate.reason, 'backoff');
  assert.equal(out[2].suggestion, null, 'quiet during backoff');
});

test('MCP: compact item-value responses are ≥50% smaller than verbose and keep the same fields', () => {
  const conv = STRINGS.en.lo_ex_reask_text;
  const run = (verbose) => {
    const calls = [['report_load', { level: 'overloaded', recentTurns: 3 }], ['get_adaptation', { overloaded: true, loadIndex: 80, conversation: conv }], ['get_loop_status', { conversation: conv }]];
    const input = calls.map(([name, a], i) => JSON.stringify({ jsonrpc: '2.0', id: i, method: 'tools/call', params: { name, arguments: { ...a, ...(verbose ? { verbose: true } : {}) } } })).join('\n') + '\n';
    const p = spawnSync(process.execPath, ['mcp/server.mjs'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8', input, timeout: 5000 });
    return p.stdout.trim().split('\n');
  };
  const full = run(true); const short = run(false);
  full.forEach((line, i) => assert.ok(Buffer.byteLength(short[i]) <= Buffer.byteLength(line) * 0.5, `tool ${i}: ${Buffer.byteLength(short[i])} vs ${Buffer.byteLength(line)}`));
  const txt = short.map((l) => JSON.parse(l).result.content[0].text);
  const kv = (t) => Object.fromEntries(t.split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)]));
  const [rl, ga, lp] = txt.map(kv);
  assert.equal(rl.level, 'overloaded');
  assert.match(rl.label, /^l_/);
  assert.match(rl.params, /summary_then_details · summary 1 · full kept · pace slow/);
  assert.match(rl.context, /summary first.*full details.*drop nothing/);
  assert.equal(ga.level, 'overloaded');
  assert.match(ga.loop, /^reask 0\.\d/);
  assert.match(ga.context, /looping \(reask\)/);
  assert.equal(ga.suggestion, 'Want a short summary?');
  assert.match(ga.gate, /^ok \d left$/);
  assert.match(lp.loop, /^reask /);
  assert.match(lp.evidence, /^same question repeated, turns \d+→\d+, \d+% alike/);
  for (const t of txt) assert.equal(isDiagnostic(t), false);
  // same meaning in the short context (KO too)
  const ko = buildAdaptationContext({ level: 'overloaded', lang: 'ko', short: true });
  assert.match(ko, /요약 먼저/);
  assert.match(ko, /내용 유지/);
  assert.equal(isDiagnostic(ko), false);
  // tools/list stays short: one-line descriptions, every tool takes verbose
  const p = spawnSync(process.execPath, ['mcp/server.mjs'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8', input: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n' });
  const tools = JSON.parse(p.stdout).result.tools;
  for (const t of tools) { assert.ok(t.description.length <= 70, t.name); assert.equal(t.inputSchema.properties.verbose.type, 'boolean'); }
});

/* ---------- extension content script in a stubbed DOM (node:vm, no browser, no network) ---------- */
import vm from 'node:vm';
function loadContent({ found = {}, lang = 'en-US', clipboardOk = true } = {}) {
  const gen = () => ({ style: {}, dataset: {}, hidden: true, textContent: '', classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, querySelector: () => gen(), querySelectorAll: () => [], appendChild() {}, setAttribute() {} });
  const chipParts = { '.attune-chip-txt': { textContent: '' }, '.attune-copy': { hidden: true, textContent: '' } };
  const chip = { hidden: true, classes: new Set(), classList: { add(c) { chip.classes.add(c); } }, querySelector: (c) => chipParts[c] };
  const copied = [];
  const document = {
    querySelectorAll(css) { if (css.includes('[[')) throw new SyntaxError('bad'); return found[css] || []; },
    querySelector(css) { if (css === '#attune-load-fab .attune-chip') return chip; if (css === '#attune-load-fab .attune-chip-txt') return chipParts['.attune-chip-txt']; return null; },
    getElementById: () => null, documentElement: { appendChild() {} }, createElement: gen, addEventListener() {}, execCommand() { return true; },
  };
  const ctx = vm.createContext({
    document, location: { hostname: 'grok.com' }, setInterval() {}, setTimeout() {}, console,
    navigator: { language: lang, clipboard: { writeText: async (t) => { if (!clipboardOk) throw new Error('denied'); copied.push(t); } } },
    fetch: async () => { throw new Error('no network in tests'); },
    chrome: { runtime: { getURL: (x) => x, sendMessage: async () => ({}) } },
    Event: class {}, InputEvent: class {},
  });
  vm.runInContext(read('../extension/content.js'), ctx);
  return { ctx, chip, chipParts, copied };
}
const el = (o = {}) => ({ tagName: 'TEXTAREA', value: '', disabled: false, readOnly: false, getAttribute: () => null, closest: () => null, getClientRects: () => (o.visible === false ? [] : [1]), dispatchEvent() {}, ...o });

test('extension grok.com: robust composer candidates (textarea, contenteditable, aria-label), first visible match wins', () => {
  const sel = JSON.parse(read('../extension/selectors.json'))['grok.com'];
  assert.ok(Array.isArray(sel.input) && sel.input.length >= 8);
  const joined = sel.input.join(' | ');
  assert.match(joined, /textarea\[aria-label='Ask Grok anything'\]/);
  assert.match(joined, /contenteditable='true'/);
  assert.match(joined, /aria-label\*='Grok' i/);
  assert.match(joined, /ProseMirror/);
  // hidden textarea skipped, visible contenteditable picked
  const hidden = el({ visible: false });
  const ce = el({ tagName: 'DIV', isContentEditable: true });
  const found = { [sel.input[0]]: [hidden], "div.ProseMirror[contenteditable='true']": [ce] };
  const { ctx } = loadContent({ found });
  assert.equal(ctx.pickInput(sel), ce);
  // invalid selector in the list is skipped, not fatal
  assert.equal(ctx.pickInput({ input: ['bad[[', "div.ProseMirror[contenteditable='true']"] }), ce);
  // writes into the composer when found (never sends)
  const ta = el();
  const r = loadContent({ found: { [sel.input[0]]: [ta] } });
  assert.equal(r.ctx.writeComposer(sel, 'NOTE'), true);
  assert.equal(ta.value, 'NOTE');
});

test('extension fallback: composer missing → "couldn’t find the chat box" chip + clipboard copy; mascot stays floating', async () => {
  const sel = JSON.parse(read('../extension/selectors.json'))['grok.com'];
  const { ctx, chip, chipParts, copied } = loadContent({ found: {} });
  assert.equal(ctx.pickInput(sel), null);
  assert.equal(ctx.writeComposer(sel, 'LOAD NOTE'), false);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(copied, ['LOAD NOTE']);
  assert.equal(chip.hidden, false);
  assert.match(chipParts['.attune-chip-txt'].textContent, /Couldn’t find the chat box/);
  assert.equal(chipParts['.attune-copy'].hidden, false, 'Copy button offered as a second path');
  const ko = loadContent({ found: {}, lang: 'ko-KR', clipboardOk: false });
  ko.ctx.writeComposer(sel, 'x');
  await new Promise((r) => setImmediate(r));
  assert.match(ko.chipParts['.attune-chip-txt'].textContent, /^입력창을 찾지 못함/);
  const ct = read('../extension/content.js');
  assert.match(ct, /position:fixed;right:16px;bottom:88px/);
  assert.match(ct, /setInterval\(\(\) => \{ if \(!document\.getElementById\('attune-load-fab'\)\)/);
  assert.doesNotMatch(ct, /\.click\(\)|requestSubmit|form\.submit/);
});

test('analyze-labels: exported JSON → Markdown summary (time bands, session minutes, acceptance), sparse note, dedupe', async () => {
  const { summarize, readExport } = await import('../scripts/analyze-labels.mjs');
  const mk = (i, extra = {}) => ({ ...makeLabel({ sessionId: 's', level: 'overloaded', now: T0 + i * 3600000, id: `l${i}` }), dow: 2, hour: 14, sessionMin: 31, ...extra });
  const few = summarize(readExport({ labels: [mk(1), mk(2)] }));
  assert.match(few, /Fewer than 5 load presses/);
  assert.doesNotMatch(few, /## Load presses by weekday/);
  const list = [mk(1), mk(2), mk(3), mk(4, { hour: 9, dow: 4, sessionMin: 5 }), mk(5),
    { ...mk(6), kind: 'suggest', origin: 'auto', outcome: 'accept' }, { ...mk(7), kind: 'suggest', origin: 'auto', outcome: 'reject' }];
  const md = summarize(readExport(JSON.stringify({ v: 1, labels: list })), { files: ['a.json'] });
  assert.match(md, /\| Records \| 7 \|/);
  assert.match(md, /shown 2 · accepted 1 \(50%\) · passed 1 · no answer 0/);
  assert.match(md, /\| Most load presses \| Tue 12–15h \|/);
  assert.match(md, /\| Tue \| 0 \| 0 \| 0 \| 0 \| 5 \| 0 \| 0 \| 0 \|/);
  assert.match(md, /\| 1 \| 0 \| 0 \| 5 \| 0 \| 0 \|/);
  assert.match(md, /Not a diagnosis/);
  assert.equal(isDiagnostic(md), false);
  const ko = summarize(readExport({ labels: list }), { lang: 'ko' });
  assert.match(ko, /표시 2 · 수락 1 \(50%\)/);
  // CLI: merges files and dedupes by id
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const dir = mkdtempSync('/tmp/attune-an-');
  writeFileSync(`${dir}/a.json`, JSON.stringify({ labels: list }));
  writeFileSync(`${dir}/b.json`, JSON.stringify({ labels: list.slice(0, 3) }));
  const p = spawnSync(process.execPath, ['scripts/analyze-labels.mjs', `${dir}/a.json`, `${dir}/b.json`], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
  assert.equal(p.status, 0, p.stderr);
  assert.match(p.stdout, /\| Records \| 7 \|/);
  assert.match(read('../README.md'), /Two-week self-experiment/);
  assert.match(read('../README.md'), /2주 자기 실험/);
  assert.match(read('../docs/index.html'), /href="conversation\.html#rhythm"/);
  assert.match(read('../docs/conversation.html'), /href="#rhythm"/);
});

test('MCP: no raw translation keys in any tool response (compact + verbose, EN + KO); evidence is a human phrase; literal "\\n" = newline', () => {
  const KEY = /\b[a-z]{2}_[a-z_]+\b/;
  const reask = STRINGS.en.lo_ex_reask_text;
  const same = 'You: How do I export the spreadsheet to PDF on one page?\nAI: Use File > Print and choose Fit to page.\nYou: How can I export my spreadsheet to PDF on one page?\nAI: Use File > Print and choose Fit to page.\nYou: still not working, how do I export the spreadsheet to PDF on one page\nAI: Use File > Print and choose Fit to page.';
  const escaped = reask.replace(/\n/g, '\\n'); // two characters: backslash + n
  assert.ok(!escaped.includes('\n'));
  const calls = [{ jsonrpc: '2.0', id: 0, method: 'tools/list' }];
  let id = 1;
  for (const lang of ['en', 'ko']) for (const verbose of [false, true]) {
    const v = verbose ? { verbose: true } : {};
    calls.push(
      { name: 'report_load', arguments: { level: 'overloaded', lang, conversation: reask, ...v } },
      { name: 'get_adaptation', arguments: { overloaded: true, lang, conversation: same, ...v } },
      { name: 'get_loop_status', arguments: { conversation: reask, lang, ...v } },
      { name: 'get_loop_status', arguments: { conversation: same, lang, ...v } },
      { name: 'get_loop_status', arguments: { conversation: escaped, lang, ...v } },
      { name: 'record_suggestion', arguments: { outcome: 'ignore', ...v } },
    );
  }
  const input = calls.map((c) => JSON.stringify(c.method ? c : { jsonrpc: '2.0', id: id++, method: 'tools/call', params: c })).join('\n') + '\n';
  const p = spawnSync(process.execPath, ['mcp/server.mjs'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8', input, timeout: 5000 });
  const lines = p.stdout.trim().split('\n');
  assert.equal(lines.length, calls.length);
  for (const line of lines) {
    const body = JSON.parse(line);
    assert.ok(!body.error, line);
    const shown = body.result.content ? body.result.content[0].text : JSON.stringify(body.result);
    assert.doesNotMatch(shown, KEY, shown.slice(0, 300));
  }
  const texts = lines.slice(1).map((l) => JSON.parse(l).result.content[0].text);
  const enLoop = texts[2]; const enEscaped = texts[4]; const koLoop = texts[14];
  assert.match(enLoop, /^loop: reask /);
  assert.match(enLoop, /evidence: same question repeated, turns 1→3, \d+% alike/);
  assert.equal(enEscaped, enLoop, 'escaped "\\n" input parses like real newlines');
  assert.match(koLoop, /evidence: 같은 질문 반복 1→3턴, 유사도 \d+%; 불만 표현 [\d, ]+턴/);
  const verboseLoop = JSON.parse(texts[8]);
  assert.equal(verboseLoop.evidence[0].kind, 'reask');
  assert.match(verboseLoop.evidence[0].text, /^Turns 1 and 3 \(yours\) share \d+% of their words$/);
  assert.equal('key' in verboseLoop.evidence[0], false);
});
