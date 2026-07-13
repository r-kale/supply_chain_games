# 📦 Supply Chain Games

Interactive browser games for teaching core supply chain concepts — inspired by the MIT
Beer Distribution Game. Each game puts players inside a classic supply chain dilemma,
then debriefs them with charts built from their own session data.

**Zero dependencies. No build step. No server.** Open `index.html` in a browser, or host
the folder anywhere (GitHub Pages, an intranet share, a laptop at a workshop).

## The games

| Game | Concept | Players | Time |
|---|---|---|---|
| 🍺 [The Beer Game](beer-game.html) | Bullwhip effect | 1–4 (hot-seat) or solo vs. bots | 20–40 min |
| 📰 [The Newsvendor Game](newsvendor.html) | Demand uncertainty, service levels, critical ratio | 1 | 10–15 min |
| 🏭 [Warehouse Consolidation](risk-pooling.html) | Risk pooling, the √n law | 1 | 10–15 min |
| 🎲 [The Dice Game](dice-game.html) | Variability + dependent events (*The Goal*) | 1 | 10 min |

### 🍺 The Beer Game
Four tiers — retailer, wholesaler, distributor, factory — each seeing only its own
inventory and incoming orders. Order delay 1 week, shipping delay 2 weeks, holding cost
$0.50/case/week, backlog $1.00/case/week. Bot players use either the Sterman (1989)
anchoring-and-adjustment heuristic (realistic, produces bullwhip) or a disciplined
base-stock policy (the benchmark). The debrief reveals the hidden demand pattern, order
amplification per tier, net inventory swings, costs, and a bot benchmark on identical demand.

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

## Running a workshop

See [FACILITATOR_GUIDE.md](FACILITATOR_GUIDE.md) for timings, discussion questions, and
the theory behind each debrief.

## Repository layout

```
index.html            landing page
beer-game.html        + js/beer-game.js      bullwhip / Beer Game
newsvendor.html       + js/newsvendor.js     newsvendor problem
risk-pooling.html     + js/risk-pooling.js   risk pooling challenge
dice-game.html        + js/dice-game.js      variability / The Goal dice game
js/charts.js          tiny SVG chart library (lines, bars, tooltips, dark mode)
css/style.css         shared design system (light + dark)
```

## Hosting on GitHub Pages

Settings → Pages → deploy from branch → root of `main`. The site is fully static and
self-contained, so nothing else is needed.
