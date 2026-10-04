# Contributing

Thanks for helping! Attune is an early, unvalidated prototype; keep that honesty in code and docs.

## Setup

No dependencies. Node 18+ for tests and the dev server.

```bash
npm test     # node --test test/
npm start    # serves docs/ on http://127.0.0.1:8080
```

## Guidelines

- **Zero dependencies, no build step.** Browser code is plain ES modules in `docs/js/`.
- **Pure logic stays DOM-free** (`profile.js`, `engine.js`, `transform.js`, `adapter.js`) and must have tests in `test/` using `node:test` only.
- **Privacy first:** no network calls, analytics or third-party scripts in shipped code. Insert text with `textContent`, never `innerHTML`. A test enforces this.
- **i18n:** every UI string goes in `docs/js/i18n.js` for both `en` and `ko`. English is the default language. A test checks key parity and placeholders.
- **Accessibility:** keyboard operable, visible focus, sufficient contrast, 44px touch targets, respect `prefers-reduced-motion`.
- **No health or medical claims.** Sensor values are virtual until validated work says otherwise. Do not add diagnostic wording.
- Keep thresholds and heuristics documented as assumptions.

## Pull requests

Small, focused PRs with tests. Describe the behaviour change and how you checked it. 
## Contribution licence (simple CLA)

By submitting a contribution (pull request, patch, issue text with code) you confirm that you have the right to submit it, and you license it under the [PolyForm Noncommercial License 1.0.0](LICENSE) like the rest of the repository. You also grant the project owner (Sehan Yun) a perpetual, worldwide, non-exclusive, royalty-free, irrevocable licence to use, modify, sublicense and distribute your contribution, including in commercial licences of the project. You keep your copyright. Do not submit code you cannot license this way.

The name "Attune" and the logos are not licensed for contribution reuse; see [NOTICE](NOTICE).
