// Loop detection and escape for AI conversations. Rule-based, local, pure functions: no DOM, no network, no storage, no microphone, no embeddings API.
// Input: an array of turns { role: 'user' | 'ai', text }. Output: a loop type with confidence and evidence, plus escape options.
// Similarity is plain token overlap (Jaccard) over words and Korean character bigrams, plus simple wording patterns (EN/KO).
// It is an assumption-based heuristic for a prototype, not a validated measurement, and it never states what a person feels or thinks.
import { t } from './i18n.js?v=e04ec2aa';

export const LOOP_TYPES = Object.freeze(['reask', 'same_answer', 'wavering', 'stalled']);
export const LOOP_THRESHOLD = 0.55; // minimum confidence to call something a loop
export const MIN_TURNS = 4; // at least two user turns and four turns in total
export const MAX_TURNS = 60;
export const MAX_CHARS = 4000; // per turn
export const MAX_INPUT_CHARS = 20000;

/* ---------- text -> tokens ---------- */
const STOP = new Set('the a an and or but if then so to of in on at for with from by as is are was were be been it its this that these those i you he she we they me my your our do does did not no yes can could would should will just please how what why when where which who also very more some any about into out up down over again still than too'.split(' '));
const KO_PARTICLE = /(으로서|에서는|에서|에게|으로|까지|부터|이랑|하고|처럼|은|는|이|가|을|를|에|의|도|로|와|과|요|죠|야|만)$/;
const HANGUL = /^[\uAC00-\uD7A3]+$/;
const strip = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');

/** Set of content tokens: latin/number words (stop words removed) and, for Korean, character bigrams of the word stem. */
export function tokens(text) {
  const out = new Set();
  for (const w of strip(text).split(/\s+/)) {
    if (!w) continue;
    if (HANGUL.test(w)) {
      const stem = w.length > 2 ? w.replace(KO_PARTICLE, '') || w : w;
      if (stem.length === 1) out.add(stem);
      else { for (let i = 0; i < stem.length - 1; i++) out.add(stem.slice(i, i + 2)); if (stem.length > 2) out.add(stem); }
    } else if (/[\p{L}\p{N}]/u.test(w) && (w.length > 1 || /\d/.test(w)) && !STOP.has(w)) out.add(w);
  }
  return out;
}
export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}
/** Similarity of two texts, 0..1 (Jaccard on tokens). Very short texts (under 3 tokens, like “ok” or “hi”) never count as similar. */
export function similarity(a, b) {
  const ta = tokens(a), tb = tokens(b);
  if (Math.min(ta.size, tb.size) < 3) return 0;
  return jaccard(ta, tb);
}

/* ---------- wording patterns (EN + KO) ---------- */
export const RE = {
  complaint: /\b(still (not|doesn['’]?t|isn['’]?t|broken|fails?|the same|getting)|not working|doesn['’]?t work|didn['’]?t work|same (error|problem|issue|thing|result|answer)|that['’]?s not what i|you (already|just) (said|told|suggested)|already tried|i (already )?(asked|said|told you)|as i (said|mentioned)|going in circles|again and again|keeps? (happening|failing|giving)|useless|no,? that['’]?s (wrong|not)|same thing again)\b|아직도|여전히|똑같(은|이|아)|또 (같은|똑같|안|이)|그대로(예요|야|네)?|안 ?(돼|되|됩니다|돼요)|해결(이|은)? ?(안|못)|그게 아니(라|고|에요)|방금 (말|했|알려)|이미 (해|시도|말|써)|계속 (같은|이래|안|그래)|소용(이)? ?없|같은 (오류|에러|답|말)|제대로 (안|못)|왜 (자꾸|계속)|몇 번(이나)?째/i,
  resolved: /\b(thanks?|thank you|that (worked|fixed it)|it works now|works now|solved|fixed|perfect|got it|makes sense|great,? (thanks|that))\b|고마워|감사(합니다|해요|해)|해결(됐|되었|했)|잘 (돼|됩|작동)|됐(어요|습니다)|성공(했|이)|이해(했|됐)/i,
  switch: /\b(actually|instead|never ?mind|forget (that|it)|let['’]?s (try|do) (something )?(else|another|different)|on second thought|scratch that|how about (we )?(do|use|try)|what if (we|i) (use|do|try)|different (way|approach|idea))\b|아니 (그냥|다시|잠깐)|그냥 (다른|이걸|그건)|다른 (방법|방식|걸로|거로)|말고 (다른|이걸)|바꿔(서|볼|줘)|생각해 보니|아니다|취소|처음부터 다시/i,
  advice: /^(?:[-*•]\s*|\d+[.)]\s*)?(try|use|run|check|clear|restart|reinstall|install|update|upgrade|add|set|change|delete|remove|make sure|ensure|open|click|go to|enable|disable|reset|reboot|rebuild|clean|verify|replace|rename)\b|(해 ?보세요|해보세요|하세요|시도|확인해|재시작|재설치|설치해|삭제해|초기화|업데이트해|바꿔 ?보|열어|지워)/i,
  error: /((?:[\w.]*(?:error|exception)|traceback|failed|cannot|can['’]?t find|not found|undefined|permission denied|timeout|timed out)\b[^\n]{0,70})|((?:오류|에러|실패|찾을 수 없|권한|시간 ?초과)[^\n]{0,50})/i,
};
const normLine = (s) => strip(s).replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
const sentences = (text) => String(text).split(/(?<=[.!?。？！])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

/* ---------- parsing a pasted conversation ---------- */
const USER_MARK = /^\s*(you|me|user|human|나|사용자|유저|질문)\s*[:：]\s*/i;
const AI_MARK = /^\s*(ai|assistant|bot|chatgpt|gpt|claude|gemini|grok|attune|답변|어시스턴트)\s*[:：]\s*/i;
/** Text -> turns. Lines starting with "You:" / "AI:" (or 나: / AI:) mark turns; without markers, blank-line separated blocks alternate user, AI. */
export function parseConversation(input) {
  const text = String(input ?? '').slice(0, MAX_INPUT_CHARS).replace(/\r\n?/g, '\n');
  const turns = [];
  let cur = null;
  let marked = false;
  for (const line of text.split('\n')) {
    const u = line.match(USER_MARK), a = u ? null : line.match(AI_MARK);
    if (u || a) { marked = true; cur = { role: u ? 'user' : 'ai', text: line.slice((u || a)[0].length) }; turns.push(cur); } else if (cur) cur.text += `\n${line}`;
  }
  let out = turns;
  if (!marked) {
    out = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b, i) => ({ role: i % 2 === 0 ? 'user' : 'ai', text: b }));
  }
  return out.map((x) => ({ role: x.role, text: x.text.trim().slice(0, MAX_CHARS) })).filter((x) => x.text).slice(-MAX_TURNS);
}

/* ---------- analysis ---------- */
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const pct = (x) => Math.round(x * 100);

function errorSignatures(text) {
  const sigs = new Set();
  for (const line of String(text).split('\n')) { const m = line.match(RE.error); if (m) sigs.add(normLine(m[0]).slice(0, 80)); }
  return [...sigs].filter((s) => s.length > 5);
}
/** Advice-like sentences of an AI turn (list items, imperative sentences). */
export function adviceItems(text) {
  return sentences(text).map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')).filter((s) => RE.advice.test(s.trim()) && tokens(s).size >= 2);
}

/**
 * @param {{role:'user'|'ai', text:string}[]} input
 * @returns {{ detected:boolean, resolved:boolean, tooFew:boolean, type:string|null, confidence:number, scores:Record<string,number>, evidence:{key:string, params:object}[], progress:number, turns:number, userTurns:number }}
 */
export function analyzeLoop(input) {
  const turns = (Array.isArray(input) ? input : []).filter((x) => x && (x.role === 'user' || x.role === 'ai') && typeof x.text === 'string' && x.text.trim()).slice(-MAX_TURNS).map((x) => ({ role: x.role, text: x.text.slice(0, MAX_CHARS) }));
  const scores = { reask: 0, same_answer: 0, wavering: 0, stalled: 0 };
  const base = { detected: false, resolved: false, tooFew: false, type: null, confidence: 0, scores, evidence: [], progress: 1, turns: turns.length, userTurns: turns.filter((x) => x.role === 'user').length };
  if (turns.length < MIN_TURNS || base.userTurns < 2) return { ...base, tooFew: true };

  const idx = (role) => turns.map((x, i) => (x.role === role ? i : -1)).filter((i) => i >= 0);
  const U = idx('user'), A = idx('ai');
  const tok = turns.map((x) => tokens(x.text));
  const complaint = turns.map((x) => x.role === 'user' && RE.complaint.test(x.text));
  const lastUser = turns[U.at(-1)];
  if (RE.resolved.test(lastUser.text) && !complaint[U.at(-1)]) return { ...base, resolved: true };

  const ev = { reask: [], same_answer: [], wavering: [], stalled: [] };
  const complaints = U.filter((i) => complaint[i]);

  /* 1. the user asks again */
  let maxSim = 0, pairs = 0, best = null;
  for (let a = 0; a < U.length; a += 1) {
    for (let b = a + 1; b < Math.min(U.length, a + 4); b += 1) {
      const s = similarity(turns[U[a]].text, turns[U[b]].text);
      if (s >= 0.4) pairs += 1;
      if (s > maxSim) { maxSim = s; best = [U[a], U[b]]; }
    }
  }
  const afterFirst = complaints.filter((i) => i > U[0]).length;
  let reask = pairs ? 0.6 * clamp01((maxSim - 0.3) / 0.4) + 0.25 * clamp01(afterFirst / 2) + 0.15 * clamp01((pairs - 1) / 2) : Math.min(0.25, 0.1 * afterFirst);
  if (pairs && !afterFirst) reask = Math.min(reask, maxSim >= 0.9 ? 0.7 : 0.45); // similar wording with no sign of dissatisfaction (a follow-up question) stays below the threshold unless it is nearly verbatim
  scores.reask = clamp01(reask);
  if (pairs) ev.reask.push({ key: 'lo_ev_reask', params: { a: best[0] + 1, b: best[1] + 1, s: pct(maxSim) } });
  if (afterFirst) ev.reask.push({ key: 'lo_ev_complaint', params: { a: complaints.filter((i) => i > U[0]).map((i) => i + 1).join(', ') } });

  /* 2. the AI repeats itself (same answer, same suggestion, same error afterwards) */
  let aMax = 0, aBest = null;
  for (let a = 0; a < A.length; a += 1) {
    for (let b = a + 1; b < A.length; b += 1) {
      if (tok[A[a]].size < 6 || tok[A[b]].size < 6) continue;
      const s = jaccard(tok[A[a]], tok[A[b]]);
      if (s > aMax) { aMax = s; aBest = [A[a], A[b]]; }
    }
  }
  const adviceCount = new Map(); // normalised advice -> number of AI turns containing it
  const seenAdvice = A.map((i) => adviceItems(turns[i].text));
  seenAdvice.forEach((items, ai) => items.forEach((s) => {
    for (const [k, v] of adviceCount) if (jaccard(tokens(k), tokens(s)) >= 0.7) { if (v.last !== ai) { v.n += 1; v.last = ai; } return; }
    adviceCount.set(s, { n: 1, last: ai });
  }));
  let topAdvice = null;
  for (const [k, v] of adviceCount) if (!topAdvice || v.n > topAdvice.n) topAdvice = { q: k, n: v.n };
  const sigTurns = new Map();
  U.forEach((i) => errorSignatures(turns[i].text).forEach((s) => { const arr = sigTurns.get(s) ?? []; arr.push(i); sigTurns.set(s, arr); }));
  let errRepeat = null;
  for (const [, arr] of sigTurns) if (arr.length >= 2 && (!errRepeat || arr.length > errRepeat.length)) errRepeat = arr;
  const simScore = clamp01((aMax - 0.4) / 0.35);
  const adviceScore = topAdvice && topAdvice.n >= 2 ? clamp01(0.5 + (topAdvice.n - 2) * 0.25) : 0;
  const errScore = errRepeat ? 1 : 0;
  scores.same_answer = clamp01(0.5 * simScore + 0.35 * adviceScore + 0.2 * errScore + (simScore && adviceScore ? 0.1 : 0));
  if (aBest && simScore > 0) ev.same_answer.push({ key: 'lo_ev_aisame', params: { a: aBest[0] + 1, b: aBest[1] + 1, s: pct(aMax) } });
  if (adviceScore) ev.same_answer.push({ key: 'lo_ev_aiadvice', params: { n: topAdvice.n, q: topAdvice.q.slice(0, 80) } });
  if (errRepeat) ev.same_answer.push({ key: 'lo_ev_error', params: { a: errRepeat[0] + 1, b: errRepeat.at(-1) + 1 } });

  /* 3. direction keeps changing */
  const switchTurns = U.filter((i) => i > U[0] && RE.switch.test(turns[i].text));
  let lowPairs = 0;
  for (let k = 1; k < U.length; k += 1) if (tok[U[k]].size >= 3 && tok[U[k - 1]].size >= 3 && jaccard(tok[U[k]], tok[U[k - 1]]) < 0.08) lowPairs += 1;
  const drift = tok[U[0]].size >= 3 && tok[U.at(-1)].size >= 3 ? 1 - jaccard(tok[U[0]], tok[U.at(-1)]) : 0;
  let wav = U.length >= 4 ? 0.5 * clamp01(switchTurns.length / 3) + 0.3 * clamp01(lowPairs / 3) + 0.2 * drift : 0;
  if (!(switchTurns.length >= 2 || (switchTurns.length >= 1 && lowPairs >= 2))) wav = Math.min(wav, 0.3); // one change of mind is normal
  scores.wavering = clamp01(wav);
  if (switchTurns.length) ev.wavering.push({ key: 'lo_ev_switch', params: { a: switchTurns.map((i) => i + 1).join(', ') } });
  if (scores.wavering >= 0.4) ev.wavering.push({ key: 'lo_ev_drift', params: { s: pct(1 - drift) } });

  /* 4. long and still unresolved: progress score (0 = none, 1 = clearly moving) */
  const seen = new Set();
  let novelty = 0;
  U.forEach((i, k) => { const nw = [...tok[i]].filter((x) => !seen.has(x)).length; if (k > 0 && tok[i].size) novelty += nw / tok[i].size; tok[i].forEach((x) => seen.add(x)); });
  novelty = U.length > 1 ? novelty / (U.length - 1) : 1;
  const complaintShare = complaints.length / U.length;
  const repeatShare = U.length > 1 ? Math.min(1, pairs / (U.length - 1)) : 0;
  const aiVariety = aBest ? 1 - aMax : 1;
  const progress = clamp01(0.2 * clamp01(novelty / 0.6) + 0.4 * (1 - complaintShare) + 0.2 * (1 - repeatShare) + 0.2 * aiVariety);
  const lengthScore = clamp01((turns.length - 6) / 10);
  scores.stalled = clamp01(lengthScore * (0.55 * (1 - progress) + 0.45 * clamp01(complaints.length / 3)) * 1.25);
  if (lengthScore > 0 && scores.stalled >= 0.3) {
    ev.stalled.push({ key: 'lo_ev_long', params: { n: turns.length } });
    ev.stalled.push({ key: 'lo_ev_noprogress', params: { p: pct(progress) } });
  }

  // the most specific type wins; "long and unresolved" is the fallback
  // the AI repeating itself is the root cause when it happens (the person then naturally repeats the question too)
  let type = scores.same_answer >= LOOP_THRESHOLD ? 'same_answer' : ['reask', 'wavering'].filter((k) => scores[k] >= LOOP_THRESHOLD).sort((x, y) => scores[y] - scores[x])[0] ?? null;
  if (!type && scores.stalled >= LOOP_THRESHOLD) type = 'stalled';
  const evidence = type ? [...ev[type], ...(type === 'stalled' ? [] : ev.stalled.slice(0, 1))] : [];
  return { ...base, detected: Boolean(type), type, confidence: type ? Math.min(0.95, +scores[type].toFixed(2)) : 0, scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, +v.toFixed(2)])), evidence, progress: +progress.toFixed(2) };
}

/* ---------- escape options (content is built from the user's own words; suggestions, never a verdict) ---------- */
const cut = (x, n) => (x.length > n ? `${x.slice(0, n - 1).trimEnd()}…` : x);
/** The most informative sentence of a message (the one with the most content words; ties go to the earlier one). */
const bestSentence = (s, n = 140) => { const x = [...sentences(s)].sort((a, b) => tokens(b).size - tokens(a).size)[0] ?? ''; return x.length > n ? `${x.slice(0, n - 1).trimEnd()}…` : x; };

/** One-line restatement made of the person's own words: the first request, plus the latest one if it differs. */
export function restateProblem(turns) {
  const users = turns.filter((x) => x.role === 'user' && tokens(x.text).size >= 3);
  if (!users.length) return '';
  const first = bestSentence(users[0].text), last = bestSentence(users.at(-1).text);
  return similarity(first, last) >= 0.5 || users.length === 1 ? first : `${first} → ${last}`;
}
/** What was tried (advice the AI gave, without repeats) and what is still open (the person's complaints). */
export function triedSoFar(turns, max = 6) {
  const tried = [];
  for (const x of turns) if (x.role === 'ai') for (const s of adviceItems(x.text)) if (!tried.some((y) => jaccard(tokens(y), tokens(s)) >= 0.7)) tried.push(s.length > 110 ? `${s.slice(0, 109).trimEnd()}…` : s);
  const failed = turns.filter((x) => x.role === 'user' && RE.complaint.test(x.text)).map((x) => cut(x.text.replace(/\s+/g, ' ').trim(), 100)).slice(-3);
  const open = bestSentence([...turns].reverse().find((x) => x.role === 'user')?.text ?? '', 120);
  return { tried: tried.slice(0, max), failed, open };
}
/** A short prompt to paste into a NEW session. Built locally from the conversation; nothing is sent anywhere. */
export function freshSessionPrompt(turns, lang = 'en') {
  const problem = restateProblem(turns);
  const { tried, failed } = triedSoFar(turns, 5);
  const lines = [t(lang, 'lo_p_intro'), t(lang, 'lo_p_problem', { x: problem })];
  if (tried.length) lines.push(t(lang, 'lo_p_tried'), ...tried.map((x) => `- ${x}`));
  if (failed.length) lines.push(t(lang, 'lo_p_failed'), ...failed.map((x) => `- ${x}`));
  lines.push(t(lang, 'lo_p_ask'));
  return lines.join('\n');
}

export const OWN_CHOICES = Object.freeze(['clarify', 'smaller', 'different', 'break']);
/** Options offered to the person (the person picks; at most one is shown as the first suggestion). Content comes from `optionContent`. */
export function escapeOptions(analysis) {
  const first = { reask: 'restate', same_answer: 'approach', wavering: 'restate', stalled: 'checkpoint' }[analysis?.type] ?? 'restate';
  return [first, ...['restate', 'checkpoint', 'approach', 'prompt', 'own'].filter((x) => x !== first)];
}
export function optionContent(id, analysis, turns, lang = 'en') {
  switch (id) {
    case 'restate': return { id, text: restateProblem(turns) };
    case 'checkpoint': return { id, ...triedSoFar(turns) };
    case 'approach': return { id, text: t(lang, `lo_a_${analysis?.type ?? 'stalled'}`) };
    case 'prompt': return { id, text: freshSessionPrompt(turns, lang) };
    case 'own': return { id, choices: OWN_CHOICES.map((c) => ({ id: c, text: t(lang, `lo_own_${c}`) })) };
    default: return null;
  }
}

/** Ready-made virtual example conversations (keys of the i18n texts). */
export const EXAMPLES = Object.freeze(['reask', 'same_answer', 'wavering', 'healthy']);
