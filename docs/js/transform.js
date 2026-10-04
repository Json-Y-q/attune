// Rule-based text transform: long answer -> shorter / more structured version.
// No LLM, no network. Deterministic, language-agnostic heuristics (works for EN and KO).

/** Share of sentences kept (and a hard cap) per amount level. */
export const AMOUNT = Object.freeze({
  1: { ratio: 0.2, max: 3 },
  2: { ratio: 0.4, max: 5 },
  3: { ratio: 0.6, max: 8 },
  4: { ratio: 0.85, max: 12 },
  5: { ratio: 1, max: Infinity },
});

const STOP = new Set(
  'the a an and or but of to in on for with is are was were be this that it as at by from not you your can will which'.split(' '),
);
const ABBREV = /(?:\be\.g|\bi\.e|\betc|\bvs|\bDr|\bMr|\bMs)\.$/i;

/** Split text into sentences (keeps paragraph boundaries irrelevant). */
export function splitSentences(text) {
  const parts = String(text)
    .replace(/\r/g, '')
    .split(/\n+/)
    .flatMap((line) => line.trim().split(/(?<=[.!?]["')\]]*)\s+|(?<=[。！？])/u))
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const s of parts) {
    if (out.length && ABBREV.test(out[out.length - 1])) out[out.length - 1] += ` ${s}`;
    else out.push(s);
  }
  return out;
}

const tokens = (s) => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length >= 2 && !STOP.has(w));

/** Pick the `count` most informative sentences; the first one is always kept. Returns indices in order. */
export function selectKeySentences(sentences, count) {
  if (count >= sentences.length) return sentences.map((_, i) => i);
  const freq = new Map();
  const toks = sentences.map(tokens);
  toks.forEach((ts) => ts.forEach((w) => freq.set(w, (freq.get(w) || 0) + 1)));
  const scored = sentences.map((_, i) => {
    const uniq = new Set(toks[i]);
    let score = 0;
    uniq.forEach((w) => { score += freq.get(w) - 1; }); // words repeated elsewhere = topical
    score = score / Math.sqrt(uniq.size || 1);
    if (i === sentences.length - 1) score += 0.3;
    return { i, score };
  });
  const chosen = new Set([0]);
  scored
    .filter((x) => x.i !== 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, Math.max(0, count - 1))
    .forEach((x) => chosen.add(x.i));
  return [...chosen].sort((a, b) => a - b);
}

/** Break very long sentences at ';' / em dash so each line stays scannable. */
function softSplit(sentence, maxLen = 140) {
  if (sentence.length <= maxLen) return [sentence];
  return sentence.split(/\s*[;；]\s*|\s+—\s+/).filter(Boolean);
}

const group = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
export const countWords = (s) => (String(s).trim() ? String(s).trim().split(/\s+/).length : 0);

/**
 * @param {string} text
 * @param {{amount:number, style:'prose'|'summary'|'bullets'|'chunks'}} settings
 * @returns {{blocks:Array<{type:'tldr'|'p'|'li'|'chunk', text:string, index?:number, total?:number}>,
 *   stats:{inputSentences:number, keptSentences:number, inputWords:number, outputWords:number}}}
 */
export function transform(text, settings) {
  const sentences = splitSentences(text);
  const level = AMOUNT[settings.amount] ? settings.amount : 3;
  const { ratio, max } = AMOUNT[level];
  const count = Math.max(1, Math.min(max, Math.ceil(sentences.length * ratio)));
  const kept = sentences.length ? selectKeySentences(sentences, count).map((i) => sentences[i]) : [];

  let blocks = [];
  switch (settings.style) {
    case 'summary':
      if (kept.length) blocks.push({ type: 'tldr', text: kept[0] });
      group(kept.slice(1), 2).forEach((g) => blocks.push({ type: 'p', text: g.join(' ') }));
      break;
    case 'bullets':
      kept.flatMap((s) => softSplit(s)).forEach((s) => blocks.push({ type: 'li', text: s }));
      break;
    case 'chunks': {
      const pieces = group(kept.flatMap((s) => softSplit(s)), level >= 4 ? 2 : 1).map((g) => g.join(' '));
      pieces.forEach((s, i) => blocks.push({ type: 'chunk', text: s, index: i + 1, total: pieces.length }));
      break;
    }
    default: // 'prose'
      group(kept, 4).forEach((g) => blocks.push({ type: 'p', text: g.join(' ') }));
  }

  return {
    blocks,
    stats: {
      inputSentences: sentences.length,
      keptSentences: kept.length,
      inputWords: countWords(text),
      outputWords: blocks.reduce((n, b) => n + countWords(b.text), 0),
    },
  };
}

/** Plain-text rendering (tests, copy-to-clipboard). */
export function toPlainText(blocks, labels = { tldr: 'TL;DR', step: (i, n) => `[${i}/${n}]` }) {
  return blocks
    .map((b) => {
      if (b.type === 'tldr') return `${labels.tldr}: ${b.text}`;
      if (b.type === 'li') return `- ${b.text}`;
      if (b.type === 'chunk') return `${labels.step(b.index, b.total)} ${b.text}`;
      return b.text;
    })
    .join('\n\n');
}
