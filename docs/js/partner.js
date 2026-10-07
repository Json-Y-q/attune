// Conversation partner logic: signals (no sensors) -> level L0-L3 -> rule R1-R15 + E3 overload button -> adjustments.
// Pure functions, no DOM, no network, no storage. Spec: cogload-startup/09 (sections 2-C, 3, 4-C, 5).
// All numbers are ASSUMPTIONS for a prototype, not validated.
import { computeSettings, THRESHOLDS } from './engine.js?v=8bf31d35';
import { clamp } from './profile.js?v=8bf31d35';

export const WINDOW_TURNS = 5; // "recent 5 turns"
export const COOLDOWN = Object.freeze({ seconds: 20 * 60, turns: 15, spokenSeconds: 10 * 60 });
export const MAX_L3 = 2;
export const LONG_REPLY_CHARS = 300;
export const SILENCE = Object.freeze({ listen: 4, gentle: 8, options: 15, autopause: 25 });
export const RESUME_DAYS = 7;
export const SUGGESTION_TYPES = Object.freeze(['lighter', 'checkpoint', 'break', 'loop']);
export const LOOP_MIN_CONF = Object.freeze({ normal: 0.55, highLoad: 0.45 }); // with a high load index a weaker loop signal is enough, and it goes first

/* ---------- text signals (E1, B1) ---------- */
const RE = {
  crisis: /(kill myself|suicid|hurt myself|self[- ]?harm|end my life)|자해|자살|죽고 싶/i,
  dismiss: /\b(i['’]?m (fine|ok|okay)|keep going|carry on|no thanks)\b|괜찮아|계속해/i,
  tired: /\b(tired|exhausted|headache|overwhelmed|too much)\b|피곤|머리 아파|지쳤/i,
  shorter: /\b(shorter|short version|too long|tl;?dr|be brief|briefly)\b|짧게|너무 길/i,
  slower: /\b(slower|slow down)\b|천천히/i,
  clarify: /\b(what do you mean|what does that mean|say that again|come again|huh|i don['’]?t (get|understand))\b|^\s*\?+\s*$|무슨 말|무슨 뜻|다시 설명|이해가 안/i,
};
export const wordCount = (s) => (String(s).trim() ? String(s).trim().split(/\s+/).length : 0);

/** @returns {{crisis:boolean, explicit:'dismiss'|'tired'|'shorter'|'slower'|null, clarify:boolean}} */
export function detectText(text) {
  const s = String(text ?? '');
  if (RE.crisis.test(s)) return { crisis: true, explicit: null, clarify: false };
  const explicit = RE.dismiss.test(s) ? 'dismiss' : RE.tired.test(s) ? 'tired' : RE.shorter.test(s) ? 'shorter' : RE.slower.test(s) ? 'slower' : null;
  return { crisis: false, explicit, clarify: RE.clarify.test(s) };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/* ---------- starting point: profile + today's (virtual) condition ---------- */
/** Thresholds start from profile.baseline.fatigueLimitMin and tighten with a condition step. */
export function thresholdsFor(profile, cond = null) {
  const step = computeSettings(profile, cond).step;
  const r = (profile.baseline?.fatigueLimitMin ?? 44) / 44;
  const k = 1 - 0.2 * step;
  return {
    step,
    turnLimit: Math.max(8, Math.round(25 * r * k)), // turns per 10 min
    charLimit: Math.max(1500, Math.round(6000 * r * k)), // AI characters per 10 min
    breakMinutes: Math.max(10, Math.round((profile.baseline?.fatigueLimitMin ?? 44) * (1 - 0.15 * step))),
  };
}
/** Initial reply length (amount 1-5), speech level (1-5, same axis as pace) and thresholds. */
export function initialSettings(profile, cond = null) {
  const s = computeSettings(profile, cond);
  return { amount: s.amount, speech: s.pace, style: s.style, step: s.step, thresholds: thresholdsFor(profile, cond) };
}

/* ---------- session ---------- */
export function newSession({ profile, cond = null, mode = 'text', lateNight = false, prefsOff = [], seedLens = [58, 64, 61] } = {}) {
  const init = initialSettings(profile, cond);
  return {
    mode, lateNight, base: init, thr: init.thresholds,
    clock: 0, sessionStart: 0,
    turns: seedLens.map((len) => ({ at: 0, len, words: 8, seed: true, lowLen: false, short: false, clarify: false, repeat: false, explicit: null, norm: '' })),
    ai: [], lastAiChars: 0,
    controls: [], adjust: { amountDelta: 0, paceDelta: 0, optionsMax: null, chip: null }, userPace: 0,
    cooldown: {}, rejects: {}, offSession: [], offForever: [...prefsOff],
    offered: {}, pending: null, l3: 0, lastSpoken: -Infinity,
    silence: { sec: 0, said: {}, paused: false }, restedAt: null, lastDecision: null,
  };
}
const clone = (s) => structuredClone(s);
const turnsSinceDismiss = (st) => {
  const i = st.turns.map((t) => t.explicit).lastIndexOf('dismiss');
  return i < 0 ? st.turns : st.turns.slice(i + 1);
};
const blocked = (st, type) => {
  if (st.offSession.includes(type) || st.offForever.includes(type)) return true;
  const c = st.cooldown[type];
  return Boolean(c && st.clock < c.untilSec && st.turns.length < c.untilTurn);
};
export const sessionMinutes = (st) => Math.floor((st.clock - st.sessionStart) / 60);

export function density(st) {
  const from = st.clock - 600;
  const turns10 = st.turns.filter((t) => !t.seed && t.at >= from).length;
  const chars10 = st.ai.filter((a) => a.at >= from).reduce((n, a) => n + a.chars, 0);
  const ratio = Math.max(turns10 / st.thr.turnLimit, chars10 / st.thr.charLimit);
  return { turns10, chars10, ratio, level: ratio >= 1 ? 2 : ratio >= 0.6 ? 1 : 0 };
}

/** Active signals for the panel. `implicit` counts only B1, B2, B3, B7 (B4/B5/P1 never count). */
export function activeSignals(st) {
  const recent = turnsSinceDismiss(st).slice(-WINDOW_TURNS);
  const real = recent.filter((t) => !t.seed);
  const ids = [];
  const sinceDismiss = st.turns.map((t) => t.explicit).lastIndexOf('dismiss');
  if (real.some((t) => t.explicit === 'tired' || t.explicit === 'shorter')) ids.push('E1');
  if (st.controls.some((c) => c.turnIndex > sinceDismiss && c.turnIndex >= st.turns.length - WINDOW_TURNS)) ids.push('E2');
  if (real.some((t) => t.clarify)) ids.push('B1');
  const last3 = st.turns.slice(-3);
  if (st.mode === 'text' && last3.length === 3 && last3.every((t) => !t.seed && t.lowLen)) ids.push('B2');
  if (st.mode === 'voice' && last3.length === 3 && last3.every((t) => !t.seed && t.short)) ids.push('B3');
  if (real.some((t) => t.repeat)) ids.push('B7');
  if (st.silence.sec >= SILENCE.gentle) ids.push('B5');
  if (sessionMinutes(st) >= st.thr.breakMinutes) ids.push('B8');
  if (density(st).level === 2) ids.push('B9');
  if (st.lateNight) ids.push('P1');
  return ids;
}
const IMPLICIT = ['B1', 'B2', 'B3', 'B7'];
export const implicitCount = (ids) => ids.filter((i) => IMPLICIT.includes(i)).length;

/** Meter value on the same 0-100 scale as the demo meter (engine THRESHOLDS decide the colours). */
export function loadIndexFor(st, profile, cond = null) {
  const c = { ...(cond ?? {}), sessionMinutes: sessionMinutes(st) };
  const base = computeSettings(profile, c).loadIndex ?? 0;
  const ids = activeSignals(st);
  const recent = turnsSinceDismiss(st).slice(-WINDOW_TURNS).filter((t) => !t.seed);
  let extra = 0;
  if (recent.some((t) => t.explicit === 'tired')) extra += 20;
  else if (recent.some((t) => t.explicit === 'shorter')) extra += 10;
  if (ids.includes('E2')) extra += 8;
  extra += Math.min(20, 10 * recent.filter((t) => t.clarify).length);
  if (ids.includes('B2') || ids.includes('B3')) extra += 10;
  if (ids.includes('B7')) extra += 10;
  if (ids.includes('B9')) extra += 15;
  return clamp(Math.round(base + Math.min(50, extra)), 0, 100);
}

/** Effective reply length / speech level after adjustments. */
export function effective(st) {
  return {
    amount: clamp(st.base.amount + st.adjust.amountDelta, 1, 5),
    speech: clamp(st.base.speech + st.userPace + st.adjust.paceDelta, 1, 5),
    optionsMax: st.adjust.optionsMax,
    chip: st.adjust.chip,
    style: st.base.style,
  };
}

const finish = (st, d) => { st.lastDecision = d; return { state: st, decision: d }; };
const decision = (over = {}) => ({ level: 0, rule: null, reasons: [], messageKey: null, suggestion: null, oneLine: false, keepImportant: true, speak: false, handoff: false, ...over });

/** Record one user turn and decide. `gapSec` = virtual seconds since the previous event. */
export function userTurn(prev, { text, gapSec = 30 }) {
  const st = clone(prev);
  st.clock += Math.max(0, gapSec);
  st.silence = { sec: 0, said: {}, paused: false };
  easeAdjust(st);
  const det = detectText(text);
  const lens = st.turns.slice(-10).map((t) => t.len);
  const words = wordCount(text);
  const n = norm(text);
  const turn = {
    at: st.clock, len: String(text).trim().length, words, seed: false,
    lowLen: lens.length >= 3 && String(text).trim().length < 0.4 * median(lens),
    short: words > 0 && words <= 2,
    clarify: det.clarify,
    repeat: n.length > 2 && st.turns.slice(-5).some((t) => t.norm === n),
    explicit: det.explicit, norm: n,
  };
  st.turns.push(turn);
  if (det.crisis) { // R14: out of scope for this feature, hand off, no adjustments
    return finish(st, decision({ rule: 'R14', messageKey: 'pm_r14', handoff: true }));
  }
  if (det.explicit === 'dismiss') { // R12: back to L0 at once, start cooldowns
    st.adjust = { amountDelta: 0, paceDelta: 0, optionsMax: null, chip: null }; st.target = null;
    st.pending = null;
    for (const t of SUGGESTION_TYPES) st.cooldown[t] = { untilSec: st.clock + COOLDOWN.seconds, untilTurn: st.turns.length + COOLDOWN.turns };
    return finish(st, decision({ rule: 'R12', messageKey: 'pm_r12' }));
  }
  const ids = activeSignals(st);
  const n2 = implicitCount(ids);
  const need1 = st.lateNight ? 1 : 2; // P1 only lowers the thresholds by one step
  const need2 = st.lateNight ? 2 : 3;
  const lastLong = st.lastAiChars >= LONG_REPLY_CHARS;
  const quietOk = !blocked(st, 'lighter');

  if (det.explicit === 'tired') { // R2
    st.adjust = { ...st.adjust, amountDelta: Math.min(st.adjust.amountDelta, -2), optionsMax: 2, chip: 'lighter' };
    return finish(st, decision({ level: 1, rule: 'R2', reasons: ['E1'], messageKey: 'pm_r2' }));
  }
  if (det.explicit === 'shorter') { // R1
    st.adjust = { ...st.adjust, amountDelta: Math.min(st.adjust.amountDelta, -2), chip: 'short' };
    return finish(st, decision({ level: 1, rule: 'R1', reasons: ['E1'], messageKey: 'pm_r1' }));
  }
  if (det.explicit === 'slower') return control(st, 'slower', true);
  if (det.clarify && lastLong && n2 < need1) { // R3: never answer a clarification with a longer explanation
    return finish(st, decision({ level: 1, rule: 'R3', reasons: ['B1'], messageKey: 'pm_r3', oneLine: true }));
  }

  // L3 first (session level), at most MAX_L3 per session
  const dense = ids.includes('B9') || ids.includes('B8');
  if (dense && st.l3 < MAX_L3) {
    if (!st.offered.checkpoint && !blocked(st, 'checkpoint')) { // R7
      st.pending = 'checkpoint'; st.offered.checkpoint = true; st.l3 += 1;
      return finish(st, decision({ level: 3, rule: 'R7', reasons: ids.filter((i) => ['B8', 'B9'].includes(i)), messageKey: 'pm_r7', suggestion: 'checkpoint' }));
    }
    if (st.offered.checkpoint && !st.offered.break && n2 >= 2 && !blocked(st, 'break')) { // R8
      st.pending = 'break'; st.offered.break = true; st.l3 += 1;
      return finish(st, decision({ level: 3, rule: 'R8', reasons: ids.filter((i) => ['B8', 'B9', ...IMPLICIT].includes(i)), messageKey: 'pm_r8', suggestion: 'break' }));
    }
  }
  if (n2 >= need2 && quietOk) { // L2: one gentle sentence, nothing to answer
    st.adjust = { ...st.adjust, amountDelta: Math.min(st.adjust.amountDelta, -1), optionsMax: 2, chip: 'lighter' };
    return finish(st, decision({ level: 2, rule: 'R6', reasons: ids.filter((i) => IMPLICIT.includes(i)), messageKey: 'pm_r6' }));
  }
  if (n2 >= need1 && quietOk) { // L1: silent change + chip; in voice mode B3 slows the voice (R11)
    const voiceShort = st.mode === 'voice' && ids.includes('B3');
    st.adjust = { ...st.adjust, amountDelta: Math.min(st.adjust.amountDelta, -1), optionsMax: 2, chip: 'lighter',
      paceDelta: voiceShort ? Math.min(st.adjust.paceDelta, -1) : st.adjust.paceDelta };
    const speak = voiceShort && st.clock - st.lastSpoken >= COOLDOWN.spokenSeconds;
    if (speak) st.lastSpoken = st.clock;
    return finish(st, decision({ level: 1, rule: voiceShort ? 'R11' : 'R4', reasons: ids.filter((i) => IMPLICIT.includes(i)), messageKey: speak ? 'pm_r11' : null, speak }));
  }
  // R5: a long gap alone does nothing. R3 with other signals falls through to the combos above.
  return finish(st, decision({ rule: gapSec >= 120 ? 'R5' : null, reasons: ids.filter((i) => IMPLICIT.includes(i)) }));
}

/** E2: user controls (slower/faster/pause/summary/shorter). Explicit, so it acts at once. */
export function control(prev, name, alreadyCloned = false) {
  const st = alreadyCloned ? prev : clone(prev);
  st.controls.push({ turnIndex: st.turns.length - 1, name });
  if (name === 'slower') st.userPace = Math.max(-3, st.userPace - 1);
  else if (name === 'faster') st.userPace = Math.min(2, st.userPace + 1);
  else if (name === 'shorter') st.adjust = { ...st.adjust, amountDelta: Math.min(st.adjust.amountDelta, -2), chip: 'short' };
  return finish(st, decision({ level: 1, rule: 'E2', reasons: ['E2'], messageKey: name === 'slower' ? 'pm_e2' : null }));
}

/** Answer to a pending suggestion: 'accept' | 'reject' | 'never'. */
export function respondToSuggestion(prev, type, answer) {
  const st = clone(prev);
  if (st.pending === type) st.pending = null;
  const out = { state: st, decision: decision({ rule: 'R12', messageKey: null }), resumeCard: false, persistOff: null };
  if (answer === 'accept') {
    if (type === 'loop') st.cooldown.loop = { untilSec: st.clock + COOLDOWN.seconds, untilTurn: st.turns.length + COOLDOWN.turns }; // opened once: no second automatic offer for 20 minutes
    out.resumeCard = type === 'break';
    if (type === 'break') rest(st, 15);
    return out;
  }
  st.rejects[type] = (st.rejects[type] ?? 0) + 1;
  st.cooldown[type] = { untilSec: st.clock + COOLDOWN.seconds, untilTurn: st.turns.length + COOLDOWN.turns };
  if (st.rejects[type] >= 2 && !st.offSession.includes(type)) st.offSession.push(type);
  if (answer === 'never') { if (!st.offForever.includes(type)) st.offForever.push(type); out.persistOff = [...st.offForever]; }
  out.decision = decision({ rule: 'R12', messageKey: 'pm_r12' });
  st.lastDecision = out.decision;
  return out;
}

/** "Back to normal": undo quiet adjustments; counts as declining the 'lighter' adjustment. */
export function undoAdjust(prev) {
  const st = clone(prev);
  st.adjust = { amountDelta: 0, paceDelta: 0, optionsMax: null, chip: null }; st.target = null;
  st.rejects.lighter = (st.rejects.lighter ?? 0) + 1;
  st.cooldown.lighter = { untilSec: st.clock + COOLDOWN.seconds, untilTurn: st.turns.length + COOLDOWN.turns };
  if (st.rejects.lighter >= 2 && !st.offSession.includes('lighter')) st.offSession.push('lighter');
  return finish(st, decision({ rule: 'R12', messageKey: 'pm_r12' }));
}

/** A break of `minutes` (virtual). Over 5 minutes resets the session timer and the recent-signal window. */
export function rest(st, minutes) {
  st.clock += minutes * 60;
  if (minutes >= 5) {
    st.sessionStart = st.clock;
    st.turns = st.turns.map((t) => ({ ...t, seed: true })); // old turns no longer count as signals
    st.adjust = { amountDelta: 0, paceDelta: 0, optionsMax: null, chip: null }; st.target = null;
    st.restedAt = st.clock;
  }
  return st;
}
export function skipAhead(prev, minutes) { const st = clone(prev); st.clock += minutes * 60; return st; }

/** Record how long the AI reply shown to the user was (for the density estimate). */
export function aiReplied(prev, chars) {
  const st = clone(prev);
  st.ai.push({ at: st.clock, chars });
  st.lastAiChars = chars;
  return st;
}

/* ---------- virtual silence (voice, section 4-C) ---------- */
export function silenceStage(sec) {
  return sec >= SILENCE.autopause ? 'autopause' : sec >= SILENCE.options ? 'options' : sec >= SILENCE.gentle ? 'gentle' : sec >= SILENCE.listen ? 'listen' : 'wait';
}
export function addSilence(prev, sec) {
  const st = clone(prev);
  st.silence.sec = sec;
  const stage = silenceStage(sec);
  if (st.mode !== 'voice') return finish(st, decision({ rule: 'R5' })); // text: waiting alone changes nothing
  let key = null;
  if (stage === 'gentle' && !st.silence.said.gentle) { st.silence.said.gentle = true; key = 'pm_r9_gentle'; }
  if (stage === 'options' && !st.silence.said.options) { st.silence.said.options = true; key = 'pm_r9_options'; }
  if (stage === 'autopause' && !st.silence.paused) { st.silence.paused = true; key = 'pm_r9_pause'; }
  return finish(st, decision({ level: stage === 'wait' || stage === 'listen' ? 0 : 1, rule: stage === 'wait' ? null : 'R9', messageKey: key, reasons: stage === 'wait' ? [] : ['B5'] }));
}

/* ---------- resume card (stored by the caller; no conversation text) ---------- */
export function buildResumeCard(st, now = 0) {
  return { v: 1, savedAt: now, topic: 'sleep', turns: st.turns.filter((t) => !t.seed).length, decided: 2, open: 1 };
}
export const resumeExpired = (card, now) => !card || typeof card.savedAt !== 'number' || now - card.savedAt > RESUME_DAYS * 86400000;


/** E3: self-reported load via the mascot (calm | rising | overloaded). Immediate density/pace change. No cooldown gate. */
export function reportLoad(prev, level = 'overloaded') {
  const st = clone(prev);
  const lv = ['calm', 'rising', 'overloaded'].includes(level) ? level : 'overloaded';
  st.controls.push({ turnIndex: st.turns.length - 1, name: `load:${lv}` });
  const a = st.adjust;
  // Soft transition: set a target, move one level now, then one level per user turn (easeAdjust in userTurn).
  if (lv === 'calm') {
    setTarget(st, 0, 0);
    st.adjust = { ...a, optionsMax: null, chip: null };
  } else if (lv === 'rising') {
    setTarget(st, Math.min(a.amountDelta, -1), Math.min(a.paceDelta, 0));
    st.adjust = { ...a, optionsMax: 3, chip: 'lighter' };
  } else {
    setTarget(st, Math.min(a.amountDelta, -2), Math.min(a.paceDelta, -2));
    st.adjust = { ...a, optionsMax: 2, chip: 'short' };
  }
  easeAdjust(st);
  const msg = lv === 'calm' ? 'pm_e3_calm' : lv === 'rising' ? 'pm_e3_rising' : 'pm_e3';
  return finish(st, decision({ level: lv === 'calm' ? 1 : 2, rule: 'E3', reasons: ['E3'], messageKey: msg }));
}

function setTarget(st, amountDelta, paceDelta) {
  const sign = (x) => Math.sign(x);
  st.target = { amountDelta, paceDelta, dir: { amountDelta: sign(amountDelta - st.adjust.amountDelta), paceDelta: sign(paceDelta - st.adjust.paceDelta) } };
}

/** One level per call toward st.target (density and pace). Clears the target once reached. */
export function easeAdjust(st) {
  const t = st.target;
  if (!t) return st;
  let done = true;
  for (const k of ['amountDelta', 'paceDelta']) {
    const d = t.dir?.[k] ?? 0;
    const cur = st.adjust[k];
    if ((d < 0 && cur > t[k]) || (d > 0 && cur < t[k])) st.adjust = { ...st.adjust, [k]: cur + d };
    const now = st.adjust[k];
    if ((d < 0 && now > t[k]) || (d > 0 && now < t[k])) done = false;
  }
  if (done) st.target = null;
  return st;
}
/** True while density/pace is still stepping toward the reported level. */
export const isEasing = (st) => Boolean(st && st.target);
/** @deprecated use reportLoad(prev, 'overloaded') */
export function reportOverload(prev) { return reportLoad(prev, 'overloaded'); }

/**
 * R15: offer a way out of a conversation loop (see loop.js). One suggestion at a time, 20-minute cooldown, easy to decline or undo,
 * and the reasons are returned so the UI can show "why". With a high load index a weaker signal is enough and it goes before
 * the other suggestions (loop + rising load = step in first). The tone is a suggestion, never a diagnosis.
 * @param analysis result of analyzeLoop()
 * @returns {{state:object, decision:object, offered:boolean, blockedBy:null|'none'|'weak'|'pending'|'cooldown'|'off', priority:boolean}}
 */
export function offerLoopEscape(prev, analysis, { loadIndex = 0 } = {}) {
  const st = clone(prev);
  const high = Number.isFinite(loadIndex) && loadIndex >= THRESHOLDS.breakSoon;
  const stop = (blockedBy) => ({ ...finish(st, decision()), offered: false, blockedBy, priority: high });
  if (!analysis || !analysis.type) return stop('none');
  if (analysis.confidence < (high ? LOOP_MIN_CONF.highLoad : LOOP_MIN_CONF.normal)) return stop('weak');
  if (st.offSession.includes('loop') || st.offForever.includes('loop')) return stop('off');
  if (blocked(st, 'loop')) return stop('cooldown');
  if (st.pending && !(high && ['lighter', 'checkpoint'].includes(st.pending))) return stop('pending'); // one at a time
  st.pending = 'loop'; st.offered.loop = true;
  const d = decision({ level: 3, rule: 'R15', reasons: ['L1', ...(high ? ['L2'] : [])], messageKey: high ? 'pm_r15b' : 'pm_r15', suggestion: 'loop' });
  return { ...finish(st, d), offered: true, blockedBy: null, priority: high };
}
