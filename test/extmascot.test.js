// Extension mascot widget: the same brain-balloon head as the site, load colour + motion, hover preview wording,
// docking above the composer, phrase rule (action-only, no diagnosis). Pure logic + source checks; no browser, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LEVELS, LOAD_HEX, stateFor, tintHex, poseFor, deflatePose, inflatePose, langFrom, previewFor, strings, allStrings,
  dockBottom, clampPos, PREVIEW_SHAPE, SIZE,
} from '../extension/lib/widget.js';
import { mascotTree, toSvgString } from '../extension/lib/mascot.js';
import { isDiagnostic } from '../docs/js/phrases.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('extension ships the site mascot verbatim (lib/mascot.js === docs/js/mascot.js)', () => {
  assert.equal(read('../extension/lib/mascot.js'), read('../docs/js/mascot.js'));
});

test('state -> colour: calm blue, rising orange, break magenta; outline = load colour, head = solid light tint of it', () => {
  assert.deepEqual(LEVELS, ['calm', 'rising', 'overloaded']);
  assert.deepEqual({ ...LOAD_HEX }, { calm: '#2F5DA8', rising: '#B45F06', overloaded: '#B3124F' });
  assert.equal(stateFor('calm').outline, '#2F5DA8');
  assert.equal(stateFor('rising').outline, '#B45F06');
  assert.equal(stateFor('overloaded').outline, '#B3124F');
  assert.equal(stateFor('high').level, 'overloaded', 'site "high" maps to the break colour');
  assert.equal(stateFor('nonsense').level, 'calm');
  assert.equal(tintHex('#000000', 0), '#FFFFFF');
  assert.equal(tintHex('#2F5DA8', 1), '#2F5DA8');
  assert.equal(tintHex('bad'), '#FFFFFF');
  for (const lv of LEVELS) {
    const s = stateFor(lv);
    assert.match(s.fill, /^#[0-9A-F]{6}$/);
    assert.notEqual(s.fill, s.outline);
    const svg = toSvgString(mascotTree(poseFor(lv)));
    assert.ok(svg.includes(`stroke="${s.outline}"`), `${lv}: rim/arcs drawn in the load colour`);
    assert.ok(svg.includes(`fill="${s.fill}"`), `${lv}: head filled with the tint`);
    assert.doesNotMatch(svg, /<text|name/i, 'no name or label on the mascot');
  }
});

test('motion: break swells, sweats and trembles most; reduced motion keeps the still frame but stops moving', () => {
  const [c, r, o] = LEVELS.map((lv) => poseFor(lv));
  assert.ok(o.puff > r.puff && r.puff > c.puff);
  assert.ok(o.shake > r.shake && r.shake >= c.shake);
  assert.equal(o.sweat, 3);
  assert.equal(o.face, 'strain');
  assert.equal(c.breathing, true);
  const red = poseFor('overloaded', { reduced: true });
  assert.equal(red.shake, 0);
  assert.equal(red.breathing, false);
  assert.equal(red.puff, o.puff, 'size still shows the state without movement');
  assert.equal(red.sweat, 3);
  const mini = poseFor('overloaded', { mini: true });
  assert.ok(mini.puff <= 1.08 && mini.shake === 0, 'face buttons stay small and still');
  assert.equal(new Set(LEVELS.map((lv) => poseFor(lv).zone)).size, 3);
});

test('"pshh" deflate on recovery and overshoot inflate on rising load', () => {
  const d0 = deflatePose('overloaded', 0);
  const dMid = deflatePose('overloaded', 0.55);
  const d1 = deflatePose('overloaded', 1);
  assert.equal(d0.puff, poseFor('overloaded').puff);
  assert.equal(d0.air, 0);
  assert.ok(dMid.puff < 1, 'dips below normal size');
  assert.equal(d1.puff, 1);
  assert.equal(d1.air, 1);
  assert.equal(d1.face, 'bright');
  assert.equal(d1.zone, 'calm');
  assert.ok(toSvgString(mascotTree(deflatePose('rising', 0.4))).includes('mc-air'), 'escaping air is drawn');
  const half = deflatePose('overloaded', 1, 'rising');
  assert.equal(half.puff, poseFor('rising').puff);
  assert.equal(half.face, 'tense');
  const i0 = inflatePose('calm', 'overloaded', 0);
  const iPeak = inflatePose('calm', 'overloaded', 0.6);
  const i1 = inflatePose('calm', 'overloaded', 1);
  assert.equal(i0.puff, 1);
  assert.ok(iPeak.puff > poseFor('overloaded').puff, 'overshoots');
  assert.equal(i1.puff, poseFor('overloaded').puff);
});

test('hover preview: expected reply shape per level (EN/KO), current-state variant for the mascot itself', () => {
  assert.deepEqual(LEVELS.map((lv) => previewFor(lv).lines), [5, 3, 1]);
  assert.equal(previewFor('rising').title, 'Next reply: ~3 lines, summary first');
  assert.equal(previewFor('overloaded').title, 'Next reply: 1-line summary first');
  assert.equal(previewFor('calm').title, 'Next reply: normal length (~5 lines)');
  assert.match(previewFor('rising', 'en', 'now').title, /^Replies now:/);
  assert.match(previewFor('rising', 'ko').title, /요약 먼저/);
  assert.match(previewFor('overloaded', 'ko').title, /^다음 답: 한 줄 요약/);
  assert.match(previewFor('calm', 'ko', 'now').title, /^지금 답/);
  assert.match(previewFor('rising').detail, /kept/, 'nothing is dropped');
  assert.match(previewFor('rising').tip, /preview only/);
  assert.equal(previewFor('rising', 'fr').title, previewFor('rising', 'en').title, 'English fallback');
  assert.deepEqual(Object.keys(PREVIEW_SHAPE), LEVELS);
  assert.equal(langFrom('ko-KR', 'en-US'), 'ko');
  assert.equal(langFrom('', 'ko'), 'ko');
  assert.equal(langFrom('en', 'en-GB'), 'en');
  assert.equal(langFrom(undefined, undefined), 'en');
  assert.equal(langFrom('kok', 'en'), 'en', 'Konkani is not Korean');
});

test('phrase rule: widget wording describes the reply (action), never the person', () => {
  const all = allStrings();
  assert.ok(all.length >= 30);
  for (const s of all) {
    assert.equal(isDiagnostic(s), false, s);
    assert.doesNotMatch(s, /\byou(?:'re|r)?\b|\bseem|tired|stressed|지친|피곤|힘드|힘들어/i, s);
  }
  for (const lang of ['en', 'ko']) {
    const t = strings(lang);
    for (const lv of LEVELS) assert.ok(t.face[lv] && t.next[lv] && t.now[lv] && t.detail[lv], `${lang}.${lv}`);
  }
});

test('dock: lift above a composer that reaches the right edge; leave the default when the composer is centred', () => {
  const vw = 900; const vh = 560;
  const wide = { top: 472, bottom: 542, left: 70, right: 830 };
  assert.equal(dockBottom({ vw, vh, composer: wide }), 560 - 472 + 12);
  const tall = { top: 380, bottom: 542, left: 70, right: 880 };
  assert.equal(dockBottom({ vw, vh, composer: tall }), 560 - 380 + 12);
  const centred = { top: 472, bottom: 542, left: 150, right: 750 };
  assert.equal(dockBottom({ vw: 1400, vh, composer: centred }), 88);
  assert.equal(dockBottom({ vw, vh, composer: null }), 88);
  const huge = { top: 10, bottom: 550, left: 0, right: 900 };
  assert.ok(dockBottom({ vw, vh, composer: huge }) <= vh - SIZE - 8, 'never pushed off screen');
  assert.deepEqual(clampPos({ right: -50, bottom: 9999 }, { vw, vh }), { right: 4, bottom: vh - SIZE - 4 });
  assert.deepEqual(clampPos({ right: 100.4, bottom: 200.6 }, { vw, vh }), { right: 100, bottom: 201 });
  assert.equal(clampPos(null, { vw, vh }), null);
  assert.equal(clampPos({ right: 'x', bottom: 1 }, { vw, vh }), null);
});

test('extension 0.3.0: mascot face in a Shadow DOM, faces panel, Escape/outside close, keyboard, reduced motion, no emoji', () => {
  const m = JSON.parse(read('../extension/manifest.json'));
  assert.equal(m.version, '0.3.0');
  assert.equal(m.name, 'Attune Load Feedback (prototype)');
  assert.deepEqual(m.content_scripts[0].js, ['content.js']);
  assert.ok(m.web_accessible_resources[0].resources.includes('lib/*'), 'lib/mascot.js + lib/widget.js importable from the content script');
  assert.equal(m.host_permissions.length, 4);
  const ct = read('../extension/content.js');
  assert.match(ct, /attachShadow\(\{ mode: 'open' \}\)/);
  assert.match(ct, /import\(chrome\.runtime\.getURL\('lib\/mascot\.js'\)\)/);
  assert.match(ct, /import\(chrome\.runtime\.getURL\('lib\/widget\.js'\)\)/);
  assert.match(ct, /e\.key !== 'Escape'/);
  assert.match(ct, /composedPath\(\)\.includes\(host\)/, 'outside click closes the panel');
  assert.match(ct, /aria-expanded/);
  assert.match(ct, /aria-pressed/);
  assert.match(ct, /ArrowRight/);
  assert.match(ct, /:focus-visible/);
  assert.match(ct, /prefers-reduced-motion: no-preference/);
  assert.match(ct, /prefers-reduced-motion: reduce/);
  assert.match(ct, /POS_KEY/, 'dragged position kept in chrome.storage');
  assert.match(ct, /clear_pending', level: prev/, 'Undo restores the previous level');
  assert.doesNotMatch(ct, /🎈|😌|😐|😣/u);
  assert.doesNotMatch(ct, /\.click\(\)|requestSubmit|form\.submit/);
  assert.doesNotMatch(read('../extension/lib/widget.js').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''), /chrome\.|document\.|window\./, 'widget.js stays pure');
  const bg = read('../extension/background.js');
  assert.match(bg, /prefs\.level = /);
  assert.match(read('../extension/README.md'), /0\.3\.0/);
});
