// "Before / After / Recovered" story: a deterministic timeline of VIRTUAL values (no sensors, no model).
// storyAt(ms) is a pure function so the page, tests and the recorded video all show the same thing.
import { THRESHOLDS } from './engine.js';

export const STORY_MS = 18000;
export const DEFAULT_LEVELS = Object.freeze({ amount: 4, pace: 4 });

/** Phases in order. `at` = start time in ms. */
export const PHASES = Object.freeze([
  { id: 'long', at: 0 }, // long continuous replies
  { id: 'rising', at: 3000 }, // load climbs (orange, then magenta)
  { id: 'adjust', at: 6000 }, // Attune: shorter, bullets, slower
  { id: 'checkpoint', at: 9000 }, // checkpoint card + offer to rest
  { id: 'rest', at: 11500 }, // rest (virtual clock jumps)
  { id: 'resume', at: 13000 }, // resume card, answers relax
  { id: 'recovered', at: 15000 }, // back to the defaults
]);

// [ms, value] keyframes, linear between them (eased)
const LOAD = [[0, 18], [3000, 52], [6000, 86], [9000, 80], [11500, 74], [13000, 52], [15000, 34], [18000, 14]];
const AMOUNT = [[0, 4], [6000, 4], [7500, 2], [13000, 2], [15000, 3], [17000, 4], [18000, 4]];
const PACE = [[0, 4], [6000, 4], [7500, 2], [13000, 2], [15000, 3], [17000, 4], [18000, 4]];

const ease = (x) => x * x * (3 - 2 * x);
function sample(frames, ms) {
  if (ms <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    if (ms <= frames[i][0]) {
      const [t0, v0] = frames[i - 1];
      const [t1, v1] = frames[i];
      return v0 + (v1 - v0) * ease((ms - t0) / (t1 - t0));
    }
  }
  return frames[frames.length - 1][1];
}
export const zoneOf = (load) => (load >= THRESHOLDS.breakNow ? 'high' : load >= THRESHOLDS.breakSoon ? 'mid' : 'calm');

/** State of the story at time `ms` (clamped to 0..STORY_MS). */
export function storyAt(msIn) {
  const ms = Math.max(0, Math.min(STORY_MS, msIn));
  const phase = [...PHASES].reverse().find((p) => ms >= p.at).id;
  const load = Math.round(sample(LOAD, ms));
  const amount = Math.round(sample(AMOUNT, ms));
  const pace = Math.round(sample(PACE, ms));
  const style = ms >= 7000 && ms < 13000 ? 'bullets' : ms >= 13000 && ms < 15000 ? 'summary' : 'prose';
  const peak = ms >= 6000 && ms < 13000;
  const recovered = ms >= 15000 && load < THRESHOLDS.breakSoon && amount === DEFAULT_LEVELS.amount && pace === DEFAULT_LEVELS.pace;
  return {
    ms, phase, load, zone: zoneOf(load), amount, pace, style, peak, recovered,
    showCheckpoint: ms >= 9000 && ms < 13000,
    resting: ms >= 11500 && ms < 13000,
    showResume: ms >= 13000,
    chip: ms >= 6500 && ms < 15500,
    virtualMinutes: Math.round(sample([[0, 0], [9000, 38], [11500, 38], [13000, 53], [18000, 55]], ms)),
  };
}
