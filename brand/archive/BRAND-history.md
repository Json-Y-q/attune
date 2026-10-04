# Attune — brand concepts v2 + v3 (draft)

Status: v2 = D/E/F. v3 = G/H "Brain Bubble" (brain outline = speech bubble with tail, load gauge inside), added after F was chosen; **H is recommended and applied**. F stays here as reference.

Slogan candidate: "AI that attunes to you."
Symbol brief: AI · brain · radio (tuning) · speaking pace. Each concept uses at least 3.
Constraints: no medical or therapy imagery (not a medical device: no cross, heart, pulse/ECG line, anatomical brain); no shapes copied from well-known marks. Name/marks unregistered, trademark check pending.
Earlier concepts A/B/C (rapport, dial, steps): see `v1/BRAND.md`.

## Comparison
| Item | D · Tuned Mind | E · Pace Wave | F · Gauge Dome |
|---|---|---|---|
| Symbol | two-lobe brain outline + dial with needle + AI spark | bars with widening gaps + radio scale with needle + AI spark | scalloped brain dome + radio scale with widening ticks + needle ending in AI spark |
| Elements | brain, radio dial, AI (pace via needle) | speech pace, radio scale, AI | brain, radio scale, pace ticks, AI (all 4) |
| Tone (one line) | friendly, bright, a little playful | lively, sonic, energetic | technical yet approachable |
| Ink / Primary / Accent | #2B1138 / #9D2A87 / #B45309 | #2B1810 / #C2410C / #0E7490 | #0D1B2A / #4338CA / #BE185D |
| Tint / Background | #F6DDF1 / #FFF8FD | #FFE3D3 / #FFF8F3 | #E0E0FF / #F7F8FF |
| Dark-bg accent | #FBA94C | #5EC8E0 | #F58BB8 |
| Display font (open, OFL) | Outfit 600 | Bricolage Grotesque 700 | Manrope 800 |
| Body font (open, OFL) | Inter | Inter | Inter |
| Contrast: ink on bg | 16.2 | 16.1 | 16.4 |
| Contrast: primary on bg | 6.5 | 4.9 | 7.5 |
| Contrast: white on primary | 6.7 | 5.2 | 7.9 |
| Contrast: accent on bg | 4.8 | 5.1 | 5.7 |
| Contrast: dark-bg accent on ink | 8.8 | 8.7 | 7.7 |
| Strength | most literal "brain + tuning" read | clearest "pace" story; most distinctive | covers all 4 elements; looks like software, not medicine |
| Risk | brain outline is the most clinical-looking of the three | brain is only implied (not drawn) | brain is abstract (reads as cloud/dome); detailed at 16 px |
| Best for | consumer, friendly onboarding | audio/voice-assistant use cases | product + developer/SDK audience |

Contrast = WCAG 2.x ratio. Thresholds: text 4.5, large text and graphics 3. All pairs in the table pass AA.

## Superseded recommendation (v2): F · Gauge Dome
- Only concept with all four elements; the widening tick spacing shows "answer pace adapts".
- Abstract dome keeps the brain cue away from anatomical/medical looks.
- Site colours (light / dark) checked: text on bg 16.7 / 15.8, muted on surface 8.0 / 8.5, primary on bg 7.5 / 10.1, on-primary 7.9 / 10.1, border on surface 3.6 / 4.2, brand accent on bg 5.7 / 8.1.
- Fallback if a more literal brain is wanted: D.

## Files
- `concept-{D,E,F}.svg`: lockup, wordmark outlined to paths (no font needed). `concept-{D,E,F}-symbol.svg`: symbol only.
- `preview/concept-{D,E,F}.{svg,png}`: sheet with light, dark, small sizes, palette. `overview.png`: v2 side by side.
- `v1/`: concepts A/B/C with their own BRAND.md, previews and overview.
- Applied (F): `docs/img/logo.svg`, `docs/img/logo-dark.svg`, `docs/favicon.svg` (dark-mode aware), CSS variables in `docs/css/style.css`.

## Usage notes
- Min symbol size 24 px (the 16 px favicon loses tick detail but keeps dome + needle).
- Keep the accent for needle and spark only; do not recolour it red/green (reads as status). No pulse, heart, cross or anatomical brain shapes.
- Fonts: Outfit, Bricolage Grotesque, Manrope, Inter are SIL OFL 1.1 (free/open).

# v3 · Brain Bubble (G, H)

Shape: scalloped brain outline that is also a speech bubble (tail bottom-left). Inside: load gauge = 9 ticks (spacing widens and length grows toward high load), needle, AI spark. Speaking pace = widening tick spacing; radio = tuning scale + needle.
No medical cues: no cross, heart, pulse line, anatomical brain; folds in G are minimal strokes.

## Comparison
| Item | G · Brain Bubble A (folds) | H · Brain Bubble B (cloud + dots) (recommended) |
|---|---|---|
| Symbol | 5-scallop dome bubble + fissure and 2 fold strokes + gauge | 3-lobe cloud bubble + larger gauge + 3 chat dots |
| Elements | brain, bubble/speech, radio scale, pace ticks, AI spark | same, brain read is abstract (cloud) |
| 16 px version | dome bubble + 3 bars (length + colour) | cloud bubble + 3 growing bars (length + colour) |
| Dark / mono | `variants/G-symbol-{dark,mono,monow}.svg` | `variants/H-symbol-{dark,mono,monow}.svg` |
| Strength | reads clearly as brain | simplest, friendliest, best at small sizes, least clinical |
| Risk | busier, closest to anatomical | brain cue weaker |
| Fonts | Manrope 800 + Inter (OFL) | Manrope 800 + Inter (OFL) |
| Tone | thoughtful, conversational | friendly, light, conversational |

## Load colour scale (calm → rising → break)
Colour is never the only cue: tick spacing widens, tick length grows, zone label text, and numeric value. Zones follow the engine thresholds (<50 calm, 50–74 rising, ≥75 break).

| Zone | Light bg | contrast on white / #F7F8FF | Dark bg | contrast on #181F3A / #0F1428 |
|---|---|---|---|---|
| Calm (indigo-blue) | #2F5DA8 | 6.5 / 6.1 | #8EB4FF | 7.8 / 8.8 |
| Rising (amber-orange) | #B45F06 | 4.6 / 4.3 | #FFB84C | 9.4 / 10.6 |
| Break (magenta-red) | #B3124F | 6.7 / 6.4 | #FF6B9A | 6.0 / 6.8 |

All ≥ 4.5 on white (text and graphics); on #F7F8FF the rising zone is 4.3 (graphics need 3, passes; for text on #F7F8FF use `--text`). Outline: #4338CA on #F7F8FF 7.5; #B9BBFF on #0F1428 10.1.

## Gradient styles tested (on H)
| Item | Continuous | 3-zone (chosen) |
|---|---|---|
| Look | ticks blend indigo → yellow → orange → magenta-red | 3 flat colours |
| Colours (light) | #2F5DA8 → #A67C00 → #C2540A → #B3124F | #2F5DA8 / #B45F06 / #B3124F |
| Min contrast on white | 3.8 (yellow-gold stop; passes graphics 3, not text 4.5) | 4.6 |
| Dark min contrast | 6.0 | 6.0 |
| Meaning | smooth but zone boundaries unclear | maps to calm / rising / break and engine thresholds |
| Verdict | decorative | use for logo and demo meter |
Files: `variants/H-symbol-continuous.svg` (continuous), `concept-H-symbol.svg` (3-zone).

## Files (v3)
- `concept-{G,H}.svg` lockup (outlined paths), `concept-{G,H}-symbol.svg`, `variants/{G,H}-symbol-{dark,mono,monow,continuous}.svg`, `variants/{G,H}-favicon-16.svg`.
- `preview/concept-{G,H}.{svg,png}`; `overview.png` shows v2 and v3 together with gradient, dark, mono, 16 px.
- Applied (H): `docs/img/logo*.svg`, `docs/favicon.svg` (simplified, dark-mode aware), CSS vars `--load-calm/--load-mid/--load-high`, demo load meter (`#load-meter`, same scale and thresholds).

# v4 · H confirmed: larger speed scale
| Item | Before (v3) | After (v4) |
|---|---|---|
| Tick width | 4.5 | 7 |
| Tick length | 9–17 | 10–28 (grows toward high load) |
| Scale radius (symbol box 200) | 26–52 | 34–62 (about 2× the ticks' area) |
| Needle / spark / dots | 4.5 / r9 / r4.5 | 5 / r8 / r5 (kept balanced) |
| 16 px version | cloud + 3 dots (r10/15/21) | cloud + 3 growing bars (24 wide, heights 20/46/74), outline 14 |
| Zone colours, dark, mono | unchanged | unchanged (contrast table above still valid) |
Before files: `archive-h-v3/`. After: `concept-H*.svg`, `variants/H-*`, `docs/img/logo*.svg`, `docs/favicon.svg`.
Bars/ticks keep non-colour cues: widening spacing, growing length (and growing height at 16 px).
