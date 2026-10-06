// Floating mascot: pick a load face → label + attach instruction to next send (no confirm when instantApply).
const N_TURNS = 8;
const HOST = location.hostname.replace(/^www\./, '');

async function loadSelectors() {
  try { return await (await fetch(chrome.runtime.getURL('selectors.json'))).json(); }
  catch { return {}; }
}
function pickInput(sel) {
  if (!sel?.input) return null;
  for (const part of sel.input.split(',').map((s) => s.trim())) {
    const el = document.querySelector(part);
    if (el) return el;
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
function ensureUI(onPick) {
  if (document.getElementById('attune-load-fab')) return;
  const root = document.createElement('div');
  root.id = 'attune-load-fab';
  root.innerHTML = `
    <button type="button" class="attune-mc" aria-label="Open load faces" title="Attune mascot — pick how heavy it feels">🎈</button>
    <div class="attune-faces" hidden>
      <button type="button" data-lv="calm" title="Calm">😌</button>
      <button type="button" data-lv="rising" title="A bit heavy">😐</button>
      <button type="button" data-lv="overloaded" title="Overloaded">😣</button>
    </div>
    <div class="attune-chip" hidden><span class="attune-chip-txt"></span><button type="button" class="attune-undo">Undo</button></div>
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
  root.querySelector('.attune-undo').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'clear_pending' });
    root.querySelector('.attune-chip').hidden = true;
  });
}

function showChip(text) {
  const chip = document.querySelector('#attune-load-fab .attune-chip');
  const txt = document.querySelector('#attune-load-fab .attune-chip-txt');
  if (!chip || !txt) return;
  txt.textContent = text ? 'Load note ready for next send' : '';
  chip.hidden = !text;
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
    const input = pickInput(sel);
    const current = getInputText(input).trim();
    // Never sends: only prepares the composer text.
    setInputText(input, res.pendingPrefix + (current || 'Please rewrite your last answer as a short summary first, with the full details below.'));
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
    const btn = sel?.submit ? e.target.closest?.(sel.submit) : e.target.closest?.('form button[type="submit"]');
    if (btn) onUserSend(getInputText(pickInput(sel)), sel);
  }, true);
}

(async () => {
  const all = await loadSelectors();
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
    const input = pickInput(sel);
    const current = getInputText(input).trim();
    if (!current) {
      // optional fill rewrite request — user still sends
      setInputText(input, prefix + 'Please rewrite your last answer more shortly and simply.');
    } else if (!current.startsWith(prefix.trim())) {
      setInputText(input, prefix + current);
    }
  });
})();
