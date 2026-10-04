// Typewriter reveal for rendered answers. The visible length is a pure function of the elapsed time (typedChars), so the same
// state can be drawn at any moment: live typing, seeking in the story player, and the recorded video.
// Works on already-rendered DOM (paragraphs, bullets, summary box): text nodes are cut to length, a blinking cursor follows.
// With reduced motion everything is shown at once. Text goes in via text nodes only; no network, no storage.

/** Characters per second for the speech/pace level 1..5 (Korean syllables or English letters). Default level 4 = 20 per second. */
export const TYPING_CPS = Object.freeze([11, 14, 17, 20, 24]);
export const typingCps = (level) => TYPING_CPS[Math.min(5, Math.max(1, Math.round(Number(level) || 4))) - 1];
export const typedChars = (elapsedMs, cps) => Math.max(0, Math.floor((elapsedMs / 1000) * cps));

const textNodes = (root) => {
  const out = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let nd = w.nextNode(); nd; nd = w.nextNode()) if (nd.nodeValue.trim() !== '' && !nd.parentElement.closest('.type-cursor')) out.push({ node: nd, chars: Array.from(nd.nodeValue) });
  return out;
};
/** Remember the full text of `root` (call once after rendering). Returns the total number of characters. */
export function prepareTyping(root) {
  root._typing = { parts: textNodes(root), cursor: null };
  root._typing.total = root._typing.parts.reduce((a, p) => a + p.chars.length, 0);
  return root._typing.total;
}
/** Show only the first `n` characters (Infinity = everything) and put the cursor after the last visible one. */
export function revealChars(root, n) {
  const t = root._typing;
  if (!t) return;
  let left = n;
  let typing = null; // the part that is being typed right now
  for (const p of t.parts) {
    const take = Math.max(0, Math.min(p.chars.length, left));
    const text = p.chars.slice(0, take).join('');
    if (p.node.nodeValue !== text) p.node.nodeValue = text;
    if (!typing && take < p.chars.length) typing = p;
    left -= take;
  }
  if (!typing) { t.cursor?.remove(); t.cursor = null; return; } // finished: no cursor
  if (!t.cursor) { t.cursor = document.createElement('span'); t.cursor.className = 'type-cursor'; t.cursor.setAttribute('aria-hidden', 'true'); }
  if (typing.node.nextSibling !== t.cursor) typing.node.after(t.cursor);
}
/** Live typing: calls revealChars every frame until done. Returns { cancel(), finish() }. */
export function typeLive(root, { cps, startedAt = performance.now(), reduced = false, onDone = () => {} }) {
  const total = prepareTyping(root);
  if (reduced || total === 0) { revealChars(root, Infinity); onDone(); return { cancel() {}, finish() {} }; }
  let raf = 0;
  let stopped = false;
  const frame = () => {
    if (stopped) return;
    const n = typedChars(performance.now() - startedAt, cps);
    revealChars(root, n);
    if (n >= total) { onDone(); return; }
    raf = requestAnimationFrame(frame);
  };
  frame();
  return { cancel() { stopped = true; cancelAnimationFrame(raf); }, finish() { stopped = true; cancelAnimationFrame(raf); revealChars(root, Infinity); onDone(); } };
}
