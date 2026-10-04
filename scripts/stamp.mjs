// Cache-busting without a build step: stamps every local module import, <script src> and stylesheet link with ?v=<hash of all JS+CSS>.
// Why: GitHub Pages lets browsers cache each file separately, so a visitor could get a new showcase.js with an old i18n.js and see raw keys.
// With one shared version, the whole module graph changes together. Run `npm run stamp` after editing anything in docs/js or docs/css.
// `node scripts/stamp.mjs --check` only verifies (used by the tests).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const docs = fileURLToPath(new URL('../docs/', import.meta.url));
const strip = (s) => s.replace(/(\.(?:js|css))\?v=[0-9a-f]{8}/g, '$1');
const jsFiles = readdirSync(`${docs}js`).filter((f) => f.endsWith('.js')).sort().map((f) => `js/${f}`);
const htmlFiles = readdirSync(docs).filter((f) => f.endsWith('.html')).sort();
const cssFiles = ['css/style.css'];
export function version() {
  const h = createHash('sha1');
  for (const f of [...jsFiles, ...cssFiles]) h.update(f).update(strip(readFileSync(docs + f, 'utf8')));
  return h.digest('hex').slice(0, 8);
}
export function stamped(file, v) {
  let s = readFileSync(docs + file, 'utf8');
  if (file.endsWith('.html')) s = strip(s).replace(/((?:src|href)="(?:js|css)\/[\w.-]+\.(?:js|css))"/g, `$1?v=${v}"`);
  else if (file.endsWith('.js')) s = strip(s).replace(/((?:from\s+|import\s*\(\s*)'\.\/[\w.-]+\.js)'/g, `$1?v=${v}'`);
  return s;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const v = version();
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const f of [...jsFiles, ...htmlFiles]) {
    const now = readFileSync(docs + f, 'utf8'), want = stamped(f, v);
    if (now !== want) { stale++; if (!check) writeFileSync(docs + f, want); }
  }
  console.log(check ? (stale ? `STALE: ${stale} files need "npm run stamp"` : `stamps ok (${v})`) : `stamped ${v} (${stale} files changed)`);
  process.exit(check && stale ? 1 : 0);
}
