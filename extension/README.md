# Attune Chrome extension (MV3 prototype)

**Status: prototype (v0.3.0) / not submitted to the Chrome Web Store.** Loaded by hand as an unpacked extension. Nothing leaves the browser (`chrome.storage.local` only), and it never sends a message for you.

Supported sites: **chatgpt.com, claude.ai, gemini.google.com, grok.com**.
(`x.com/i/grok` is not included: X is a single-page app, so a path-limited content script would not load reliably, and a host permission for all of `x.com` would be far broader than needed. Use grok.com.)

## Install (Chrome, "Load unpacked")
1. Get the folder: `git clone https://github.com/Json-Y-q/attune.git` (or download the repo ZIP and unzip it). The extension is the `attune/extension` folder (the one that contains `manifest.json`).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (toggle, top right).
4. Click **Load unpacked** and choose the `attune/extension` folder.
5. Pin "Attune Load Feedback (prototype)" from the puzzle-piece menu if you want the popup handy.
6. After pulling new code: press the ↻ reload icon on the extension card, then reload the chat tab.

## Try it on grok.com
1. Open https://grok.com and sign in to your own account.
2. The **brain-balloon mascot** (the same head as on the website, ~60px, no name or label) floats at the bottom right, lifted above the chat box so it never covers the input or the send button. Drag it anywhere; the spot is remembered (popup → **Reset mascot position** puts it back).
3. **Colour + motion show the current reply style**: calm = blue outline with a light blue head, slow breathing; rising = orange, a little swollen, one sweat drop, a slight wobble; break = magenta, clearly inflated, three sweat drops, trembling. Going back to calm lets the air out with a "pshh" (puffs drift away). With `prefers-reduced-motion` it shows the same still frames (size, face, sweat) without any movement.
4. **Hover** the mascot → a small bubble shows how replies look right now (e.g. "Replies now: summary first (~3 lines)") with bars. Preview only, nothing changes.
5. **Click** the mascot → three mascot faces: **light / medium / heavy**. Hover (or focus) a face → "Next reply: ~3 lines, summary first" with bars shrinking to the expected length. **Click a face** → applied at once: the mascot changes, and on medium/heavy a short note is put in front of whatever you type (an empty box gets a "rewrite shorter" request). It is attached to your **next** message only; you still press send yourself. A chip says "Load note ready" with **Undo** (removes the note from the box and shows the previous level again).
6. Keyboard: Tab to the mascot, Enter/Space opens the faces, arrow keys move between them, Enter picks, **Escape** closes (focus returns to the mascot). Clicking anywhere outside also closes the panel.
7. Automatic suggestion: if you send nearly the same message again, a bubble may ask "Want a short summary first?" with **Yes, please / Not now**. Sending again without answering counts as "no answer".
8. Popup (toolbar icon): manual buttons, auto-suggestion on/off, daily max (2 or 3), reset learning, reset mascot position, export JSON, clear labels.

UI text is English by default and Korean when the page (`<html lang>`) or the browser language is Korean.

Composer detection tries a list of candidates in order (Grok's `textarea[aria-label='Ask Grok anything']`, other `aria-label`/`placeholder` textareas, ProseMirror/`contenteditable` boxes, any form textarea) and uses the first visible, editable one. If none is found (e.g. a new logged-in layout), the mascot still floats at the bottom right, a chip says **"Couldn't find the chat box"** ("입력창을 찾지 못함" in Korean), and the note is copied to the clipboard (with a **Copy** button as a second path) so you can paste it yourself. To fix it for good, add a selector to the `grok.com` list in `selectors.json` and reload the extension.

## Interaction rules
- Floating **mascot**, not a text button. Default ON: a pick immediately prepares the note for the **next** message (no confirm dialog). Never auto-sends.
- Notes ask the model for a 1–2 sentence summary first and the full details below. Nothing is dropped.
- Hover text only describes the **reply** ("Next reply: 1-line summary first"), never the person.
- Automatic suggestions follow the same policy as the site (`lib/suggest.js` is a verbatim copy of `docs/js/suggest.js`): at most 2–3 per day, quiet for 1 / 3 / 7 days after 1 / 2 / 3 passes in a row, and a "yes" shortens that. Wording is action-only ("Want a short summary first?"), never a statement about you.

## How the mascot is built
- `lib/mascot.js` is a **verbatim copy** of `docs/js/mascot.js` (checked by a test), so the extension draws exactly the website's head. `lib/widget.js` holds the pure logic (level → colour/pose, "pshh" deflate and inflate frames, preview wording EN/KO, docking above the composer) and is covered by `node --test`.
- `content.js` loads both with `import(chrome.runtime.getURL(...))` (they are listed under `web_accessible_resources`) and renders the widget inside an open **Shadow DOM**, so the chat site's CSS cannot restyle it. If the modules cannot load, a plain coloured circle with the same three choices is shown instead.
- Visual check without installing: serve the repo root (`python3 -m http.server 8099`) and open `http://localhost:8099/scripts/ext-harness.html?level=overloaded&state=open` (states: `idle`, `hover`, `open`, `face`; add `&lang=ko` or `&dark=1`). The harness stubs the `chrome.*` APIs; nothing is sent anywhere.

## Permissions
`storage`, `activeTab`, and host_permissions for `https://chatgpt.com/*`, `https://claude.ai/*`, `https://gemini.google.com/*`, `https://grok.com/*` only.
