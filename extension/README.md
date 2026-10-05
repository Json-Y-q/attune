# Attune Chrome extension (MV3 prototype)

**Status: prototype / not submitted to the Chrome Web Store.**

## What it does
- Floating **"I'm overloaded"** button on `chatgpt.com`, `claude.ai`, `gemini.google.com`
- Records a local label in `chrome.storage.local` (timestamp, session id, recent turn count, host snapshot)
- Optionally prepends a short load-status instruction to the input (**confirm before insert is on by default**)
- Popup: button, status, label count, export / clear, insert prefs

## What it does not do
- No external network / analytics / account
- No Web Store listing
- Does not guarantee DOM selectors keep working (vendors redesign often) — see `selectors.json`

## Load unpacked
1. Open `chrome://extensions` → Developer mode → Load unpacked → select this `extension/` folder.
2. Open one of the three hosts and look for the blue floating button.

## Permissions
- `storage`, `activeTab`
- `host_permissions`: only the three domains above

## Reuse
Label helpers live in `lib/labels.js` (mirrors `docs/js/labels.js`). Full engine/loop/partner stay in the docs site and the local MCP server; the extension keeps a minimal footprint so it does not ship the whole demo.

