// Adaptation helpers: load + optional loop status -> system context text and soft generation hints.
// Pure, no network. Used by the web overload button, Chrome extension (prompt prefix), and local MCP.
// Numbers and wording are ASSUMPTIONS for a prototype.

import { THRESHOLDS } from './engine.js?v=e86ad124';
import { analyzeLoop } from './loop.js?v=e86ad124';

export const LOAD_LEVELS = Object.freeze(['calm', 'rising', 'high', 'overloaded']);

/** Map a 0–100 (or null) load index / explicit overload into a level. */
export function loadLevel(loadIndex, { overloaded = false } = {}) {
  if (overloaded) return 'overloaded';
  const n = Number(loadIndex);
  if (!Number.isFinite(n)) return 'calm';
  if (n >= THRESHOLDS.breakNow) return 'high';
  if (n >= THRESHOLDS.breakSoon) return 'rising';
  return 'calm';
}

/**
 * Build a short system-context instruction the user can prepend (or an MCP tool can return).
 * Suggestive tone; never diagnostic.
 */
export function buildAdaptationContext({ level = 'calm', loopType = null, lang = 'en' } = {}) {
  const ko = lang === 'ko';
  const lines = [];
  if (level === 'overloaded' || level === 'high') {
    lines.push(ko
      ? '사용자가 지금 인지 부하가 높다고 알렸습니다. 먼저 한 문장 요약으로 시작하고, 그 아래에 전체 내용을 접어 둘 수 있게 "자세히" 부분으로 이어 주세요. 내용은 빼지 마세요. 한 가지씩, 쉬운 말로, 선택지는 최대 2개.'
      : 'The user reported high cognitive load. Start with a one-sentence summary, then give the full details below under a "Details" part that can be folded. Do not drop content. One thing at a time, plain language, at most 2 options.');
  } else if (level === 'rising') {
    lines.push(ko
      ? '사용자가 부담이 오르고 있다고 알렸습니다. 먼저 1~2문장 요약으로 시작하고, 그 아래에 전체 내용을 "자세히" 부분으로 이어 주세요. 내용은 빼지 마세요.'
      : 'The user reported rising load. Start with a 1–2 sentence summary, then the full details below under a "Details" part. Do not drop content.');
  } else {
    lines.push(ko
      ? '일반 밀도·속도로 답해도 됩니다. 사용자가 짧게 해 달라고 하면 맞춰 주세요.'
      : 'Normal density and pace are fine. Match the user if they ask for shorter replies.');
  }
  if (loopType) {
    lines.push(ko
      ? `대화가 "${loopType}" 패턴으로 맴돌 수 있습니다. 같은 제안을 반복하지 말고, 한 줄로 문제를 다시 정리하거나 다른 접근을 제안해 주세요.`
      : `The chat may be looping (${loopType}). Do not repeat the same suggestion; restate the problem in one line or offer a different approach.`);
  }
  lines.push(ko
    ? '사용자 상태를 단정하지 마세요("지친 것 같아요" 금지). "짧게 요약해 줄까요?"처럼 행동 제안으로만 말하세요.'
    : 'Never state how the user is (no "you seem tired"). Offer actions only, e.g. "Want a short summary?".');
  return lines.join(' ');
}

/**
 * Soft generation hints (not binding on any vendor).
 * Lighter levels change the STRUCTURE (summary first, full details kept), not a hard token cut, so nothing is lost.
 */
export function generationHints(level) {
  if (level === 'overloaded' || level === 'high') {
    return { structure: 'summary_then_details', summary_sentences: 1, keep_full_details: true, pace: 'slow', tone: 'plain', amount: 1, max_options: 2 };
  }
  if (level === 'rising') {
    return { structure: 'summary_then_details', summary_sentences: 2, keep_full_details: true, pace: 'steady', tone: 'plain', amount: 2, max_options: 3 };
  }
  return { structure: 'normal', summary_sentences: null, keep_full_details: true, pace: 'normal', tone: 'default', amount: 3, max_options: null };
}

/** Action-only suggestion line for a level (never a statement about the person). */
export function suggestionFor(level, lang = 'en') {
  const ko = lang === 'ko';
  if (level === 'overloaded' || level === 'high') return ko ? '짧게 요약해 줄까요?' : 'Want a short summary?';
  if (level === 'rising') return ko ? '핵심만 먼저 볼까요?' : 'See the key point first?';
  return null;
}

/**
 * Full adaptation payload for MCP get_adaptation / extension preview.
 * @param {{loadIndex?:number, overloaded?:boolean, turns?:Array, lang?:string}} input
 */
export function getAdaptation(input = {}) {
  const overloaded = Boolean(input.overloaded);
  const level = loadLevel(input.loadIndex, { overloaded });
  let loop = null;
  if (Array.isArray(input.turns) && input.turns.length >= 4) {
    try { loop = analyzeLoop(input.turns); } catch { loop = null; }
  }
  const loopType = loop?.detected ? loop.type : null;
  const lang = input.lang === 'ko' ? 'ko' : 'en';
  const context = buildAdaptationContext({ level, loopType, lang });
  const params = generationHints(level);
  return {
    level,
    overloaded,
    loadIndex: Number.isFinite(input.loadIndex) ? input.loadIndex : null,
    loop: loop ? { detected: loop.detected, type: loop.type, confidence: loop.confidence } : null,
    context,
    params,
    suggestion: suggestionFor(level, lang),
    preview: context,
  };
}
