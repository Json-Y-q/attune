// Onboarding scoring: turns raw task results into a personal profile (plain JSON).
// All heuristics here are PROTOTYPE assumptions, not validated psychometrics.

export const PROFILE_VERSION = 1;
/** Expression styles, ordered from least to most structured. */
export const STYLES = ['prose', 'summary', 'bullets', 'chunks'];
export const DEFAULT_HRV_BASELINE_MS = 50; // virtual default; real baselines come later (roadmap)

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
/** Map a 0-100 score to a 1-5 level. */
export const levelFromScore = (score) => clamp(Math.round(1 + clamp(score, 0, 100) / 25), 1, 5);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Digit-span score: span 3 -> 0, span 9 -> 100. */
export function scoreDigitSpan(maxSpan) {
  return Math.round(clamp(((maxSpan - 3) / 6) * 100, 0, 100));
}

/**
 * Adaptive digit-span staircase. Start at `start` digits; a correct answer adds one digit,
 * two misses at the same length end the task.
 */
export class DigitSpanSession {
  constructor({ start = 3, max = 9, rng = Math.random } = {}) {
    this.length = start;
    this.max = max;
    this.rng = rng;
    this.fails = 0;
    this.trials = 0;
    this.maxSpan = 0;
    this.done = false;
    this.sequence = this.#next();
  }
  #next() {
    const digits = [];
    for (let i = 0; i < this.length; i++) {
      let d = Math.floor(this.rng() * 10);
      // avoid an immediate repeat (offset 1-9 can never land on the same digit)
      if (i > 0 && d === digits[i - 1]) d = (d + 1 + Math.floor(this.rng() * 9)) % 10;
      digits.push(d);
    }
    return digits.join('');
  }
  /** @param {string} answer digits typed by the user */
  answer(answer) {
    if (this.done) throw new Error('session finished');
    this.trials++;
    const correct = String(answer).replace(/\D/g, '') === this.sequence;
    if (correct) {
      this.maxSpan = Math.max(this.maxSpan, this.length);
      this.fails = 0;
      if (this.length >= this.max) this.done = true;
      else this.length++;
    } else if (++this.fails >= 2) {
      this.done = true;
    }
    if (!this.done) this.sequence = this.#next();
    return { correct, done: this.done };
  }
  result() {
    return { maxSpan: this.maxSpan, trials: this.trials };
  }
}

/**
 * Summarise a simple vigilance task (reaction times in ms).
 * lapse = response slower than `lapseMs`; drift = slowdown of last third vs first third (%).
 */
export function summarizeReaction(rts, { lapseMs = 500 } = {}) {
  const xs = rts.filter((x) => Number.isFinite(x) && x > 0);
  if (xs.length < 6) throw new RangeError('need at least 6 reaction times');
  const third = Math.max(2, Math.floor(xs.length / 3));
  const first = mean(xs.slice(0, third));
  const last = mean(xs.slice(-third));
  const avg = mean(xs);
  const med = median(xs);
  const sd = Math.sqrt(mean(xs.map((x) => (x - avg) ** 2)));
  const lapses = xs.filter((x) => x > lapseMs).length;
  const driftPct = ((last - first) / first) * 100;
  const base = 100 * (1 - (med - 250) / 300); // 250 ms -> 100, 550 ms -> 0
  const score = Math.round(clamp(base - 6 * lapses - Math.max(0, driftPct) * 0.2, 0, 100));
  return {
    trials: xs.length,
    medianMs: Math.round(med),
    meanMs: Math.round(avg),
    cvPct: Math.round((sd / avg) * 100),
    lapses,
    driftPct: Math.round(driftPct),
    score,
  };
}

const VOLUME_CHOICES = [1, 3, 5];
const PACE_CHOICES = [1, 3, 5];

/**
 * Build the profile.
 * @param {{digitSpan:{maxSpan:number,trials?:number}, reaction:number[], reading:{volume:1|3|5, structure:string, pace:1|3|5}}} raw
 */
export function buildProfile(raw, { now = new Date() } = {}) {
  const { digitSpan, reaction, reading } = raw;
  if (!VOLUME_CHOICES.includes(reading.volume)) throw new RangeError('reading.volume must be 1, 3 or 5');
  if (!PACE_CHOICES.includes(reading.pace)) throw new RangeError('reading.pace must be 1, 3 or 5');
  if (!STYLES.includes(reading.structure)) throw new RangeError('unknown reading.structure');

  const span = { maxSpan: digitSpan.maxSpan, trials: digitSpan.trials ?? null, score: scoreDigitSpan(digitSpan.maxSpan) };
  const attention = summarizeReaction(reaction);
  const capacityScore = Math.round(0.5 * span.score + 0.5 * attention.score);

  return {
    version: PROFILE_VERSION,
    createdAt: now.toISOString(),
    measures: { digitSpan: span, attention, reading: { ...reading } },
    baseline: {
      capacityScore,
      // Rough session length before fatigue risk rises (assumption): 20-60 min.
      fatigueLimitMin: Math.round(20 + 0.4 * capacityScore),
      hrvMs: null, // virtual HRV baseline is supplied in the demo, not measured
    },
    levels: {
      // Blend of measured capacity and stated preference.
      amount: Math.round((levelFromScore(capacityScore) + reading.volume) / 2),
      pace: Math.round((levelFromScore(attention.score) + reading.pace) / 2),
      style: reading.structure,
    },
    notice: 'Prototype. Not a medical device. Not a diagnosis. Not scientifically validated.',
  };
}

/** Light structural validation, used for imported / stored JSON. */
export function validateProfile(p) {
  const errors = [];
  const isLevel = (x) => Number.isInteger(x) && x >= 1 && x <= 5;
  if (!p || typeof p !== 'object') return { ok: false, errors: ['not an object'] };
  if (p.version !== PROFILE_VERSION) errors.push('unsupported version');
  if (!p.levels || !isLevel(p.levels.amount)) errors.push('levels.amount must be an integer 1-5');
  if (!p.levels || !isLevel(p.levels.pace)) errors.push('levels.pace must be an integer 1-5');
  if (!p.levels || !STYLES.includes(p.levels.style)) errors.push('levels.style invalid');
  const b = p.baseline;
  if (!b || !Number.isFinite(b.capacityScore) || !Number.isFinite(b.fatigueLimitMin)) errors.push('baseline invalid');
  if (b && b.hrvMs != null && !(Number.isFinite(b.hrvMs) && b.hrvMs > 0)) errors.push('baseline.hrvMs invalid');
  return { ok: errors.length === 0, errors };
}

/** Hand-made profile for trying the demo without taking the tests. */
export const SAMPLE_PROFILE = Object.freeze({
  version: PROFILE_VERSION,
  createdAt: '2026-01-01T00:00:00.000Z',
  measures: {},
  baseline: { capacityScore: 60, fatigueLimitMin: 44, hrvMs: null },
  levels: { amount: 4, pace: 4, style: 'summary' },
  notice: 'Sample profile (not measured).',
});
