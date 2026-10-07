// Auto-suggestion policy: daily cap + decline backoff. Pure functions, no DOM, no network.
// Shared verbatim by the site and the Chrome extension prototype (extension/lib/suggest.js).
// Values are ASSUMPTIONS for a prototype; not validated.

export const SUGGEST_KEY = 'tempoloon.suggest.v1';
export const DAILY_MAX_DEFAULT = 3;
export const DAILY_MAX_CHOICES = Object.freeze([2, 3]);
/** Quiet days after N consecutive declines (reject or ignore): 1 → 1 day, 2 → 3 days, 3+ → 7 days. */
export const BACKOFF_DAYS = Object.freeze([0, 1, 3, 7]);
export const DAY_MS = 86400000;
const HISTORY_MAX = 60;

/** Local calendar day, e.g. "2026-10-06". */
export function dayKey(now) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function newSuggestState(over = {}) {
  return { v: 1, enabled: true, dailyMax: DAILY_MAX_DEFAULT, day: null, shownToday: 0, declineStreak: 0, silentUntil: 0, history: [], ...over };
}

const clampMax = (n) => (DAILY_MAX_CHOICES.includes(Number(n)) ? Number(n) : Math.max(1, Math.min(DAILY_MAX_DEFAULT, Math.round(Number(n)) || DAILY_MAX_DEFAULT)));

/** Repair anything loaded from storage. */
export function normalizeSuggest(raw) {
  const base = newSuggestState();
  if (!raw || typeof raw !== 'object') return base;
  const num = (v, d) => (Number.isFinite(v) ? v : d);
  return {
    ...base,
    enabled: raw.enabled !== false,
    dailyMax: clampMax(raw.dailyMax ?? DAILY_MAX_DEFAULT),
    day: typeof raw.day === 'string' ? raw.day : null,
    shownToday: Math.max(0, num(raw.shownToday, 0)),
    declineStreak: Math.max(0, Math.min(BACKOFF_DAYS.length - 1, num(raw.declineStreak, 0))),
    silentUntil: Math.max(0, num(raw.silentUntil, 0)),
    history: Array.isArray(raw.history) ? raw.history.filter((h) => h && typeof h.ts === 'number').slice(-HISTORY_MAX) : [],
  };
}

const rollDay = (st, now) => (st.day === dayKey(now) ? st : { ...st, day: dayKey(now), shownToday: 0 });

/** May we show an automatic suggestion right now? */
export function canSuggest(state, now = Date.now()) {
  const st = rollDay(normalizeSuggest(state), now);
  const remaining = Math.max(0, st.dailyMax - st.shownToday);
  if (!st.enabled) return { ok: false, reason: 'off', remaining, until: null };
  if (st.silentUntil > now) return { ok: false, reason: 'backoff', remaining, until: st.silentUntil };
  if (remaining <= 0) return { ok: false, reason: 'cap', remaining: 0, until: null };
  return { ok: true, reason: null, remaining, until: null };
}

/** Count one shown suggestion against today's cap. */
export function markShown(state, now = Date.now()) {
  const st = rollDay(normalizeSuggest(state), now);
  return { ...st, shownToday: st.shownToday + 1 };
}

/** accept relaxes the backoff by one step and lifts quiet time; reject/ignore extend it (1 → 3 → 7 days). */
export function recordOutcome(state, outcome, now = Date.now()) {
  const st = rollDay(normalizeSuggest(state), now);
  const history = [...st.history, { ts: now, outcome }].slice(-HISTORY_MAX);
  if (outcome === 'accept') return { ...st, declineStreak: Math.max(0, st.declineStreak - 1), silentUntil: 0, history };
  if (outcome === 'reject' || outcome === 'ignore') {
    const streak = Math.min(BACKOFF_DAYS.length - 1, st.declineStreak + 1);
    return { ...st, declineStreak: streak, silentUntil: now + BACKOFF_DAYS[streak] * DAY_MS, history };
  }
  return st;
}

export const setEnabled = (state, on) => ({ ...normalizeSuggest(state), enabled: Boolean(on) });
export const setDailyMax = (state, n) => ({ ...normalizeSuggest(state), dailyMax: clampMax(n) });
/** Forget what was learned (streak, quiet time, history); keep the user's on/off and cap. */
export function resetSuggest(state) {
  const st = normalizeSuggest(state);
  return newSuggestState({ enabled: st.enabled, dailyMax: st.dailyMax });
}

/**
 * Decide whether existing signals justify an automatic offer. Returns a reason or null.
 * decision: partner decision ({ level, reasons }), loop: analyzeLoop result, loadIndex: 0-100.
 */
export function suggestTrigger({ decision = null, loop = null, loadIndex = 0, threshold = 50 } = {}) {
  if (loop && loop.detected) return 'loop';
  if (decision && decision.level >= 2 && Array.isArray(decision.reasons) && decision.reasons.length) return 'signals';
  if (Number(loadIndex) >= threshold) return 'load';
  return null;
}

/** Action-only phrase key for a trigger (never a statement about the person). */
export const suggestKey = (trigger) => (trigger === 'loop' ? 'sg_loop' : 'sg_short');
