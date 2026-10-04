// Optional LLM adapter interface. This repo ships NO network code and needs NO API key:
// without an adapter (or when it fails) the rule-based transform is used.
import { transform } from './transform.js';

/**
 * @typedef {Object} DensityAdapter
 * @property {string} name
 * @property {(req:{text:string, settings:object, systemPrompt:string}) => Promise<string>} rewrite
 *   Return the rewritten answer as plain text. Lines starting with "- " become bullets.
 */

const STYLE_HINT = {
  prose: 'flowing short paragraphs',
  summary: 'a one-sentence TL;DR first, then short paragraphs',
  bullets: 'a flat bullet list, one idea per bullet',
  chunks: 'very short numbered chunks, one idea each, with plain wording',
};
const AMOUNT_HINT = { 1: '2-3 sentences', 2: 'about 40% of the length', 3: 'about 60% of the length', 4: 'about 85% of the length', 5: 'full length' };

/** System prompt an adapter can pass to any model. Never includes biometric or profile raw data. */
export function buildSystemPrompt(settings) {
  return [
    'Rewrite the answer below without adding facts or removing critical caveats.',
    `Length: ${AMOUNT_HINT[settings.amount] ?? AMOUNT_HINT[3]}.`,
    `Format: ${STYLE_HINT[settings.style] ?? STYLE_HINT.prose}.`,
    settings.pace <= 2 ? 'Use simple words and short sentences.' : 'Use clear, direct wording.',
    'Keep the original language.',
  ].join(' ');
}

/** Convert adapter plain text into the same block shape the rule-based transform returns. */
export function parseAdapterText(text) {
  return String(text)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/^[-*•]\s+/.test(l) ? { type: 'li', text: l.replace(/^[-*•]\s+/, '') } : { type: 'p', text: l }));
}

/**
 * Rewrite with an adapter if given; fall back to rules on missing adapter, error, timeout or empty output.
 * @param {string} text
 * @param {object} settings  from computeSettings()
 * @param {DensityAdapter|null} [adapter]
 */
export async function rewrite(text, settings, adapter = null, { timeoutMs = 8000 } = {}) {
  const fallback = (error) => ({ source: 'rules', error, ...transform(text, settings) });
  if (!adapter) return fallback(undefined);
  if (typeof adapter.rewrite !== 'function') return fallback('adapter has no rewrite()');
  let timer;
  try {
    const out = await Promise.race([
      adapter.rewrite({ text, settings, systemPrompt: buildSystemPrompt(settings) }),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), timeoutMs); }),
    ]);
    if (typeof out !== 'string' || !out.trim()) return fallback('empty adapter output');
    return { source: adapter.name || 'adapter', blocks: parseAdapterText(out), stats: null };
  } catch (e) {
    return fallback(e.message);
  } finally {
    clearTimeout(timer);
  }
}
