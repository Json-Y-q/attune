// Landing page controller: an interactive preview of the same answer at different (virtual) conditions.
// Reuses the engine and the rule-based transform; no network, no storage, text via textContent only.
import { computeSettings } from './engine.js';
import { SAMPLE_PROFILE } from './profile.js';
import { transform } from './transform.js';
import { initPage, renderBlocks, renderLoadMeter } from './ui.js';

const $ = (id) => document.getElementById(id);
const BASELINE_HRV_MS = 55; // virtual baseline for the preview
const PRESETS = {
  rested: { hrvMs: 55, sessionMinutes: 15 },
  tired: { hrvMs: 37, sessionMinutes: 20 }, // about -33% vs baseline
  long: { hrvMs: 33, sessionMinutes: 60 }, // about -40%, long session
};
const state = { ...PRESETS.rested };

const app = initPage(() => render());
const tr = (k, p) => app.tr(k, p);

function render() {
  const { hrvMs, sessionMinutes } = state;
  $('lp-hrv').value = hrvMs;
  $('lp-min').value = sessionMinutes;
  $('lp-hrv-label').textContent = tr('lp_pv_hrv', { v: hrvMs });
  $('lp-min-label').textContent = tr('lp_pv_min', { m: sessionMinutes });
  const dev = Math.round(((hrvMs - BASELINE_HRV_MS) / BASELINE_HRV_MS) * 100);
  $('lp-hrv-help').textContent = tr('lp_pv_hrv_help', { b: BASELINE_HRV_MS, p: `${dev > 0 ? '+' : ''}${dev}%` });
  document.querySelectorAll('.lp-pick').forEach((b) => {
    const p = PRESETS[b.dataset.pre];
    b.setAttribute('aria-pressed', String(p.hrvMs === hrvMs && p.sessionMinutes === sessionMinutes));
  });

  const s = computeSettings(SAMPLE_PROFILE, { baselineHrvMs: BASELINE_HRV_MS, hrvMs, sessionMinutes });
  renderLoadMeter($('lp-meter'), s.loadIndex, tr);
  const alert = $('lp-alert');
  alert.hidden = s.breakAdvice === 'none';
  alert.classList.toggle('break-now', s.breakAdvice === 'now');
  alert.textContent = s.breakAdvice === 'none' ? '' : tr(s.breakAdvice === 'now' ? 'break_now' : 'break_soon');
  $('lp-settings').textContent = tr('lp_pv_settings', {
    a: tr('lvl_amount')[s.amount - 1],
    p: tr('lvl_pace')[s.pace - 1],
    s: tr(`st_${s.style}`),
  });

  const answer = tr('sample_answer');
  renderBlocks($('lp-out'), transform(answer, { amount: s.amount, style: s.style }).blocks, tr);
  $('lp-orig').textContent = answer;

  document.querySelectorAll('[data-n]').forEach((el) => { el.textContent = tr(el.dataset.i18n, { n: el.dataset.n }); });
}

$('lp-hrv').addEventListener('input', (e) => { state.hrvMs = Number(e.target.value); render(); });
$('lp-min').addEventListener('input', (e) => { state.sessionMinutes = Number(e.target.value); render(); });
document.querySelectorAll('.lp-pick').forEach((b) => b.addEventListener('click', () => {
  Object.assign(state, PRESETS[b.dataset.pre]);
  render();
}));

app.start();
