// Content script: floating load button + optional prompt-prefix insertion.
// Selectors come from selectors.json (fragile — vendor DOM changes often).
// Conversation text stays on-device; only the last N turns are read locally. No fetch.

const N_TURNS = 8;
const HOST = location.hostname.replace(/^www\./, '');

async function loadSelectors() {
  try {
    const url = chrome.runtime.getURL('selectors.json');
    const res = await fetch(url);
    return await res.json();
  } catch {
    return {};
  }
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
  const nodes = document.querySelectorAll(sel.messages);
  for (const n of nodes) {
    const text = (n.innerText || n.textContent || '').trim().slice(0, 2000);
    if (!text) continue;
    let role = 'ai';
    if (sel.userRoleAttr) {
      const v = n.getAttribute(sel.userRoleAttr) || n.closest(`[${sel.userRoleAttr}]`)?.getAttribute(sel.userRoleAttr);
      role = v === sel.userRoleValue ? 'user' : 'ai';
    } else {
      const blob = (n.className + ' ' + (n.outerHTML || '').slice(0, 200)).toLowerCase();
      if (sel.userHint && new RegExp(sel.userHint, 'i').test(blob)) role = 'user';
    }
    turns.push({ role, text });
  }
  return turns.slice(-N_TURNS);
}

function setInputText(el, text) {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  if (el.isContentEditable) {
    el.focus();
    // Prefer execCommand for editors that listen to it; fall back to textContent.
    try {
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
    } catch {
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
    return true;
  }
  return false;
}

function ensureButton(onClick) {
  if (document.getElementById('attune-load-fab')) return;
  const b = document.createElement('button');
  b.id = 'attune-load-fab';
  b.type = 'button';
  b.textContent = "I'm overloaded";
  b.title = 'Attune prototype — records a local label and can prepend a short load note (preview first).';
  b.addEventListener('click', onClick);
  document.documentElement.appendChild(b);
}

(async () => {
  const all = await loadSelectors();
  const sel = all[HOST] || all['chatgpt.com'];
  ensureButton(async () => {
    const turns = extractTurns(sel);
    const status = await chrome.runtime.sendMessage({
      type: 'record_overload',
      recentTurns: turns.filter((t) => t.role === 'user').length,
      signals: { host: HOST, turnSample: turns.length, overloaded: true },
    });
    const prefs = status?.prefs || {};
    if (prefs.insertEnabled !== false) {
      const prefix = "The user reported high cognitive load. Keep the next answer short (about 3 key lines), one thing at a time, plain language. At most 2 options.\n\n";
      const input = pickInput(sel);
      const current = input?.value ?? input?.innerText ?? '';
      const next = prefix + current;
      if (prefs.confirmBeforeInsert !== false) {
        const ok = confirm(`Attune will put this note in front of your next message (you can edit or cancel):\n\n${prefix}\nContinue?`);
        if (!ok) return;
      }
      setInputText(input, next);
    }
  });
})();
