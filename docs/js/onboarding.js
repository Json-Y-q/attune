// Onboarding page controller: 3 short tasks -> profile JSON -> localStorage (browser only).
import { DigitSpanSession, buildProfile, validateProfile } from './profile.js';
import { transform } from './transform.js';
import { clearProfile, loadProfile, saveProfile } from './storage.js';
import { deliver, initPage, levelBar, renderBlocks } from './ui.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RX_ROUNDS = 20;
const raw = { digitSpan: null, rts: null };
let currentProfile = null;
let cancelPreview = () => {};

const app = initPage(() => {
  renderStepLabels();
  if (!$('s-t3').hidden) renderReadingOptions();
  if (!$('s-res').hidden && currentProfile) renderResult(currentProfile);
});
const tr = (k, p) => app.tr(k, p);

function show(id) {
  document.querySelectorAll('[data-screen]').forEach((s) => { s.hidden = s.id !== id; });
  const heading = $(id).querySelector('h1, h2');
  heading?.focus();
  window.scrollTo({ top: 0 });
}
function renderStepLabels() {
  ['1', '2', '3'].forEach((n) => { $(`t${n}-step`).textContent = tr('step_of', { n }); });
}

/* ---------- task 1: digit span ---------- */
async function runSpan() {
  $('t1-begin').hidden = true;
  $('t1-run').hidden = false;
  const session = new DigitSpanSession();
  while (!session.done) {
    $('t1-form').hidden = true;
    $('t1-len').textContent = tr('t1_len', { n: session.sequence.length });
    $('t1-status').textContent = tr('t1_watch');
    await sleep(700);
    for (const d of session.sequence) {
      $('t1-display').textContent = d;
      await sleep(800);
      $('t1-display').textContent = '';
      await sleep(250);
    }
    $('t1-status').textContent = tr('t1_type');
    const answer = await askDigits();
    const { correct } = session.answer(answer);
    $('t1-status').textContent = tr(correct ? 't1_ok' : 't1_no');
    $('t1-form').hidden = true;
    await sleep(900);
  }
  raw.digitSpan = session.result();
  startTask2();
}
function askDigits() {
  const form = $('t1-form');
  const input = $('t1-input');
  form.hidden = false;
  input.value = '';
  input.focus();
  return new Promise((resolve) => {
    form.addEventListener('submit', (e) => { e.preventDefault(); resolve(input.value); }, { once: true });
  });
}

/* ---------- task 2: reaction ---------- */
let rxHandler = null;
function onRxKey(e) {
  if (!rxHandler || e.repeat || (e.key !== ' ' && e.key !== 'Enter')) return;
  e.preventDefault();
  rxHandler();
}
document.addEventListener('keydown', onRxKey);
$('rx-box').addEventListener('pointerdown', (e) => { if (rxHandler) { e.preventDefault(); rxHandler(); } });

function setBox(state, text) {
  const box = $('rx-box');
  box.dataset.state = state;
  box.textContent = text;
}
/** Resolves with reaction time in ms, or null on a false start. */
function oneRound() {
  return new Promise((resolve) => {
    setBox('wait', tr('t2_wait'));
    let t0 = 0;
    const timer = setTimeout(() => {
      setBox('go', tr('t2_go'));
      t0 = performance.now();
    }, 1000 + Math.random() * 2500);
    rxHandler = () => {
      rxHandler = null;
      clearTimeout(timer);
      resolve(t0 ? performance.now() - t0 : null);
    };
  });
}
async function runReaction() {
  $('t2-begin').hidden = true;
  $('t2-run').hidden = false;
  const rts = [];
  while (rts.length < RX_ROUNDS) {
    $('t2-round').textContent = tr('t2_round', { n: rts.length + 1, total: RX_ROUNDS });
    $('t2-bar').style.width = `${(rts.length / RX_ROUNDS) * 100}%`;
    await sleep(300);
    const rt = await oneRound();
    if (rt === null) {
      setBox('early', tr('t2_early'));
      $('t2-status').textContent = tr('t2_early');
      await sleep(1200);
      $('t2-status').textContent = '';
      continue;
    }
    rts.push(rt);
    $('t2-status').textContent = `${Math.round(rt)} ms`;
    setBox('wait', '');
    await sleep(500);
  }
  raw.rts = rts;
  startTask3();
}

/* ---------- task 3: reading comfort ---------- */
const VOL = [1, 3, 5];
const STR = ['prose', 'summary', 'bullets', 'chunks'];
const PACES = [
  [1, { delivery: 'step', charsPerSec: 0 }],
  [3, { delivery: 'stream', charsPerSec: 30 }],
  [5, { delivery: 'instant', charsPerSec: Infinity }],
];

function option(group, value, title, buildPreview, previewButton) {
  const wrap = document.createElement('div');
  wrap.className = 'opt';
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = group;
  input.value = String(value);
  const span = document.createElement('span');
  span.textContent = title;
  label.append(input, span);
  const prev = document.createElement('div');
  prev.className = 'preview';
  prev.setAttribute('aria-live', 'polite');
  wrap.append(label);
  if (previewButton) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn secondary';
    b.textContent = tr('t3_preview');
    b.addEventListener('click', () => { cancelPreview(); cancelPreview = buildPreview(prev) || (() => {}); });
    wrap.append(b);
  } else {
    buildPreview(prev);
  }
  wrap.append(prev);
  return wrap;
}

function renderReadingOptions() {
  cancelPreview();
  const keep = Object.fromEntries(['vol', 'str', 'pace'].map((g) => [g, document.querySelector(`input[name="${g}"]:checked`)?.value]));
  const sample = tr('sample_answer');
  const fill = (id, nodes) => {
    const fs = $(id);
    fs.querySelectorAll('.opt').forEach((o) => o.remove());
    nodes.forEach((n) => fs.append(n));
  };
  fill('fs-vol', VOL.map((v) => option('vol', v, tr(`t3_vol_${v}`),
    (p) => renderBlocks(p, transform(sample, { amount: v, style: 'prose' }).blocks, tr))));
  fill('fs-str', STR.map((s) => option('str', s, tr(`t3_str_${s}`),
    (p) => renderBlocks(p, transform(sample, { amount: 3, style: s }).blocks, tr))));
  const demoBlocks = transform(sample, { amount: 1, style: 'chunks' }).blocks;
  fill('fs-pace', PACES.map(([v, cfg]) => option('pace', v, tr(`t3_pace_${v}`),
    (p) => deliver(p, demoBlocks, cfg, tr), true)));
  Object.entries(keep).forEach(([g, v]) => {
    if (v) document.querySelector(`input[name="${g}"][value="${v}"]`).checked = true;
  });
}

function startTask2() { show('s-t2'); }
function startTask3() { show('s-t3'); renderReadingOptions(); }

function finishTask3(e) {
  e.preventDefault();
  const pick = (g) => document.querySelector(`input[name="${g}"]:checked`)?.value;
  if (!pick('vol') || !pick('str') || !pick('pace')) {
    $('t3-error').textContent = tr('t3_incomplete');
    return;
  }
  $('t3-error').textContent = '';
  cancelPreview();
  const profile = buildProfile({
    digitSpan: raw.digitSpan,
    reaction: raw.rts,
    reading: { volume: Number(pick('vol')), structure: pick('str'), pace: Number(pick('pace')) },
  });
  saveProfile(profile);
  showResult(profile);
}

/* ---------- result ---------- */
function renderResult(p) {
  const dl = $('res-levels');
  dl.replaceChildren();
  const row = (label, value) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.append(value);
    dl.append(dt, dd);
  };
  const lvl = (level, names) => {
    const f = document.createDocumentFragment();
    const name = names[level - 1];
    f.append(levelBar(level, `${name}: ${level}/5`), ` ${level}/5 · ${name}`);
    return f;
  };
  row(tr('res_amount'), lvl(p.levels.amount, tr('lvl_amount')));
  row(tr('res_pace'), lvl(p.levels.pace, tr('lvl_pace')));
  row(tr('res_style'), tr(`st_${p.levels.style}`));

  const ul = $('res-measures');
  ul.replaceChildren();
  const m = p.measures;
  const items = [];
  if (m.digitSpan) items.push(tr('res_span', { n: m.digitSpan.maxSpan }));
  if (m.attention) items.push(tr('res_rt', { ms: m.attention.medianMs, l: m.attention.lapses }));
  items.push(tr('res_cap', { n: p.baseline.capacityScore }));
  items.forEach((text) => { const li = document.createElement('li'); li.textContent = text; ul.append(li); });
  $('res-json').textContent = JSON.stringify(p, null, 2);
}
function showResult(p) {
  currentProfile = p;
  renderResult(p);
  $('res-msg').textContent = '';
  show('s-res');
}

function download() {
  const blob = new Blob([JSON.stringify(currentProfile, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'attune-profile.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function copy() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(currentProfile, null, 2));
    $('res-msg').textContent = tr('res_copied');
  } catch {
    $('res-json').focus(); // user can copy manually
  }
}
function importFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const p = JSON.parse(String(reader.result));
      const v = validateProfile(p);
      if (!v.ok) throw new Error(v.errors.join(', '));
      saveProfile(p);
      showResult(p);
    } catch (err) {
      $('res-msg').textContent = tr('res_import_err', { e: err.message });
    }
  };
  reader.readAsText(file);
}

/* ---------- wiring ---------- */
$('btn-start').addEventListener('click', () => show('s-t1'));
$('btn-existing').addEventListener('click', () => showResult(loadProfile()));
$('t1-begin').addEventListener('click', runSpan);
$('t2-begin').addEventListener('click', runReaction);
$('t3-form').addEventListener('submit', finishTask3);
$('btn-download').addEventListener('click', download);
$('btn-copy').addEventListener('click', copy);
$('btn-import').addEventListener('click', () => $('file-import').click());
$('file-import').addEventListener('change', (e) => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; });
$('btn-retake').addEventListener('click', () => {
  $('t1-begin').hidden = false; $('t1-run').hidden = true;
  $('t2-begin').hidden = false; $('t2-run').hidden = true;
  show('s-t1');
});
$('btn-delete').addEventListener('click', () => {
  if (!window.confirm(tr('res_confirm_delete'))) return;
  clearProfile();
  currentProfile = null;
  $('existing').hidden = true;
  show('s-intro');
  $('existing').hidden = true;
});

app.start();
$('existing').hidden = !loadProfile();
