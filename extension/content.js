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
  `;
  // Use textContent for faces via emoji as lightweight stand-in (full SVG mascot ships on the docs site).
  document.documentElement.appendChild(root);
  const faces = root.querySelector('.attune-faces');
  root.querySelector('.attune-mc').addEventListener('click', () => { faces.hidden = !faces.hidden; });
  faces.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { faces.hidden = true; onPick(b.dataset.lv); }));
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

(async () => {
  const all = await loadSelectors();
  const sel = all[HOST] || all['chatgpt.com'];
  ensureUI(async (level) => {
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
