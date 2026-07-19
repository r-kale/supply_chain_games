# Facilitator Guide

How to run each game as a team learning session. Every game ends with a built-in debrief
screen generated from the session's own data — your job as facilitator is mostly to set
up the experience, protect the surprise, and lead the discussion afterward.

The site is live at **[r-kale.github.io/supply_chain_games](https://r-kale.github.io/supply_chain_games/)** —
send participants there directly; nothing to install.

**Tournaments:** every game's debrief has a **Copy result code** button. Have each team
paste its code into the chat (or read it out); paste them all into the
[Comparison Board](compare.html) and project the leaderboards. Nothing is uploaded —
the code itself carries the result.

General tips:

- **Don't pre-teach the concept.** The "aha" comes from experiencing the failure first
  and seeing the theory second. Introduce each game only by its rules.
- **Project the debrief.** The charts are the discussion material.
- **Let people be wrong in public safely.** Everyone falls for these — that's the point.
  Sterman ran the Beer Game with thousands of executives; almost all produced bullwhip.

---

## 🍺 The Beer Game (bullwhip effect) — 45–60 min with discussion

**Setup options**

- *Online multiplayer (best when everyone has a device):* open
  [beer-online.html](beer-online.html), host a room, share the 5-letter code (phones work).
  Uncheck "I'll play a role too" to facilitate: you get a live board showing who has
  ordered each week and the chain cost so far. Guests who drop are replaced by bots.
- *Hot-seat (one shared machine):* players pass it each week; hand-off screens keep each
  player's numbers private. 36 weeks takes ~25 minutes.
- *Tournament (larger groups):* split into teams of 1–4, one room or machine each, same
  settings (Classic demand, human-like bots). Lowest total chain cost wins — collect
  result codes into the Comparison Board.
- Keep **Classic** demand selected and don't reveal what it is — the flat-then-step
  pattern is the punchline.

**Watch for during play:** panic ordering when backlogs appear around week 8–12; players
forgetting what they already ordered (supply-line neglect); blame flowing between tiers.

**Debrief discussion (15–20 min)**

1. Before revealing: "What do you think customer demand did?" (Most will guess wild
   swings. It stepped once, from 4 to 8, and never moved again.)
2. Walk the order chart tier by tier — amplification is usually 2–5× by the factory.
3. "Who was the villain?" — nobody. The structure (delays, local information, no shared
   demand signal) produces the behavior. This is the systems-thinking lesson.
4. Connect to reality: 2020–21 semiconductor and toilet-paper whipsaws, retail
   phantom-ordering during shortages, the benchmark bots' cost (information + discipline).
5. Countermeasures: share POS data (CPFR, VMI), shorten lead times, order steadily,
   count the supply line, avoid promotions that distort demand.

**Replays:** try the same team with *Disciplined (base-stock)* bots, or everyone-human
vs. everyone-bot, or Random demand to show bullwhip isn't caused by the step alone.

---

## 📰 The Newsvendor Game (demand uncertainty) — 25–35 min with discussion

**Setup:** each participant plays solo (both scenarios, ~12 min). Ask them to note their
average order in each scenario when the debrief shows it.

**Debrief discussion**

1. Poll the room: average order in scenario 1 (optimal ≈ 120) and scenario 2 (optimal ≈ 80).
   Expect both averages to sit near 100 — that's **pull-to-center**, and seeing the whole
   room share the bias is the moment that lands.
2. Teach the critical ratio from the built-in debrief: order where
   P(demand ≤ Q) = Cu/(Cu+Co). Emphasize that *average demand barely matters*.
3. Applications: seasonal buys, perishables, capacity reservations, hotel/airline
   overbooking (same math, opposite direction), safety stock service levels.

---

## 🏭 Warehouse Consolidation (risk pooling) — 20–30 min with discussion

**Setup:** solo or pairs. Frame it as a competition: "lowest total inventory that still
hits 95% fill in *both* phases."

**Debrief discussion**

1. Compare locked-in numbers around the room; theory says ~600 regional vs. ~450 central.
2. Key insight from the stacked comparison: cycle stock doesn't pool — only safety stock
   does, and it shrinks by √n.
3. Use the correlation slider live: "What if all four regions boom together?" (national
   promotions, weather, fashion trends → pooling benefit evaporates).
4. Discuss the trade-off pooling costs: distance to customer, transport, resilience.
   Where do e-commerce networks sit on this spectrum today?

---

## 🎲 The Dice Game (variability & flow) — 20–30 min with discussion

**Setup:** solo or projected as a group exercise (one person rolls, the room watches).
Collect predictions before starting — write a few on a whiteboard.

**Debrief discussion**

1. Predictions vs. reality: the line delivers ~60–65, not 70, despite being perfectly
   balanced. Where did the units go? (Look at the WIP pile-up.)
2. The two culprits: statistical fluctuations × dependent events. Deficits propagate
   downstream; surpluses can't be banked.
3. Run the three countermeasures and rank them: variability reduction ≈ free throughput;
   buffers buy throughput with WIP; capacity is the expensive fix.
4. Connect to practice: why lean cares about steady takt and small batches, why the
   Theory of Constraints buffers only the bottleneck, why running at 100% utilization
   destroys lead times.

---

## 🤝 The Contract Game (incentives & coordination) — 25–35 min with discussion

**Setup:** solo or pairs, 8 seasons. Frame it plainly: "You're the manufacturer;
maximize *your* profit." Don't mention buybacks — the input field is there, and
discovering it is the game.

**Debrief discussion**

1. Poll: who offered a buyback? Who found terms where the retailer ordered 120?
   Most players spend early seasons raising or lowering the wholesale price and
   watching the pie shrink or their share vanish.
2. Name the trap: **double marginalization** — two firms each taking a margin order
   less than one integrated firm would. The wholesale-only chart shows there is *no*
   wholesale price that fixes it.
3. Walk the coordination line (w = $9, b = $8 → retailer orders 120 and you keep most
   of the pie). Key sequence: **grow the pie first, then negotiate the split.**
4. Real-world hooks: Blockbuster revenue sharing, book returns, markdown money,
   vendor-managed inventory. Ask: what contracts in *your* business quietly shrink
   the pie?

---

## ⚖️ The Batch Size Game (EOQ) — 15–20 min with discussion

**Setup:** solo; race on fewest attempts to reach the 2% zone.

**Debrief discussion**

1. Compare best batch sizes — then point out the cost curve's flat bottom: ±20% on Q
   costs ~2%. Precision in Q is not where the money is.
2. The lever that matters: **shrink the fixed cost K** (setup time, paperwork, freight
   minimums) and the optimal batch shrinks by √. That's the EOQ math behind lean's
   setup-time obsession (SMED) and behind "batch of one" flow.
3. Tie back to the Beer Game: order batching is a classic bullwhip amplifier.

---

## One-hour Beer Game workshop (ready-made)

[workshop-slides.html](workshop-slides.html) is a self-contained slide deck for a 60-minute
session (built for a dealer-network audience; adapt freely). Arrow keys / click to advance,
`F11` fullscreen, `P` prints all slides as handouts. Structure:

- **Part A (before play):** setting, the three rules, join logistics — a dashed box on the
  logistics slide is click-to-type for your room code. A "Now we play" divider stops you
  from spoiling the reveal.
- **Part B (after play):** the reveal, what the bullwhip is, why nobody was incompetent,
  the dealer-network translation table, countermeasures, discussion prompts.

Suggested run of show (10–15 participants): 5 min rules → 7 min join (4 groups, one device
each, one multiplayer room, you host in facilitator mode and project the live board) →
20 min playing **16 weeks** (game length is freely configurable, 8–104 weeks) → 8 min
debrief charts on the projector → 12 min Part B slides → 8 min discussion.

**Connection test matrix (run before the day):**

1. Two devices on the same wifi — should join; if not, the router isolates clients:
   move one device to mobile data (the app's error message says this too).
2. One device on wifi + one on cellular — exercises the TURN relay path.
3. Both on cellular — the toughest NAT case.
4. Open the join link from inside WhatsApp — expect it to fail with a message telling
   the player to open it in Safari/Chrome. That's working as intended; tell players to
   use a real browser.

Each case should either connect or show a specific, actionable error. For maximum
reliability at a paid workshop, configure a dedicated TURN relay — either directly in
`js/turn-config.js` or via the repository secrets consumed by the Pages deploy workflow
(free metered.ca account; instructions in that file and in the README).

## Teaching a full course

[course.html](course.html) packages everything into a six-lesson course with a deliberate
sequence (flow → single decision → network → policy → chain dynamics → incentives). Each
lesson page contains objectives, the theory with worked examples, a "now play" block,
post-game discussion questions, and a self-check quiz. Two ways to run a session:

- **Lesson-first:** teach the page, then play the game as reinforcement, then use the
  lesson's discussion questions on the game's debrief data.
- **Game-first (recommended for Lessons 5 & 6):** play cold, then teach the lesson as the
  explanation of what just happened. Don't spoil the traps beforehand.

## Suggested sequences

- **Half-day "systems thinking in supply chains":** Beer Game → Dice Game → discussion.
- **Inventory fundamentals session:** Newsvendor → Warehouse Consolidation → Batch Size.
- **Working-with-partners session:** Beer Game → Contract Game (information, then incentives).
- **Lunch-and-learn:** any single game with its debrief (~30 min).

## References

- Forrester, J. (1961). *Industrial Dynamics.*
- Sterman, J. (1989). Modeling managerial behavior. *Management Science 35*(3).
- Schweitzer, M. & Cachon, G. (2000). Decision bias in the newsvendor problem. *Management Science 46*(3).
- Eppen, G. (1979). Effects of centralization on expected costs in a multi-location newsboy problem. *Management Science 25*(5).
- Goldratt, E. (1984). *The Goal.*
- Spengler, J. (1950). Vertical integration and antitrust policy. *Journal of Political Economy 58*(4).
- Pasternack, B. (1985). Optimal pricing and return policies for perishable commodities. *Marketing Science 4*(2).
- Cachon, G. & Lariviere, M. (2005). Supply chain coordination with revenue-sharing contracts. *Management Science 51*(1).
- Harris, F. (1913). How many parts to make at once. *Factory, The Magazine of Management 10*(2).
