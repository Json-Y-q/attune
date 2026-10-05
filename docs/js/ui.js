// Shared UI helpers: page init (language toggle) and block rendering / paced delivery.
// Text is always inserted with textContent.
import { applyI18n, t } from './i18n.js?v=f2a7a765';
import { THRESHOLDS } from './engine.js?v=f2a7a765';
import { getLang, setLang } from './storage.js?v=f2a7a765';

/** Wire the language toggle; `onLang(lang)` runs after every (re)render of static strings. */
export function initPage(onLang = () => {}) {
  let lang = getLang();
  const btn = document.getElementById('lang-toggle');
  const render = () => {
    applyI18n(document, lang);
    onLang(lang);
    document.dispatchEvent(new CustomEvent('attune:lang', { detail: { lang } }));
  };
  btn?.addEventListener('click', () => {
    lang = lang === 'en' ? 'ko' : 'en';
    setLang(lang);
    render();
  });
  return {
    get lang() { return lang; },
    tr: (key, params) => t(lang, key, params),
    start: render,
  };
}

const el = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
};

/** Build the DOM node for one block; `textEl` is where the (possibly streamed) text goes. */
function makeNode(block, tr) {
  switch (block.type) {
    case 'tldr': {
      const p = el('p', 'tldr');
      p.append(el('strong', 'tldr-label', tr('tldr')), ' ');
      const textEl = el('span');
      p.append(textEl);
      return { root: p, textEl, text: block.text };
    }
    case 'li': {
      const li = el('li');
      return { root: li, textEl: li, text: block.text, isLi: true };
    }
    case 'chunk': {
      const s = el('section', 'chunk');
      s.append(el('span', 'chunk-label', tr('step_label', { i: block.index, n: block.total })));
      const p = el('p');
      s.append(p);
      return { root: s, textEl: p, text: block.text };
    }
    default: {
      const p = el('p');
      return { root: p, textEl: p, text: block.text };
    }
  }
}

function mounter(container) {
  let ul = null;
  return (node) => {
    if (node.isLi) {
      if (!ul) { ul = el('ul', 'bullets'); container.append(ul); }
      ul.append(node.root);
    } else {
      ul = null;
      container.append(node.root);
    }
  };
}

/** Render all blocks at once. */
export function renderBlocks(container, blocks, tr) {
  container.replaceChildren();
  const mount = mounter(container);
  blocks.forEach((b) => {
    const n = makeNode(b, tr);
    n.textEl.textContent = n.text;
    mount(n);
  });
}

const prefersReducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Deliver blocks according to settings.delivery: 'instant' | 'stream' | 'step' (tap per chunk).
 * Returns a cancel function.
 */
export function deliver(container, blocks, { delivery, charsPerSec }, tr) {
  if (delivery === 'instant' || (delivery === 'stream' && prefersReducedMotion()) || !blocks.length) {
    renderBlocks(container, blocks, tr);
    return () => {};
  }
  container.replaceChildren();
  container.setAttribute('aria-busy', 'true');
  const mount = mounter(container);
  const nodes = blocks.map((b) => makeNode(b, tr));
  let timer = null;
  let button = null;
  const finish = () => container.setAttribute('aria-busy', 'false');

  if (delivery === 'step') {
    let i = 0;
    const showNext = () => {
      const n = nodes[i++];
      n.textEl.textContent = n.text;
      mount(n);
      if (button) button.remove();
      if (i < nodes.length) {
        button = el('button', 'btn secondary next', tr('chunk_next', { n: i + 1, total: nodes.length }));
        button.type = 'button';
        button.addEventListener('click', () => { showNext(); button?.focus(); });
        container.append(button);
      } else {
        button = null;
        container.append(el('p', 'end-note', tr('chunk_end')));
        finish();
      }
    };
    showNext();
    return () => { button?.remove(); finish(); };
  }

  const perTick = Math.max(1, Math.round(charsPerSec / 20)); // 50 ms ticks
  let bi = 0;
  let ci = 0;
  const tick = () => {
    const n = nodes[bi];
    if (!n) { finish(); return; }
    if (ci === 0) mount(n);
    ci += perTick;
    n.textEl.textContent = n.text.slice(0, ci);
    if (ci >= n.text.length) { bi++; ci = 0; timer = setTimeout(tick, 250); } else timer = setTimeout(tick, 50);
  };
  tick();
  return () => { clearTimeout(timer); finish(); };
}

export const levelBar = (level, label) => {
  const bar = el('span', 'levelbar');
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', label);
  for (let i = 1; i <= 5; i++) bar.append(el('span', i <= level ? 'seg on' : 'seg'));
  return bar;
};

/* Load meter: same 3-zone scale as the logo (calm / rising / break). Zones follow engine thresholds.
   Colour is never the only cue: zone label text, tick length and the numeric value. */
export function renderLoadMeter(box, loadIndex, tr) {
  box.replaceChildren();
  if (loadIndex == null) { box.hidden = true; return; }
  box.hidden = false;
  const v = Math.max(0, Math.min(100, loadIndex));
  const zone = v >= THRESHOLDS.breakNow ? 'high' : v >= THRESHOLDS.breakSoon ? 'mid' : 'calm';
  const name = tr(`dm_zone_${zone}`);
  const label = document.createElement('div');
  label.className = 'meter-label';
  label.textContent = `${tr('dm_meter')}: ${v} / 100 · ${name}`;
  const track = document.createElement('div');
  track.className = 'meter-track';
  track.setAttribute('role', 'meter');
  track.setAttribute('aria-label', tr('dm_meter'));
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(v));
  track.setAttribute('aria-valuetext', `${v} / 100, ${name}`);
  for (let i = 0; i <= 20; i++) {
    const at = i * 5;
    const t = document.createElement('i');
    t.className = `tick z-${at >= THRESHOLDS.breakNow ? 'high' : at >= THRESHOLDS.breakSoon ? 'mid' : 'calm'}`;
    t.style.height = `${8 + i * 0.6}px`; // longer toward higher load
    track.append(t);
  }
  const mark = document.createElement('span');
  mark.className = 'meter-mark';
  mark.style.left = `${v}%`;
  track.append(mark);
  const zones = document.createElement('div');
  zones.className = 'meter-zones';
  for (const [z, w] of [['calm', THRESHOLDS.breakSoon], ['mid', THRESHOLDS.breakNow - THRESHOLDS.breakSoon], ['high', 100 - THRESHOLDS.breakNow]]) {
    const sp = document.createElement('span');
    sp.className = `z-${z}`;
    sp.style.width = `${w}%`;
    sp.textContent = tr(`dm_zone_${z}`);
    zones.append(sp);
  }
  box.append(label, track, zones);
}
