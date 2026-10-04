// Unit tests for the conversation partner logic, story timeline, voice helpers and mascot (pure modules).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SAMPLE_PROFILE } from '../docs/js/profile.js';
import { STRINGS } from '../docs/js/i18n.js';
import {
  detectText, newSession, userTurn, aiReplied, control, respondToSuggestion, undoAdjust, addSilence, silenceStage, rest, skipAhead,
  activeSignals, implicitCount, loadIndexFor, effective, density, thresholdsFor, initialSettings, buildResumeCard, resumeExpired, sessionMinutes,
  COOLDOWN, MAX_L3, RESUME_DAYS,
} from '../docs/js/partner.js';
import { storyAt, STORY_MS, PHASES, DEFAULT_LEVELS, REPLIES } from '../docs/js/story.js';
import { TYPING_CPS, typingCps, typedChars } from '../docs/js/typing.js';
import { SPEECH_LEVELS, levelInfo, measureSpeed, countSyllables, isChunkEnd } from '../docs/js/voice.js';
import { mascotTree, toSvgString, poseFor, STILL_POSES, ARC_SCALE } from '../docs/js/mascot.js';
import { transform } from '../docs/js/transform.js';

const mk = (o = {}) => newSession({ profile: SAMPLE_PROFILE, cond: null, ...o });
const turn = (st, text, gapSec = 40) => userTurn(st, { text, gapSec });
const BASE = 'Okay, tell me more about how that works in practice.';
const seq = (st, texts) => texts.reduce((acc, t) => { const r = turn(acc.state, t); return { state: r.state, decision: r.decision }; }, { state: st, decision: null });

test('detectText: explicit requests, clarification, crisis, KO + EN', () => {
  assert.equal(detectText('please make it shorter').explicit, 'shorter');
  assert.equal(detectText('짧게 해줘').explicit, 'shorter');
  assert.equal(detectText("I'm tired").explicit, 'tired');
  assert.equal(detectText('피곤해').explicit, 'tired');
  assert.equal(detectText('slow down').explicit, 'slower');
  assert.equal(detectText("I'm fine, keep going").explicit, 'dismiss');
  assert.equal(detectText('무슨 말이야?').clarify, true);
  assert.equal(detectText('what do you mean?').clarify, true);
  assert.equal(detectText('?').clarify, true);
  assert.equal(detectText(BASE).explicit, null);
  assert.equal(detectText('I want to hurt myself').crisis, true);
  assert.equal(detectText('자해').crisis, true);
});

test('E1 acts at once: R1 shortens by two levels, R2 adds a lighter mode with an exit', () => {
  let st = mk();
  const base = effective(st).amount;
  let r = turn(st, 'shorter please');
  assert.equal(r.decision.rule, 'R1');
  assert.equal(effective(r.state).amount, Math.max(1, base - 2));
  assert.equal(effective(r.state).chip, 'short');
  r = turn(mk(), "I'm tired");
  assert.equal(r.decision.rule, 'R2');
  assert.equal(r.decision.level, 1);
  assert.equal(effective(r.state).optionsMax, 2);
  assert.ok(!/burnout|diagnos|번아웃/i.test(STRINGS.en.pm_r2 + STRINGS.ko.pm_r2));
});

test('R3: a clarification after a long reply gets a one-line answer, never a longer explanation', () => {
  let st = aiReplied(mk(), 800);
  const r = turn(st, 'what do you mean?');
  assert.equal(r.decision.rule, 'R3');
  assert.equal(r.decision.oneLine, true);
  assert.equal(effective(r.state).amount, effective(st).amount); // no persistent change
  const after = turn(mk(), 'what do you mean?'); // previous reply short -> nothing special
  assert.equal(after.decision.rule, null);
});

test('implicit signals: one is not enough (nothing happens), two give a quiet L1 change (R4) with no message', () => {
  const one = seq(aiReplied(mk(), 800), ['ok', 'yes', 'sure']);
  assert.ok(activeSignals(one.state).includes('B2'), 'three much shorter replies in a row');
  assert.equal(implicitCount(activeSignals(one.state)), 1);
  assert.equal(one.decision.level, 0);
  const two = seq(aiReplied(mk(), 800), ['next', 'next', 'next']); // short replies + repetition
  assert.ok(implicitCount(activeSignals(two.state)) >= 2);
  assert.equal(two.decision.level, 1);
  assert.equal(two.decision.rule, 'R4');
  assert.equal(two.decision.messageKey, null); // silent, chip only
  assert.equal(effective(two.state).chip, 'lighter');
  assert.ok(effective(two.state).amount < effective(mk()).amount);
});

test('P1 late-night weighting never triggers alone and only lowers thresholds by one step', () => {
  let st = mk({ lateNight: true });
  const r = turn(st, BASE);
  assert.equal(r.decision.level, 0);
  assert.equal(r.decision.rule, null);
  assert.ok(activeSignals(r.state).includes('P1'));
  assert.equal(implicitCount(activeSignals(r.state)), 0);
  // one implicit signal is enough at night (needs two otherwise)
  const day = turn(aiReplied(mk(), 800), 'ok'); const night = turn(aiReplied(mk({ lateNight: true }), 800), 'ok');
  assert.equal(day.decision.level, 0);
  const n3 = seq(aiReplied(mk({ lateNight: true }), 800), ['ok', 'ok', 'ok']);
  assert.ok(n3.decision.level >= 1);
  assert.ok(night.decision.level <= 1);
  assert.ok(!/late|night|늦|밤|야간/i.test(Object.values(STRINGS.en).filter((v, i) => typeof v === 'string').filter((v) => /^(Here|Want|In one|I’d|If you|Take|Repeat|All good|Got it|Shortened|Slower)/.test(v)).join(' ')), 'partner lines never mention the time of day');
});

test('R5: a long gap in a text chat alone does nothing; silence in text mode does nothing', () => {
  const r = turn(mk(), BASE, 900);
  assert.equal(r.decision.level, 0);
  const s = addSilence(mk({ mode: 'text' }), 30);
  assert.equal(s.decision.level, 0);
  assert.equal(s.decision.messageKey, null);
});

test('voice silence timeline: wait, listen, gentle once, options once, auto-pause with a resume cue', () => {
  assert.deepEqual([0, 5, 8, 15, 25].map(silenceStage), ['wait', 'listen', 'gentle', 'options', 'autopause']);
  let st = mk({ mode: 'voice' });
  const keys = [];
  for (let s = 1; s <= 30; s++) { const r = addSilence(st, s); st = r.state; if (r.decision.messageKey) keys.push(r.decision.messageKey); }
  assert.deepEqual(keys, ['pm_r9_gentle', 'pm_r9_options', 'pm_r9_pause']);
  assert.equal(st.silence.paused, true);
  assert.ok(activeSignals(st).includes('B5'));
  assert.equal(implicitCount(activeSignals(st)), 0, 'silence alone is not a trigger');
});

test('voice: three short answers slow the voice (R11) and the partner speaks at most once per 10 minutes', () => {
  let st = mk({ mode: 'voice' });
  const speech0 = effective(st).speech;
  const r = seq(st, ['next', 'next', 'next']);
  assert.equal(r.decision.rule, 'R11');
  assert.equal(r.decision.speak, true);
  assert.equal(effective(r.state).speech, speech0 - 1);
  const again = turn(r.state, 'next', 20);
  assert.equal(again.decision.speak, false, 'no second spoken check-in within 10 minutes');
});

test('explicit controls (E2) act at once and persist: slower never goes below level 1', () => {
  let st = mk();
  const l0 = effective(st).speech;
  st = control(st, 'slower').state;
  assert.equal(effective(st).speech, Math.max(1, l0 - 1));
  for (let i = 0; i < 8; i++) st = control(st, 'slower').state;
  assert.equal(effective(st).speech, 1);
  st = control(st, 'faster').state;
  assert.equal(effective(st).speech, 2);
  assert.ok(activeSignals(st).includes('E2'));
});

test('suggestions: decline starts a 20 minute / 15 turn cooldown, two declines switch it off, never-ask is persisted', () => {
  let st = mk();
  // push the session into the density threshold with many quick turns (AI replies are long)
  let r;
  for (let i = 0; i < 12 && !(r && r.decision.rule === 'R7'); i++) { r = turn(aiReplied(st, 900), 'tell me more about topic ' + i, 20); st = r.state; }
  assert.equal(r.decision.rule, 'R7');
  assert.equal(r.decision.suggestion, 'checkpoint');
  assert.equal(r.decision.level, 3);
  let rej = respondToSuggestion(r.state, 'checkpoint', 'reject');
  assert.ok(rej.state.cooldown.checkpoint.untilSec >= rej.state.clock + COOLDOWN.seconds - 1);
  // R8 break offer after a checkpoint was offered, while signals continue
  const noRe = turn(aiReplied(rej.state, 900), 'and one more thing', 20);
  assert.notEqual(noRe.decision.suggestion, 'checkpoint', 'no repeat during cooldown');
  const never = respondToSuggestion(r.state, 'checkpoint', 'never');
  assert.deepEqual(never.persistOff, ['checkpoint']);
  assert.ok(newSession({ profile: SAMPLE_PROFILE, prefsOff: never.persistOff }).offForever.includes('checkpoint'));
  const twice = respondToSuggestion(rej.state, 'checkpoint', 'reject');
  assert.ok(twice.state.offSession.includes('checkpoint'));
});

test('L3 is limited to MAX_L3 per session and R8 needs a checkpoint first', () => {
  assert.equal(MAX_L3, 2);
  let st = mk();
  const seen = [];
  for (let i = 0; i < 40; i++) {
    const r = turn(aiReplied(st, 900), i % 3 === 0 ? 'what do you mean?' : 'ok', 8);
    st = r.state;
    if (r.decision.suggestion) { seen.push(r.decision.rule); st = respondToSuggestion(st, r.decision.suggestion, 'accept').state; }
  }
  assert.ok(seen.length <= MAX_L3);
  assert.notEqual(seen[0], 'R8');
});

test('R12: "I am fine, keep going" returns to L0 at once and starts cooldowns', () => {
  let st = turn(mk(), "I'm tired").state;
  assert.equal(effective(st).chip, 'lighter');
  const r = turn(st, "I'm fine, keep going");
  assert.equal(r.decision.rule, 'R12');
  assert.equal(r.decision.level, 0);
  assert.equal(effective(r.state).chip, null);
  assert.ok(r.state.cooldown.checkpoint && r.state.cooldown.break && r.state.cooldown.lighter);
  assert.equal(activeSignals(r.state).includes('E1'), false);
});

test('undo ("back to normal") clears the adjustment and counts as declining it', () => {
  let st = turn(mk(), "I'm tired").state;
  const u = undoAdjust(st);
  assert.equal(effective(u.state).amount, effective(mk()).amount);
  assert.ok(u.state.cooldown.lighter);
  assert.equal(u.state.rejects.lighter, 1);
});

test('R13: shortening keeps the important line (UI pins it and says so); copy exists in EN and KO', () => {
  for (const l of ['en', 'ko']) { assert.ok(STRINGS[l].pm_r13); assert.ok(STRINGS[l].cv_important.length > 10); }
  const text = STRINGS.en.cv_ai_2;
  assert.ok(!STRINGS.en.cv_ai_2.includes('Important'), 'the pinned line is separate from the trimmed body');
  assert.ok(transform(text, { amount: 1, style: 'prose' }).blocks.length >= 1);
});

test('R14: crisis wording is handed off, no adjustment is made', () => {
  const st = mk();
  const r = turn(st, 'I want to hurt myself');
  assert.equal(r.decision.rule, 'R14');
  assert.equal(r.decision.handoff, true);
  assert.deepEqual(effective(r.state), effective(st));
  assert.ok(!/fatigue|tired|피로|휴식/.test(STRINGS.en.pm_r14 + STRINGS.ko.pm_r14));
});

test('no diagnosis, scolding or score words in partner lines (EN + KO)', () => {
  const lines = Object.entries(STRINGS.en).filter(([k]) => k.startsWith('pm_')).map(([k]) => [STRINGS.en[k], STRINGS.ko[k]]).flat().join(' ');
  assert.doesNotMatch(lines, /cognitive load|you seem|you are tired|too long you|burnout|번아웃|인지 부하|지치셨|건강을 위해|점수/i);
});

test('profile and condition set the starting point and the thresholds', () => {
  const rested = initialSettings(SAMPLE_PROFILE, { baselineHrvMs: 55, hrvMs: 55 });
  const tired = initialSettings(SAMPLE_PROFILE, { baselineHrvMs: 55, hrvMs: 33 }); // -40%: two steps
  assert.equal(rested.amount, SAMPLE_PROFILE.levels.amount);
  assert.equal(rested.speech, SAMPLE_PROFILE.levels.pace);
  assert.equal(tired.amount, SAMPLE_PROFILE.levels.amount - 2);
  assert.equal(tired.speech, SAMPLE_PROFILE.levels.pace - 2);
  assert.ok(tired.thresholds.turnLimit < rested.thresholds.turnLimit);
  assert.ok(tired.thresholds.breakMinutes < rested.thresholds.breakMinutes);
  const small = { ...SAMPLE_PROFILE, baseline: { ...SAMPLE_PROFILE.baseline, fatigueLimitMin: 22 } };
  assert.ok(thresholdsFor(small).breakMinutes < thresholdsFor(SAMPLE_PROFILE).breakMinutes);
  assert.equal(thresholdsFor(SAMPLE_PROFILE).breakMinutes, SAMPLE_PROFILE.baseline.fatigueLimitMin);
});

test('load meter value uses the same 0-100 scale; signals raise it and rest brings it down', () => {
  const cond = { baselineHrvMs: 55, hrvMs: 55 };
  let st = mk({ cond });
  const calm = loadIndexFor(st, SAMPLE_PROFILE, cond);
  st = turn(st, "I'm tired").state;
  const up = loadIndexFor(st, SAMPLE_PROFILE, cond);
  assert.ok(up > calm && up <= 100);
  st = aiReplied(st, 900);
  st = skipAhead(st, 60);
  const long = loadIndexFor(st, SAMPLE_PROFILE, cond);
  assert.ok(long > up);
  assert.ok(sessionMinutes(st) >= 60);
  st = rest(st, 15);
  const after = loadIndexFor(st, SAMPLE_PROFILE, cond);
  assert.ok(after < long, 'rest resets the session timer and the recent signals');
  assert.equal(sessionMinutes(st), 0);
});

test('density: turns and characters per 10 minutes against profile-based limits', () => {
  let st = mk();
  assert.equal(density(st).level, 0);
  for (let i = 0; i < 20; i++) st = turn(aiReplied(st, 500), 'more please ' + i, 20).state;
  assert.ok(density(st).level >= 1);
});

test('resume card: no conversation text, expires after 7 days', () => {
  const card = buildResumeCard(turn(mk(), BASE).state, 1000);
  assert.deepEqual(Object.keys(card).sort(), ['decided', 'open', 'savedAt', 'topic', 'turns', 'v']);
  assert.equal(resumeExpired(card, 1000 + (RESUME_DAYS * 86400000) - 1), false);
  assert.equal(resumeExpired(card, 1000 + (RESUME_DAYS * 86400000) + 1), true);
  assert.equal(resumeExpired(null, 0), true);
});

/* ---------- story ---------- */
test('story: about 40 seconds; load climbs to the break zone, falls back to calm, and the label reads Recovered', () => {
  assert.ok(STORY_MS >= 35000 && STORY_MS <= 45000);
  const frames = Array.from({ length: STORY_MS / 100 + 1 }, (_, i) => storyAt(i * 100));
  const peak = Math.max(...frames.map((f) => f.load));
  const peakAt = frames.find((f) => f.load === peak).ms;
  assert.ok(peak >= 85, 'reaches the break zone');
  assert.equal(frames[0].zone, 'calm');
  const zones = frames.map((f) => f.zone).filter((z, i, a) => z !== a[i - 1]);
  assert.deepEqual(zones, ['calm', 'mid', 'high', 'mid', 'calm'], 'blue -> orange -> magenta -> orange -> blue');
  // every stage stays long enough to read, and the zones change slowly
  const dwell = (z) => frames.filter((f) => f.zone === z).length * 100;
  assert.ok(dwell('calm') >= 12000 && dwell('mid') >= 9000 && dwell('high') >= 6000, 'long dwell per zone');
  for (let i = frames.findIndex((f) => f.ms === peakAt) + 1; i < frames.length; i++) assert.ok(frames[i].load <= frames[i - 1].load, 'falls monotonically after the peak');
  for (let i = 1; i < frames.length; i++) assert.ok(Math.abs(frames[i].load - frames[i - 1].load) <= 2, 'no jumps in the meter');
  const last = frames.at(-1);
  assert.equal(last.recovered, true);
  assert.equal(last.amount, DEFAULT_LEVELS.amount);
  assert.equal(last.pace, DEFAULT_LEVELS.pace);
  assert.ok(last.load < 35);
  assert.equal(frames.filter((f) => f.recovered).every((f) => f.ms >= 38000), true);
  assert.ok(frames.some((f) => f.amount < DEFAULT_LEVELS.amount), 'answers get lighter');
  assert.ok(frames.some((f) => f.style === 'bullets'));
  assert.equal(PHASES.length, 8);
  for (let i = 1; i < PHASES.length; i++) assert.ok(PHASES[i].at - PHASES[i - 1].at >= 3500, 'each stage lasts at least 3.5 s');
});

test('story: lengths and pace return gradually (never jump back in one step)', () => {
  let prev = storyAt(34000).amount;
  for (let ms = 34000; ms <= STORY_MS; ms += 100) { const a = storyAt(ms).amount; assert.ok(a >= prev && a - prev <= 1); prev = a; }
});

test('story: the balloon swells towards bursting, hangs there, then lets the air out and settles', () => {
  const f = Array.from({ length: STORY_MS / 100 + 1 }, (_, i) => storyAt(i * 100));
  const maxPuff = Math.max(...f.map((x) => x.puff));
  assert.ok(maxPuff >= 1.3 && maxPuff <= 1.4);
  const rise = f.filter((x) => x.ms <= 22000).map((x) => x.puff);
  for (let i = 1; i < rise.length; i++) assert.ok(rise[i] >= rise[i - 1] - 1e-9, 'swells monotonically');
  assert.ok(f.filter((x) => x.puff >= 1.3).length * 100 >= 1500, 'hangs at the edge for a moment');
  assert.ok(f.some((x) => x.ms > 22200 && x.puff < 1), 'goes slightly below normal when the air is let out');
  assert.equal(storyAt(26000).puff, 1);
  assert.equal(storyAt(42000).puff, 1);
  assert.ok(Math.max(...f.map((x) => x.shake)) === 1 && storyAt(30000).shake === 0 && storyAt(2000).shake === 0);
  assert.equal(Math.max(...f.map((x) => x.sweat)), 3);
  assert.equal(storyAt(30000).sweat, 0);
  assert.ok(f.filter((x) => x.air > 0).length > 10 && storyAt(22000 + 900).air > 0 && storyAt(30000).air === 0, 'air puffs while deflating');
  const arcs = f.filter((x) => x.ms <= 22000).map((x) => x.arc);
  assert.ok(arcs.at(-1) > arcs[0] + 0.6, 'arcs get thicker as the load rises');
  assert.deepEqual([storyAt(1000).face, storyAt(12000).face, storyAt(19000).face, storyAt(23200).face, storyAt(30000).face, storyAt(41000).face], ['calm', 'tense', 'strain', 'tired', 'ease', 'bright']);
});

test('story: replies are typed at 15-25 characters per second at first, then slower and shorter', () => {
  const r = REPLIES;
  assert.ok(r[0].cps >= 15 && r[0].cps <= 25 && r[0].amount === DEFAULT_LEVELS.amount);
  assert.ok(r[1].cps < r[0].cps && r[1].amount < r[0].amount, 'after the adjustment: slower and shorter');
  assert.ok(r.at(-1).cps >= 15 && r.at(-1).amount === DEFAULT_LEVELS.amount, 'back to normal at the end');
  assert.equal(storyAt(5000).reply.at, 0);
  assert.equal(storyAt(23000).reply.at, 22000);
  assert.deepEqual(TYPING_CPS.map((c) => c >= 10 && c <= 25), [true, true, true, true, true]);
  assert.equal(typingCps(4), 20);
  assert.ok(typingCps(2) < typingCps(4) && typingCps(1) < typingCps(2));
  assert.equal(typedChars(1000, 20), 20);
  assert.equal(typedChars(2500, 12), 30);
  assert.equal(typedChars(-5, 20), 0);
});

/* ---------- voice ---------- */
test('voice levels: rate never below 0.8, pauses shrink with speed, measured speed from timing', () => {
  assert.equal(SPEECH_LEVELS.length, 5);
  assert.ok(Math.min(...SPEECH_LEVELS.map((l) => l.rate)) >= 0.8);
  assert.equal(levelInfo(3).rate, 1);
  assert.equal(levelInfo(0).level, 1);
  assert.equal(levelInfo(9).level, 5);
  for (let i = 1; i < 5; i++) assert.ok(SPEECH_LEVELS[i].pauseMs < SPEECH_LEVELS[i - 1].pauseMs);
  assert.deepEqual(measureSpeed('one two three four five six', 3000, 'en'), { value: 120, unit: 'wpm' });
  assert.deepEqual(measureSpeed('안녕하세요 반갑습니다', 2000, 'ko'), { value: 300, unit: 'spm' });
  assert.equal(countSyllables('안녕 abc'), 2);
  assert.equal(measureSpeed('x', 0, 'en'), null);
  assert.equal(isChunkEnd(3, 3), true);
  assert.equal(isChunkEnd(3, 5), false);
});

/* ---------- mascot ---------- */
test('mascot: four still frames differ in shape (arc thickness, face), not only colour; logo files untouched', () => {
  const poses = Object.values(STILL_POSES);
  assert.equal(poses.length, 4);
  const widths = (p) => mascotTree(p).children.flatMap(function walk(n) { return n.children ? [n, ...n.children.flatMap(walk)] : [n]; }).filter((n) => n.attrs?.class?.startsWith('mc-arc')).map((n) => n.attrs['stroke-width']);
  assert.ok(widths(STILL_POSES.heavy)[0] > widths(STILL_POSES.build)[0] && widths(STILL_POSES.build)[0] > widths(STILL_POSES.calm)[0]);
  assert.ok(ARC_SCALE.high > ARC_SCALE.mid && ARC_SCALE.mid > ARC_SCALE.calm);
  const faces = new Set(poses.map((p) => p.face));
  assert.equal(faces.size, 4);
  const svgs = poses.map((p) => toSvgString(mascotTree(p)));
  assert.equal(new Set(svgs).size, 4);
  assert.ok(svgs.every((s) => !/<text|<image|href/.test(s)));
  assert.match(readFileSync(new URL('../docs/img/mascot-heavy.svg', import.meta.url), 'utf8'), /Attune mascot, heavy/);
  assert.ok(readFileSync(new URL('../docs/img/logo.svg', import.meta.url), 'utf8').includes('Attune logo'));
});

test('mascot follows the story: swells, trembles and sweats at the edge, lets the air out, breathes, brightens', () => {
  assert.equal(poseFor(storyAt(500)).face, 'calm');
  assert.equal(poseFor(storyAt(12000)).face, 'tense');
  const edge = poseFor(storyAt(21000));
  assert.deepEqual([edge.face, edge.zone], ['strain', 'high']);
  assert.ok(edge.puff > 1.3 && edge.shake > 0.8 && edge.sweat === 3 && edge.arc > 1.35);
  assert.ok(poseFor(storyAt(22800)).air > 0 && poseFor(storyAt(22800)).face === 'tired');
  assert.equal(poseFor(storyAt(30000)).breathing, true);
  assert.equal(poseFor(storyAt(30000)).puff, 1);
  assert.equal(poseFor(storyAt(42000)).face, 'bright');
  assert.equal(poseFor(storyAt(42000)).breathing, false);
  assert.equal(poseFor(storyAt(33000)).face, 'ease');
  // the tree really carries the size and the tremble
  const svg = toSvgString(mascotTree(edge));
  assert.match(svg, /scale\(1\.3\d*\)/);
  assert.match(svg, /--shake:0\.\d+|--shake:1/);
  assert.equal((svg.match(/mc-sweat/g) || []).length, 3);
  assert.match(toSvgString(mascotTree(poseFor(storyAt(22900)))), /mc-air/);
});

test('conversation.html wires every control the script uses and offers a Text/Voice mode', () => {
  const html = readFileSync(new URL('../docs/conversation.html', import.meta.url), 'utf8');
  for (const a of ['short', 'clarify', 'shorter', 'tired', 'silence', 'rapid', 'dismiss', 'normal', 'skip']) assert.match(html, new RegExp(`data-act="${a}"`));
  assert.match(html, /name="cvmode" value="voice"/);
  assert.doesNotMatch(html, /getUserMedia|SpeechRecognition|webkitSpeechRecognition/);
  const js = readFileSync(new URL('../docs/js/conversation.js', import.meta.url), 'utf8') + readFileSync(new URL('../docs/js/voice.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /getUserMedia|SpeechRecognition|mediaDevices/);
});

/* ---------- individual differences (illustrative) ---------- */
import { PERSONAS, SHARED, personaAt, allAt, adjustMinute, riseRate, msToMinutes, minutesToMs } from '../docs/js/individuals.js';
import { VARIANTS } from '../docs/js/mascot.js';

test('individuals: same conversation, different rise speed and different adjust points', () => {
  assert.ok(PERSONAS.length >= 3 && PERSONAS.length <= 4);
  const rates = PERSONAS.map(riseRate);
  const mins = PERSONAS.map(adjustMinute);
  assert.equal(new Set(rates).size, PERSONAS.length, 'rise speeds differ');
  assert.equal(new Set(mins).size, PERSONAS.length, 'adjust moments differ');
  assert.ok(Math.max(...mins) - Math.min(...mins) > 15, 'a clearly visible spread');
  assert.ok(new Set(PERSONAS.map((p) => p.adjustAt)).size > 2, 'thresholds differ, not only speed');
  // fast riser intervenes early, slow riser late
  const fast = PERSONAS.reduce((a, b) => (riseRate(a) > riseRate(b) ? a : b));
  const slow = PERSONAS.reduce((a, b) => (riseRate(a) < riseRate(b) ? a : b));
  assert.ok(adjustMinute(fast) < adjustMinute(slow));
  // every load is identical in input terms: the model only reads the shared clock
  assert.equal(SHARED.minutes, 50);
  assert.equal(msToMinutes(SHARED.durationMs), SHARED.minutes);
  assert.equal(minutesToMs(msToMinutes(7500)), 7500);
});

test('individuals: load rises until the persona-specific point, then eases; adjusted state is flagged', () => {
  for (const p of PERSONAS) {
    const at = minutesToMs(adjustMinute(p));
    const before = personaAt(p, Math.max(0, at - 150)), after = personaAt(p, Math.min(SHARED.durationMs, at + 300)), end = personaAt(p, SHARED.durationMs);
    assert.equal(personaAt(p, 0).adjusted, false);
    assert.equal(before.adjusted, false);
    assert.equal(after.adjusted, true);
    assert.ok(after.load < before.load + 4 && end.load < before.load, 'eases after lighter answers');
    const later = personaAt(p, Math.min(SHARED.durationMs, at + 2500));
    assert.equal(later.pose.breathing, true);
    assert.equal(later.pose.face, 'ease');
    assert.equal(later.pose.puff, 1);
    assert.ok(personaAt(p, 0).load <= 20);
    for (let ms = 0; ms < at - 100; ms += 100) assert.ok(personaAt(p, ms + 100).load >= personaAt(p, ms).load);
  }
  const mid = allAt(9000);
  assert.equal(mid.list.length, PERSONAS.length);
  assert.notEqual(new Set(mid.list.map((x) => x.adjusted)).size, 1, 'at the same moment some are adjusted and some are not');
  assert.equal(mid.order.length, PERSONAS.length);
});

test('individuals: characters differ by colour, eye shape and accessory only; no body or demographic cues', () => {
  assert.equal(VARIANTS.length, PERSONAS.length);
  for (const key of ['tint', 'eyes', 'accessory']) assert.ok(new Set(VARIANTS.map((v) => v[key])).size >= 3, key);
  assert.deepEqual(Object.keys(VARIANTS[0]).sort(), ['accessory', 'eyes', 'id', 'tint']);
  assert.ok(VARIANTS.every((v) => ['glasses', 'headphones', 'sprout', 'none'].includes(v.accessory)));
  const svgs = VARIANTS.map((v) => toSvgString(mascotTree({ ...STILL_POSES.calm, variant: v.id })));
  assert.equal(new Set(svgs).size, VARIANTS.length);
  const outline = (svg) => svg.match(/<path d="M176 112[^"]*"[^>]*stroke-width="14"/)?.[0];
  assert.ok(outline(svgs[0]) && svgs.every((x) => outline(x) === outline(svgs[0])), 'the bubble outline (head shape) is the same for everybody');
});

test('individuals copy: carries the "illustrative / not age or gender / virtual" label and makes no age or gender claims', () => {
  assert.match(STRINGS.en.in_label, /Illustrative — individual differences, not age or gender; virtual values/);
  assert.match(STRINGS.ko.in_label, /연령·성별과는 무관/);
  assert.match(STRINGS.en.in_msg, /baseline/);
  const keys = Object.keys(STRINGS.en).filter((k) => k.startsWith('in_') && k !== 'in_label' && !k.startsWith('in_desc_')); // in_desc_* are aria-labels only
  const text = keys.flatMap((k) => [STRINGS.en[k], STRINGS.ko[k]]).join(' ');
  assert.doesNotMatch(text, /\b(age|aged|gender|male|female|men|women|boy|girl|elderly|old|older|young|younger|teen)\b|나이|연령|성별|남성|여성|노인|청년|어린이|젊은|세대/i);
  const html = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="individuals"/);
  assert.match(html, /data-i18n="in_label"/);
});

test('individuals: no names or accessory words in any visible text (cards, captions, text blocks); descriptions are aria-only', () => {
  const visible = Object.entries(STRINGS).flatMap(([lang, o]) => Object.entries(o).filter(([k]) => /^(in_|mc_|st_|lp_story)/.test(k) && !k.startsWith('in_desc_')).map(([k, v]) => [lang, k, v]));
  for (const [lang, k, v] of visible) assert.doesNotMatch(String(v), /mascot [a-d]\b|마스코트 [A-D]|glasses|headphones|sprout|안경|헤드폰|새싹/i, `${lang}.${k}`);
  const js = readFileSync(new URL('../docs/js/showcase.js', import.meta.url), 'utf8');
  assert.match(js, /setAttribute\('aria-label', desc\(p\.id\)\)/);
  assert.doesNotMatch(js, /textContent[^;\n]*desc\(|el\([^)]*desc\(/); // desc() never becomes visible text
  const html = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html.slice(html.indexOf('id="individuals"'), html.indexOf('lp-prob-h')), /glasses|headphones|sprout|Mascot [A-D]/);
  // short, human lines on the cards; numbers live in a collapsed <details>
  for (const id of ['a', 'b', 'c', 'd']) assert.ok(STRINGS.en[`in_t_${id}`].length < 40 && STRINGS.ko[`in_t_${id}`]);
  assert.match(js, /el\('details', 'in-more'\)/);
});

test('individuals: each mascot swells, trembles and sweats towards ITS OWN limit, then lets the air out', () => {
  for (const p of PERSONAS) {
    const at = minutesToMs(adjustMinute(p));
    const near = personaAt(p, at - 60).pose;
    assert.ok(near.puff > 1.28 && near.shake > 0.8 && near.sweat >= 2 && near.face === 'strain', `${p.id} near its own edge`);
    assert.ok(personaAt(p, 0).pose.puff < 1.05 && personaAt(p, 0).pose.shake === 0);
    const out = personaAt(p, at + 600).pose;
    assert.ok(out.puff < 1.05 && out.air > 0 && out.shake === 0, 'deflating');
    assert.ok(Math.min(...[300, 500, 700, 900].map((d) => personaAt(p, at + d).pose.puff)) < 1, 'dips below normal');
    assert.equal(personaAt(p, at + 3000).pose.puff, 1);
    for (let ms = 0; ms < at - 100; ms += 100) assert.ok(personaAt(p, ms + 100).pose.puff >= personaAt(p, ms).pose.puff - 1e-9, 'swells steadily');
  }
  // same moment, different state: the quick riser is already swollen while the slow one is still relaxed
  const t = 3600;
  const fast = PERSONAS.reduce((a, b) => (riseRate(a) > riseRate(b) ? a : b)), slow = PERSONAS.reduce((a, b) => (riseRate(a) < riseRate(b) ? a : b));
  assert.ok(personaAt(fast, t).pose.puff > personaAt(slow, t).pose.puff + 0.1);
});
