// Conversation page controller: scripted partner simulation + text-to-speech (no microphone, no AI model, no network).
import { computeSettings } from './engine.js?v=e04ec2aa';
import { SAMPLE_PROFILE } from './profile.js?v=e04ec2aa';
import { transform, toPlainText } from './transform.js?v=e04ec2aa';
import { loadProfile, loadJSON, saveJSON, removeKey } from './storage.js?v=e04ec2aa';
import { initPage, renderBlocks, renderLoadMeter } from './ui.js?v=e04ec2aa';
import {
  newSession, userTurn, aiReplied, control, respondToSuggestion, undoAdjust, skipAhead, addSilence, silenceStage,
  activeSignals, loadIndexFor, density, effective, sessionMinutes, buildResumeCard, resumeExpired, SILENCE, SUGGESTION_TYPES,
} from './partner.js?v=e04ec2aa';
import { typeLive, typingCps } from './typing.js?v=e04ec2aa';
import { mountLoop } from './loopui.js?v=e04ec2aa';
import { mountMascotLoad, newSessionId } from './loadui.js?v=e04ec2aa';
import { levelInfo, ttsSupported, pickVoices, createSpeaker, speechSentences } from './voice.js?v=e04ec2aa';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const PREFS_KEY = 'attune.partner.prefs.v1';
const RESUME_KEY = 'attune.resume.v1';
const SPEED_KEY = 'attune.voice.level.v1';
const BASELINE_HRV = 55;
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const own = loadProfile();
const profile = own ?? SAMPLE_PROFILE;
const ui = { hrv: BASELINE_HRV, late: false, mode: 'text', pauseOverride: null, silenceTimer: null, speakText: '', online: false };
let session = null;
let sessionId = null;
let log = []; // {role:'you'|'ai'|'partner', ...} keys only, rendered on demand
let replyIdx = 0;
let suggestion = null; // pending suggestion type
let showCp = false;

const app = initPage(() => renderAll());
const tr = (k, p) => app.tr(k, p);
const cond = () => ({ baselineHrvMs: BASELINE_HRV, hrvMs: ui.hrv });

/* ---------- session ---------- */
function startSession() {
  sessionId = newSessionId();
  session = newSession({ profile, cond: cond(), mode: ui.mode, lateNight: ui.late, prefsOff: loadJSON(PREFS_KEY)?.off ?? [] });
  log = [];
  replyIdx = 0;
  suggestion = null;
  showCp = false;
  stopSilence();
  const saved = loadJSON(SPEED_KEY);
  if (Number.isInteger(saved) && saved >= 1 && saved <= 5) session.userPace = saved - session.base.speech;
  produceReply({ decision: null }, true);
}

const AI_KEYS = ['cv_ai_1', 'cv_ai_2', 'cv_ai_3'];
/** Builds the AI reply for the current settings. Returns the plain text length shown (for density). */
function produceReply({ decision }, push) {
  const eff = effective(session);
  const idx = replyIdx % AI_KEYS.length;
  const oneLine = Boolean(decision?.oneLine);
  const item = { role: 'ai', at: performance.now(), cps: typingCps(eff.speech), done: false, idx, amount: oneLine ? 1 : eff.amount, style: oneLine ? 'summary' : eff.style, pick: idx === 2 && eff.optionsMax != null, short: eff.amount < session.base.amount || oneLine };
  replyIdx += 1;
  const shown = replyText(item);
  session = aiReplied(session, shown.length);
  if (push) log.push(item);
  ui.speakText = shown;
  return item;
}
function replyBlocks(item) { return transform(tr(AI_KEYS[item.idx]), { amount: item.amount, style: item.style }).blocks; }
function replyText(item) {
  let t = toPlainText(replyBlocks(item), { tldr: tr('tldr'), step: (i, n) => `${i}/${n}` });
  if (item.idx === 1) t += `\n${tr('cv_important')}`;
  if (item.pick) t = tr('cv_pick');
  return t;
}

function say(key) { if (key) log.push({ role: 'partner', key }); }
function afterDecision(d, { reply = true } = {}) {
  if (d.messageKey) say(d.messageKey);
  suggestion = d.suggestion ?? suggestion;
  if (reply && !d.handoff) {
    const item = produceReply({ decision: d }, true);
    if (item.idx === 1 && item.short && d.rule !== 'R14') say('pm_r13'); // R13: keep the important line, say so
  }
  if (log.length > 14) log = log.slice(-14);
}

const USER_TEXT = { short: 'cv_u_short', clarify: 'cv_u_clarify', shorter: 'cv_u_shorter', tired: 'cv_u_tired', dismiss: 'cv_u_dismiss', normal: 'cv_u_normal', rapid: 'cv_u_rapid' };
function sendUser(text, key, gapSec = 40) {
  ui.speakStop?.();
  log.push({ role: 'you', key, text });
  const r = userTurn(session, { text, gapSec });
  session = r.state;
  if (ui.silenceTimer) stopSilence();
  afterDecision(r.decision);
  renderAll();
}

function act(a) {
  if (a === 'skip') { session = skipAhead(session, 10); renderAll(); return; }
  if (a === 'silence') { startSilence(); return; }
  if (a === 'rapid') {
    for (let i = 0; i < 10; i++) {
      const text = tr(USER_TEXT.rapid);
      const r = userTurn(session, { text, gapSec: 8 });
      session = r.state;
      if (i === 0) log.push({ role: 'you', key: 'cv_u_rapid', text, many: 10 });
      if (r.decision.messageKey && i > 0) say(r.decision.messageKey);
      suggestion = r.decision.suggestion ?? suggestion;
      const item = produceReply({ decision: r.decision }, i === 9);
      if (i === 9 && item.idx === 1 && item.short) say('pm_r13');
    }
    if (log.length > 14) log = log.slice(-14);
    renderAll();
    return;
  }
  sendUser(tr(USER_TEXT[a]), USER_TEXT[a]);
}

/* ---------- rendering ---------- */
let typer = null; // typing of the newest AI reply (restarted on every redraw from the time it began, so it never jumps)
function renderLog() {
  const box = $('cv-log');
  box.replaceChildren();
  typer?.cancel(); typer = null;
  const shown = log.slice(-8);
  const lastAi = [...shown].reverse().find((x) => x.role === 'ai' && !x.pick);
  for (const it of shown) {
    const row = el('div', `cv-row ${it.role}`);
    const who = it.role === 'you' ? tr('cv_you') : it.role === 'ai' ? tr('cv_ai') : tr('cv_partner');
    row.append(el('span', 'cv-who', who));
    const body = el('div', 'cv-body');
    if (it.role === 'you') body.textContent = it.key ? `${tr(it.key)}${it.many ? ` ×${it.many}` : ''}` : it.text;
    else if (it.role === 'partner') body.textContent = tr(it.key);
    else {
      if (it.pick) {
        body.append(el('p', null, tr('cv_pick')));
        const det = el('details');
        det.append(el('summary', null, tr('cv_options_fold')), el('p', null, tr(AI_KEYS[it.idx])));
        body.append(det);
      } else {
        const inner = el('div');
        renderBlocks(inner, replyBlocks(it), tr);
        body.append(inner);
        if (it === lastAi && it.at && !it.done && !reduced()) {
          inner.setAttribute('aria-hidden', 'true'); // screen readers get the whole reply at once, not letter by letter
          body.append(el('span', 'sr-only', replyText(it)));
          typer = typeLive(inner, { cps: it.cps, startedAt: it.at, onDone: () => { it.done = true; inner.removeAttribute('aria-hidden'); body.querySelector(':scope > .sr-only')?.remove(); } });
        }
      }
      if (it.idx === 1) {
        const imp = el('p', 'cv-important');
        imp.append(el('strong', null, `${tr('cv_important_label')}: `), tr('cv_important').replace(/^[^:]*:\s*/, ''));
        body.append(imp);
      }
    }
    row.append(body);
    box.append(row);
  }
  box.scrollTop = box.scrollHeight;
}

function renderSuggest() {
  const box = $('cv-suggest');
  box.hidden = !suggestion;
  box.replaceChildren();
  if (!suggestion) return;
  box.append(el('p', null, tr(suggestion === 'checkpoint' ? 'pm_r7' : 'pm_r8')));
  const row = el('div', 'row');
  [['accept', 'cv_sg_yes', 'btn'], ['reject', 'cv_sg_no', 'btn secondary'], ['never', 'cv_sg_never', 'btn secondary']].forEach(([ans, key, cls]) => {
    const b = el('button', cls, tr(key));
    b.type = 'button';
    b.addEventListener('click', () => answerSuggestion(ans));
    row.append(b);
  });
  box.append(row);
}
function answerSuggestion(ans) {
  const type = suggestion;
  suggestion = null;
  const r = respondToSuggestion(session, type, ans);
  session = r.state;
  if (r.persistOff) saveJSON(PREFS_KEY, { off: r.persistOff });
  if (ans === 'accept') {
    if (type === 'checkpoint') showCp = true;
    if (type === 'break') { saveJSON(RESUME_KEY, buildResumeCard(session, Date.now())); say('st_resume_msg'); }
  } else {
    say('pm_r12');
    if (session.offSession.includes(type)) log.push({ role: 'partner', key: 'cv_sg_off' });
  }
  renderAll();
}

function renderSignals() {
  const ids = activeSignals(session);
  const ul = $('cv-sig');
  ul.replaceChildren();
  if (!ids.length) ul.append(el('li', 'muted', tr('cv_sig_none')));
  ids.forEach((id) => ul.append(el('li', null, `${id} · ${tr(`sig_${id}`)}`)));
  const d = session.lastDecision;
  const names = tr('cv_levels');
  $('cv-decision').textContent = d && d.rule ? tr('cv_decision', { l: names[d.level], r: d.rule }) : tr('cv_decision_none');
  $('cv-why-line').textContent = d && d.rule ? tr('cv_why_line', { s: (d.reasons.length ? d.reasons : ids).join(' + ') || '–', l: names[d.level], r: d.rule }) : tr('cv_sig_none');
  const cools = SUGGESTION_TYPES.filter((t) => session.cooldown[t] && session.clock < session.cooldown[t].untilSec && session.turns.length < session.cooldown[t].untilTurn).map((t) => tr(`cv_type_${t}`));
  $('cv-cool').textContent = cools.length ? tr('cv_cooldown', { t: cools.join(', ') }) : tr('cv_cooldown_none');
  renderLoadMeter($('cv-meter'), loadIndexFor(session, profile, cond()), tr);
  const dn = density(session);
  $('cv-dens-bar').style.width = `${Math.min(100, Math.round(dn.ratio * 100))}%`;
  $('cv-dens-bar').dataset.level = String(dn.level);
  $('cv-dens-label').textContent = tr('cv_dens_levels')[dn.level];
  $('cv-dens-line').textContent = tr('cv_dens_line', { t: dn.turns10, c: dn.chars10 });
  $('cv-clock').textContent = tr('cv_clock', { m: sessionMinutes(session) });
  const eff = effective(session);
  $('cv-chip-row').hidden = !eff.chip;
  $('cv-chip').textContent = eff.chip ? tr(eff.chip === 'short' ? 'cv_chip_short' : 'cv_chip_lighter') : '';
}

function renderStart() {
  $('cv-profile').textContent = own ? tr('cv_profile_own', { date: new Date(own.createdAt).toLocaleDateString(app.lang) }) : tr('cv_profile_sample');
  $('cv-hrv-label').textContent = tr('cv_hrv', { v: ui.hrv });
  $('cv-hrv-help').textContent = tr('cv_hrv_help', { b: BASELINE_HRV });
  const b = session.base;
  const ul = $('cv-init');
  ul.replaceChildren();
  [tr('cv_init_speech', { n: b.speech }), tr('cv_init_amount', { n: b.amount }), tr('cv_init_thresh', { t: b.thresholds.turnLimit, c: b.thresholds.charLimit, m: b.thresholds.breakMinutes }),
    b.step ? tr('cv_init_step', { n: b.step }) : tr('cv_init_step0')].forEach((t) => ul.append(el('li', null, t)));
}

function renderVoice() {
  const eff = effective(session);
  const info = levelInfo(eff.speech);
  $('cv-level').value = String(eff.speech);
  $('cv-level-label').textContent = tr('cv_voice_level', { n: eff.speech, name: tr('cv_speed_names')[eff.speech - 1], r: info.rate.toFixed(2) });
  const pauseMs = ui.pauseOverride ?? info.pauseMs;
  $('cv-pause').value = String(pauseMs);
  $('cv-pause-label').textContent = tr('cv_pause_label', { ms: pauseMs });
  const sel = $('cv-voice-sel');
  const voices = pickVoices(app.lang, ui.online);
  const prev = sel.value;
  sel.replaceChildren();
  voices.forEach((v) => { const o = el('option', null, `${v.name} (${v.lang})`); o.value = v.name; sel.append(o); });
  if (prev) sel.value = prev;
  const warn = $('cv-voice-warn');
  warn.hidden = ttsSupported() && voices.length > 0;
  warn.textContent = !ttsSupported() ? tr('cv_no_tts') : voices.length ? '' : tr('cv_no_voice');
  const can = ttsSupported() && voices.length > 0;
  ['cv-play', 'cv-pause-btn', 'cv-stop', 'cv-summary', 'cv-repeat'].forEach((id) => { $(id).disabled = !can; });
  $('cv-slower').disabled = eff.speech <= 1;
  $('cv-faster').disabled = eff.speech >= 5;
  if (!$('cv-wpm').textContent) $('cv-wpm').textContent = tr('cv_wpm_none');
  if (!$('cv-vstatus').textContent) $('cv-vstatus').textContent = tr('cv_idle');
}

function renderSession() {
  $('cv-cp').hidden = !showCp;
  $('cv-cp-show').hidden = showCp;
  const card = loadJSON(RESUME_KEY);
  const valid = card && !resumeExpired(card, Date.now());
  if (card && !valid) removeKey(RESUME_KEY);
  $('cv-resume').textContent = valid ? tr('cv_resume_line', { topic: tr('cv_topic'), d: card.decided, o: card.open, date: new Date(card.savedAt).toLocaleDateString(app.lang) }) : tr('cv_resume_none');
  $('cv-resume-start').hidden = !valid;
  $('cv-resume-delete').hidden = !valid;
  const voice = session.mode === 'voice';
  $('cv-sil-text').hidden = voice;
  $('cv-sil').disabled = !voice;
  $('cv-sil').value = String(session.silence.sec);
  $('cv-sil-label').textContent = tr('cv_sil_slider', { s: session.silence.sec });
  const st = silenceStage(session.silence.sec);
  document.querySelectorAll('.cv-stages li').forEach((li) => { if (voice && li.dataset.st === st) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
  $('cv-stopped').hidden = !session.silence.paused;
}

function renderAll() {
  if (!session) return;
  renderStart();
  renderLog();
  renderSuggest();
  renderSignals();
  renderVoice();
  renderSession();
}

/* ---------- virtual silence ---------- */
function applySilence(target) {
  for (let s = session.silence.sec + 1; s <= target; s++) {
    const r = addSilence(session, s);
    session = r.state;
    if (r.decision.messageKey) say(r.decision.messageKey);
  }
  if (target < session.silence.sec) session.silence = { sec: target, said: {}, paused: false };
}
function stopSilence() { clearInterval(ui.silenceTimer); ui.silenceTimer = null; }
function startSilence() {
  if (session.mode !== 'voice') { session = addSilence(session, 10).state; renderAll(); $('cv-sil-text').focus?.(); return; }
  stopSilence();
  session.silence = { sec: 0, said: {}, paused: false };
  renderAll();
  if (reduced()) { applySilence(8); renderAll(); return; } // no timers with reduced motion: use the slider
  ui.silenceTimer = setInterval(() => {
    applySilence(session.silence.sec + 1);
    renderAll();
    if (session.silence.sec >= SILENCE.autopause + 1) stopSilence();
  }, 450);
}

/* ---------- voice ---------- */
const speaker = ttsSupported() ? createSpeaker({
  onSentence: (i, n) => { $('cv-vstatus').textContent = tr('cv_speaking', { i: i + 1, n }); },
  onTimed: ({ value, unit, sentences }) => { $('cv-wpm').textContent = tr('cv_wpm', { v: value, u: tr(unit === 'wpm' ? 'cv_unit_wpm' : 'cv_unit_spm'), n: sentences }); },
  onEnd: (reason) => { $('cv-vstatus').textContent = tr(reason === 'done' ? 'cv_done' : 'cv_idle'); },
}) : null;
ui.speakStop = () => speaker?.stop();
function speakOptions(slowerBy = 0) {
  const lang = app.lang === 'ko' ? 'ko-KR' : 'en-US';
  return {
    lang,
    level: () => Math.max(1, effective(session).speech - slowerBy),
    pauseMs: () => (ui.pauseOverride ?? levelInfo(Math.max(1, effective(session).speech - slowerBy)).pauseMs) + slowerBy * 200,
    voice: () => pickVoices(app.lang, ui.online).find((v) => v.name === $('cv-voice-sel').value) ?? pickVoices(app.lang, ui.online)[0],
  };
}
function speak(text, from = 0) { if (speaker) speaker.start(speechSentences(text), speakOptions(), from); }
function voiceControl(name) {
  session = control(session, name).state;
  if (name === 'slower') { say('pm_e2'); saveJSON(SPEED_KEY, effective(session).speech); }
  if (name === 'faster') saveJSON(SPEED_KEY, effective(session).speech);
  renderAll();
}

/* ---------- wiring ---------- */
document.querySelectorAll('.cv-act').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));
$('cv-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('cv-text').value.trim();
  if (!text) return;
  $('cv-text').value = '';
  sendUser(text, null);
});
$('cv-undo').addEventListener('click', () => { session = undoAdjust(session).state; say('pm_r12'); renderAll(); });
$('cv-why').addEventListener('click', () => { $('cv-why-panel').open = true; $('cv-why-panel').querySelector('summary').focus(); });
$('cv-reset').addEventListener('click', () => { startSession(); renderAll(); });
$('cv-hrv').addEventListener('input', (e) => { ui.hrv = Number(e.target.value); startSession(); renderAll(); });
$('cv-late').addEventListener('change', (e) => { ui.late = e.target.checked; startSession(); renderAll(); });
document.querySelectorAll('input[name="cvmode"]').forEach((r) => r.addEventListener('change', (e) => { ui.mode = e.target.value; startSession(); renderAll(); }));
$('cv-level').addEventListener('input', (e) => {
  const want = Number(e.target.value);
  const have = effective(session).speech;
  const name = want < have ? 'slower' : 'faster';
  for (let i = 0; i < Math.abs(want - have); i++) session = control(session, name).state;
  if (want < have) say('pm_e2');
  saveJSON(SPEED_KEY, effective(session).speech);
  renderAll();
});
$('cv-pause').addEventListener('input', (e) => { ui.pauseOverride = Number(e.target.value); renderVoice(); });
$('cv-online').addEventListener('change', (e) => { ui.online = e.target.checked; renderVoice(); });
$('cv-slower').addEventListener('click', () => voiceControl('slower'));
$('cv-faster').addEventListener('click', () => voiceControl('faster'));
$('cv-play').addEventListener('click', () => { if (speaker?.total && !speaker.running && speaker.index > 0 && speaker.index < speaker.total) speaker.resume(); else speak(ui.speakText); });
$('cv-pause-btn').addEventListener('click', () => { speaker?.pause(); $('cv-vstatus').textContent = tr('cv_paused', { i: (speaker?.index ?? 0) + 1, n: speaker?.total ?? 0 }); voiceControl('pause'); });
$('cv-stop').addEventListener('click', () => { speaker?.stop(); $('cv-vstatus').textContent = tr('cv_idle'); });
$('cv-summary').addEventListener('click', () => {
  voiceControl('summary');
  const blocks = transform(tr(AI_KEYS[(replyIdx + AI_KEYS.length - 1) % AI_KEYS.length]), { amount: 1, style: 'prose' }).blocks;
  speak(toPlainText(blocks));
});
$('cv-repeat').addEventListener('click', () => {
  voiceControl('repeat');
  if (speaker && speaker.total) speaker.repeatLast(speakOptions(1));
});
$('cv-sil').addEventListener('input', (e) => { stopSilence(); applySilence(Number(e.target.value)); renderAll(); });
$('cv-resume-listen').addEventListener('click', () => { session.silence = { sec: 0, said: {}, paused: false }; say('st_resume_msg'); renderAll(); });
$('cv-cp-show').addEventListener('click', () => { showCp = true; renderSession(); });
$('cv-resume-save').addEventListener('click', () => { saveJSON(RESUME_KEY, buildResumeCard(session, Date.now())); renderSession(); });
$('cv-resume-delete').addEventListener('click', () => { removeKey(RESUME_KEY); renderSession(); });
$('cv-resume-start').addEventListener('click', () => { startSession(); say('cv_resume_started'); renderAll(); });
if (ttsSupported()) globalThis.speechSynthesis.addEventListener?.('voiceschanged', () => renderVoice());

startSession();
mountLoop({ getSession: () => session, setSession: (s, off) => { session = s; if (off) saveJSON(PREFS_KEY, { off }); renderAll(); }, getLoad: () => loadIndexFor(session, profile, cond()) });
mountMascotLoad({
  getSession: () => session,
  setSession: (s) => { session = s; },
  getProfile: () => profile,
  getCond: () => cond(),
  getSessionId: () => sessionId,
  tr,
  onChange: ({ decision }) => {
    if (decision?.messageKey) say(decision.messageKey);
    // one click: regenerate the simulated reply immediately in the new mode (virtual AI, typed)
    produceReply({ decision }, true);
    if (log.length > 14) log = log.slice(-14);
    renderAll();
    const last = log.filter((x) => x.role === 'ai').at(-1);
    if (last && !reduced()) {
      // restart typing on the newest AI bubble at the new pace
      renderAll();
    }
  },
});
app.start();
