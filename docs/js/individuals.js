// "Same conversation, different people": an illustration that the load builds up at a personal pace and that the point where
// Attune lightens the answers is personal too. Pure data + functions (no DOM), so it is unit-tested.
// All values are VIRTUAL. The characters differ only in colour, eye shape and a small accessory; nothing here depends on, or
// claims anything about, age, gender or any other group. The personal numbers come from the (virtual) onboarding baseline.
import { THRESHOLDS } from './engine.js?v=6972a45f';
import { clamp } from './profile.js?v=6972a45f';

/** One shared conversation: same length, same turns, same density for everybody. */
export const SHARED = Object.freeze({ minutes: 50, turns: 20, charsPerReply: 900, durationMs: 24000 });

/**
 * limitMin   = virtual "fatigue limit" from the onboarding baseline (minutes of this kind of conversation until the time part of the load reaches 60).
 * floor      = load at the start of the conversation (virtual).
 * adjustAt   = personal point on the 0-100 scale where Attune starts lightening the answers (from the same baseline).
 */
export const PERSONAS = Object.freeze([
  { id: 'a', variant: 'a', limitMin: 48, floor: 8, adjustAt: 54 },
  { id: 'b', variant: 'b', limitMin: 16, floor: 12, adjustAt: 55 },
  { id: 'c', variant: 'c', limitMin: 30, floor: 15, adjustAt: 45 },
  { id: 'd', variant: 'd', limitMin: 34, floor: 10, adjustAt: 60 },
]);
const EASE_PER_MIN = 0.55; // load falls this much per virtual minute after the lighter answers start (virtual)

export const msToMinutes = (ms) => clamp(ms, 0, SHARED.durationMs) / SHARED.durationMs * SHARED.minutes;
export const minutesToMs = (m) => Math.round(clamp(m, 0, SHARED.minutes) / SHARED.minutes * SHARED.durationMs);

/** Minute (virtual) at which the load first reaches the persona's adjust point. */
export function adjustMinute(p) {
  return +(((p.adjustAt - p.floor) / 60) * p.limitMin).toFixed(1);
}
const zone = (load) => (load >= THRESHOLDS.breakNow ? 'high' : load >= THRESHOLDS.breakSoon ? 'mid' : 'calm');

const smooth = (x) => { const c = clamp(x, 0, 1); return c * c * (3 - 2 * c); };
const DEFLATE_MS = 1100; // how long the "pshh" takes in animation time

/** State of one persona `ms` into the shared conversation. */
export function personaAt(p, ms) {
  const m = msToMinutes(ms);
  const am = adjustMinute(p);
  const rising = clamp(p.floor + 60 * (Math.min(m, am) / p.limitMin), 0, 100);
  const adjusted = m >= am;
  const load = adjusted ? clamp(rising - EASE_PER_MIN * (m - am), 0, 100) : rising;
  const lvl = zone(Math.round(load));
  // Everyone swells towards THEIR OWN limit: tension 1 = the personal adjust point, whatever the absolute number is.
  const tension = clamp(rising / p.adjustAt, 0, 1);
  const dt = adjusted ? ms - minutesToMs(am) : -1; // animation ms since the adjustment
  let puff; let shake; let sweat; let face; let air = 0;
  if (!adjusted) {
    puff = 1 + 0.34 * Math.pow(tension, 2.2);
    shake = +clamp((tension - 0.6) / 0.4, 0, 1).toFixed(2);
    sweat = tension > 0.92 ? 3 : tension > 0.78 ? 2 : tension > 0.55 ? 1 : 0;
    face = tension > 0.9 ? 'strain' : tension > 0.5 ? 'tense' : 'calm';
  } else {
    const peak = 1.34;
    puff = dt < 380 ? peak + (0.93 - peak) * smooth(dt / 380) : dt < DEFLATE_MS + 700 ? 0.93 + 0.07 * smooth((dt - 380) / (DEFLATE_MS + 320)) : 1;
    shake = 0;
    sweat = dt < DEFLATE_MS ? 1 : 0;
    face = dt < DEFLATE_MS ? 'tired' : 'ease';
    air = dt < 1500 ? +(dt / 1500).toFixed(3) : 0;
  }
  return {
    id: p.id, minute: +m.toFixed(1), load: Math.round(load), zone: lvl, adjusted, adjustedAtMin: am, adjustedAtMs: minutesToMs(am), tension: +tension.toFixed(3),
    pose: { zone: lvl, face, puff: +puff.toFixed(3), arc: +(0.7 + 0.75 * (adjusted ? 0.25 + 0.75 * (1 - smooth(dt / 3000)) : tension)).toFixed(2), shake, sweat, air, breathing: adjusted && dt >= DEFLATE_MS, variant: p.variant },
  };
}
/** Every persona at once; `order` lists ids from earliest to latest adjustment. */
export function allAt(ms) {
  const list = PERSONAS.map((p) => personaAt(p, ms));
  const order = [...PERSONAS].sort((x, y) => adjustMinute(x) - adjustMinute(y)).map((p) => p.id);
  return { ms, minute: +msToMinutes(ms).toFixed(1), list, order };
}
/** Rise speed in load points per virtual minute (before the adjust point). */
export const riseRate = (p) => +(60 / p.limitMin).toFixed(2);
