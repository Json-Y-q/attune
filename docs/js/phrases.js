// Phrase rule: suggestions are actions, never statements about the person's state.
// Use: "Want a short summary?" / "짧게 요약해 줄까요?". Never: "You seem tired" / "지친 것 같아요".
// The user's own sample words (e.g. a user line "I'm tired") are not system phrasing and are exempt.

export const DIAGNOSTIC_PATTERNS = Object.freeze({
  en: [
    /\byou\s+(?:seem|look|sound|appear|feel)(?:\s+to\s+be)?\s+(?:a\s+bit\s+|really\s+|very\s+|quite\s+|so\s+)?(?:tired|exhausted|stressed|overwhelmed|overloaded|worn|frustrated|confused|upset|drained|fatigued|sleepy|burn(?:ed|t)\s+out)/i,
    /\byou(?:'|’)re\s+(?:a\s+bit\s+|really\s+|very\s+|so\s+)?(?:tired|exhausted|stressed|overwhelmed|overloaded|frustrated|confused|drained|fatigued|burn(?:ed|t)\s+out)/i,
    /\byou\s+are\s+(?:a\s+bit\s+|really\s+|very\s+|so\s+)?(?:tired|exhausted|stressed|overwhelmed|overloaded|frustrated|confused|drained|fatigued)/i,
    /\byou\s+(?:must|might|may)\s+be\s+(?:tired|exhausted|stressed|overwhelmed|frustrated|confused)/i,
    /\byour\s+(?:load|stress|fatigue|focus|energy)\s+(?:is|seems|looks)\s+(?:rising|high|low|dropping)/i,
    /\bit\s+(?:seems|looks)\s+like\s+you(?:'|’)re\b/i,
    /\bthis\s+has\s+felt\s+heavy\b/i,
    /\bwas\s+that\s+the\s+confusing\s+part\b/i,
  ],
  ko: [
    /지친\s*것\s*같/, /지쳐\s*보/, /지치셨/, /지치신\s*것/,
    /피곤해\s*보/, /피곤하신\s*것\s*같/, /피곤한\s*것\s*같/, /피곤하시죠/,
    /힘들어\s*보/, /힘드신\s*것\s*같/, /힘드시죠/,
    /스트레스[^.?!]{0,8}(?:같아|보여)/, /헷갈리셨/, /답답하신\s*것\s*같/, /답답해\s*보/,
    /무거워졌/, /부하가\s*(?:올라가고\s*있어요|높아\s*보|높은\s*것\s*같)/, /과부하\s*상태(?:예요|이에요|입니다)/, /집중력이\s*떨어진\s*것\s*같/,
  ],
});

/** True when a sentence tells the person how they are (diagnostic phrasing). */
export function isDiagnostic(text) {
  const s = String(text ?? '');
  return [...DIAGNOSTIC_PATTERNS.en, ...DIAGNOSTIC_PATTERNS.ko].some((re) => re.test(s));
}

/** Approved action-only examples (documentation + tests). */
export const ACTION_EXAMPLES = Object.freeze({
  en: ['Want a short summary?', 'See the key point first?', 'Want a quick checkpoint?'],
  ko: ['짧게 요약해 줄까요?', '핵심만 먼저 볼까요?', '여기까지 정리해 둘까요?'],
});
