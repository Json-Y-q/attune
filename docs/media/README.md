# Optional media slots

The onboarding page has four media slots: `hero` (loop video) and `t1`, `t2`, `t3` (task illustrations). The landing page reuses the `hero` video (inside the "Watch the video version" disclosure).

**Included now:** `hero.mp4`, `hero.webm`, `hero-poster.webp` (the 42-second story with the mascot, about 0.8 MB in total; re-render with `node --experimental-websocket scripts/record-hero.mjs`) and captions in EN/KO. The `t1`–`t3` slots are still placeholders.
Each slot shows an inline SVG placeholder (drawn for this project) until you provide real assets, so the site
works with this folder as it is. Nothing here is requested from the network until a slot is switched on.

## Add an asset

1. Put the files here, named after the slot:
   - hero video: `hero.webm` (VP9/AV1) and `hero.mp4` (H.264), plus `hero-poster.webp` (the still image shown first
     and when the user prefers reduced motion). Captions already exist: `hero.en.vtt`, `hero.ko.vtt` (edit them to match).
     Keep it short (under about 45 s), muted, loopable, and under about 5 MB (the current one is about 0.8 MB).
   - step images: `t1.avif`, `t1.webp`, `t1.png` (the PNG is the required fallback), same for `t2`, `t3`; 480x300 recommended.
2. In `docs/onboarding.html` set `data-media-ready="true"` on that slot's `<figure>`.
3. Alt text and the video label come from `docs/js/i18n.js` (`md_alt_*`, `md_hero_label`); keep EN and KO in sync.

Behaviour: images are `loading="lazy"`; the video only loads and plays when it scrolls into view, never autoplays
when `prefers-reduced-motion: reduce` is set (the poster stays, with a Play button), and always has a Pause button.
If a file fails to load the SVG placeholder stays visible.

## Rules for assets

- Only assets you made yourself or that are CC0 / public domain, with the source noted in `docs/media/CREDITS.md`.
- No stock-site assets with attribution or licence restrictions, no third-party hosting, no CDN, no tracking.
- No real people's faces or health data. Do not imply a medical claim.
- The project licence (PolyForm Noncommercial) covers the code; add the licence of each asset to `CREDITS.md`.
