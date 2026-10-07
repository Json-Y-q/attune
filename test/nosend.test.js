// Extension 0.3.1 regression: the extension must NEVER send a chat message. It only places a one-line note in the composer
// for the user's next manual send (with Undo). Live bug in 0.3.0 on grok.com: a heavy pick inserted the note + rewrite request
// with "\n\n" via execCommand('insertText') into the ProseMirror composer; ProseMirror reads an inserted paragraph as an Enter
// key press (prosemirror-view readDOMChange -> looksLikeEnter -> handleKeyDown(Enter)) and Grok's Enter = send.
// Static source checks + pure logic + the content script in a stubbed DOM (node:vm). No browser, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { SUBMIT_CHARS, oneLine, planPick, planUndo, keyAction, chipPos, CHIP_GAP } from '../extension/lib/widget.js';
import { prefixForLevel, rewritePrompt, REWRITE_FILLS, NOTE_MAX, fillFor } from '../extension/lib/labels.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const extFiles = () => {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}${e.name}/`);
      else if (/\.(js|mjs|html)$/.test(e.name)) out.push(`${dir}${e.name}`);
    }
  };
  walk('../extension/');
  return out;
};
const ct = read('../extension/content.js');

test('no code in extension/ submits: no submit()/requestSubmit, no send-button click, no synthetic Enter, no paragraph insert', () => {
  const files = extFiles();
  assert.ok(files.includes('../extension/content.js') && files.includes('../extension/lib/widget.js'));
  for (const f of files) {
    const src = strip(read(f));
    assert.doesNotMatch(src, /requestSubmit|\.submit\s*\(/, `${f}: form submit`);
    assert.doesNotMatch(src, /new\s+KeyboardEvent|KeyboardEvent\s*\(|initKeyboardEvent|keyCode\s*:\s*13|which\s*:\s*13/, `${f}: synthetic key event`);
    assert.doesNotMatch(src, /dispatchEvent\([^)]*(submit|keydown|keypress|keyup|Enter)/i, `${f}: dispatching submit/Enter`);
    assert.doesNotMatch(src, /insertParagraph|insertLineBreak|insertHTML/, `${f}: paragraph / line-break insertion`);
    assert.doesNotMatch(src, /\bel\.(textContent|innerText|innerHTML)\s*=/, `${f}: raw text replacement of the composer`);
    // .click() only for the popup's JSON download link, never for a page/send button
    for (const m of src.matchAll(/^.*\.click\(\).*$/gm)) {
      assert.equal(f, '../extension/popup.js', `${f}: .click() call`);
      assert.match(m[0], /a\.download/, 'popup .click() is only the export download anchor');
    }
  }
  // submit selectors are only used to OBSERVE the user's own press (closest()), never to click them
  assert.doesNotMatch(strip(ct), /sel(Ref)?\??\.submit[^)]*\)\s*\.\s*(click|dispatchEvent)/);
  // every execCommand is a plain insertText of a checked one-line string, or a delete of our own selected note
  const cmds = [...strip(ct).matchAll(/execCommand\(\s*'([a-zA-Z]+)'\s*,\s*false(?:\s*,\s*([^)]+))?\)/g)].map((m) => [m[1], (m[2] || '').trim()]);
  assert.ok(cmds.length >= 2);
  for (const [cmd, arg] of cmds) {
    assert.ok(cmd === 'insertText' || cmd === 'delete', `execCommand ${cmd}`);
    if (cmd === 'insertText') assert.equal(arg, 't', 'insertText only takes the flattened, checked variable t');
  }
  assert.match(ct, /if \(!el \|\| !t \|\| SUBMIT_CHARS\.test\(t\)\) return false;/, 'insertAtStart refuses text with a line break');
  assert.doesNotMatch(strip(ct), /selectAll/, 'the user\'s draft is never selected and re-typed');
});

test('the next-send watcher only observes trusted user presses; it never cancels, re-dispatches or sends', () => {
  const src = strip(ct);
  const w = src.slice(src.indexOf('function watchSends'), src.indexOf('(async () => {', src.indexOf('function watchSends')));
  assert.match(w, /if \(!e\.isTrusted \|\| e\.key !== 'Enter' \|\| e\.shiftKey \|\| e\.isComposing\) return;/);
  assert.match(w, /if \(!e\.isTrusted\) return;/);
  assert.doesNotMatch(w, /preventDefault|stopPropagation|dispatchEvent|execCommand|setFieldValue|insertAtStart|\.click\(/);
});

test('note text has no submit characters (all levels, the rewrite fills, and newline-carrying input is flattened)', () => {
  for (const lv of ['calm', 'rising', 'overloaded']) assert.doesNotMatch(prefixForLevel(lv), SUBMIT_CHARS, lv);
  for (const lv of ['rising', 'overloaded']) assert.doesNotMatch(prefixForLevel(lv, 'ko'), SUBMIT_CHARS, `ko ${lv}`);
  assert.doesNotMatch(rewritePrompt(), SUBMIT_CHARS);
  for (const f of REWRITE_FILLS) assert.doesNotMatch(f, SUBMIT_CHARS, f);
  assert.equal(oneLine('A.\n\nB'), 'A. B');
  assert.equal(oneLine('A.\r\n'), 'A. ');
  assert.equal(oneLine('x\u2028y\u2029z\u0085w\vq\fr'), 'x y z w q r');
  assert.doesNotMatch(oneLine(prefixForLevel('overloaded') + '\n\n'), SUBMIT_CHARS);
});

test('planPick / planUndo: only one-line inserts at the start or removal of our own note; the user draft is never re-typed', () => {
  const R = rewritePrompt();
  const fills = [...REWRITE_FILLS];
  const heavy = prefixForLevel('overloaded'); const medium = prefixForLevel('rising');
  const drafts = ['', 'hello', 'hello\nworld', 'draft 1\r\n\r\ndraft 2\u2028x', '   spaced  '];
  const notes = ['', heavy, medium, `${heavy.trim()}\n\n`, 'NOTE.\nTWO LINES\n'];
  for (const d of drafts) for (const oldN of notes) for (const n of notes) {
    const cur = oldN && d ? `${oneLine(oldN)}${d}` : oldN ? `${oneLine(oldN)}${R}` : d;
    const p = planPick({ current: cur, oldNote: oldN, note: n, fill: R, fills });
    assert.doesNotMatch(p.insert, SUBMIT_CHARS, JSON.stringify({ d, oldN, n }));
    assert.doesNotMatch(p.remove, SUBMIT_CHARS);
    if (d.trim()) assert.ok(!p.insert.includes(d.trim().split(/\s/)[0]) || n.includes(d.trim()), 'the draft is not part of any insert');
    if (d.trim()) assert.equal(p.clear, false, 'a box with the user draft is never cleared');
    const u = planUndo({ current: cur, note: oldN, fills });
    assert.equal(u.insert, '');
    if (d.trim()) assert.equal(u.clear, false);
  }
  assert.deepEqual(planPick({ current: '', note: `${heavy.trim()}\n\n`, fill: R, fills }), { clear: false, remove: '', insert: `${heavy.trim()} ${R}` });
  assert.deepEqual(planPick({ current: 'hi\nthere', note: heavy, fill: R, fills }), { clear: false, remove: '', insert: heavy });
  assert.deepEqual(planPick({ current: `${heavy}${R}`, oldNote: heavy, note: medium, fill: R, fills }), { clear: true, remove: '', insert: `${medium}${R}` });
  assert.deepEqual(planPick({ current: `${heavy}hi\nthere`, oldNote: heavy, note: medium, fill: R, fills }), { clear: false, remove: heavy.trim(), insert: medium });
  assert.deepEqual(planPick({ current: `${heavy}hi`, oldNote: heavy, note: '', fill: R, fills }), { clear: false, remove: heavy.trim(), insert: '' });
  assert.deepEqual(planUndo({ current: `${heavy}${R}`, note: heavy, fills }), { clear: true, remove: '', insert: '' });
  assert.deepEqual(planUndo({ current: `${heavy}hi\nthere`, note: heavy, fills }), { clear: false, remove: heavy.trim(), insert: '' });
  assert.deepEqual(planUndo({ current: 'user edited it', note: heavy, fills }), { clear: false, remove: '', insert: '' });
});

const DIAGNOSIS = /cognitive load|the user (reported|is|seems|feels)|you (seem|are|look|feel)|tired|overwhelm|stress|burnout|exhaust|confus|struggl|부하|지치|피곤|힘들|번아웃|스트레스|사용자가/i;
test('0.4.1 notes are compact: one line, length cap per level, action-only, core instructions kept (EN + KO)', () => {
  for (const lang of ['en', 'ko']) {
    assert.equal(prefixForLevel('calm', lang), '', 'light = no note');
    const med = prefixForLevel('rising', lang); const heavy = prefixForLevel('overloaded', lang);
    for (const [lv, n] of [['rising', med], ['overloaded', heavy]]) {
      assert.doesNotMatch(n, SUBMIT_CHARS, `${lang} ${lv}: no line break`);
      assert.ok(n.trim().length <= NOTE_MAX[lv], `${lang} ${lv}: ${n.trim().length} > ${NOTE_MAX[lv]}`);
      assert.ok(n.endsWith(' ') && !n.endsWith('  '), 'one trailing space so the user text follows');
      assert.doesNotMatch(n, DIAGNOSIS, `${lang} ${lv}: no statement about the user`);
    }
    assert.ok(med.length < heavy.length, 'medium is shorter than heavy');
    assert.ok(heavy.trim().length <= 110 && med.trim().length <= 80);
  }
  const en = prefixForLevel('overloaded'); const ko = prefixForLevel('overloaded', 'ko');
  for (const re of [/1-line summary first/, /"Details"/, /one step at a time/, /max 2 options/]) assert.match(en, re);
  for (const re of [/한 줄 요약 먼저/, /"자세히"/, /한 번에 하나씩/, /선택지 최대 2개/]) assert.match(ko, re);
  assert.match(prefixForLevel('rising'), /summary first, full details kept below/);
  assert.match(prefixForLevel('rising', 'ko'), /요약 먼저, 전체 내용은 아래에 유지/);
  for (const f of REWRITE_FILLS) { assert.doesNotMatch(f, DIAGNOSIS); assert.ok(f.length <= 40, f); }
  assert.equal(rewritePrompt(), 'Redo the last answer this way.');
  assert.equal(rewritePrompt('ko'), '마지막 답을 이 방식으로 다시 써 주세요.');
  // the background gets the language from the content script
  assert.match(read('../extension/background.js'), /prefixForLevel\(level, msg\.lang\)/);
  assert.match(ct, /lang: LANG, \/\/ note in Korean/);
});

test('empty / new chat: only the style note, no "redo the last answer"; with a previous answer: note + short redo request', () => {
  assert.equal(fillFor({ hasAnswer: false }), '');
  assert.equal(fillFor({ hasAnswer: false, lang: 'ko' }), '');
  assert.equal(fillFor({ hasAnswer: true }), rewritePrompt());
  assert.equal(fillFor({ hasAnswer: true, lang: 'ko' }), rewritePrompt('ko'));
  const heavy = prefixForLevel('overloaded');
  assert.deepEqual(planPick({ current: '', note: heavy, fill: fillFor({ hasAnswer: false }), fills: REWRITE_FILLS }), { clear: false, remove: '', insert: heavy });
  assert.deepEqual(planPick({ current: '', note: heavy, fill: fillFor({ hasAnswer: true }), fills: REWRITE_FILLS }), { clear: false, remove: '', insert: `${heavy}${rewritePrompt()}` });
  // a draft in the box: never a rewrite request, with or without a previous answer
  assert.equal(planPick({ current: 'my question', note: heavy, fill: fillFor({ hasAnswer: true }), fills: REWRITE_FILLS }).insert, heavy);
  // Undo after an empty-chat pick clears only our note
  assert.deepEqual(planUndo({ current: heavy, note: heavy, fills: REWRITE_FILLS }), { clear: true, remove: '', insert: '' });
  // selectors.json: every site has an assistantMessage list; content.js treats a missing selector as "no previous answer"
  const all = JSON.parse(read('../extension/selectors.json'));
  for (const site of ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'grok.com']) {
    assert.ok(Array.isArray(all[site].assistantMessage) && all[site].assistantMessage.length > 0, `${site} assistantMessage`);
  }
  assert.match(ct, /function fillNow\(sel\) \{ return L \? L\.fillFor\(\{ hasAnswer: hasAssistantMessage\(sel\), lang: LANG \}\) : ''; \}/);
});

test('content.js hasAssistantMessage: unknown selector = false, matching non-empty answer = true, own widget ignored', () => {
  const env = loadContent();
  const has = vm.runInContext('hasAssistantMessage', env.ctx);
  const nodes = { '.answer': [], '.empty': [{ textContent: '   ', closest: () => null }], '.mine': [{ textContent: 'x', closest: () => ({}) }] };
  env.ctx.document.querySelectorAll = (css) => { if (css === 'bad[') throw new Error('invalid'); return nodes[css] || []; };
  assert.equal(has({}), false, 'no assistantMessage selector: no rewrite');
  assert.equal(has({ assistantMessage: ['.answer'] }), false, 'new chat: nothing matches');
  assert.equal(has({ assistantMessage: ['bad[', '.empty', '.mine'] }), false, 'invalid / empty / own-widget nodes do not count');
  nodes['.answer'] = [{ textContent: 'Here is the answer', closest: () => null }];
  assert.equal(has({ assistantMessage: ['bad[', '.answer'] }), true);
  assert.equal(has({ assistantMessage: '.empty, .answer' }), true, 'comma list works too');
});

test('Undo chip placement (chipPos): left of the mascot with a >= 12px gap, never over the composer, inside the viewport', () => {
  const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const gapOf = (a, b) => Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);
  const cases = [];
  for (const vw of [360, 800, 1200, 1920]) for (const vh of [500, 800, 1080]) for (const w of [140, 220, 280]) for (const h of [28, 52]) {
    const composer = { left: Math.round(vw * 0.15), right: Math.round(vw * 0.85), top: vh - 96, bottom: vh - 16 };
    const docked = { left: vw - 76, right: vw - 16, top: composer.top - 12 - 60, bottom: composer.top - 12 };
    const wide = { left: 0, right: vw, top: vh - 120, bottom: vh };
    const dockedWide = { left: vw - 76, right: vw - 16, top: wide.top - 72, bottom: wide.top - 12 };
    const dragged = { left: Math.round(vw / 2) - 30, right: Math.round(vw / 2) + 30, top: vh - 70, bottom: vh - 10 }; // dragged onto the composer
    const topLeft = { left: 4, right: 64, top: 4, bottom: 64 };
    cases.push([vw, vh, { w, h }, docked, composer], [vw, vh, { w, h }, dockedWide, wide], [vw, vh, { w, h }, dragged, composer], [vw, vh, { w, h }, topLeft, null], [vw, vh, { w, h }, docked, null]);
  }
  for (const [vw, vh, chip, mascot, composer] of cases) {
    const p = chipPos({ vw, vh, mascot, chip, composer });
    const cw = Math.min(chip.w, vw - 8);
    const r = { left: p.left, top: p.top, right: p.left + cw, bottom: p.top + chip.h };
    const msg = JSON.stringify({ vw, vh, chip, mascot, composer, p });
    assert.ok(r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh, `in viewport ${msg}`);
    assert.ok(gapOf(r, mascot) >= CHIP_GAP, `gap from the mascot ${msg}`);
    if (composer) assert.ok(!hit(r, composer), `not over the composer / its buttons ${msg}`);
  }
  // the usual case: docked above the composer -> to the left of the mascot, bottom aligned with the composer top - gap
  const vw = 1200; const vh = 800;
  const composer = { left: 300, right: 1190, top: 700, bottom: 790 };
  const mascot = { left: 1124, right: 1184, top: 628, bottom: 688 };
  assert.deepEqual(chipPos({ vw, vh, mascot, chip: { w: 220, h: 30 }, composer }), { left: 1124 - 12 - 220, top: 688 - 30, side: 'left' });
  assert.equal(CHIP_GAP, 12);
  assert.match(ct, /W\.chipPos\(/, 'content.js places the chip with chipPos');
  assert.match(ct, /\.chip \{ position: fixed;/, 'chip is out of the mascot column');
});

test('keyAction: Escape / arrows / Home / End / Space / Enter never mean send; Escape closes, arrows move, held Enter is swallowed', () => {
  const allowed = new Set(['close', 'hide', 'focus', 'native', 'none']);
  const keys = ['Escape', 'Esc', 'Enter', ' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab', 'a', 'Backspace'];
  for (const k of keys) for (const open of [true, false]) for (const index of [-1, 0, 1, 2]) for (const repeat of [true, false]) {
    const a = keyAction(k, { open, index, count: 3, repeat });
    assert.ok(allowed.has(a.type), `${k}: ${a.type}`);
    assert.equal(typeof a.preventDefault, 'boolean');
    if (k === 'Escape') assert.deepEqual(a, { type: open ? 'close' : 'hide', preventDefault: true });
    if (k.startsWith('Arrow') && open && index >= 0) assert.equal(a.type, 'focus');
    if ((k === 'Enter' || k === ' ') && repeat) assert.deepEqual(a, { type: 'none', preventDefault: true });
  }
  assert.equal(keyAction('ArrowRight', { open: true, index: 2 }).index, 0);
  assert.equal(keyAction('ArrowLeft', { open: true, index: 0 }).index, 2);
  assert.equal(keyAction('End', { open: true, index: 0 }).index, 2);
  assert.deepEqual(keyAction('Enter', { open: true, index: 2 }), { type: 'native', preventDefault: false });
});

/* ---------- content.js in a stubbed DOM: keys from the widget are stopped and never reach the send path ---------- */
function loadContent() {
  const sent = [];
  const listeners = {};
  const focusLog = [];
  const mk = (name, extra = {}) => ({ name, hidden: true, style: { setProperty() {} }, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, focus() { focusLog.push(name); shadowRoot.activeElement = this; }, replaceChildren() {}, querySelectorAll: () => [], getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0 }), ...extra });
  const faces = ['calm', 'rising', 'overloaded'].map((lv) => mk(`face:${lv}`, { dataset: { lv } }));
  const panel = mk('panel', { hidden: false, querySelectorAll: () => faces, querySelector: () => faces[0] });
  const parts = { '.panel': panel, '.main': mk('main'), '.preview': mk('preview'), '.wrap': mk('wrap'), '.chip': mk('chip'), '.chip-txt': mk('chip-txt'), '.offer': mk('offer') };
  const shadowRoot = { activeElement: faces[2], querySelector: (s) => parts[s] ?? null, querySelectorAll: (s) => (s === '.panel .face' ? faces : []) };
  const host = { id: 'tempoloon-load-fab', shadowRoot, style: {}, getBoundingClientRect: () => ({ right: 0, bottom: 0 }) };
  const composer = { tagName: 'TEXTAREA', value: '', dispatched: [], dispatchEvent(e) { this.dispatched.push(e); }, getAttribute: () => null, closest: () => null, getClientRects: () => [1] };
  const document = {
    querySelectorAll: (css) => (css.includes('textarea') ? [composer] : []), querySelector: () => null,
    getElementById: (id) => (id === 'tempoloon-load-fab' ? host : null), documentElement: { appendChild() {}, lang: '' },
    createElement: () => mk('el'), addEventListener() {}, execCommand: () => { throw new Error('execCommand must not run for a textarea'); },
  };
  const ctx = vm.createContext({
    document, location: { hostname: 'grok.com' }, setInterval() {}, setTimeout() {}, console, navigator: { language: 'en-US', clipboard: { writeText: async () => {} } },
    fetch: async () => { throw new Error('no network'); }, innerWidth: 1200, innerHeight: 800,
    chrome: { runtime: { getURL: (x) => x, sendMessage: async (m) => { sent.push(m); return {}; } } },
    Event: class { constructor(type, o) { this.type = type; Object.assign(this, o); } }, InputEvent: class {},
    addEventListener: (type, fn, cap) => { (listeners[type] ||= []).push({ fn, cap }); },
  });
  vm.runInContext(ct, ctx);
  return { ctx, sent, listeners, focusLog, faces, panel, parts, host, composer, shadowRoot };
}
const keyEvent = (key, path, extra = {}) => {
  const e = { type: 'keydown', key, repeat: false, isTrusted: true, stopped: false, prevented: false, composedPath: () => path, stopImmediatePropagation() { e.stopped = true; }, stopPropagation() { e.stopped = true; }, preventDefault() { e.prevented = true; }, ...extra };
  return e;
};

test('widget keys (Escape, Enter, Space, arrows) are stopped at the window and never reach the composer or the send path', async () => {
  const env = loadContent();
  const W = await import('../extension/lib/widget.js');
  env.ctx.__W = W; vm.runInContext('W = globalThis.__W;', env.ctx);
  for (const t of ['keydown', 'keypress', 'keyup']) assert.ok(env.listeners[t]?.some((l) => l.cap), `${t} capture listener on window`);
  const fire = (e) => { for (const l of env.listeners[e.type]) l.fn(e); return e; };
  const inside = [env.faces[2], env.host];
  // arrows move between faces (heavy -> calm wraps), Home/End
  let e = fire(keyEvent('ArrowRight', inside));
  assert.ok(e.stopped && e.prevented); assert.equal(env.focusLog.at(-1), 'face:calm');
  fire(keyEvent('End', [env.faces[0], env.host])); assert.equal(env.focusLog.at(-1), 'face:overloaded');
  // Enter / Space on a face: stopped for the page, default (button click) kept; keyup/keypress too
  for (const k of ['Enter', ' ']) {
    for (const type of ['keydown', 'keypress', 'keyup']) { e = fire(keyEvent(k, inside, { type })); assert.ok(e.stopped, `${type} ${k} stopped`); assert.equal(e.prevented, false); }
  }
  e = fire(keyEvent('Enter', inside, { repeat: true })); assert.ok(e.stopped && e.prevented, 'held Enter swallowed');
  // Escape with the panel open (heavy focused): closes, focus back to the mascot, nothing recorded or sent
  env.shadowRoot.activeElement = env.faces[2];
  e = fire(keyEvent('Escape', inside));
  assert.ok(e.stopped && e.prevented);
  assert.equal(env.panel.hidden, true);
  assert.equal(env.focusLog.at(-1), 'main');
  e = fire(keyEvent('Escape', [env.parts['.main'], env.host])); assert.ok(e.stopped);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(env.sent.filter((m) => m.type === 'record_load'), [], 'no pick from Escape/arrows/keys');
  assert.equal(env.composer.value, '', 'composer untouched');
  assert.deepEqual(env.composer.dispatched, [], 'no event dispatched to the composer');
  // keys typed in the page itself are left alone (only Escape closes an open panel)
  env.panel.hidden = false;
  e = fire(keyEvent('Enter', [env.composer]));
  assert.equal(e.stopped, false); assert.equal(e.prevented, false);
  e = fire(keyEvent('Escape', [env.composer]));
  assert.equal(e.stopped, false); assert.equal(env.panel.hidden, true);
});

test('composer writes are one line: newline notes are flattened, newline text is refused, and the user draft is kept', () => {
  const env = loadContent();
  const sel = { input: ['textarea'] };
  assert.equal(env.ctx.writeComposer(sel, 'NOTE.\n\nPlease rewrite.'), true);
  assert.equal(env.composer.value, 'NOTE. Please rewrite.');
  assert.ok(env.composer.dispatched.every((ev) => ev.type === 'input'), 'only a plain input event, never a key event');
  // a contenteditable composer only ever gets one flattened line through execCommand('insertText')
  const calls = [];
  const ce = { tagName: 'DIV', isContentEditable: true, focus() {}, firstElementChild: null };
  Object.assign(env.ctx.document, {
    execCommand: (...a) => { calls.push(a); return true; },
    createRange: () => ({ setStart() {}, collapse() {}, selectNodeContents() {} }),
    createTreeWalker: () => ({ nextNode: () => null }),
  });
  env.ctx.getSelection = () => ({ removeAllRanges() {}, addRange() {} });
  assert.equal(vm.runInContext('insertAtStart', env.ctx)(ce, 'NOTE.\n\nPlease rewrite.\u2028'), true);
  assert.deepEqual(calls, [['insertText', false, 'NOTE. Please rewrite. ']]);
  for (const c of calls) assert.doesNotMatch(String(c[2]), SUBMIT_CHARS);
  // the user's multi-line draft stays as it is: the note goes in front, Undo removes only the note
  env.composer.value = 'hello\nworld';
  assert.equal(vm.runInContext('insertAtStart', env.ctx)(env.composer, 'NOTE. '), true);
  assert.equal(env.composer.value, 'NOTE. hello\nworld');
  assert.equal(vm.runInContext('removeLeading', env.ctx)(env.composer, 'NOTE.'), true);
  assert.equal(env.composer.value, 'hello\nworld');
});
