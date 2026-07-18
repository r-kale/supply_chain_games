# 📦 Supply Chain Games

Interactive browser games for teaching core supply chain concepts — inspired by the MIT
Beer Distribution Game. Each game puts players inside a classic supply chain dilemma,
then debriefs them with charts built from their own session data.

**Now a complete course:** [course.html](course.html) sequences six structured lessons —
learning objectives, theory with worked examples, post-game discussion questions, and
interactive self-check quizzes — each reinforced by one of the games:

1. [Flow & Variability](lesson-1-flow-variability.html) → 🎲 Dice Game
2. [Inventory under Uncertainty](lesson-2-inventory-uncertainty.html) → 📰 Newsvendor
3. [Risk Pooling](lesson-3-risk-pooling.html) → 🏭 Warehouse Consolidation
4. [Batching & Cycle Stock](lesson-4-batching-eoq.html) → ⚖️ Batch Size
5. [The Bullwhip Effect](lesson-5-bullwhip.html) → 🍺 Beer Game (capstone)
6. [Incentives & Contracts](lesson-6-contracts.html) → 🤝 Contract Game

The sequence climbs from a single process → a single decision → a network → a policy →
multi-echelon dynamics → cross-firm incentives.

**Zero dependencies. No build step. No server.** Open `index.html` in a browser, or host
the folder anywhere (GitHub Pages, an intranet share, a laptop at a workshop).

## The games

| Game | Concept | Players | Time |
|---|---|---|---|
| 🍺 [The Beer Game](beer-game.html) | Bullwhip effect | 1–4: solo vs. bots, hot-seat, or [online multiplayer](beer-online.html) | 20–40 min |
| 📰 [The Newsvendor Game](newsvendor.html) | Demand uncertainty, service levels, critical ratio | 1 | 10–15 min |
| 🏭 [Warehouse Consolidation](risk-pooling.html) | Risk pooling, the √n law | 1 | 10–15 min |
| 🎲 [The Dice Game](dice-game.html) | Variability + dependent events (*The Goal*) | 1 | 10 min |
| 🤝 [The Contract Game](contract-game.html) | Double marginalization, coordinating contracts | 1 | 10–15 min |
| ⚖️ [The Batch Size Game](batch-game.html) | EOQ, ordering vs. holding costs | 1 | 5–10 min |

Plus a 🏆 [Comparison Board](compare.html) for tournaments: every debrief issues a copyable
**result code**; the facilitator pastes the codes into the board for instant leaderboards.
No server, no accounts — the code is the data.

### 🍺 The Beer Game
Four tiers — retailer, wholesaler, distributor, factory — each seeing only its own
inventory and incoming orders. Order delay 1 week, shipping delay 2 weeks, holding cost
$0.50/case/week, backlog $1.00/case/week. Bot players use either the Sterman (1989)
anchoring-and-adjustment heuristic (realistic, produces bullwhip) or a disciplined
base-stock policy (the benchmark). The debrief reveals the hidden demand pattern, order
amplification per tier, net inventory swings, costs, and a bot benchmark on identical demand.

**Online multiplayer** (`beer-online.html`): up to 4 players on their own devices
(phones work). The host's browser runs the game and is the source of truth; players
connect **peer-to-peer over WebRTC** (via the vendored PeerJS library), so there is no
game server and nothing is stored anywhere. The free public PeerJS broker only performs
the initial handshake. Guests who disconnect are seamlessly replaced by bots.

Connection robustness:

- Peers negotiate through **STUN plus public TURN relays**, so joins work across
  networks and on wifi routers with client isolation (where direct paths fail).
  For workshop-grade reliability, add a **dedicated TURN relay** in
  `js/turn-config.js` (free [metered.ca](https://www.metered.ca/) account; details
  in that file) — it is tried before the public relays.
- Join failures are **diagnosed in stages** (broker unreachable / room not found /
  host unreachable / host silent) with the specific fix in each message: open links
  in a real browser rather than the WhatsApp/Instagram in-app browser; on
  client-isolating wifi, switch one device to mobile data.
- A **protocol version check** makes the host reject guests running a stale cached
  page (with a "reload and rejoin" message), and a one-shot auto-reload guard
  recovers pages whose scripts fail to load after a deploy.
- Organizations that can't reach the public broker can self-host one
  (`npx peerjs --port 9000`) and point the page at it with
  `beer-online.html?srv=host:port`. Strict corporate firewalls can still block
  WebRTC entirely — a phone on mobile data is the workaround.

### 📰 The Newsvendor Game
Ten days running a bakery stand under a high-margin scenario (critical ratio 0.75 →
order *above* mean) then a low-margin one (0.25 → order *below* mean). The debrief plots
the expected-profit curve for every order quantity, marks the player's average against
the optimum, and explains the pull-to-center bias (Schweitzer & Cachon, 2000).

### 🏭 Warehouse Consolidation
Find the least stock that achieves a 95% fill rate — first with four regional warehouses,
then with one central warehouse serving the same demand. The debrief decomposes cycle vs.
safety stock and includes an interactive explorer for locations × demand correlation
(Eppen, 1979).

### 🎲 The Dice Game
A balanced five-station line where each station's per-round capacity is a die roll.
Players predict output, watch throughput fall short of the 3.5/round average, then test
countermeasures (variability reduction, buffers, extra capacity) over 200 simulated runs.

### 🤝 The Contract Game
The player is a manufacturer setting wholesale (and optionally buyback) terms for a
rational newsvendor retailer over 8 seasons. Squeezing the wholesale price shrinks the
retailer's order — double marginalization (Spengler, 1950). Buyback terms on the
coordination line restore the chain-optimal order (Pasternack, 1985), echoing
Blockbuster-style revenue sharing.

### ⚖️ The Batch Size Game
Find the order quantity that balances a $400 fixed ordering cost against $0.30/unit/week
holding cost. Debrief covers the EOQ formula (Harris, 1913), the flatness of the cost
curve, and why lean attacks the fixed cost (SMED) rather than tuning the batch.

## Running a workshop

See [FACILITATOR_GUIDE.md](FACILITATOR_GUIDE.md) for timings, discussion questions, and
the theory behind each debrief.

## Repository layout

```
index.html            landing page
beer-game.html        + js/beer-game.js      bullwhip / Beer Game (solo & hot-seat)
beer-online.html      + js/beer-online.js    Beer Game online multiplayer (WebRTC, serverless)
js/beer-engine.js     shared Beer Game simulation, bots, and debrief renderer
js/vendor/peerjs.min.js  vendored PeerJS 1.5.5 (MIT) — WebRTC peer connections
newsvendor.html       + js/newsvendor.js     newsvendor problem
risk-pooling.html     + js/risk-pooling.js   risk pooling challenge
dice-game.html        + js/dice-game.js      variability / The Goal dice game
contract-game.html    + js/contract-game.js  double marginalization / buyback contracts
batch-game.html       + js/batch-game.js     EOQ / batch sizing
compare.html          + js/compare.js        facilitator leaderboards from result codes
js/results.js         result-code encode/decode + share widget
js/charts.js          tiny SVG chart library (lines, bars, tooltips, dark mode)
css/style.css         shared design system (light + dark)
```

## Hosting on GitHub Pages

Settings → Pages → deploy from branch → root of `main`. The site is fully static and
self-contained, so nothing else is needed.

## License

MIT — see [LICENSE](LICENSE). Use it, adapt it, host it on your intranet, teach with it.
The vendored [PeerJS](https://peerjs.com) library (js/vendor/peerjs.min.js) is also MIT;
its notice is preserved in [js/vendor/LICENSE-peerjs.txt](js/vendor/LICENSE-peerjs.txt).
The classic game concepts (Beer Distribution Game, newsvendor problem, EOQ, etc.) are
long-standing academic exercises; the implementations here are original, with sources
cited in each game's footer and in the [facilitator guide](FACILITATOR_GUIDE.md).
