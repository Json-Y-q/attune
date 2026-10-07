// Writes the standalone mascot SVG files (brand/mascot/ and docs/img/) from docs/js/mascot.js.
import { writeFileSync, mkdirSync } from 'node:fs';
import { mascotTree, toSvgString, STILL_POSES, VARIANTS } from '../docs/js/mascot.js';

const STYLE = '<style>[stroke="#0D1B2A"]{stroke:#0D1B2A}[fill="#0D1B2A"]{fill:#0D1B2A}@media (prefers-color-scheme:dark){[stroke="#0D1B2A"]{stroke:#E0E0FF}[fill="#0D1B2A"]{fill:#E0E0FF}[stroke="#2F5DA8"]{stroke:#8EB4FF}[stroke="#B45F06"]{stroke:#FFB84C}[stroke="#B3124F"]{stroke:#FF6B9A}}</style>';
const TITLES = { calm: 'Tempoloon mascot, calm', build: 'Tempoloon mascot, building up', heavy: 'Tempoloon mascot, heavy', recovered: 'Tempoloon mascot, recovered' };
mkdirSync(new URL('../brand/mascot/', import.meta.url), { recursive: true });
for (const [name, pose] of Object.entries(STILL_POSES)) {
  const tree = mascotTree({ ...pose, breathing: false }, { title: TITLES[name] });
  tree.children.splice(1, 0, { tag: 'defs', attrs: {}, children: [] });
  let svg = toSvgString(tree).replace('<defs/>', '').replace(/(<svg[^>]*>)/, `$1${STYLE}`);
  for (const dir of ['../brand/mascot/', '../docs/img/']) writeFileSync(new URL(`${dir}mascot-${name}.svg`, import.meta.url), `${svg}\n`);
}
const VTITLES = { a: 'glasses', b: 'headphones', c: 'sprout', d: 'plain' };
for (const v of VARIANTS) {
  const tree = mascotTree({ ...STILL_POSES.calm, variant: v.id }, { title: `Tempoloon mascot, character ${v.id.toUpperCase()} (${VTITLES[v.id]})` });
  const svg = toSvgString(tree).replace(/(<svg[^>]*>)/, `$1${STYLE}`);
  for (const dir of ['../brand/mascot/', '../docs/img/']) writeFileSync(new URL(`${dir}mascot-character-${v.id}.svg`, import.meta.url), `${svg}\n`);
}
console.log('mascot svgs written');
