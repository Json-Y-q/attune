// Loop detection and escape: rule-based, local. Includes false-positive guards and a check that nothing touches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRINGS } from '../docs/js/i18n.js';
import {
  tokens, similarity, parseConversation, analyzeLoop, restateProblem, triedSoFar, freshSessionPrompt, escapeOptions, optionContent,
  LOOP_THRESHOLD, LOOP_TYPES, EXAMPLES, MAX_TURNS, OWN_CHOICES,
} from '../docs/js/loop.js';
import { newSession, offerLoopEscape, respondToSuggestion, skipAhead, userTurn, COOLDOWN, SUGGESTION_TYPES } from '../docs/js/partner.js';
import { SAMPLE_PROFILE } from '../docs/js/profile.js';

const turns = (...lines) => lines.map((l, i) => ({ role: i % 2 === 0 ? 'user' : 'ai', text: l }));
const ex = (lang, id) => parseConversation(STRINGS[lang][`lo_ex_${id}_text`]);
const mk = () => newSession({ profile: SAMPLE_PROFILE });

test('similarity: token overlap, Korean bigrams, short texts never count as similar', () => {
  assert.ok(similarity('How do I export the spreadsheet to PDF on one page?', 'How can I export my spreadsheet to PDF on one page') > 0.6);
  assert.ok(similarity('How do I export the spreadsheet to PDF on one page?', 'What is the capital city of France today') < 0.1);
  assert.ok(similarity('로그인이 안 돼요 비밀번호 재설정 메일도 안 와요', '로그인 안 되고 비밀번호 재설정 메일이 안 옵니다') > 0.3);
  assert.equal(similarity('ok', 'ok thanks'), 0);
  assert.equal(similarity('ok', 'ok'), 0);
  assert.equal(similarity('how do i reset my router password', 'how do i reset my router password'), 1);
  assert.equal(similarity('', ''), 0);
  assert.ok(tokens('The quick brown fox!').has('quick') && !tokens('The quick brown fox!').has('the'));
});

test('parseConversation: You:/AI: markers (EN + KO), multi-line turns, blocks without markers, size limits', () => {
  const a = parseConversation('You: hello there\nmore of it\nAI: hi\nyou: next');
  assert.deepEqual(a.map((x) => x.role), ['user', 'ai', 'user']);
  assert.equal(a[0].text, 'hello there\nmore of it');
  assert.deepEqual(parseConversation('나: 안녕\nAI: 네').map((x) => x.role), ['user', 'ai']);
  assert.deepEqual(parseConversation('first block\n\nsecond block\n\nthird').map((x) => x.role), ['user', 'ai', 'user']);
  assert.deepEqual(parseConversation(''), []);
  assert.equal(parseConversation(Array.from({ length: 200 }, (_, i) => `${i % 2 ? 'AI' : 'You'}: line ${i}`).join('\n')).length, MAX_TURNS);
  assert.ok(parseConversation(`You: ${'x'.repeat(50000)}`)[0].text.length <= 4000);
});

for (const lang of ['en', 'ko']) {
  test(`virtual examples (${lang}): each loop type is found, the healthy chat is not`, () => {
    const got = Object.fromEntries(EXAMPLES.map((id) => [id, analyzeLoop(ex(lang, id))]));
    assert.equal(got.reask.type, 'reask');
    assert.equal(got.same_answer.type, 'same_answer');
    assert.equal(got.wavering.type, 'wavering');
    assert.equal(got.healthy.type, null);
    assert.equal(got.healthy.resolved, true);
    for (const id of ['reask', 'same_answer', 'wavering']) {
      assert.ok(got[id].confidence >= LOOP_THRESHOLD && got[id].confidence <= 0.95, `${lang}.${id} confidence`);
      assert.ok(got[id].evidence.length >= 1);
      for (const e of got[id].evidence) for (const l of ['en', 'ko']) assert.ok(STRINGS[l][e.key], `${l}.${e.key}`);
    }
  });
}

test('false positives: normal conversations stay quiet', () => {
  // a long, healthy chat: new information every turn, no complaints
  const long = turns(
    'I want to plan a trip to Japan in April.', 'Great. Do you prefer cities or countryside?',
    'Mostly cities, maybe Tokyo and Osaka.', 'Then three days in Tokyo and two in Osaka works well.',
    'What about the cherry blossom forecast?', 'Peak bloom is usually late March to early April in those cities.',
    'Which neighbourhoods should I stay in?', 'Shinjuku in Tokyo and Namba in Osaka are convenient.',
    'And the rail pass, is it worth it?', 'For two cities a single shinkansen ticket is usually cheaper.',
    'How do I book the train seats?', 'You can reserve at a station machine or online.');
  const a = analyzeLoop(long);
  assert.equal(a.detected, false);
  assert.ok(a.progress > 0.7);
  // elaboration: similar words but no sign of dissatisfaction stays below the threshold
  const elaborate = analyzeLoop(turns('How do I export the report to PDF from the dashboard?', 'Use the Export menu and choose PDF.',
    'How do I export the report to PDF from the dashboard with the filters applied?', 'Apply the filters first, then export.',
    'Can I export the report to PDF from the dashboard on a schedule?', 'Yes, with a scheduled export.'));
  assert.equal(elaborate.detected, false);
  // very short turns
  assert.equal(analyzeLoop(turns('ok', 'Done.', 'ok', 'Anything else?', 'ok', 'Bye.')).detected, false);
  // the same greeting twice is not a loop
  assert.equal(analyzeLoop(turns('hi', 'Hello, how can I help?', 'hi', 'Hello again, how can I help?')).detected, false);
  // one change of mind is normal
  const one = analyzeLoop(turns('Plan a weekend in Busan for two people.', 'Here is a two day plan with the beach and the market.',
    'Actually, make it Jeju instead, we prefer hiking.', 'Then Hallasan and the coastal trail fit well.',
    'Great, what should we pack for hiking in spring?', 'Layers, waterproof shoes and water.'));
  assert.equal(one.detected, false);
  assert.ok(one.scores.wavering <= 0.3);
  // different advice each time is not "the same answer"
  const varied = analyzeLoop(turns('My laptop is slow after the update.', 'Try restarting it first.', 'Restarted, still slow.', 'Check which apps start at login and disable some.',
    'Disabled three, a bit better.', 'Run the disk cleanup tool to free some space.'));
  assert.ok(varied.scores.same_answer < LOOP_THRESHOLD);
  // asking the AI to repeat or clarify once is fine
  assert.equal(analyzeLoop(turns('Explain recursion.', 'A function that calls itself with a smaller input until a base case.', 'Can you explain that again, more simply?', 'It is like Russian dolls: open one, find a smaller one, until the last.')).detected, false);
  // thanks at the end means resolved, even after a rough start
  const done = analyzeLoop(turns('The printer is not working.', 'Check the cable.', 'Still not working.', 'Restart the printer.', 'That worked, thank you!'));
  assert.equal(done.resolved, true); assert.equal(done.detected, false);
  assert.equal(analyzeLoop(turns('안 돼요.', '재시작해 보세요.', '아직도 안 돼요.', '케이블을 확인해 보세요.', '됐어요, 고마워요!')).resolved, true);
});

test('too few turns, bad input and odd values never throw', () => {
  assert.equal(analyzeLoop(turns('a b c d', 'e f g h')).tooFew, true);
  assert.equal(analyzeLoop([]).detected, false);
  assert.equal(analyzeLoop(null).detected, false);
  assert.equal(analyzeLoop([{ role: 'x', text: 'y' }, { text: 5 }, null]).tooFew, true);
  assert.equal(analyzeLoop(Array.from({ length: 500 }, (_, i) => ({ role: i % 2 ? 'ai' : 'user', text: `message ${i} about topic ${i}` }))).turns, MAX_TURNS);
});

test('long and unresolved: complaints keep coming with new details each time -> "stalled"', () => {
  const t = turns(
    'The deploy to the staging server fails.', 'Check that the environment variables are set.',
    'They are set. Still not working, the build stops at the last step.', 'Look at the build logs for the last step.',
    'The logs only show a timeout. Not working.', 'Increase the build timeout in the pipeline settings.',
    'I raised it to ten minutes. It still fails at the same place.', 'Make sure the runner has enough memory.',
    'The runner has eight gigabytes. Still failing.', 'Try a different region for the runner.',
    'Different region, still not working. Maybe the registry is slow?', 'Check the registry status page.',
    'Registry is fine. We are going in circles.', 'Contact the platform support with the logs.');
  const a = analyzeLoop(t);
  assert.equal(a.type, 'stalled');
  assert.ok(a.confidence >= LOOP_THRESHOLD);
  assert.ok(a.evidence.some((e) => e.key === 'lo_ev_long'));
  assert.ok(a.progress < 0.75);
});

test('same mistake: the same error text coming back after different-looking suggestions counts as evidence', () => {
  const a = analyzeLoop(turns('Build fails with TypeError: Cannot read properties of undefined (reading map).', 'Check that the array is initialised before use.',
    'Done, TypeError: Cannot read properties of undefined (reading map) again.', 'Add a null check around the map call.',
    'Added it. Same TypeError: Cannot read properties of undefined (reading map).', 'Make sure the API returns a list.'));
  assert.ok(a.evidence.some((e) => e.key === 'lo_ev_error') || a.scores.same_answer > 0.15);
  assert.ok(a.scores.same_answer > 0.15);
});

test('escape options: one suggested first, content built from the person’s own words, in EN and KO', () => {
  const tt = ex('en', 'reask');
  const a = analyzeLoop(tt);
  const order = escapeOptions(a);
  assert.equal(order.length, 5); assert.equal(new Set(order).size, 5);
  assert.deepEqual([...order].sort(), ['approach', 'checkpoint', 'own', 'prompt', 'restate']);
  assert.equal(escapeOptions({ type: 'same_answer' })[0], 'approach');
  assert.equal(escapeOptions({ type: 'stalled' })[0], 'checkpoint');
  const r = restateProblem(tt);
  assert.match(r, /export/i); assert.ok(r.length <= 300);
  const c = triedSoFar(tt);
  assert.ok(c.tried.length >= 2 && c.tried.length <= 6);
  assert.ok(c.failed.length >= 1);
  const p = freshSessionPrompt(tt, 'en');
  assert.match(p, /Problem:/); assert.match(p, /different/); assert.ok(p.includes(r));
  const pk = freshSessionPrompt(ex('ko', 'same_answer'), 'ko');
  assert.match(pk, /문제:/); assert.match(pk, /npm install/);
  assert.ok(!/undefined|\{x\}|\{n\}/.test(pk));
  for (const type of LOOP_TYPES) assert.ok(optionContent('approach', { type }, tt, 'en').text.length > 10);
  assert.equal(optionContent('own', a, tt, 'en').choices.length, OWN_CHOICES.length);
  assert.equal(optionContent('nope', a, tt), null);
  assert.equal(optionContent('restate', a, [], 'en').text, '');
});

test('tone: loop strings are suggestions, never diagnoses or statements about feelings (EN + KO)', () => {
  const bad = /you are (frustrated|angry|stuck|confused|tired|stressed)|you['’]?re (frustrated|angry|stuck|confused)|diagnos(e|is) (you|that)|disorder|짜증|화가 났|불안해|우울|스트레스를 받|당신은 .*(지쳤|혼란|화났)/i;
  for (const lang of ['en', 'ko']) for (const [k, v] of Object.entries(STRINGS[lang])) if (/^(lo_|pm_r15)/.test(k) && !k.startsWith('lo_ex_')) assert.doesNotMatch(String(v), bad, `${lang}.${k}`);
  for (const l of ['en', 'ko']) {
    assert.match(STRINGS[l].lo_t_reask, /^(Possibly|어쩌면)/);
    assert.match(STRINGS[l].lo_conf, /%/);
    for (const k of ['lo_impl', 'lo_plan', 'lo_privacy', 'lo_tone']) assert.ok(STRINGS[l][k]);
  }
  assert.match(STRINGS.en.lo_impl, /^Implemented: rule-based local/); assert.match(STRINGS.en.lo_plan, /^Planned, not built: LLM/);
  assert.match(STRINGS.ko.lo_impl, /^구현됨: 규칙 기반 로컬/); assert.match(STRINGS.ko.lo_plan, /^계획\(미구현\): LLM/);
});

/* ---------- partner integration (R15) ---------- */
const loopAnalysis = () => analyzeLoop(ex('en', 'reask'));

test('R15: a loop is offered once, one at a time, with reasons; nothing else changes', () => {
  assert.ok(SUGGESTION_TYPES.includes('loop'));
  const a = loopAnalysis();
  const r = offerLoopEscape(mk(), a, { loadIndex: 20 });
  assert.equal(r.offered, true);
  assert.equal(r.decision.rule, 'R15'); assert.equal(r.decision.suggestion, 'loop'); assert.equal(r.decision.messageKey, 'pm_r15');
  assert.deepEqual(r.decision.reasons, ['L1']);
  assert.equal(r.state.pending, 'loop');
  assert.deepEqual(r.state.adjust, mk().adjust); // no hidden change of reply length or pace
  // a second loop while the first is waiting: one at a time
  const again = offerLoopEscape(r.state, a, { loadIndex: 20 });
  assert.equal(again.offered, false); assert.equal(again.blockedBy, 'pending');
  for (const k of ['pm_r15', 'pm_r15b']) for (const l of ['en', 'ko']) assert.ok(STRINGS[l][k]);
  for (const k of ['sig_L1', 'sig_L2', 'cv_type_loop']) for (const l of ['en', 'ko']) assert.ok(STRINGS[l][k]);
});

test('R15: weak or missing loops are never offered', () => {
  assert.equal(offerLoopEscape(mk(), null).blockedBy, 'none');
  assert.equal(offerLoopEscape(mk(), analyzeLoop(ex('en', 'healthy'))).blockedBy, 'none');
  assert.equal(offerLoopEscape(mk(), { type: 'reask', confidence: 0.5 }, { loadIndex: 10 }).blockedBy, 'weak');
});

test('R15: 20-minute cooldown after accepting or declining, then it may come back; undo counts as declining', () => {
  const a = loopAnalysis();
  const o = offerLoopEscape(mk(), a, { loadIndex: 10 });
  const acc = respondToSuggestion(o.state, 'loop', 'accept');
  assert.equal(acc.state.pending, null);
  const blocked = offerLoopEscape(acc.state, a, { loadIndex: 10 });
  assert.equal(blocked.blockedBy, 'cooldown');
  const later = skipAhead(acc.state, COOLDOWN.seconds / 60 + 1);
  assert.equal(offerLoopEscape(later, a, { loadIndex: 10 }).offered, true);
  // decline
  const rej = respondToSuggestion(offerLoopEscape(mk(), a, { loadIndex: 10 }).state, 'loop', 'reject');
  assert.equal(offerLoopEscape(rej.state, a, { loadIndex: 10 }).blockedBy, 'cooldown');
  // declined twice -> off for this session
  const rej2 = respondToSuggestion(offerLoopEscape(skipAhead(rej.state, 21), a, { loadIndex: 10 }).state, 'loop', 'reject');
  assert.ok(rej2.state.offSession.includes('loop'));
  assert.equal(offerLoopEscape(skipAhead(rej2.state, 60), a, { loadIndex: 10 }).blockedBy, 'off');
  // "never" is kept as a preference
  const nev = respondToSuggestion(offerLoopEscape(mk(), a, { loadIndex: 10 }).state, 'loop', 'never');
  assert.deepEqual(nev.persistOff, ['loop']);
  assert.equal(offerLoopEscape(newSession({ profile: SAMPLE_PROFILE, prefsOff: nev.persistOff }), a, { loadIndex: 10 }).blockedBy, 'off');
});

test('R15 + load: with a high load index a weaker loop signal is enough and it goes before a waiting lighter/checkpoint suggestion', () => {
  const weak = { type: 'stalled', confidence: 0.5 };
  assert.equal(offerLoopEscape(mk(), weak, { loadIndex: 30 }).offered, false);
  const hi = offerLoopEscape(mk(), weak, { loadIndex: 80 });
  assert.equal(hi.offered, true); assert.equal(hi.priority, true);
  assert.equal(hi.decision.messageKey, 'pm_r15b'); assert.deepEqual(hi.decision.reasons, ['L1', 'L2']);
  const st = mk(); st.pending = 'checkpoint';
  assert.equal(offerLoopEscape(st, loopAnalysis(), { loadIndex: 30 }).blockedBy, 'pending');
  const first = offerLoopEscape(st, loopAnalysis(), { loadIndex: 80 });
  assert.equal(first.offered, true); assert.equal(first.state.pending, 'loop');
  const brk = mk(); brk.pending = 'break';
  assert.equal(offerLoopEscape(brk, loopAnalysis(), { loadIndex: 90 }).blockedBy, 'pending'); // a break is never pushed aside
});

test('R15 does not disturb the existing rules: dismiss starts the loop cooldown too', () => {
  const a = loopAnalysis();
  const d = userTurn(mk(), { text: "I'm fine, keep going" });
  assert.equal(d.decision.rule, 'R12');
  assert.equal(offerLoopEscape(d.state, a, { loadIndex: 10 }).blockedBy, 'cooldown');
});

/* ---------- privacy ---------- */
test('loop modules: no network, no storage, no innerHTML, no microphone', () => {
  for (const f of ['loop', 'loopui']) {
    const js = readFileSync(new URL(`../docs/js/${f}.js`, import.meta.url), 'utf8').replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(js, /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource|localStorage|sessionStorage|indexedDB|innerHTML|insertAdjacentHTML|getUserMedia|SpeechRecognition|import\(\s*['"]http)/, f);
    assert.doesNotMatch(js, /https?:\/\//, f);
  }
  const html = readFileSync(new URL('../docs/conversation.html', import.meta.url), 'utf8');
  assert.match(html, /id="lo-input"[^>]*maxlength="20000"/);
  assert.doesNotMatch(html.slice(html.indexOf('id="loop"'), html.indexOf('cv-sil-h')), /<form|action=/);
});

test('crisis wording is handed off by the UI before any loop analysis (R14 first)', () => {
  const js = readFileSync(new URL('../docs/js/loopui.js', import.meta.url), 'utf8');
  assert.match(js, /detectText\(x\.text\)\.crisis/);
  assert.ok(js.indexOf('detectText(x.text).crisis') < js.indexOf('analyzeLoop(turns)'));
  assert.match(js, /pm_r14/);
});
