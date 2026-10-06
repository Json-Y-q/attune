# Attune Chrome extension (MV3 prototype)

**Status: prototype / not submitted to the Chrome Web Store.** Loaded by hand as an unpacked extension. Nothing leaves the browser (`chrome.storage.local` only), and it never sends a message for you.

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
2. A round 🎈 mascot appears at the bottom right. Click it → pick 😌 calm / 😐 a bit heavy / 😣 overloaded.
3. On a heavy pick, a short load note is put in front of whatever you type (an empty box gets a "rewrite shorter" request). A chip says "Load note ready" with **Undo**. You still press send yourself.
4. Automatic suggestion: if you send nearly the same message again, a bubble may ask "Want a short summary first?" with **Yes, please / Not now**. Sending again without answering counts as "no answer".
5. Popup (toolbar icon): manual buttons, auto-suggestion on/off, daily max (2 or 3), reset learning, export JSON, clear labels.

If the mascot shows but the note does not land in the composer, Grok's page structure probably changed: edit the `grok.com` entry in `selectors.json` (the composer selector was checked on 2026-10-07 on the logged-out page; the logged-in message list selectors are best-effort fallbacks), then reload the extension.

## Interaction rules
- Floating **mascot**, not a text button. Default ON: a pick immediately prepares the note for the **next** message (no confirm dialog). Never auto-sends.
- Notes ask the model for a 1–2 sentence summary first and the full details below. Nothing is dropped.
- Automatic suggestions follow the same policy as the site (`lib/suggest.js` is a verbatim copy of `docs/js/suggest.js`): at most 2–3 per day, quiet for 1 / 3 / 7 days after 1 / 2 / 3 passes in a row, and a "yes" shortens that. Wording is action-only ("Want a short summary first?"), never a statement about you.

## Permissions
`storage`, `activeTab`, and host_permissions for `https://chatgpt.com/*`, `https://claude.ai/*`, `https://gemini.google.com/*`, `https://grok.com/*` only.
