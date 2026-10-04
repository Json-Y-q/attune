// Static consistency checks that stand in for a browser: i18n parity, referenced keys and element ids exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { STRINGS, t } from '../docs/js/i18n.js';

const read = (p) => readFileSync(new URL(`../docs/${p}`, import.meta.url), 'utf8');
const PAGES = { 'index.html': 'js/landing.js', 'onboarding.html': 'js/onboarding.js', 'demo.html': 'js/demo.js', 'architecture.html': 'js/architecture.js', 'conversation.html': 'js/conversation.js' };
const keysIn = (src, re) => [...src.matchAll(re)].map((m) => m[1]);

test('EN and KO define exactly the same keys with the same value types', () => {
  const en = Object.keys(STRINGS.en).sort();
  const ko = Object.keys(STRINGS.ko).sort();
  assert.deepEqual(ko, en);
  for (const k of en) {
    assert.equal(typeof STRINGS.ko[k], typeof STRINGS.en[k], k);
    if (Array.isArray(STRINGS.en[k])) assert.equal(STRINGS.ko[k].length, STRINGS.en[k].length, k);
  }
});

test('KO and EN strings use the same {placeholders}', () => {
  const ph = (s) => (typeof s === 'string' ? [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join() : '');
  for (const k of Object.keys(STRINGS.en)) assert.equal(ph(STRINGS.ko[k]), ph(STRINGS.en[k]), k);
});

test('t() interpolates and falls back', () => {
  assert.equal(t('en', 'step_of', { n: 2 }), 'Task 2 of 3');
  assert.equal(t('ko', 'step_of', { n: 2 }), '과제 2 / 3');
  assert.equal(t('en', 'no_such_key'), 'no_such_key');
});

for (const [page, script] of Object.entries(PAGES)) {
  test(`${page}: every data-i18n / data-i18n-attr key exists`, () => {
    const html = read(page);
    const keys = [
      ...keysIn(html, /data-i18n="([^"]+)"/g),
      ...keysIn(html, /data-i18n-attr="[^"]*?:([\w]+)(?:;[^"]*)?"/g),
    ];
    assert.ok(keys.length > 10);
    for (const k of keys) assert.ok(k in STRINGS.en, `${page}: missing key ${k}`);
  });

  test(`${page}: every $('id') used by ${script} exists in the page`, () => {
    const html = read(page);
    const ids = new Set(keysIn(read(script), /\$\('([\w-]+)'\)/g));
    for (const id of ids) assert.ok(html.includes(`id="${id}"`), `${page}: missing #${id}`);
  });

  test(`${page}: ids are unique and a11y basics present`, () => {
    const html = read(page);
    const ids = keysIn(html, /\sid="([^"]+)"/g);
    assert.equal(new Set(ids).size, ids.length);
    assert.match(html, /<meta name="viewport"/);
    assert.match(html, /<html lang=/);
    assert.match(html, /class="skip"/);
  });
}

test('t() keys used in JS exist in the dictionary', () => {
  for (const f of ['js/onboarding.js', 'js/demo.js', 'js/ui.js', 'js/landing.js']) {
    const src = read(f);
    for (const k of keysIn(src, /\btr\('([a-z0-9_]+)'/g)) assert.ok(k in STRINGS.en, `${f}: ${k}`);
  }
});

test('no innerHTML / eval / network calls in shipped JS', () => {
  for (const f of ['profile', 'engine', 'transform', 'adapter', 'i18n', 'storage', 'ui', 'onboarding', 'demo', 'landing', 'media', 'charts', 'stylecard', 'architecture', 'partner', 'voice', 'story', 'mascot', 'showcase', 'conversation', 'individuals', 'loop', 'loopui']) {
    const src = read(`js/${f}.js`);
    assert.doesNotMatch(src, /innerHTML|eval\(|new Function|fetch\(|XMLHttpRequest|sendBeacon|WebSocket/, f);
  }
});

const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
for (const page of Object.keys(PAGES)) {
  test(`${page}: inline English text matches the EN dictionary (works without JS)`, () => {
    const html = read(page);
    for (const m of html.matchAll(/<(\w+)([^>]*?)\sdata-i18n="(\w+)"([^>]*)>([^<]+)<\/\1>/g)) {
      if (/data-n=/.test(m[2] + m[4])) continue;
      assert.equal(unescape(m[5]), STRINGS.en[m[3]], `${page}: ${m[3]}`);
    }
  });

  test(`${page}: no third-party hosts; local links resolve`, () => {
    const html = read(page);
    for (const m of html.matchAll(/\s(?:href|src|srcset)="(https?:)?\/\/([^/"]+)/g)) assert.equal(m[2], 'github.com', `${page}: external host ${m[2]}`);
    for (const m of html.matchAll(/\s(?:href|src)="([\w./-]+)"/g)) {
      if (m[1].startsWith('media/')) continue; // optional assets, inside inert <template> slots
      assert.doesNotThrow(() => readFileSync(new URL(`../docs/${m[1]}`, import.meta.url)), `${page}: broken link ${m[1]}`);
    }
  });
}

test('architecture page: both SVG variants, status labels, and the HealthKit on-device statement', () => {
  const html = read('architecture.html');
  assert.equal((html.match(/<svg class="ar-svg/g) || []).length, 2);
  for (const k of ['ar_impl', 'ar_plan', 'ar_badge_impl', 'ar_badge_plan']) assert.match(html, new RegExp(`data-i18n="${k}"`));
  for (const lang of ['en', 'ko']) {
    assert.match(STRINGS[lang].ar_d_phone, /HealthKit/);
    assert.match(STRINGS[lang].ar_d_phone, lang === 'en' ? /on-device[^.]*not a remote API/i : /원격 API가 아니라/);
  }
  assert.equal(STRINGS.en.ar_impl, 'Implemented in this prototype');
});

test('sample HRV summary: matches the shown excerpt, the schema keys and the engine', async () => {
  const raw = read('data/sample-hrv.json');
  const sample = JSON.parse(raw);
  const schema = JSON.parse(read('data/hrv-summary.schema.json'));
  assert.deepEqual(Object.keys(sample).sort(), Object.keys(schema.properties).sort());
  for (const k of schema.required) assert.ok(k in sample, k);
  assert.equal(sample.source, 'virtual');
  assert.ok(read('architecture.html').includes(raw.trim().replace(/"/g, '"').split('\n')[1].trim()));
  const { computeSettings } = await import('../docs/js/engine.js');
  const { SAMPLE_PROFILE } = await import('../docs/js/profile.js');
  const s = computeSettings(SAMPLE_PROFILE, sample);
  assert.ok(s.step >= 1);
});

test('style card: reflects levels, both languages, no medical claims', async () => {
  const { styleCard } = await import('../docs/js/stylecard.js');
  const { SAMPLE_PROFILE } = await import('../docs/js/profile.js');
  for (const lang of ['en', 'ko']) {
    for (let a = 1; a <= 5; a++) for (const style of ['prose', 'summary', 'bullets', 'chunks']) {
      const card = styleCard({ levels: { amount: a, pace: 6 - a, style } }, lang);
      assert.ok(card.includes(STRINGS[lang].sc_amount[a - 1]));
      assert.ok(card.includes(STRINGS[lang].sc_pace[5 - a]));
      assert.ok(card.includes(STRINGS[lang][`sc_style_${style}`]));
    }
  }
  assert.match(styleCard(SAMPLE_PROFILE, 'en'), /not medical advice/);
});

test('media slots: inert templates with lazy images, captions and alt text keys; assets folder documented', () => {
  const html = read('onboarding.html');
  const slots = html.match(/<figure class="ob-media[\s\S]*?<\/figure>/g) || [];
  assert.equal(slots.length, 4);
  for (const sl of slots) {
    const hero = sl.includes('data-media-slot="hero"');
    assert.match(sl, hero ? /data-media-ready="true"/ : /data-media-ready="false"/); // the hero video exists; step images are still optional slots
    assert.match(sl, /class="ob-ph" aria-hidden="true"><svg/);
    assert.match(sl, /<template data-media-template>/);
    if (sl.includes('<video')) { assert.match(sl, /<track kind="captions"/); assert.match(sl, /muted loop playsinline preload="none" poster=/); } else { assert.match(sl, /loading="lazy"/); assert.match(sl, /alt:md_alt_/); }
  }
  readFileSync(new URL('../docs/media/README.md', import.meta.url));
  readFileSync(new URL('../docs/media/hero.en.vtt', import.meta.url));
});

test('hero video assets: small, with poster and captions (landing story + onboarding)', () => {
  let total = 0;
  for (const f of ['hero.mp4', 'hero.webm', 'hero-poster.webp', 'hero.en.vtt', 'hero.ko.vtt']) total += statSync(new URL(`../docs/media/${f}`, import.meta.url)).size;
  assert.ok(total < 5 * 1024 * 1024, `media under 5 MB, got ${total}`);
  assert.match(read('index.html'), /data-media-slot="hero" data-media-ready="true"/);
  for (const f of ['hero.en.vtt', 'hero.ko.vtt']) assert.match(readFileSync(new URL(`../docs/media/${f}`, import.meta.url), 'utf8'), /^WEBVTT/);
});

test('hero headline: gradient text keeps room for descenders (line-height >= 1.1, bottom padding, no overflow clipping)', () => {
  const css = readFileSync(new URL('../docs/css/style.css', import.meta.url), 'utf8');
  const rules = [...css.matchAll(/\.lp-hero h1\s*\{([^}]*)\}/g)].map((m) => m[1]).join(';');
  const last = (prop) => [...rules.matchAll(new RegExp(`(?:^|;|\\s)${prop}:\\s*([^;]+)`, 'g'))].map((m) => m[1].trim()).pop();
  assert.ok(parseFloat(last('line-height')) >= 1.1);
  assert.match(last('padding-bottom') ?? '', /^\.?\d+(\.\d+)?(em|rem|px)$/);
  assert.doesNotMatch(rules, /overflow:\s*(hidden|clip|auto)/);
});

test('i18n: every key used by data-i18n, data-i18n-attr and literal tr()/t() calls exists in both EN and KO (no raw keys on screen)', () => {
  const missing = [];
  const need = (where, key) => { for (const l of ['en', 'ko']) if (typeof STRINGS[l][key] === 'undefined') missing.push(`${l}:${key} (${where})`); };
  for (const f of ['index', 'onboarding', 'demo', 'conversation', 'architecture']) {
    const html = readFileSync(new URL(`../docs/${f}.html`, import.meta.url), 'utf8');
    for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) need(`${f}.html`, m[1]);
    for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) need(`${f}.html`, pair.split(':')[1]);
  }
  for (const f of ['landing', 'showcase', 'conversation', 'demo', 'onboarding', 'ui', 'partner', 'story', 'individuals', 'typing', 'voice', 'loopui', 'loop']) {
    const js = readFileSync(new URL(`../docs/js/${f}.js`, import.meta.url), 'utf8');
    for (const m of js.matchAll(/\btr\(\s*'([a-z0-9_]+)'/g)) need(`${f}.js`, m[1]);
    // template keys such as tr(`in_t_${id}`): every key with that prefix must exist in both languages with the same set
    for (const m of js.matchAll(/\btr\(\s*`([a-z0-9_]+_)\$\{/g)) {
      const en = Object.keys(STRINGS.en).filter((k) => k.startsWith(m[1])), ko = Object.keys(STRINGS.ko).filter((k) => k.startsWith(m[1]));
      assert.ok(en.length > 0, `${f}.js prefix ${m[1]}`);
      assert.deepEqual(ko.sort(), en.sort(), `prefix ${m[1]}`);
    }
  }
  for (const id of ['a', 'b', 'c', 'd']) for (const k of [`in_t_${id}`, `in_desc_${id}`]) need('individuals cards', k);
  need('individuals cards', 'in_more');
  assert.deepEqual(missing, []);
});

test('i18n: the landing scripts render with the language ready (no raw key can be drawn before the dictionary is used)', () => {
  const js = readFileSync(new URL('../docs/js/landing.js', import.meta.url), 'utf8');
  assert.ok(js.indexOf('const app = initPage') < js.indexOf('mountIndividuals('), 'language is resolved before the sections are built');
  assert.match(t('en', 'definitely_missing_key'), /definitely_missing_key/); // the fallback is the key itself; the test above makes sure it never happens
});

test('cache busting: every local script/stylesheet/module import carries the same current ?v= stamp (run `npm run stamp` after edits)', async () => {
  const { version, stamped } = await import('../scripts/stamp.mjs');
  const v = version();
  const { readdirSync } = await import('node:fs');
  const files = [...readdirSync(new URL('../docs/js/', import.meta.url)).map((f) => `js/${f}`).filter((f) => f.endsWith('.js')), ...readdirSync(new URL('../docs/', import.meta.url)).filter((f) => f.endsWith('.html'))];
  for (const f of files) assert.equal(readFileSync(new URL(`../docs/${f}`, import.meta.url), 'utf8'), stamped(f, v), `${f} is stale: run npm run stamp`);
  const landing = readFileSync(new URL('../docs/js/landing.js', import.meta.url), 'utf8');
  assert.match(landing, new RegExp(`from './i18n\\.js\\?v=${v}'|from './ui\\.js\\?v=${v}'`));
});

test('pill buttons: selected state is a solid primary background with on-primary text; hover/focus states are defined', () => {
  const css = readFileSync(new URL('../docs/css/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.lp-pick\[aria-pressed="true"\][^}]*background:\s*var\(--primary\)[^}]*color:\s*var\(--on-primary\)/);
  assert.match(css, /\.st-step\[aria-current="step"\][^}]*background:\s*var\(--primary\)[^}]*color:\s*var\(--on-primary\)/);
  assert.match(css, /\.btn\.secondary:hover:not\(:disabled\)[^}]*background:\s*var\(--accent-bg\)/);
  assert.match(css, /\.btn:focus-visible[^}]*outline:\s*3px solid/);
  const mascot = readFileSync(new URL('../docs/js/mascot.js', import.meta.url), 'utf8');
  assert.match(mascot, /d: HEAD, fill: v\.tint/); // one flat fill over the whole head, no half-and-half
});
