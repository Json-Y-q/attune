# Attune mascot (optional, candidate)

A **separate variant** of the logo for the "From overload to recovery" story and the "Same conversation, different pace" section.
The logo itself (`brand/concept-2/`, `docs/img/logo*.svg`) is **not changed** and stays the default; the mascot is shown only
if the visitor switches it on (checkbox, remembered in `localStorage` as `attune.mascot`).

## What it is
- A floating **head only**: the speech-bubble outline plus the five brain arcs of the logo, with simple dot eyes and a small mouth.
  No body, no limbs, no realistic human face.
- Arc colour follows the meter (blue → orange → magenta, the same scale as the load meter). **Arc thickness** and the **expression**
  change too, so the state is never carried by colour alone: thin = calm, medium = rising, thick = break zone.
- Faces: calm, tense (lowered eyes, flat mouth), tired (heavy-lid lines), ease (soft closed-smile), bright. Extras: sweat drops,
  a slight puff while loaded, a slow breathing animation while resting, a small sparkle when recovered. No swirl eyes, minimal shake.
- It illustrates the **meter's state**; it does not read or claim anything about anyone's feelings.

## Four still frames (also used when `prefers-reduced-motion` is on)
`mascot-calm.svg`, `mascot-build.svg`, `mascot-heavy.svg`, `mascot-recovered.svg`

## Characters (individual differences)
`mascot-character-a.svg` … `d.svg`: the same head shape for everybody. Characters differ **only** in a soft colour tint, the eye shape
and one small accessory (glasses, headphones, sprout, none). They carry no names, and no age, gender or other group meaning;
the section says so ("Illustrative — individual differences, not age or gender; virtual values").

## Source of truth
Geometry is plain data in `docs/js/mascot.js`. `node scripts/gen-mascot.mjs` writes the SVG files here and into `docs/img/`.
Drawn for this project. Like the logo, the mascot artwork is **not** covered by the code licence (see `NOTICE`); trademark check pending.
