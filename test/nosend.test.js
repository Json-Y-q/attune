// Extension 0.3.1 regression: the extension must NEVER send a chat message. It only places a one-line note in the composer
// for the user's next manual send (with Undo). Live bug in 0.3.0 on grok.com: a heavy pick inserted the note + rewrite request
// with "\n\n" via execCommand('insertText') into the ProseMirror composer; ProseMirror reads an inserted paragraph as an Enter
// key press (prosemirror-view readDOMChange -> looksLikeEnter -> handleKeyDown(Enter)) and Grok's Enter = send.
// Static source checks + pure logic + the content script in a stubbed DOM (node:vm). No browser, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { SUBMIT_CHARS, oneLine, planPick, planUndo, keyAction } from '../extension/lib/widget.js';
import { prefixForLevel, rewritePrompt } from '../extension/lib/labels.js';

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
  assert.doesNotMatch(rewritePrompt(), SUBMIT_CHARS);
  for (const m of ct.matchAll(/const (REWRITE|REWRITE_OFFER) = '([^']*)'/g)) assert.doesNotMatch(m[2], SUBMIT_CHARS, m[1]);
  assert.equal(oneLine('A.\n\nB'), 'A. B');
  assert.equal(oneLine('A.\r\n'), 'A. ');
  assert.equal(oneLine('x\u2028y\u2029z\u0085w\vq\fr'), 'x y z w q r');
  assert.doesNotMatch(oneLine(prefixForLevel('overloaded') + '\n\n'), SUBMIT_CHARS);
});

test('planPick / planUndo: only one-line inserts at the start or removal of our own note; the user draft is never re-typed', () => {
  const R = 'Please rewrite your last answer more shortly and simply.';
  const fills = [R, 'Please rewrite your last answer as a short summary first, with the full details below.'];
  const heavy = prefixForLevel('overloaded'); const medium = prefixForLevel('rising');
  const drafts = ['', 'hello', 'hello\nworld', 'line 1\r\n\r\nline 2\u2028x', '   spaced  '];
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
  const host = { id: 'attune-load-fab', shadowRoot, style: {}, getBoundingClientRect: () => ({ right: 0, bottom: 0 }) };
  const composer = { tagName: 'TEXTAREA', value: '', dispatched: [], dispatchEvent(e) { this.dispatched.push(e); }, getAttribute: () => null, closest: () => null, getClientRects: () => [1] };
  const document = {
    querySelectorAll: (css) => (css.includes('textarea') ? [composer] : []), querySelector: () => null,
    getElementById: (id) => (id === 'attune-load-fab' ? host : null), documentElement: { appendChild() {}, lang: '' },
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
