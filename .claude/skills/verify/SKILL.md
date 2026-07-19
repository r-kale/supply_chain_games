---
name: verify
description: How to run and end-to-end verify this static site, including the multiplayer Beer Game, in a headless environment.
---

# Verifying supply_chain_games

Static site — no build. Serve and drive with Playwright.

## Launch

```bash
python3 -m http.server 8901 --directory <repo-root> &   # serve the site
```

Multiplayer needs a local PeerJS broker (the public one is often unreachable
from sandboxes; pages accept `?srv=host:port` to override):

```js
// peerserver.js — npm i peer; then: node peerserver.js &
const { PeerServer } = require('peer');
PeerServer({ port: 9100, path: '/', host: '127.0.0.1' }); // host REQUIRED: no-IPv6 sandboxes throw EAFNOSUPPORT on '::'
```

Health check: `curl http://127.0.0.1:9100/peerjs/id` returns an id.

## Playwright gotchas

- `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })` — a freshly
  installed playwright expects a newer browser build than the preinstalled one.
- Number inputs (`#cfg-weeks`, `#order-input`, …): use `fill()`; `fill('abc')` on a
  number input throws — probe empty/negative instead.
- Multiplayer: use separate `browser.newContext()` per simulated device; open pages
  with `beer-online.html?srv=127.0.0.1:9100`.
- `window.__scgIce` on beer-online.html exposes the resolved ICE server list.

## Flows worth driving

- Solo Beer Game: set weeks, loop fill+order, assert `#debrief:not(.hidden)`,
  charts (`#debrief svg` count), benchmark note.
- Multiplayer: host creates room (code from `#lobby-code`), guests join by code and
  `&join=CODE` deep link, play all weeks (wait `#btn-order:not([disabled])` on all
  pages each week), assert synchronized debriefs. Kill a guest page mid-game →
  heartbeat converts it to a bot within ~12s and the game reaches debrief.
- Join failure paths: dead `?srv` → staged "can't reach broker" message at ~15s;
  wrong code → fast "no room" message; both re-enable the join button.
- Quizzes (lesson pages): wrong option disables + stays unexplained; right option
  locks quiz and reveals `.explain`.
- Result codes: `#result-widget .copy-btn` then read `.code-out` text (clipboard is
  unavailable headless); paste codes into compare.html and assert leaderboards.
