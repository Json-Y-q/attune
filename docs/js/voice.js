// Text-to-speech wrapper (Web Speech API, speech OUTPUT only; the microphone and speech recognition are never used).
// The pure helpers at the top are unit-tested in Node; the browser part below is guarded.
import { splitSentences } from './transform.js?v=f2a7a765';

/** Level 1-5 table (spec 4-A). rate never goes below 0.8; use pauses and shorter sentences to go gentler. */
export const SPEECH_LEVELS = Object.freeze([
  { level: 1, rate: 0.8, pauseMs: 700, chunk: 2, wpm: 120, spm: 200 },
  { level: 2, rate: 0.9, pauseMs: 550, chunk: 3, wpm: 140, spm: 225 },
  { level: 3, rate: 1.0, pauseMs: 400, chunk: 4, wpm: 160, spm: 250 },
  { level: 4, rate: 1.1, pauseMs: 300, chunk: 5, wpm: 180, spm: 280 },
  { level: 5, rate: 1.25, pauseMs: 200, chunk: Infinity, wpm: 200, spm: 310 },
]);
export const levelInfo = (level) => SPEECH_LEVELS[Math.max(1, Math.min(5, Math.round(level))) - 1];
export const countSyllables = (s) => (String(s).match(/[\uAC00-\uD7A3]/g) || []).length;
export const countWords = (s) => (String(s).trim() ? String(s).trim().split(/\s+/).length : 0);
/** Speed from timing: words (EN) or Hangul syllables (KO) per minute. */
export function measureSpeed(text, ms, lang) {
  if (!(ms > 0)) return null;
  const units = lang === 'ko' ? countSyllables(text) : countWords(text);
  return { value: Math.round((units / ms) * 60000), unit: lang === 'ko' ? 'spm' : 'wpm' };
}
export const speechSentences = (text) => splitSentences(text);
/** Sentence index where the next check-in question would go (chunk size by level), or null. */
export const isChunkEnd = (index, level) => Number.isFinite(levelInfo(level).chunk) && (index + 1) % levelInfo(level).chunk === 0;

export const ttsSupported = () => typeof globalThis.speechSynthesis !== 'undefined' && typeof globalThis.SpeechSynthesisUtterance !== 'undefined';

/** Voices for a language; only on-device ones unless `allowOnline` (remote voices may send text out). */
export function pickVoices(lang, allowOnline = false) {
  if (!ttsSupported()) return [];
  return globalThis.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang) && (allowOnline || v.localService));
}

/**
 * Speaks sentences one by one with a pause between them. Returns controller { pause, resume, stop, state }.
 * Callbacks: onSentence(i, total), onTimed({value, unit}), onEnd(reason).
 */
export function createSpeaker({ onSentence = () => {}, onTimed = () => {}, onEnd = () => {} } = {}) {
  let sentences = [];
  let index = 0;
  let opts = {};
  let timer = null;
  let running = false;
  let timedWords = 0;
  let timedMs = 0;

  const clear = () => { clearTimeout(timer); timer = null; };
  function next() {
    if (!running) return;
    if (index >= sentences.length) { running = false; onEnd('done'); return; }
    const i = index;
    const u = new globalThis.SpeechSynthesisUtterance(sentences[i]);
    const info = levelInfo(opts.level());
    u.rate = info.rate;
    u.lang = opts.lang;
    if (opts.voice?.()) u.voice = opts.voice();
    let t0 = 0;
    u.onstart = () => { t0 = performance.now(); onSentence(i, sentences.length); };
    u.onend = () => {
      if (t0) {
        timedMs += performance.now() - t0;
        timedWords += opts.lang.startsWith('ko') ? countSyllables(sentences[i]) : countWords(sentences[i]);
        const unit = opts.lang.startsWith('ko') ? 'spm' : 'wpm';
        onTimed({ value: Math.round((timedWords / timedMs) * 60000), unit, sentences: i + 1 });
      }
      if (!running) return;
      index = i + 1;
      timer = setTimeout(next, opts.pauseMs());
    };
    u.onerror = () => { if (running) { running = false; onEnd('error'); } };
    globalThis.speechSynthesis.speak(u);
  }
  return {
    start(list, options, from = 0) {
      globalThis.speechSynthesis.cancel(); clear();
      sentences = list; opts = options; index = from; running = true; timedWords = 0; timedMs = 0;
      next();
    },
    pause() { running = false; clear(); globalThis.speechSynthesis.cancel(); },
    resume() { if (!running && sentences.length && index < sentences.length) { running = true; next(); } },
    stop() { running = false; clear(); globalThis.speechSynthesis.cancel(); index = 0; },
    get index() { return index; },
    get total() { return sentences.length; },
    get running() { return running; },
    /** Re-say the last sentence (one level slower is applied by the caller). */
    repeatLast(options) {
      globalThis.speechSynthesis.cancel(); clear();
      opts = options; index = Math.max(0, index - 1); running = true; next();
    },
  };
}
