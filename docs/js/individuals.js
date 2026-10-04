// "Same conversation, different people": an illustration that the load builds up at a personal pace and that the point where
// Attune lightens the answers is personal too. Pure data + functions (no DOM), so it is unit-tested.
// All values are VIRTUAL. The characters differ only in colour, eye shape and a small accessory; nothing here depends on, or
// claims anything about, age, gender or any other group. The personal numbers come from the (virtual) onboarding baseline.
import { THRESHOLDS } from './engine.js';
import { clamp } from './profile.js';

/** One shared conversation: same length, same turns, same density for everybody. */
export const SHARED = Object.freeze({ minutes: 50, turns: 20, charsPerReply: 900, durationMs: 15000 });

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

/** State of one persona `ms` into the shared conversation. */
export function personaAt(p, ms) {
  const m = msToMinutes(ms);
  const am = adjustMinute(p);
  const rising = clamp(p.floor + 60 * (Math.min(m, am) / p.limitMin), 0, 100);
  const adjusted = m >= am;
  const load = adjusted ? clamp(rising - EASE_PER_MIN * (m - am), 0, 100) : rising;
  const lvl = zone(Math.round(load));
  // Face follows the state: before the adjust point it tracks the meter; after it the face eases and the mascot breathes.
  const face = adjusted ? 'ease' : lvl === 'high' ? 'tired' : lvl === 'mid' ? 'tense' : 'calm';
  const puff = adjusted ? 1 : lvl === 'high' ? 1.04 : lvl === 'mid' ? 1.03 : 1;
  return {
    id: p.id, minute: +m.toFixed(1), load: Math.round(load), zone: lvl, adjusted, adjustedAtMin: am, adjustedAtMs: minutesToMs(am),
    pose: { zone: lvl, face, puff, sweat: adjusted ? 0 : lvl === 'high' ? 2 : lvl === 'mid' ? 1 : 0, breathing: adjusted, variant: p.variant },
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
