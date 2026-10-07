// Floating mascot: pick a load face → label + attach instruction to next send (no confirm when instantApply).
const N_TURNS = 8;
const HOST = location.hostname.replace(/^www\./, '');

async function loadSelectors() {
  try { return await (await fetch(chrome.runtime.getURL('selectors.json'))).json(); }
  catch { return {}; }
}
const KO = /^ko/i.test(navigator.language || '');
const MSG = KO
  ? { noInput: '입력창을 찾지 못함 — 메모를 클립보드에 복사했어요. 입력창에 붙여넣기(Ctrl/⌘+V) 하세요.', copyFail: '입력창을 찾지 못함 — 아래 버튼으로 복사해 붙여넣으세요.', copy: '복사', ready: '다음 전송에 메모 준비됨' }
  : { noInput: 'Couldn’t find the chat box — the note is copied. Paste it (Ctrl/⌘+V).', copyFail: 'Couldn’t find the chat box — copy the note with the button and paste it.', copy: 'Copy', ready: 'Load note ready for next send' };

/** Candidate list: array in selectors.json (preferred) or a comma list. First visible, editable match wins. */
function candidates(v) { return Array.isArray(v) ? v : String(v || '').split(',').map((s) => s.trim()).filter(Boolean); }
function usable(el) {
  if (!el || el.closest('#attune-load-fab')) return false;
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
function setInputText(el, text) {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    el.value = text; el.dispatchEvent(new Event('input', { bubbles: true })); return true;
  }
  if (el.isContentEditable) {
    el.focus();
    try { document.execCommand('selectAll', false, null); document.execCommand('insertText', false, text); }
    catch { el.textContent = text; el.dispatchEvent(new InputEvent('input', { bubbles: true })); }
    return true;
  }
  return false;
}
function getInputText(el) {
  if (!el) return '';
  return el.value ?? el.innerText ?? '';
}

let onOffer = () => {};
let lastPick = () => {};
function ensureUI(onPick) {
  lastPick = onPick;
  if (document.getElementById('attune-load-fab')) return;
  const root = document.createElement('div');
  root.id = 'attune-load-fab';
  // Inline fallback so the mascot floats bottom-right even if the page blocks or overrides content.css.
  root.style.cssText = 'position:fixed;right:16px;bottom:88px;z-index:2147483646;';
  root.innerHTML = `
    <button type="button" class="attune-mc" aria-label="Open load faces" title="Attune mascot — pick how heavy it feels">🎈</button>
    <div class="attune-faces" hidden>
      <button type="button" data-lv="calm" title="Calm">😌</button>
      <button type="button" data-lv="rising" title="A bit heavy">😐</button>
      <button type="button" data-lv="overloaded" title="Overloaded">😣</button>
    </div>
    <div class="attune-chip" role="status" hidden><span class="attune-chip-txt"></span><button type="button" class="attune-copy" hidden>Copy</button><button type="button" class="attune-undo">Undo</button></div>
    <div class="attune-offer" role="group" aria-label="Suggestion from Attune" hidden>
      <p class="attune-offer-txt"></p>
      <div class="attune-offer-row"><button type="button" class="attune-offer-yes">Yes, please</button><button type="button" class="attune-offer-no">Not now</button></div>
    </div>
  `;
  // Use textContent for faces via emoji as lightweight stand-in (full SVG mascot ships on the docs site).
  document.documentElement.appendChild(root);
  const faces = root.querySelector('.attune-faces');
  root.querySelector('.attune-mc').addEventListener('click', () => { faces.hidden = !faces.hidden; });
  faces.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { faces.hidden = true; onPick(b.dataset.lv); }));
  root.querySelector('.attune-offer-yes').addEventListener('click', () => onOffer('accept'));
  root.querySelector('.attune-offer-no').addEventListener('click', () => onOffer('reject'));
  root.querySelector('.attune-copy').addEventListener('click', async () => { if (fallbackText) await copyText(fallbackText); });
  root.querySelector('.attune-undo').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'clear_pending' });
    root.querySelector('.attune-chip').hidden = true;
  });
}

function showChip(text, message = MSG.ready) {
  const chip = document.querySelector('#attune-load-fab .attune-chip');
  const txt = document.querySelector('#attune-load-fab .attune-chip-txt');
  if (!chip || !txt) return;
  txt.textContent = text ? message : '';
  chip.hidden = !text;
  const copyBtn = chip.querySelector('.attune-copy');
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
  const chip = document.querySelector('#attune-load-fab .attune-chip');
  if (!chip) return ok;
  chip.querySelector('.attune-chip-txt').textContent = ok ? MSG.noInput : MSG.copyFail;
  chip.classList.add('attune-chip-warn');
  const copyBtn = chip.querySelector('.attune-copy');
  copyBtn.textContent = MSG.copy;
  copyBtn.hidden = false;
  chip.hidden = false;
  return ok;
}
/** Put text in the composer, or fall back to clipboard + chip. Never sends. */
function writeComposer(sel, text) {
  const input = pickInput(sel);
  if (input && setInputText(input, text)) return true;
  composerFallback(text);
  return false;
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
function hideOffer() { const o = document.querySelector('#attune-load-fab .attune-offer'); if (o) o.hidden = true; }
async function answerOffer(outcome, sel) {
  const p = pendingOffer; pendingOffer = null; hideOffer();
  if (!p) return;
  const res = await chrome.runtime.sendMessage({ type: 'suggest_outcome', outcome, trigger: p.trigger, host: HOST });
  if (outcome === 'accept' && res?.pendingPrefix) {
    showChip(res.pendingPrefix);
    const current = getInputText(pickInput(sel)).trim();
    // Never sends: only prepares the composer text (or copies it when the composer is missing).
    writeComposer(sel, res.pendingPrefix + (current || 'Please rewrite your last answer as a short summary first, with the full details below.'));
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
  const o = document.querySelector('#attune-load-fab .attune-offer');
  if (!o) return;
  o.querySelector('.attune-offer-txt').textContent = res.text;
  o.hidden = false;
}
function watchSends(sel) {
  // Observe the user's own Enter / send-button presses; read the composer text just before it clears.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    const input = pickInput(sel);
    if (input && (e.target === input || input.contains(e.target))) onUserSend(getInputText(input), sel);
  }, true);
  document.addEventListener('pointerdown', (e) => {
    const btn = candidates(sel?.submit || 'form button[type="submit"]').map((css) => { try { return e.target.closest?.(css); } catch { return null; } }).find(Boolean);
    if (btn) onUserSend(getInputText(pickInput(sel)), sel);
  }, true);
}

(async () => {
  const all = await loadSelectors();
  // SPA pages can wipe injected nodes: re-attach the floating mascot if it disappears.
  setInterval(() => { if (!document.getElementById('attune-load-fab')) ensureUI(lastPick); }, 2000);
  const sel = all[HOST] || all['chatgpt.com'];
  watchSends(sel);
  onOffer = (outcome) => answerOffer(outcome, sel);
  ensureUI(async (level) => {
    if (pendingOffer) { pendingOffer = null; hideOffer(); } // a manual pick supersedes an open offer
    const turns = extractTurns(sel);
    const res = await chrome.runtime.sendMessage({
      type: 'record_load',
      level,
      recentTurns: turns.length,
      signals: { host: HOST, turnSample: turns.length },
    });
    const prefix = res?.pendingPrefix || '';
    showChip(prefix);
    if (!prefix) return;
    const current = getInputText(pickInput(sel)).trim();
    if (!current) {
      // optional fill rewrite request — user still sends
      writeComposer(sel, prefix + 'Please rewrite your last answer more shortly and simply.');
    } else if (!current.startsWith(prefix.trim())) {
      writeComposer(sel, prefix + current);
    }
  });
})();
