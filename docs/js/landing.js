// Landing page controller: an interactive preview of the same answer at different (virtual) conditions.
// Reuses the engine and the rule-based transform; no network, no storage, text via textContent only.
import { computeSettings, THRESHOLDS } from './engine.js?v=e04ec2aa';
import { renderMascot } from './mascot.js?v=e04ec2aa';
import { loadJSON } from './storage.js?v=e04ec2aa';
import { SAMPLE_PROFILE } from './profile.js?v=e04ec2aa';
import { transform } from './transform.js?v=e04ec2aa';
import { initPage, renderBlocks, renderLoadMeter } from './ui.js?v=e04ec2aa';
import { typeLive, typingCps } from './typing.js?v=e04ec2aa';
import { mountStory, mountIndividuals } from './showcase.js?v=e04ec2aa';
import { mountMascotLoad } from './loadui.js?v=e04ec2aa';
import { mountFlow } from './flow.js?v=e04ec2aa';
import { mountMedia } from './media.js?v=e04ec2aa';

const $ = (id) => document.getElementById(id);
const BASELINE_HRV_MS = 55; // virtual baseline for the preview
const PRESETS = {
  rested: { hrvMs: 55, sessionMinutes: 15 },
  tired: { hrvMs: 37, sessionMinutes: 20 }, // about -33% vs baseline
  long: { hrvMs: 33, sessionMinutes: 60 }, // about -40%, long session
};
const state = { ...PRESETS.rested };
let mascotOn = loadJSON('attune.mascot') !== false;
let artKey = '';
let lastPace = 4;
let outTyper = null;

// Hero illustration: the brain balloon, tinted warm, whose arcs follow the preview's load (same scale as the meter).
function renderArt(load) {
  const zone = load >= THRESHOLDS.breakNow ? 'high' : load >= THRESHOLDS.breakSoon ? 'mid' : 'calm';
  const pose = { zone, face: zone === 'high' ? 'tired' : zone === 'mid' ? 'tense' : 'calm', puff: 1, sweat: 0, breathing: false, tint: '#F2A65A', plain: !mascotOn };
  const k = JSON.stringify(pose);
  if (k !== artKey) { artKey = k; renderMascot($('lp-hero-art'), pose); }
}

let story = null;
let indiv = null;
const app = initPage((lang) => { render(); story?.render(); indiv?.render(); mountMedia(lang); });
const tr = (k, p) => app.tr(k, p);
story = mountStory(() => tr);
indiv = mountIndividuals(() => tr);

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
  renderArt(s.loadIndex);
  const alert = $('lp-alert');
  alert.hidden = s.breakAdvice === 'none';
  alert.classList.toggle('break-now', s.breakAdvice === 'now');
  alert.textContent = s.breakAdvice === 'none' ? '' : tr(s.breakAdvice === 'now' ? 'break_now' : 'break_soon');
  $('lp-settings').textContent = tr('lp_pv_settings', {
    a: tr('lvl_amount')[s.amount - 1],
    p: tr('lvl_pace')[s.pace - 1],
    s: tr(`st_${s.style}`),
  });

  lastPace = s.pace;
  outTyper?.cancel(); outTyper = null;
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
  // picking a day types the adapted answer out (slower when the pace is lower); sliders and reduced motion show it at once
  if (!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) outTyper = typeLive($('lp-out'), { cps: typingCps(lastPace) });
}));

document.addEventListener('attune:mascot', (e) => { mascotOn = e.detail.on; render(); });
mountFlow();

/* Landing live mascot: one click applies level + regenerates the sample answer (local only). */
const liveHost = $('fb-live-host');
const liveOut = $('fb-live-out');
let liveLevel = 'calm';
let liveTyper = null;
function renderLiveAnswer(level) {
  if (!liveOut) return;
  const amount = level === 'overloaded' ? 1 : level === 'rising' ? 2 : 3;
  const pace = level === 'overloaded' ? 2 : level === 'rising' ? 3 : 4;
  liveTyper?.cancel?.();
  renderBlocks(liveOut, transform(tr('sample_answer'), { amount, style: amount <= 1 ? 'summary' : 'prose' }).blocks, tr);
  if (!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    liveTyper = typeLive(liveOut, { cps: typingCps(pace) });
  }
}
if (liveHost) {
  mountMascotLoad({
    host: liveHost,
    tr,
    getSession: () => null,
    setSession: () => {},
    getProfile: () => SAMPLE_PROFILE,
    getCond: () => ({ baselineHrvMs: BASELINE_HRV_MS, hrvMs: state.hrvMs }),
    getSessionId: () => 'landing',
    onChange: ({ level }) => {
      liveLevel = level;
      renderLiveAnswer(level);
      const flow = $('fb-flow');
      if (flow) flow.dataset.active = level === 'overloaded' ? '1' : '0';
      document.querySelectorAll('#fb-flow [data-fb-step]').forEach((el) => {
        el.classList.toggle('is-active', el.dataset.fbStep === (level === 'calm' ? '0' : '1'));
      });
    },
  });
  renderLiveAnswer('calm');
}

/* Hero mascot click = same local try-out (no network). */
const hero = $('lp-hero-art');
if (hero) {
  hero.setAttribute('role', 'button');
  hero.tabIndex = 0;
  hero.setAttribute('aria-label', 'Try load faces on the hero mascot');
  const cycle = ['calm', 'rising', 'overloaded'];
  let hi = 0;
  const applyHero = () => {
    hi = (hi + 1) % cycle.length;
    const lv = cycle[hi];
    state.hrvMs = lv === 'overloaded' ? 30 : lv === 'rising' ? 40 : 55;
    state.sessionMinutes = lv === 'overloaded' ? 45 : lv === 'rising' ? 25 : 15;
    render();
    renderLiveAnswer(lv);
  };
  hero.addEventListener('click', applyHero);
  hero.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyHero(); }
  });
}

app.start();
