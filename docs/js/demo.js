// Demo page controller: profile + virtual condition -> engine settings -> rule-based transform.
import { computeSettings } from './engine.js?v=6972a45f';
import { SAMPLE_PROFILE, DEFAULT_HRV_BASELINE_MS } from './profile.js?v=6972a45f';
import { rewrite } from './adapter.js?v=6972a45f';
import { transform } from './transform.js?v=6972a45f';
import { loadProfile } from './storage.js?v=6972a45f';
import { typeLive, typingCps } from './typing.js?v=6972a45f';
import { deliver, initPage, renderBlocks, renderLoadMeter } from './ui.js?v=6972a45f';

const $ = (id) => document.getElementById(id);
const own = loadProfile();
const state = {
  profile: own ?? SAMPLE_PROFILE,
  usingOwn: Boolean(own),
  condOn: true,
  cond: { baselineHrvMs: own?.baseline.hrvMs ?? DEFAULT_HRV_BASELINE_MS, hrvMs: own?.baseline.hrvMs ?? DEFAULT_HRV_BASELINE_MS, sessionMinutes: 10 },
  customAnswer: false,
};
const SCENARIOS = {
  s1: { baselineHrvMs: 55, hrvMs: 55, sessionMinutes: 20 },
  s2: { baselineHrvMs: 55, hrvMs: 37, sessionMinutes: 10 }, // about -33%
  s3: { baselineHrvMs: 55, hrvMs: 33, sessionMinutes: 95 }, // -40%, long session
};
let cancelDelivery = () => {};
let runId = 0;

const app = initPage(() => {
  if (!state.customAnswer) $('answer').value = app.tr('sample_answer');
  update({ paced: false, type: true });
});
const tr = (k, p) => app.tr(k, p);

function syncControls() {
  const { baselineHrvMs, hrvMs, sessionMinutes } = state.cond;
  $('rg-base').value = baselineHrvMs;
  $('rg-hrv').value = hrvMs;
  $('rg-min').value = sessionMinutes;
  $('lb-base').textContent = tr('dm_base_hrv', { v: baselineHrvMs });
  $('lb-hrv').textContent = tr('dm_hrv', { v: hrvMs });
  $('lb-min').textContent = tr('dm_minutes', { v: sessionMinutes });
  $('cond-json').value = JSON.stringify(state.cond, null, 2);
  for (const id of ['rg-base', 'rg-hrv', 'rg-min']) $(id).disabled = !state.condOn;
  $('cond-on').checked = state.condOn;
  $('btn-use-sample').hidden = !state.usingOwn;
  $('btn-use-own').hidden = state.usingOwn || !own;
  $('profile-source').textContent = state.usingOwn
    ? tr('dm_using_own', { date: new Date(state.profile.createdAt).toLocaleDateString(app.lang) })
    : tr('dm_using_sample');
}

function settingsRows(s) {
  const lvlA = tr('lvl_amount');
  const lvlP = tr('lvl_pace');
  const pct = s.hrvDeviation == null ? '–' : `${s.hrvDeviation > 0 ? '+' : ''}${Math.round(s.hrvDeviation * 100)}%`;
  const delivery = s.delivery === 'step' ? tr('del_step') : s.delivery === 'stream' ? tr('del_stream', { cps: s.charsPerSec }) : tr('del_instant');
  const eff = (base, now) => (base === now ? `${now}` : `${base} → ${now}`);
  return [
    [tr('res_amount'), `${eff(s.base.amount, s.amount)} · ${lvlA[s.amount - 1]}`],
    [tr('res_pace'), `${eff(s.base.pace, s.pace)} · ${lvlP[s.pace - 1]}`],
    [tr('res_style'), s.base.style === s.style ? tr(`st_${s.style}`) : `${tr(`st_${s.base.style}`)} → ${tr(`st_${s.style}`)}`],
    [tr('dm_delivery'), delivery],
    [tr('dm_adjust'), s.step ? tr('dm_adjust_steps', { n: s.step }) : tr('dm_adjust_none')],
    [tr('dm_deviation'), pct],
    [tr('dm_load'), s.loadIndex == null ? '–' : `${s.loadIndex} / 100`],
  ];
}

function renderSettings(s) {
  renderLoadMeter($('load-meter'), s.loadIndex, tr);
  const dl = $('settings');
  dl.replaceChildren();
  settingsRows(s).forEach(([k, v]) => {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    dl.append(dt, dd);
  });
  const ul = $('reasons');
  ul.replaceChildren();
  const reasons = state.condOn ? s.reasons : [];
  if (!state.condOn) reasons.push('__off');
  reasons.forEach((r) => {
    const li = document.createElement('li');
    li.textContent = r === '__off' ? tr('dm_no_cond') : tr(`r_${r}`);
    ul.append(li);
  });
  const alert = $('break-alert');
  alert.hidden = s.breakAdvice === 'none';
  alert.classList.toggle('break-now', s.breakAdvice === 'now');
  alert.textContent = s.breakAdvice === 'none' ? '' : tr(s.breakAdvice === 'now' ? 'break_now' : 'break_soon');
}

function renderCompare(answer, s) {
  const box = $('compare');
  box.replaceChildren();
  for (let n = 1; n <= 5; n++) {
    const col = document.createElement('section');
    col.className = 'cmp-col';
    if (n === s.amount) col.setAttribute('aria-current', 'true');
    const h = document.createElement('h4');
    h.textContent = tr('dm_level', { n, name: tr('lvl_amount')[n - 1] });
    const body = document.createElement('div');
    renderBlocks(body, transform(answer, { amount: n, style: s.style }).blocks, tr);
    col.append(h, body);
    box.append(col);
  }
}

const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// type: the adapted answer is typed out character by character (slower for lower pace levels); reduced motion shows it at once.
async function update({ paced, type = false }) {
  const id = ++runId;
  cancelDelivery();
  syncControls();
  const settings = computeSettings(state.profile, state.condOn ? state.cond : null);
  renderSettings(settings);
  const answer = $('answer').value;
  renderCompare(answer, settings);
  const result = await rewrite(answer, settings, globalThis.attuneAdapter ?? null);
  if (id !== runId) return; // a newer update superseded this one
  const out = $('output');
  if (paced && settings.delivery === 'step') cancelDelivery = deliver(out, result.blocks, settings, tr);
  else if ((paced || type) && !reduced()) {
    renderBlocks(out, result.blocks, tr);
    out.setAttribute('aria-busy', 'true');
    const h = typeLive(out, { cps: typingCps(settings.pace), onDone: () => out.setAttribute('aria-busy', 'false') });
    cancelDelivery = () => { h.finish(); };
  } else { renderBlocks(out, result.blocks, tr); cancelDelivery = () => {}; }
  const stats = result.stats;
  const sourceLabel = result.source === 'rules' ? tr('src_rules') : result.source;
  const parts = [];
  if (stats) {
    const p = stats.inputWords ? Math.round(((stats.outputWords - stats.inputWords) / stats.inputWords) * 100) : 0;
    parts.push(tr('dm_words', { a: stats.inputWords, b: stats.outputWords, p: `${p}%` }));
  }
  parts.push(tr('dm_source', { s: sourceLabel }));
  $('out-stats').textContent = parts.join(' · ');
}

const redraw = () => update({ paced: $('pacing').checked });

/* ---------- wiring ---------- */
const bindRange = (id, key) => $(id).addEventListener('input', (e) => { state.cond[key] = Number(e.target.value); redraw(); });
bindRange('rg-base', 'baselineHrvMs');
bindRange('rg-hrv', 'hrvMs');
bindRange('rg-min', 'sessionMinutes');
$('cond-on').addEventListener('change', (e) => { state.condOn = e.target.checked; redraw(); });
document.querySelectorAll('.scen').forEach((b) => b.addEventListener('click', () => {
  state.cond = { ...SCENARIOS[b.dataset.scen] };
  state.condOn = true;
  update({ paced: $('pacing').checked, type: true });
}));
$('btn-json').addEventListener('click', () => {
  try {
    const c = JSON.parse($('cond-json').value);
    const ok = c && typeof c === 'object' && ['baselineHrvMs', 'hrvMs', 'sessionMinutes'].every((k) => c[k] === undefined || Number.isFinite(c[k]));
    if (!ok) throw new Error('bad shape');
    state.cond = { ...state.cond, ...c };
    $('json-err').textContent = '';
    redraw();
  } catch {
    $('json-err').textContent = tr('dm_json_err');
  }
});
$('answer').addEventListener('input', () => { state.customAnswer = true; redraw(); });
$('btn-reset').addEventListener('click', () => { state.customAnswer = false; $('answer').value = tr('sample_answer'); redraw(); });
$('btn-replay').addEventListener('click', () => update({ paced: true, type: true }));
$('pacing').addEventListener('change', redraw);
$('btn-use-sample').addEventListener('click', () => { state.profile = SAMPLE_PROFILE; state.usingOwn = false; redraw(); });
$('btn-use-own').addEventListener('click', () => { state.profile = own; state.usingOwn = true; redraw(); });

app.start();
