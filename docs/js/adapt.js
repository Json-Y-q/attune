// Adaptation helpers: load + optional loop status -> system context text and soft generation hints.
// Pure, no network. Used by the web overload button, Chrome extension (prompt prefix), and local MCP.
// Numbers and wording are ASSUMPTIONS for a prototype.

import { THRESHOLDS } from './engine.js?v=395c86ef';
import { analyzeLoop } from './loop.js?v=395c86ef';

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
      ? '사용자가 지금 인지 부하가 높다고 알렸습니다. 답을 짧게(핵심 3줄 이내), 한 가지씩, 쉬운 말로 해주세요. 선택지는 최대 2개.'
      : 'The user reported high cognitive load. Keep answers short (about 3 key lines), one thing at a time, plain language. At most 2 options.');
  } else if (level === 'rising') {
    lines.push(ko
      ? '사용자가 부담이 오르고 있다고 느꼈습니다. 분량을 조금 줄이고, 먼저 요지를 말한 뒤 필요할 때만 자세히 적어 주세요.'
      : 'The user felt load rising. Shorten a little: lead with the gist, add detail only if needed.');
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
    ? '단정·진단 표현은 쓰지 마세요. 제안 어조로 말하세요.'
    : 'Do not sound diagnostic. Keep a suggestive tone.');
  return lines.join(' ');
}

/** Soft generation hints (not binding on any vendor). */
export function generationHints(level) {
  if (level === 'overloaded' || level === 'high') {
    return { max_tokens: 256, pace: 'slow', tone: 'plain', amount: 1 };
  }
  if (level === 'rising') {
    return { max_tokens: 512, pace: 'steady', tone: 'plain', amount: 2 };
  }
  return { max_tokens: 1024, pace: 'normal', tone: 'default', amount: 3 };
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
    preview: context,
  };
}
