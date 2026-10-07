// Density engine: profile (+ optional "today's condition") -> output settings.
// Pure functions, no DOM, no network. Thresholds are ASSUMPTIONS, not validated.
import { DEFAULT_HRV_BASELINE_MS, STYLES, clamp, validateProfile } from './profile.js?v=647d0f36';

export const THRESHOLDS = Object.freeze({
  hrvDropStep1: 0.2, // HRV >= 20% below baseline -> one level lower
  hrvDropStep2: 0.4, // >= 40% below -> two levels lower
  breakSoon: 50, // load index
  breakNow: 75,
});

/** Streaming speed by pace level (characters per second). 0 = tap per chunk; Infinity = instant. */
export const PACE_CPS = Object.freeze({ 1: 0, 2: 15, 3: 30, 4: 60, 5: Infinity });

/** Relative HRV change vs. baseline, e.g. -0.33 = 33% below. */
export const hrvDeviation = (hrvMs, baselineMs) => (hrvMs - baselineMs) / baselineMs;

const isPositive = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0;

/**
 * @param {object} profile  see profile.js
 * @param {{hrvMs?:number, baselineHrvMs?:number, sessionMinutes?:number}|null} [condition]
 *        VIRTUAL values in this prototype (sliders / sample JSON).
 * @returns {{amount:number,pace:number,style:string,delivery:'step'|'stream'|'instant',charsPerSec:number,
 *   step:number,hrvDeviation:number|null,loadIndex:number|null,breakAdvice:'none'|'soon'|'now',
 *   reasons:string[],base:{amount:number,pace:number,style:string}}}
 */
export function computeSettings(profile, condition = null) {
  const v = validateProfile(profile);
  if (!v.ok) throw new TypeError(`invalid profile: ${v.errors.join('; ')}`);

  const base = { ...profile.levels };
  const reasons = [];
  let step = 0;
  let dev = null;
  let loadIndex = null;
  let breakAdvice = 'none';

  const c = condition ?? {};
  const baselineHrv = isPositive(c.baselineHrvMs) ? c.baselineHrvMs : (profile.baseline.hrvMs ?? DEFAULT_HRV_BASELINE_MS);
  if (isPositive(c.hrvMs)) {
    dev = hrvDeviation(c.hrvMs, baselineHrv);
    if (dev <= -THRESHOLDS.hrvDropStep2) { step = 2; reasons.push('hrv_drop_2'); }
    else if (dev <= -THRESHOLDS.hrvDropStep1) { step = 1; reasons.push('hrv_drop_1'); }
  }

  if (dev !== null || isPositive(c.sessionMinutes)) {
    const timeLoad = isPositive(c.sessionMinutes)
      ? Math.min(1, c.sessionMinutes / profile.baseline.fatigueLimitMin) * 60
      : 0;
    const hrvLoad = dev !== null ? clamp(-dev / THRESHOLDS.hrvDropStep2, 0, 1) * 40 : 0;
    loadIndex = Math.round(timeLoad + hrvLoad);
    if (loadIndex >= THRESHOLDS.breakNow) { breakAdvice = 'now'; reasons.push('break_now_lite'); }
    else if (loadIndex >= THRESHOLDS.breakSoon) { breakAdvice = 'soon'; reasons.push('break_soon'); }
  }

  let amount = clamp(base.amount - step, 1, 5);
  const pace = clamp(base.pace - step, 1, 5);
  const style = STYLES[clamp(STYLES.indexOf(base.style) + step, 0, STYLES.length - 1)];
  if (breakAdvice === 'now') amount = 1; // lite mode: shortest summary

  const charsPerSec = PACE_CPS[pace];
  const delivery = charsPerSec === 0 ? 'step' : Number.isFinite(charsPerSec) ? 'stream' : 'instant';

  return { amount, pace, style, delivery, charsPerSec, step, hrvDeviation: dev, loadIndex, breakAdvice, reasons, base };
}
