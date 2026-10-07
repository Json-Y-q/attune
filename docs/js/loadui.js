// Floating mascot load input: click opens 3 faces; choosing one records a label and switches reply mode at once.
// Hover/focus on a face shows a preview only (no mode change). No separate overload button.
import { loadJSON, saveJSON, removeKey } from './storage.js?v=647d0f36';
import { reportLoad, activeSignals, loadIndexFor, density, sessionMinutes, effective } from './partner.js?v=647d0f36';
import { renderMascot } from './mascot.js?v=647d0f36';
import {
  makeLabel, appendLabel, normalizeLabels, exportLabelsJSON, LABEL_KEY, newSessionId,
  poseForLevel, LOAD_LEVELS,
} from './labels.js?v=647d0f36';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const HINT_KEY = 'tempoloon.mascot.hint.v1';
const LEVEL_KEY = 'tempoloon.mascot.level.v1';

function readLabels() { return normalizeLabels(loadJSON(LABEL_KEY)?.labels); }
function writeLabels(labels) { saveJSON(LABEL_KEY, { v: 1, labels }); document.dispatchEvent(new CustomEvent('tempoloon:labels')); }
/** Append one label to the local log (also used for automatic-suggestion outcomes). */
export function pushLabel(label) { writeLabels(appendLabel(readLabels(), label)); }
export { readLabels };

const PREVIEW = {
  calm: { lines: 5, pace: 'fast', key: 'ld_prev_long' },
  rising: { lines: 3, pace: 'steady', key: 'ld_prev_normal' },
  overloaded: { lines: 1, pace: 'slow', key: 'ld_prev_short' },
};

function paintPreview(box, level, tr) {
  if (!box) return;
  const p = PREVIEW[level] || PREVIEW.calm;
  box.replaceChildren();
  box.dataset.level = level;
  const lab = el('span', 'ld-prev-lab', tr(p.key));
  const speed = el('span', 'ld-prev-speed', tr(`ld_prev_pace_${p.pace}`));
  const bubble = el('div', 'ld-prev-bubble');
  for (let i = 0; i < 5; i += 1) {
    const line = el('i', i < p.lines ? 'on' : 'off');
    line.style.setProperty('--w', `${88 - i * 10}%`);
    bubble.append(line);
  }
  box.append(lab, speed, bubble);
}

/**
 * @param {{ getSession:()=>object, setSession:(s)=>void, getProfile:()=>object, getCond:()=>object,
 *   tr:(k,p?)=>string, onChange:(info:{level:string,decision:object})=>void, getSessionId:()=>string,
 *   host?: HTMLElement|null }} api
 */
export function mountMascotLoad(api) {
  const host = api.host || $('ld-mascot-host');
  if (!host) return { refresh() {}, setLevel() {} };

  let level = LOAD_LEVELS.includes(loadJSON(LEVEL_KEY)) ? loadJSON(LEVEL_KEY) : 'calm';
  let open = false;
  let previewLevel = null;

  host.replaceChildren();
  host.classList.add('ld-float');

  const wrap = el('div', 'ld-mascot-wrap');
  const btn = el('button', 'ld-mascot-btn');
  btn.type = 'button';
  btn.setAttribute('role', 'button');
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  const art = el('div', 'ld-mascot-art');
  btn.append(art);
  const sr = el('span', 'sr-only');
  btn.append(sr);

  const hint = el('p', 'ld-hint');
  hint.hidden = Boolean(loadJSON(HINT_KEY));

  const preview = el('div', 'ld-preview');
  preview.hidden = true;
  preview.setAttribute('aria-hidden', 'true');

  const menu = el('div', 'ld-picker');
  menu.hidden = true;
  menu.setAttribute('role', 'listbox');
  menu.id = 'ld-picker';

  const faces = LOAD_LEVELS.map((lv) => {
    const opt = el('button', `ld-face ld-face-${lv}`);
    opt.type = 'button';
    opt.dataset.level = lv;
    opt.setAttribute('role', 'option');
    opt.setAttribute('aria-selected', String(lv === level));
    const mini = el('div', 'ld-face-art');
    opt.append(mini);
    const cap = el('span', 'ld-face-cap');
    opt.append(cap);
    menu.append(opt);
    return { lv, opt, mini, cap };
  });

  const gear = el('button', 'ld-gear');
  gear.type = 'button';
  gear.setAttribute('aria-expanded', 'false');
  gear.setAttribute('aria-controls', 'ld-settings');
  const settings = el('div', 'ld-settings');
  settings.id = 'ld-settings';
  settings.hidden = true;
  const countEl = el('p', 'ld-count status');
  const status = el('p', 'ld-status status');
  status.setAttribute('role', 'status');
  const exportBtn = el('button', 'btn secondary');
  exportBtn.type = 'button';
  const clearBtn = el('button', 'btn secondary');
  clearBtn.type = 'button';
  const list = el('ul', 'ld-list');
  settings.append(countEl, status, exportBtn, clearBtn, list);

  const a11y = el('p', 'ld-a11y muted lp-help');

  // Automatic suggestion bubble (action phrasing only; see phrases.js). Never steals focus.
  const offerBox = el('div', 'ld-offer');
  offerBox.hidden = true;
  offerBox.setAttribute('role', 'group');
  let offerState = null;

  wrap.append(btn, hint, preview, offerBox, menu, gear, settings);
  host.append(wrap, a11y);

  const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  function drawMain() {
    renderMascot(art, { ...poseForLevel(level), tint: undefined });
  }
  function drawFaces() {
    for (const { lv, mini, cap, opt } of faces) {
      renderMascot(mini, { ...poseForLevel(lv), puff: poseForLevel(lv).puff });
      cap.textContent = api.tr(`ld_lv_${lv}`);
      opt.setAttribute('aria-selected', String(lv === level));
    }
  }
  function i18nChrome() {
    btn.setAttribute('aria-label', api.tr('ld_mascot_label'));
    btn.title = api.tr('ld_mascot_label');
    sr.textContent = api.tr('ld_mascot_label');
    hint.textContent = api.tr('ld_hint');
    gear.setAttribute('aria-label', api.tr('ld_settings_label'));
    gear.textContent = '⚙';
    exportBtn.textContent = api.tr('ld_export');
    clearBtn.textContent = api.tr('ld_clear');
    a11y.textContent = api.tr('ld_a11y');
    menu.setAttribute('aria-label', api.tr('ld_picker_label'));
    drawFaces();
    refreshList();
  }
  function refreshList() {
    const labels = readLabels();
    countEl.textContent = api.tr('ld_count', { n: labels.length });
    list.replaceChildren();
    for (const L of labels.slice(-6).reverse()) {
      list.append(el('li', null, `${L.ts} · ${L.level || L.kind} · ${L.source}`));
    }
  }

  function showPreview(lv) {
    previewLevel = lv;
    paintPreview(preview, lv, api.tr);
    preview.hidden = false;
    preview.classList.toggle('static', reduced());
  }
  function hidePreview() {
    previewLevel = null;
    preview.hidden = true;
  }

  function applyLevel(lv, { fromPicker = true } = {}) {
    if (!LOAD_LEVELS.includes(lv)) return;
    const st0 = api.getSession?.();
    level = lv;
    saveJSON(LEVEL_KEY, level);
    drawMain();
    drawFaces();
    hidePreview();
    closePicker();
    if (hint && !hint.hidden) { saveJSON(HINT_KEY, true); hint.hidden = true; }

    let decision = null;
    if (st0 && api.setSession) {
      const r = reportLoad(st0, lv);
      api.setSession(r.state);
      decision = r.decision;
      const dens = density(r.state);
      const load = loadIndexFor(r.state, api.getProfile(), api.getCond());
      const eff = effective(r.state);
      const label = makeLabel({
        sessionId: api.getSessionId(),
        recentTurns: st0.turns.filter((t) => !t.seed).length,
        source: 'mascot',
        kind: 'load',
        level: lv,
        origin: 'manual',
        sessionStart: api.getSessionStart?.() ?? null,
        signals: {
          loadIndex: load, densityLevel: dens.level, amount: eff.amount, speech: eff.speech,
          active: activeSignals(r.state), sessionMinutes: sessionMinutes(r.state),
          rule: decision?.rule ?? 'E3', level: lv,
        },
      });
      pushLabel(label);
      status.textContent = api.tr(lv === 'calm' ? 'ld_recorded_calm' : 'ld_recorded');
      refreshList();
    }
    api.onChange?.({ level: lv, decision });
  }

  function openPicker() {
    open = true;
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    faces[0]?.opt.focus();
  }
  function closePicker() {
    open = false;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    hidePreview();
  }

  btn.addEventListener('click', () => { if (open) closePicker(); else openPicker(); });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (open) closePicker(); else openPicker(); }
    if (e.key === 'Escape') closePicker();
  });
  // hover/focus on main mascot → preview current pending (rising as default tease) without applying
  btn.addEventListener('mouseenter', () => { if (!open) showPreview(level === 'calm' ? 'rising' : level); });
  btn.addEventListener('mouseleave', () => { if (!open) hidePreview(); });
  btn.addEventListener('focus', () => { if (!open) showPreview(level === 'calm' ? 'rising' : level); });
  btn.addEventListener('blur', () => { if (!open && !menu.contains(document.activeElement)) hidePreview(); });

  let longTimer = null;
  btn.addEventListener('touchstart', (e) => {
    longTimer = setTimeout(() => { showPreview(level === 'calm' ? 'rising' : level); }, 420);
  }, { passive: true });
  btn.addEventListener('touchend', () => { clearTimeout(longTimer); hidePreview(); });
  btn.addEventListener('touchcancel', () => { clearTimeout(longTimer); hidePreview(); });

  for (const { lv, opt } of faces) {
    opt.addEventListener('click', () => applyLevel(lv));
    opt.addEventListener('mouseenter', () => showPreview(lv));
    opt.addEventListener('mouseleave', () => { if (open) showPreview(level); else hidePreview(); });
    opt.addEventListener('focus', () => showPreview(lv));
    opt.addEventListener('keydown', (e) => {
      const idx = LOAD_LEVELS.indexOf(lv);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault(); faces[(idx + 1) % faces.length].opt.focus();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault(); faces[(idx + faces.length - 1) % faces.length].opt.focus();
      } else if (e.key === 'Escape') { closePicker(); btn.focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyLevel(lv); }
    });
  }

  gear.addEventListener('click', () => {
    const on = settings.hidden;
    settings.hidden = !on;
    gear.setAttribute('aria-expanded', String(on));
  });
  exportBtn.addEventListener('click', () => {
    const json = exportLabelsJSON(readLabels());
    const a = el('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `tempoloon-labels-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    status.textContent = api.tr('ld_exported');
  });
  clearBtn.addEventListener('click', () => {
    removeKey(LABEL_KEY);
    status.textContent = api.tr('ld_cleared');
    refreshList();
  });

  function paintOffer() {
    offerBox.replaceChildren();
    if (!offerState) { offerBox.hidden = true; offerBox.classList.remove('show'); return; }
    offerBox.setAttribute('aria-label', api.tr('sg_aria'));
    offerBox.append(el('p', 'ld-offer-text', api.tr(offerState.key)));
    if (offerState.whyKey) offerBox.append(el('p', 'ld-offer-why', api.tr('sg_why', { r: api.tr(offerState.whyKey) })));
    const row = el('div', 'ld-offer-row');
    [['accept', 'sg_yes', 'btn'], ['reject', 'sg_no', 'btn secondary']].forEach(([ans, key, cls]) => {
      const b = el('button', `${cls} ld-offer-${ans}`, api.tr(key));
      b.type = 'button';
      b.addEventListener('click', () => {
        const cb = offerState?.onAnswer;
        clearOffer();
        cb?.(ans);
      });
      row.append(b);
    });
    offerBox.append(row);
    offerBox.hidden = false;
    offerBox.classList.toggle('static', reduced());
    requestAnimationFrame(() => offerBox.classList.add('show'));
  }
  /** Show an automatic suggestion next to the mascot. onAnswer('accept'|'reject'). */
  function offer({ key, whyKey = null, onAnswer }) { offerState = { key, whyKey, onAnswer }; paintOffer(); }
  function clearOffer() { offerState = null; paintOffer(); }

  document.addEventListener('tempoloon:lang', () => { i18nChrome(); paintOffer(); });
  document.addEventListener('tempoloon:labels', refreshList);
  document.addEventListener('pointerdown', (e) => {
    if (open && !wrap.contains(e.target)) closePicker();
  });

  i18nChrome();
  drawMain();
  return {
    refresh: i18nChrome,
    setLevel: (lv) => applyLevel(lv),
    getLevel: () => level,
    offer,
    clearOffer,
    hasOffer: () => Boolean(offerState),
  };
}

export { newSessionId, LABEL_KEY, paintPreview, PREVIEW };
