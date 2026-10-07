// Floating brain-balloon mascot (the same head as the website: lib/mascot.js is a verbatim copy of docs/js/mascot.js),
// drawn inside a Shadow DOM so the chat page's CSS cannot touch it.
// Click = open three faces (light / medium / heavy). Picking one labels the moment and attaches a note to the NEXT
// message only (never sends). Hover = preview of the next reply's shape (preview only, nothing changes). Undo chip.
// NEVER SENDS: no form submit, no send-button press, no synthetic Enter key, and no line break is ever inserted into
// the composer (ProseMirror/tiptap composers turn an inserted line break into Enter = send). See lib/widget.js planPick/keyAction.
const N_TURNS = 8;
const HOST = location.hostname.replace(/^www\./, '');
const FAB_ID = 'tempoloon-load-fab';
const POS_KEY = 'tempoloon.ext.pos.v1';
const PREFS_KEY = 'tempoloon.ext.prefs.v1';
const REWRITE = 'Please rewrite your last answer more shortly and simply.'; // only PLACED in an empty box; the user sends it
const REWRITE_OFFER = 'Please rewrite your last answer as a short summary first, with the full details below.';
const FILLS = [REWRITE, REWRITE_OFFER];

async function loadSelectors() {
  try { return await (await fetch(chrome.runtime.getURL('selectors.json'))).json(); }
  catch { return {}; }
}
const KO = /^ko\b/i.test(document.documentElement?.lang || '') || /^ko\b/i.test(navigator.language || '');
const MSG = KO
  ? { noInput: '입력창을 찾지 못함 — 메모를 클립보드에 복사했어요. 입력창에 붙여넣기(Ctrl/⌘+V) 하세요.', copyFail: '입력창을 찾지 못함 — 아래 버튼으로 복사해 붙여넣으세요.', copy: '복사', ready: '다음 전송에 메모 준비됨', undo: '되돌리기', yes: '네, 좋아요', no: '지금은 괜찮아요', offer: '템포룬 제안' }
  : { noInput: 'Couldn’t find the chat box — the note is copied. Paste it (Ctrl/⌘+V).', copyFail: 'Couldn’t find the chat box — copy the note with the button and paste it.', copy: 'Copy', ready: 'Load note ready for next send', undo: 'Undo', yes: 'Yes, please', no: 'Not now', offer: 'Suggestion from Tempoloon' };

/** Candidate list: array in selectors.json (preferred) or a comma list. First visible, editable match wins. */
function candidates(v) { return Array.isArray(v) ? v : String(v || '').split(',').map((s) => s.trim()).filter(Boolean); }
function usable(el) {
  if (!el || el.closest('#tempoloon-load-fab')) return false;
  if (el.disabled || el.readOnly || el.getAttribute('aria-hidden') === 'true') return false;
  return el.getClientRects().length > 0;
}
function pickInput(sel) {
  for (const css of candidates(sel?.input)) {
    let list = [];
    try { list = [...document.querySelectorAll(css)]; } catch { continue; } // invalid selector: skip
    const hit = list.find(usable);
    if (hit) return hit;
  }
  return null;
}
function extractTurns(sel) {
  const turns = [];
  if (!sel?.messages) return turns;
  for (const n of document.querySelectorAll(sel.messages)) {
    const text = (n.innerText || '').trim().slice(0, 2000);
    if (!text) continue;
    turns.push({ role: 'ai', text });
  }
  return turns.slice(-N_TURNS);
}
/* ---------- composer writes: insert-only, single line, never sends ----------
   Only two edits ever happen: insert ONE line of our own text at the very start, or delete our own leading note.
   The user's draft (which may hold Shift+Enter line breaks) is never re-typed, so no line break is ever inserted. */
const SUBMIT_CHARS = /[\r\n\v\f\u0085\u2028\u2029]/;
const flat = (t) => (W ? W.oneLine(t) : String(t ?? '').replace(/[ \t]*[\r\n\v\f\u0085\u2028\u2029]+[ \t]*/g, ' '));
const isField = (el) => el?.tagName === 'TEXTAREA' || el?.tagName === 'INPUT';
/** React-controlled textareas ignore a plain .value write; use the native setter, then a plain input event (no key events). */
function setFieldValue(el, v) {
  const proto = el.tagName === 'TEXTAREA' ? globalThis.HTMLTextAreaElement?.prototype : globalThis.HTMLInputElement?.prototype;
  const desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc?.set && proto.isPrototypeOf(el)) desc.set.call(el, v); else el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
function textNodes(el) {
  const out = [];
  const walk = document.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) out.push(n);
  return out;
}
function selectRange(r) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
function caretToEnd(el) {
  if (isField(el)) { try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* type without selection */ } return; }
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); selectRange(r);
}
/** Insert one line of text at the very start of the composer. Refuses anything with a line break. */
function insertAtStart(el, text) {
  const t = flat(text);
  if (!el || !t || SUBMIT_CHARS.test(t)) return false;
  if (isField(el)) { setFieldValue(el, t + (el.value || '')); return true; }
  if (!el.isContentEditable) return false;
  el.focus();
  const r = document.createRange();
  const first = textNodes(el)[0];
  if (first) r.setStart(first, 0);
  else { let n = el; while (n.firstElementChild && !/^(BR|IMG)$/.test(n.firstElementChild.tagName)) n = n.firstElementChild; r.setStart(n, 0); }
  r.collapse(true);
  selectRange(r);
  try { return document.execCommand('insertText', false, t) !== false; } catch { return false; }
}
/** Delete our own note from the start of the composer (plus the spaces after it). Never touches the rest of the draft. */
function removeLeading(el, text) {
  const want = String(text || '').trim();
  if (!el || !want) return false;
  if (isField(el)) {
    const v = el.value || '';
    const lead = v.length - v.trimStart().length;
    if (!v.slice(lead).replace(/\u00a0/g, ' ').startsWith(want)) return false;
    setFieldValue(el, v.slice(lead + want.length).replace(/^[ \t\u00a0]+/, ''));
    return true;
  }
  if (!el.isContentEditable) return false;
  const chars = []; // [node, offset, char] across the composer's text nodes
  for (const n of textNodes(el)) for (let k = 0; k < n.data.length; k += 1) chars.push([n, k, n.data[k] === '\u00a0' ? ' ' : n.data[k]]);
  let p = 0;
  while (p < chars.length && /[ \t]/.test(chars[p][2])) p += 1;
  if (chars.slice(p, p + want.length).map((c) => c[2]).join('') !== want) return false;
  let q = p + want.length;
  while (q < chars.length && chars[q][2] === ' ') q += 1;
  const start = [chars[p][0], chars[p][1]];
  const last = chars[q - 1];
  const end = [last[0], last[1] + 1];
  el.focus();
  const r = document.createRange(); r.setStart(...start); r.setEnd(...end); selectRange(r);
  try { return document.execCommand('delete', false) !== false; } catch { return false; }
}
/** Empty the composer (only used when it holds nothing but our own note + fill). */
function clearComposer(el) {
  if (!el) return false;
  if (isField(el)) { setFieldValue(el, ''); return true; }
  if (!el.isContentEditable) return false;
  el.focus();
  const r = document.createRange(); r.selectNodeContents(el); selectRange(r);
  try { return document.execCommand('delete', false) !== false; } catch { return false; }
}
/** Apply a {clear, remove, insert} plan from lib/widget.js. */
function runPlan(el, plan) {
  if (plan.clear && !clearComposer(el)) return false;
  if (!plan.clear && plan.remove && !removeLeading(el, plan.remove)) return false;
  if (plan.insert) { if (!insertAtStart(el, plan.insert)) return false; caretToEnd(el); }
  return true;
}
function getInputText(el) {
  if (!el) return '';
  return el.value ?? el.innerText ?? '';
}

/* ---------- mascot widget (Shadow DOM) ---------- */
/** Element inside the widget's shadow root (null when the widget is not mounted). */
const $ui = (s) => document.getElementById(FAB_ID)?.shadowRoot?.querySelector(s) ?? null;
let M = null; // lib/mascot.js (drawing)
let W = null; // lib/widget.js (pure state / wording / layout)
async function loadLibs() {
  try {
    [M, W] = await Promise.all([import(chrome.runtime.getURL('lib/mascot.js')), import(chrome.runtime.getURL('lib/widget.js'))]);
  } catch { M = null; W = null; } // the widget still works as a plain coloured circle
}
const FALLBACK_HEX = { calm: '#2F5DA8', rising: '#B45F06', overloaded: '#B3124F' };
const FALLBACK_TXT = { face: { calm: 'Light', rising: 'Medium', overloaded: 'Heavy' }, mascot: 'Tempoloon load faces', group: 'Next reply style', undo: 'Undo' };
const LEVEL_LIST = ['calm', 'rising', 'overloaded'];
const RANK = { calm: 0, rising: 1, overloaded: 2 };
const LANG = KO ? 'ko' : 'en';
const T = () => (W ? W.strings(LANG) : FALLBACK_TXT);
const hexOf = (lv) => (W ? W.stateFor(lv).outline : FALLBACK_HEX[lv] || FALLBACK_HEX.calm);
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const CSS = `
:host { all: initial; }
.wrap { position: relative; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; font: 600 13px/1.3 system-ui, -apple-system, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; color: #14172B; --c: #2F5DA8; }
[hidden] { display: none !important; }
button { font: inherit; color: inherit; }
button:focus-visible { outline: 3px solid var(--c); outline-offset: 3px; box-shadow: 0 0 0 6px #fff; }
.main { width: 60px; height: 60px; padding: 0; border: 0; background: transparent; border-radius: 50%; cursor: pointer; touch-action: none; -webkit-tap-highlight-color: transparent; }
.main.dragging { cursor: grabbing; }
.main { position: relative; }
.puffs { position: absolute; right: 2px; top: 6px; width: 0; height: 0; pointer-events: none; }
.puffs i { position: absolute; left: 0; top: 0; width: 9px; height: 9px; border-radius: 50%; border: 2px solid #0D1B2A; opacity: 0; }
.jit, .art { width: 100%; height: 100%; }
.art { filter: drop-shadow(0 3px 5px rgba(13,27,42,.35)); }
.art svg, .face-art svg { width: 100%; height: 100%; display: block; overflow: visible; }
.fallback { width: 100%; height: 100%; border-radius: 50%; background: var(--c); }
.mc-stroke { stroke: #0D1B2A; } .mc-fill { fill: #0D1B2A; } .mc-hl { fill: #fff; } .mc-sweat { fill: #2F5DA8; } .mc-spark { fill: #B45F06; } .mc-air { fill: none; }
.mc-shake, .mc-breath { transform-box: view-box; transform-origin: 100px 120px; }
.panel { display: flex; gap: 6px; padding: 6px; border-radius: 16px; background: #fff; border: 1px solid #D6DCE8; box-shadow: 0 8px 22px rgba(13,27,42,.22); }
.face { width: 52px; height: 52px; padding: 5px; border-radius: 12px; border: 2px solid transparent; background: #F4F7FB; cursor: pointer; }
.face[aria-pressed="true"] { border-color: var(--fc); background: #fff; }
.face:hover { border-color: var(--fc); }
.face-art { width: 100%; height: 100%; pointer-events: none; }
.preview { position: fixed; width: 196px; box-sizing: border-box; padding: 8px 10px; border-radius: 12px; background: #fff; border: 2px solid var(--pc, #2F5DA8); box-shadow: 0 10px 24px rgba(13,27,42,.22); pointer-events: none; }
.p-title { display: block; font-weight: 800; font-size: 12.5px; color: var(--pc, #2F5DA8); }
.p-detail { display: block; font-weight: 500; font-size: 11.5px; color: #4A5468; margin: 2px 0 6px; }
.bars { display: flex; flex-direction: column; gap: 4px; }
.bars i { display: block; height: 6px; border-radius: 3px; width: var(--w); background: var(--pc, #2F5DA8); transform-origin: left center; }
.bars i.off { opacity: .16; transform: scaleX(.3); }
.p-tip { display: block; font-weight: 500; font-size: 10.5px; color: #6B7487; margin-top: 6px; }
.chip { display: flex; gap: 8px; align-items: center; background: #E4ECFA; color: #14172B; padding: 6px 10px; border-radius: 999px; font-size: 12px; max-width: 240px; box-shadow: 0 4px 12px rgba(13,27,42,.15); }
.chip.warn { background: #FFF1D6; color: #3B2600; border: 1px solid #B45F06; border-radius: 12px; flex-wrap: wrap; }
.undo { border: none; background: transparent; color: #2F5DA8; font-weight: 700; cursor: pointer; padding: 2px 4px; border-radius: 6px; }
.copy { border: 1px solid #B45F06; background: #fff; color: #3B2600; border-radius: 8px; padding: 2px 8px; font-weight: 700; cursor: pointer; }
.offer { width: 230px; background: #fff; color: #14172B; border: 2px solid #2F5DA8; border-radius: 12px; padding: 8px 10px; box-shadow: 0 6px 16px rgba(13,27,42,.2); }
.offer-txt { margin: 0 0 6px; }
.offer-row { display: flex; gap: 6px; }
.offer-row button { border-radius: 8px; border: 1px solid #C5CEDE; background: #F4F7FB; padding: 4px 8px; cursor: pointer; }
.offer-row .yes { background: #2F5DA8; color: #fff; border-color: #2F5DA8; }
@media (prefers-reduced-motion: no-preference) {
  .mc-breathe { animation: mc-breathe 5s ease-in-out infinite; }
  .mc-sweat { animation: mc-drip 2.6s ease-in infinite; }
  .mc-shake { animation: mc-tremble .27s linear infinite; }
  .face .mc-shake, .face .mc-sweat { animation: none; }
  @keyframes mc-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.045); } }
  @keyframes mc-tremble { 0%, 100% { transform: translate(calc(var(--shake, 0) * 2.6px), calc(var(--shake, 0) * -1.4px)); } 50% { transform: translate(calc(var(--shake, 0) * -2.8px), calc(var(--shake, 0) * 1.8px)); } }
  @keyframes mc-drip { 0% { transform: translateY(-4px); opacity: 0; } 25% { opacity: 1; } 100% { transform: translateY(12px); opacity: 0; } }
  /* exaggerated on purpose at 60px: the break state swells and jitters, rising wobbles a little */
  .wrap[data-level="overloaded"] .main .art { animation: att-swell 1.5s ease-in-out infinite; }
  .wrap[data-level="overloaded"] .main .jit { animation: att-jitter .26s linear infinite; }
  .wrap[data-level="rising"] .main .jit { animation: att-wobble 1.8s ease-in-out infinite; }
  @keyframes att-swell { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
  @keyframes att-jitter { 0%, 100% { transform: translate(1.2px, -.6px) rotate(2deg); } 25% { transform: translate(-1.4px, .8px) rotate(-2.5deg); } 50% { transform: translate(.8px, 1px) rotate(1.5deg); } 75% { transform: translate(-1px, -1px) rotate(-1.8deg); } }
  @keyframes att-wobble { 0%, 100% { transform: rotate(0); } 30% { transform: rotate(-3deg); } 70% { transform: rotate(3deg); } }
  /* "pshh": three air puffs burst out of the head while it deflates */
  .main.pshh .puffs i { animation: att-puff 1s ease-out both; }
  .main.pshh .puffs i:nth-child(2) { animation-delay: .12s; --dx: 20px; --dy: -8px; }
  .main.pshh .puffs i:nth-child(3) { animation-delay: .24s; --dx: 12px; --dy: -22px; }
  @keyframes att-puff { from { opacity: .9; transform: translate(0, 0) scale(.4); } to { opacity: 0; transform: translate(var(--dx, 18px), var(--dy, -16px)) scale(1.3); } }
  .face-art { transition: transform .15s ease; }
  .face:hover .face-art, .face:focus-visible .face-art { transform: translateY(-2px) scale(1.08); }
  .panel:not([hidden]), .preview:not([hidden]), .offer:not([hidden]) { animation: att-in .18s ease-out both; }
  @keyframes att-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .preview:not(.static) .bars i.off { animation: att-shrink .55s ease .18s both; }
  @keyframes att-shrink { from { opacity: 1; transform: scaleX(1); } to { opacity: .16; transform: scaleX(.3); } }
}
`;

let onOffer = () => {};
let lastPick = () => {};
let level = 'calm';
let userPos = null; // dragged position {right,bottom} (chrome.storage.local), null = docked above the composer
let selRef = null;
let previewMode = null;
let animId = 0;

function paintMascot(box, pose) {
  if (!M) return;
  M.renderMascot(box, pose);
  const head = box.querySelector('.mc-tint'); // solid tinted head (mascot.js draws a 26% tint; the widget wants it opaque)
  if (head) { head.setAttribute('fill', pose.tint); head.setAttribute('fill-opacity', '1'); }
}
function poseNow(lv) { return W ? W.poseFor(lv, { reduced: reduced() }) : null; }
function animatePose(fn, ms, done) {
  globalThis.cancelAnimationFrame?.(animId);
  const art = $ui('.main .art');
  if (!art || !M || !W || reduced()) { done(); return; }
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    paintMascot(art, fn(t));
    if (t < 1) animId = requestAnimationFrame(step); else done();
  };
  animId = requestAnimationFrame(step);
}
/** Show a level: colour + size + face + motion. Up = swell with overshoot; down = "pshh" deflate with escaping air. */
function setLevel(next, { animate = true } = {}) {
  const prev = level;
  level = LEVEL_LIST.includes(next) ? next : 'calm';
  const wrap = $ui('.wrap');
  if (!wrap) return;
  wrap.dataset.level = level;
  wrap.style.setProperty('--c', hexOf(level));
  $ui('.main')?.setAttribute('aria-label', `${T().mascot} (${T().face[level]})`);
  for (const b of $ui('.panel')?.querySelectorAll('.face') || []) b.setAttribute('aria-pressed', String(b.dataset.lv === level));
  const art = $ui('.main .art');
  if (!M || !W) { if (art) art.innerHTML = '<div class="fallback"></div>'; return; }
  const settle = () => paintMascot(art, poseNow(level));
  if (!animate || prev === level) { settle(); return; }
  if (RANK[level] > RANK[prev]) { animatePose((t) => W.inflatePose(prev, level, t), 650, settle); return; }
  const target = level;
  const main = $ui('.main');
  if (main && !reduced()) { main.classList.remove('pshh'); void main.offsetWidth; main.classList.add('pshh'); setTimeout(() => main.classList.remove('pshh'), 1400); }
  animatePose((t) => W.deflatePose(prev, t, target), 1100, () => {
    if (target !== 'calm') { settle(); return; }
    paintMascot(art, { ...poseNow('calm'), face: 'bright', breathing: false }); // relieved face for a moment, then calm
    setTimeout(() => { if (level === 'calm') settle(); }, 1400);
  });
}

function showPreview(lv, mode) {
  const box = $ui('.preview');
  if (!box || !W) return;
  const p = W.previewFor(lv, LANG, mode);
  previewMode = mode;
  box.style.setProperty('--pc', hexOf(p.level));
  box.dataset.level = p.level;
  box.classList.toggle('static', reduced());
  const title = document.createElement('span'); title.className = 'p-title'; title.textContent = p.title;
  const detail = document.createElement('span'); detail.className = 'p-detail'; detail.textContent = p.detail;
  const bars = document.createElement('div'); bars.className = 'bars';
  for (let i = 0; i < 5; i += 1) {
    const b = document.createElement('i');
    b.className = i < p.lines ? 'on' : 'off';
    b.style.setProperty('--w', `${92 - i * 11}%`);
    bars.append(b);
  }
  const tip = document.createElement('span'); tip.className = 'p-tip'; tip.textContent = p.tip;
  box.replaceChildren(title, detail, bars, tip);
  box.hidden = false;
  placePreview();
}
/** The preview sits next to the open faces (or the mascot), on whichever side has room. Fixed position, viewport px. */
function placePreview() {
  const box = $ui('.preview');
  const anchor = isOpen() ? $ui('.panel') : $ui('.main');
  if (!box || box.hidden || !anchor) return;
  const r = anchor.getBoundingClientRect();
  const w = box.offsetWidth || 196;
  const roomLeft = r.left - 10 >= w + 4;
  box.style.left = `${Math.round(roomLeft ? r.left - 10 - w : Math.min(innerWidth - w - 4, r.right + 10))}px`;
  box.style.top = 'auto';
  box.style.bottom = `${Math.round(Math.max(4, innerHeight - r.bottom))}px`;
}
function hidePreview() { const b = $ui('.preview'); if (b) b.hidden = true; previewMode = null; }

function isOpen() { return $ui('.panel')?.hidden === false; }
function openPanel() {
  const panel = $ui('.panel');
  if (!panel) return;
  hidePreview();
  panel.hidden = false;
  $ui('.main')?.setAttribute('aria-expanded', 'true');
  (panel.querySelector(`.face[data-lv="${level}"]`) || panel.querySelector('.face'))?.focus();
}
function closePanel({ refocus = false } = {}) {
  const panel = $ui('.panel');
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  $ui('.main')?.setAttribute('aria-expanded', 'false');
  hidePreview();
  if (refocus) $ui('.main')?.focus();
}

/** Docked above the composer (or the dragged spot), always on screen. */
function place() {
  const host = document.getElementById(FAB_ID);
  if (!host || !W) return;
  const vw = innerWidth; const vh = innerHeight;
  let pos = userPos ? W.clampPos(userPos, { vw, vh }) : null;
  if (!pos) {
    const input = selRef ? pickInput(selRef) : null;
    const box = input?.closest?.('form') || input;
    const rect = box?.getBoundingClientRect?.() || null;
    pos = { right: W.MARGIN, bottom: W.dockBottom({ vw, vh, composer: rect }) };
  }
  host.style.right = `${pos.right}px`;
  host.style.bottom = `${pos.bottom}px`;
  placePreview();
}

function ensureUI(onPick) {
  lastPick = onPick;
  if (document.getElementById(FAB_ID)) return;
  const host = document.createElement('div');
  host.id = FAB_ID;
  // Inline position so the mascot floats bottom-right even if the page overrides styles; the rest lives in the shadow root.
  host.style.cssText = 'all:initial;position:fixed;right:16px;bottom:88px;z-index:2147483646;';
  const root = host.attachShadow({ mode: 'open' });
  const t = T();
  root.innerHTML = `<style>${CSS}</style>
    <div class="wrap" data-level="calm">
      <div class="offer" role="group" aria-label="${MSG.offer}" hidden>
        <p class="offer-txt"></p>
        <div class="offer-row"><button type="button" class="yes">${MSG.yes}</button><button type="button" class="no">${MSG.no}</button></div>
      </div>
      <div class="chip" role="status" hidden><span class="chip-txt"></span><button type="button" class="copy" hidden>${MSG.copy}</button><button type="button" class="undo">${MSG.undo}</button></div>
      <div class="panel" id="tempoloon-faces" role="group" aria-label="${t.group}" hidden></div>
      <div class="preview" id="tempoloon-preview" role="note" hidden></div>
      <button type="button" class="main" aria-describedby="tempoloon-preview" aria-haspopup="true" aria-expanded="false" aria-controls="tempoloon-faces"><div class="jit"><div class="art"></div></div><span class="puffs" aria-hidden="true"><i></i><i></i><i></i></span></button>
    </div>`;
  const panel = root.querySelector('.panel');
  for (const lv of LEVEL_LIST) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'face';
    b.dataset.lv = lv;
    b.setAttribute('aria-label', t.face[lv]);
    b.setAttribute('aria-pressed', String(lv === level));
    b.setAttribute('aria-describedby', 'tempoloon-preview');
    b.style.setProperty('--fc', hexOf(lv));
    const art = document.createElement('div');
    art.className = 'face-art';
    b.append(art);
    panel.append(b);
    if (M && W) paintMascot(art, W.poseFor(lv, { mini: true, reduced: true }));
    else { art.innerHTML = '<div class="fallback"></div>'; art.firstChild.style.background = hexOf(lv); }
    // click (mouse, or Enter/Space on the focused face: detail 0) = pick. A pick only places a note; it never sends.
    b.addEventListener('click', (e) => { closePanel({ refocus: true }); pick(lv, { viaKeyboard: e.detail === 0 }); });
    b.addEventListener('mouseenter', () => showPreview(lv, 'next'));
    b.addEventListener('focus', () => showPreview(lv, 'next'));
    b.addEventListener('mouseleave', () => hidePreview());
  }
  document.documentElement.appendChild(host);

  const main = root.querySelector('.main');
  // drag to move (position kept in chrome.storage.local); a real drag never counts as a click
  let drag = null; let suppressClick = false;
  main.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const r = host.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, right: innerWidth - r.right, bottom: innerHeight - r.bottom, moved: false, id: e.pointerId };
    try { main.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  });
  main.addEventListener('pointermove', (e) => {
    if (!drag || !W) return;
    const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) { drag.moved = true; main.classList.add('dragging'); hidePreview(); closePanel(); }
    userPos = W.clampPos({ right: drag.right - dx, bottom: drag.bottom - dy }, { vw: innerWidth, vh: innerHeight });
    place();
  });
  const endDrag = () => {
    if (drag?.moved) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); main.classList.remove('dragging'); chrome.storage?.local?.set({ [POS_KEY]: userPos }); }
    drag = null;
  };
  main.addEventListener('pointerup', endDrag);
  main.addEventListener('pointercancel', endDrag);
  main.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    if (isOpen()) closePanel(); else openPanel();
  });
  main.addEventListener('mouseenter', () => { if (!isOpen() && !drag?.moved) showPreview(level, 'now'); });
  main.addEventListener('mouseleave', () => { if (previewMode === 'now') hidePreview(); });
  main.addEventListener('focus', () => { if (!isOpen()) showPreview(level, 'now'); });
  main.addEventListener('blur', () => { if (previewMode === 'now') hidePreview(); });
  panel.addEventListener('focusout', (e) => { if (!panel.contains(e.relatedTarget)) hidePreview(); });

  root.querySelector('.offer .yes').addEventListener('click', () => onOffer('accept'));
  root.querySelector('.offer .no').addEventListener('click', () => onOffer('reject'));
  root.querySelector('.copy').addEventListener('click', async () => { if (fallbackText) await copyText(fallbackText); });
  root.querySelector('.undo').addEventListener('click', (e) => undoPick({ viaKeyboard: e.detail === 0 }));

  setLevel(level, { animate: false });
  place();
}

/* Keys. Every key event that starts inside the widget (Escape, Enter, Space, arrows, Home/End, Tab...) is stopped at the
   window capture phase, so no page or composer handler ever sees it; the widget then acts on it itself (lib/widget.js keyAction:
   close / hide / move focus / let the focused widget button click). Escape from the page only closes the panel. */
const FALLBACK_KEY = (key, { open }) => (key === 'Escape' ? { type: open ? 'close' : 'hide', preventDefault: true } : { type: 'none', preventDefault: false });
function onKey(e) {
  const host = document.getElementById(FAB_ID);
  const inside = Boolean(host) && Boolean(e.composedPath?.().includes(host));
  if (!inside) {
    if (e.type !== 'keydown' || e.key !== 'Escape') return;
    if (isOpen()) closePanel(); else hidePreview(); // the page keeps its own Escape (and its focus)
    return;
  }
  e.stopImmediatePropagation();
  if (e.type !== 'keydown') return;
  const root = host.shadowRoot;
  const faces = [...(root?.querySelectorAll('.panel .face') || [])];
  const opts = { open: isOpen(), index: faces.indexOf(root?.activeElement), count: faces.length, repeat: e.repeat };
  const a = (W ? W.keyAction : FALLBACK_KEY)(e.key, opts);
  if (a.preventDefault) e.preventDefault();
  if (a.type === 'close') closePanel({ refocus: true });
  else if (a.type === 'hide') hidePreview();
  else if (a.type === 'focus') faces[a.index]?.focus();
  // 'native' (Enter/Space): the focused widget button's own click runs (open faces / pick / Undo). Nothing is sent.
}
for (const type of ['keydown', 'keypress', 'keyup']) globalThis.addEventListener?.(type, onKey, true);
globalThis.addEventListener?.('pointerdown', (e) => {
  const host = document.getElementById(FAB_ID);
  if (host && isOpen() && !e.composedPath().includes(host)) closePanel();
}, true);
globalThis.addEventListener?.('resize', () => place());

function showChip(text, message = MSG.ready) {
  const chip = $ui('.chip');
  const txt = $ui('.chip-txt');
  if (!chip || !txt) return;
  txt.textContent = text ? message : '';
  chip.hidden = !text;
  chip.classList.remove('warn');
  const copyBtn = chip.querySelector('.copy');
  if (copyBtn) copyBtn.hidden = true;
}

/* Fallback when the composer cannot be found (e.g. a redesigned or logged-in layout):
   keep the mascot floating bottom-right, show a "couldn't find the chat box" chip, copy the note to the clipboard. */
let fallbackText = '';
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch { return false; }
}
async function composerFallback(text) {
  fallbackText = text;
  const ok = await copyText(text);
  const chip = $ui('.chip');
  if (!chip) return ok;
  chip.querySelector('.chip-txt').textContent = ok ? MSG.noInput : MSG.copyFail;
  chip.classList.add('warn');
  const copyBtn = chip.querySelector('.copy');
  copyBtn.textContent = MSG.copy;
  copyBtn.hidden = false;
  chip.hidden = false;
  return ok;
}
/** Put one line of text in front of the composer text, or fall back to clipboard + chip. Never sends. */
function writeComposer(sel, text) {
  const input = pickInput(sel);
  if (input && insertAtStart(input, text)) return true;
  composerFallback(flat(text));
  return false;
}
/**
 * Place (or swap) the load note for the NEXT manual send: lib/widget.js planPick decides; runPlan only inserts one line at the
 * start or deletes our own leading note. An empty box gets note + fill (a rewrite request) that the user may send or edit.
 */
function applyNote(sel, note, fill) {
  const input = pickInput(sel);
  const oldNote = lastPrefix;
  lastPrefix = flat(note);
  if (!W) { if (note) composerFallback(flat(note + (getInputText(input).trim() ? '' : fill))); return false; }
  const plan = W.planPick({ current: getInputText(input), oldNote, note, fill, fills: FILLS });
  if (!plan.clear && !plan.remove && !plan.insert) return true;
  if (input && runPlan(input, plan)) return true;
  if (plan.insert) composerFallback(plan.insert);
  return false;
}
/** After a keyboard-driven pick/Undo, focus goes back to the mascot (not left in the composer). */
function refocusMascot(viaKeyboard) { if (viaKeyboard) $ui('.main')?.focus(); }

/* ---------- pick + undo ---------- */
let undoState = null; // { prevLevel, prefix }
let lastPrefix = ''; // note currently placed in the composer by the last pick
function pick(lv, opts = {}) {
  undoState = { prevLevel: level, prefix: '' };
  setLevel(lv); // the mascot answers at once; the note itself is prepared by the pick handler
  lastPick(lv, opts);
}
/** Undo: drop the pending note, take it back out of the composer, and show the previous level again. */
async function undoPick({ viaKeyboard = false } = {}) {
  const prev = undoState?.prevLevel ?? 'calm';
  const prefix = (undoState?.prefix || '').trim();
  undoState = null;
  lastPrefix = '';
  setLevel(prev);
  await chrome.runtime.sendMessage({ type: 'clear_pending', level: prev });
  if (prefix && selRef && W) {
    const input = pickInput(selRef);
    if (input) runPlan(input, W.planUndo({ current: getInputText(input), note: prefix, fills: FILLS }));
  }
  const chip = $ui('.chip');
  if (chip) chip.hidden = true;
  refocusMascot(viaKeyboard);
}

/* ---------- automatic suggestion (action phrasing only; daily cap + backoff live in background) ---------- */
const recentSends = [];
let pendingOffer = null; // { trigger }
const words = (t) => new Set((String(t).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []));
function similar(a, b) {
  const A = words(a); const B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / (A.size + B.size - n);
}
function hideOffer() { const o = $ui('.offer'); if (o) o.hidden = true; }
async function answerOffer(outcome, sel) {
  const p = pendingOffer; pendingOffer = null; hideOffer();
  if (!p) return;
  const res = await chrome.runtime.sendMessage({ type: 'suggest_outcome', outcome, trigger: p.trigger, host: HOST });
  if (outcome === 'accept' && res?.pendingPrefix) {
    const note = flat(res.pendingPrefix);
    undoState = { prevLevel: level, prefix: note };
    showChip(note);
    // Never sends: only prepares the composer text (or copies it when the composer is missing).
    applyNote(sel, note, REWRITE_OFFER);
  }
}
async function onUserSend(text, sel) {
  const t = String(text || '').trim();
  if (!t) return;
  if (pendingOffer) { const p = pendingOffer; pendingOffer = null; hideOffer(); await chrome.runtime.sendMessage({ type: 'suggest_outcome', outcome: 'ignore', trigger: p.trigger, host: HOST }); return; }
  const repeat = recentSends.slice(-3).some((x) => similar(x, t) >= 0.6);
  recentSends.push(t); if (recentSends.length > 6) recentSends.shift();
  if (!repeat) return;
  const res = await chrome.runtime.sendMessage({ type: 'suggest_check', trigger: 'loop' });
  if (!res?.ok) return;
  pendingOffer = { trigger: 'loop' };
  const o = $ui('.offer');
  if (!o) return;
  o.querySelector('.offer-txt').textContent = res.text;
  o.hidden = false;
}
function watchSends(sel) {
  // OBSERVE ONLY: notice the user's own (trusted) Enter / send-button presses and read the composer text before it clears.
  // Never preventDefault, never re-dispatch, never send: the note is already in the box, the page sends it as usual.
  document.addEventListener('keydown', (e) => {
    if (!e.isTrusted || e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    const input = pickInput(sel);
    if (input && (e.target === input || input.contains(e.target))) onUserSend(getInputText(input), sel);
  }, true);
  document.addEventListener('pointerdown', (e) => {
    if (!e.isTrusted) return;
    const btn = candidates(sel?.submit || 'form button[type="submit"]').map((css) => { try { return e.target.closest?.(css); } catch { return null; } }).find(Boolean);
    if (btn) onUserSend(getInputText(pickInput(sel)), sel);
  }, true);
}

(async () => {
  const all = await loadSelectors();
  const sel = all[HOST] || all['chatgpt.com'];
  selRef = sel;
  await loadLibs();
  try {
    const st = await chrome.runtime.sendMessage({ type: 'get_status' });
    if (LEVEL_LIST.includes(st?.prefs?.level)) level = st.prefs.level;
    userPos = (await chrome.storage?.local?.get(POS_KEY))?.[POS_KEY] || null;
  } catch { /* first run / no background yet: calm, docked */ }
  // SPA pages can wipe injected nodes: re-attach the floating mascot if it disappears, and keep it above the composer.
  setInterval(() => { if (!document.getElementById(FAB_ID)) ensureUI(lastPick); else place(); }, 2000);
  // popup picks / position reset show up here too
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    const lv = changes[PREFS_KEY]?.newValue?.level;
    if (lv && lv !== level) setLevel(lv);
    if (POS_KEY in changes) { userPos = changes[POS_KEY].newValue || null; place(); }
  });
  watchSends(sel);
  onOffer = (outcome) => answerOffer(outcome, sel);
  ensureUI(async (lv, { viaKeyboard = false } = {}) => {
    if (pendingOffer) { pendingOffer = null; hideOffer(); } // a manual pick supersedes an open offer
    const turns = extractTurns(sel);
    const res = await chrome.runtime.sendMessage({
      type: 'record_load',
      level: lv,
      recentTurns: turns.length,
      signals: { host: HOST, turnSample: turns.length },
    });
    const prefix = flat(res?.pendingPrefix || '');
    if (undoState) undoState.prefix = prefix;
    showChip(prefix);
    // a new pick replaces the note from the previous pick instead of stacking two notes; an empty box gets the
    // optional rewrite request (one line, PLACED only: the user still sends it themselves)
    applyNote(sel, prefix, REWRITE);
    refocusMascot(viaKeyboard);
  });
})();
