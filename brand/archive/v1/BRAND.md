# Attune — brand concepts (draft)
> Archived v1 concepts (A/B/C). Superseded by v2 (D/E/F) in `../BRAND.md`; docs/ now use concept F.

Slogan candidate: "AI that attunes to you."
Idea: rapport with an AI, as in social life. The AI tunes pace, amount and shape to how you take things in.
Constraints: no medical or therapy imagery (not a medical device); no shapes copied from well-known marks. Name/marks unregistered, trademark check pending.

## Comparison
| Item | A · Rapport (recommended) | B · Dial | C · Steps |
|---|---|---|---|
| Symbol | speech bubble + small bubble that leaves a gap (two parties in conversation) | open ring + core + small dot (a knob finding its setting) | rounded square, 3 bars shortening (answer density levels) |
| Metaphor | conversation, rapport | tuning, calibration | levels, sizing |
| Tone (one line) | warm, human, conversational | calm, precise, tool-like | crisp, product-first, friendly |
| Ink / Primary / Accent | #2A1F4D / #5B3CC4 / #C2410C | #0B2B33 / #0E6B73 / #B45309 | #0F172A / #1D4ED8 / #FBBF24 |
| Tint / Background | #EDE7FF / #FBF8FF | #D5EEEF / #F1FAFA | #DBE5FF / #F8FAFC |
| Dark-bg accent | #FF9A6B | #F6A63A | #FBBF24 |
| Display font (open, OFL) | Fraunces 600 (soft) | Space Grotesk 600 | Sora 600 |
| Body font (open, OFL) | Inter | Inter | Inter |
| Contrast: ink on bg | 14.3 | 14.1 | 17.1 |
| Contrast: primary on bg | 6.9 | 5.9 | 6.4 |
| Contrast: white on primary | 7.3 | 6.2 | 6.7 |
| Contrast: accent on bg | 4.9 | 4.7 | 1.6 (graphic use only, never text) |
| Contrast: dark-bg accent on ink | 7.2 | 7.4 | 10.7 |
| Strength | fits "relationship" concept; friendly | simple, scales well | clearest link to the product (density) |
| Risk | chat-bubble motif is common (shape is generic, not copied) | may read as power/settings icon | resembles text-align icon |
| Best for | consumer-facing, onboarding | developer/tool audience | B2B/SDK audience |

Contrast = WCAG 2.x ratio. Thresholds: text 4.5, large text and graphics 3. All text pairs above pass; C's accent is for the symbol on blue (4.0) only.

## Recommendation: A · Rapport
- Matches the "AI social life / rapport" concept most directly.
- Warm palette keeps away from clinical blue/green looks.
- All site colour pairs pass AA (light and dark), checked: text 16.8/15.1, muted 8.5/8.9, primary 6.9/10.5, border 3.4/3.6, on-primary 7.3/10.5.

## Files
- `concept-{A,B,C}.svg`: lockup, wordmark outlined to paths (no font needed). `concept-{A,B,C}-symbol.svg`: symbol only.
- `preview/concept-{A,B,C}.{svg,png}`: sheet with light, dark, palette. `overview.png`: all three side by side.
- Applied (A): `docs/img/logo.svg`, `docs/img/logo-dark.svg`, `docs/favicon.svg`, CSS variables in `docs/css/style.css`.

## Usage notes
- Min symbol size 16 px; clear space = half the symbol width.
- Do not recolour the accent dot to red/green (reads as status). Do not add pulse, heart, brain or cross shapes.
- Fonts: Fraunces, Space Grotesk, Sora, Inter are SIL OFL 1.1 (free/open).
