// Soft transition helpers: summary first, the full original kept in a folded block. Pure, no DOM.
import { splitSentences } from './transform.js?v=e86ad124';

/**
 * Build a soft view of an answer. Nothing is dropped: `full` is the original text, unchanged.
 * @param {string} text original answer
 * @param {{sentences?:number}} [opt] 1 or 2 summary sentences
 * @returns {{summary:string, full:string, folded:boolean}}
 */
export function softView(text, { sentences = 2 } = {}) {
  const full = String(text ?? '');
  const n = Math.max(1, Math.min(2, Math.round(sentences) || 1));
  const all = splitSentences(full);
  return { summary: all.slice(0, n).join(' '), full, folded: all.length > n };
}

/** Summary sentence count for an amount level (1 = shortest). */
export const summarySentences = (amount) => (amount <= 1 ? 1 : 2);

/** One step toward a target integer (density/pace change one level per turn). */
export function stepToward(current, target) {
  if (current === target) return current;
  return current + (target > current ? 1 : -1);
}
