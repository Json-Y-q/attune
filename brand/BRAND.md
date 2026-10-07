# Tempoloon — logo spec

Slogan candidate: "AI that attunes to you."
Idea: a brain-shaped speech bubble (5 wavy arcs on top, balloon bottom, tail bottom-left). Rapport with an AI + the load scale calm → rising → break.
No medical cues (no cross, heart, pulse line, anatomical brain). Name/marks unregistered, trademark check pending.
Rename (2026-10): the project is now **Tempoloon** (Korean 템포룬), formerly "Attune". The symbol artwork is unchanged; the lockups (`docs/img/logo*.svg`, `concept-2.svg`, `concept-H.svg`, `concept-1b*.svg`) carry the new "tempoloon" wordmark. Preview sheets/PNGs (`overview.png`, `*/preview/*`) and everything in `archive/` still show the old "attune" wordmark as history.

## Status
| Folder | Role |
|---|---|
| `concept-2/` | **chosen**, applied to `docs/` (logo, dark logo, favicon, CSS variables) |
| `concept-1/` | candidate: 5-arc bubble + 6-tick speed scale + needle + spark + chat dots |
| `concept-1b/` | candidate: concept 1 with the ticks and dots replaced by a circular loading gauge; optional animated SVG |
| `archive/` | earlier concepts (v1 A/B/C, D/E/F, G) and earlier revisions of concept 1 |
`overview.png`: concept 2 (chosen) next to concept 1b (and concept 1 for reference), variants and 16 px.

## Concept 2 (chosen)
| Item | Value |
|---|---|
| Silhouette | 5 arcs (radius = 0.6 × chord, angle spans 30/35/50/35/30° so the middle is largest), balloon bottom, tail |
| Arc colours (left → right) | blue, blue, orange, magenta, magenta = calm 2 / rising 1 / break 2 (load <50, 50–74, ≥75) |
| Non-colour cue | arc thickness 6 / 7.5 / 9 / 10.5 / 12 (mono keeps it); 16 px: 11–23 |
| Bottom outline | ink #0D1B2A (dark #E0E0FF), width 9 (16 px: 14) |
| AI spark | small (r14), centred; dropped at 16 px |
| Wordmark | "tempoloon", Manrope 800, outlined to paths (0.06 × font units, baseline y 142, same as the earlier wordmark); body font Inter (both SIL OFL) |
| Variants | colour, dark, mono, mono white, 16 px (+dark), continuous-gradient study |
| Colour vs gradient | 3-zone chosen: clear boundaries; min contrast on white 4.6 vs 4.3 for a smooth blend |
| Tone | friendly, light, conversational |

## Concept 1b (candidate)
| Item | Value |
|---|---|
| Silhouette | same bubble as concept 1, outline #4338CA |
| Loading gauge | 270° ring (gap at bottom), centre (100,106), r40, three segments clockwise from bottom-left: calm 50% (<50), rising 25% (50–74), break 25% (≥75) |
| Non-colour cue | segment thickness 8 / 11 / 14 and 4° gaps between segments; mono keeps thickness |
| AI spark | r16, centred in the ring |
| 16 px | bubble outline 14 + ring r36 with thickness 15 / 20 / 25, no spark |
| Animation (optional) | `concept-1b/variants/1b-symbol-animated.svg`, `concept-1b-animated.svg`: ring rotates 2.4 s linear; CSS `@media (prefers-reduced-motion: no-preference)` so it stays still for users who reduce motion. Static files are the default. |
| Trade-off vs concept 2 | reads as "loading / thinking" (can be mistaken for a wait state), ring is busier; concept 2 is simpler and keeps the brain outline as the scale |

## Palette and contrast (WCAG 2.x; text 4.5, graphics 3)
| Role | Light | Contrast | Dark | Contrast |
|---|---|---|---|---|
| Ink / text | #0D1B2A | 16.4 on #F7F8FF | #ECEEFB | 15.8 on #0F1428 |
| Calm (blue) | #2F5DA8 | 6.5 on white, 6.1 on #F7F8FF | #8EB4FF | 7.8 on #181F3A |
| Rising (orange) | #B45F06 | 4.6 on white, 4.3 on #F7F8FF | #FFB84C | 9.4 on #181F3A |
| Break (magenta-red) | #B3124F | 6.7 on white, 6.4 on #F7F8FF | #FF6B9A | 6.0 on #181F3A |
Site (CSS variables): primary = calm blue; on-primary 6.5 / 8.8 (light / dark); primary on accent-bg 5.4 / 6.7; text on accent-bg 14.9 / 12.1; brand accent (nav underline) = break colour, 6.4 / 6.8 on bg.
Colour is never the only cue: thickness (concept 2, 1b), zone labels in the demo meter, mono versions keep thickness.
Demo load meter keeps its scale: `--load-calm/--load-mid/--load-high` (unchanged colours).

## Files
- `concept-2/`: `concept-2.svg` (lockup), `concept-2-symbol.svg`, `variants/2-symbol-{dark,mono,monow,continuous}.svg`, `variants/2-favicon-16{,-dark}.svg`, `preview/concept-2.{svg,png}`.
- `concept-1b/`: same layout with `1b-` names, plus the animated variants.
- `concept-1/`: `concept-H.svg`, `concept-H-symbol.svg`, `variants/H-*`, `preview/concept-H.{svg,png}` (named H historically).
- Applied: `docs/img/logo.svg`, `docs/img/logo-dark.svg`, `docs/favicon.svg` (16 px version, dark-mode aware).
