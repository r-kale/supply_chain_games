# Roadmap

Where this project can go next, in priority order. The guiding principle so far — and
for everything below — is **zero infrastructure**: everything must keep working as a
static site anyone can host, with the host's browser doing any "server" work.

## Now — sharpen the workshop weapon

The site's proven use case is facilitated sessions. These multiply that value:

1. **Live class mode for the Newsvendor Game.** Reuse the Beer Game's PeerJS star:
   everyone joins a room code, each round every participant submits an order, and the
   instructor's projected screen builds a **live histogram of the room's orders** against
   the optimal quantity. Pull-to-center bias appearing in real time, anonymously, in
   front of the whole room is the single most powerful teaching moment this project
   doesn't have yet. (The same "poll-the-room" engine would later serve other games.)
2. **Facilitator control room upgrades** for the multiplayer Beer Game:
   - a per-week **pace timer** broadcast to players ("20s left…"), configurable;
   - **nudge/force-bot**: let the host convert one slow role to a bot for a single week
     so 15 people never wait on one distracted player;
   - **demand shock injection**: a facilitator button that mid-game switches the demand
     pattern ("a promotion hits!") — great for advanced replays;
   - a **custom demand pattern editor** at room setup (draw or type the series).
3. **Connection-path telemetry.** A `getStats()` probe after each peer connects, showing
   a per-player *direct/relayed* badge in the lobby and facilitator board. Makes the
   TURN-share question answerable at a glance and speeds up venue debugging.
4. **Commit the test harness.** The Playwright end-to-end drivers (full playthroughs of
   every game, multiplayer with three browser contexts against a local PeerJS broker,
   failure-path probes) currently live outside the repo. Move them into `tests/` with a
   CI workflow so every PR replays them.

## Next — deepen the course

5. **Course progression tracking** (localStorage, no accounts): completion ticks on the
   course page, quiz scores, and a printable **certificate of completion** generated
   client-side.
6. **Printable lesson handouts**: print stylesheets so each lesson collapses to a clean
   one-page A4 summary for workshop packets.
7. **New game — Disruption & Resilience.** Players allocate a budget across mitigations
   (dual sourcing, buffer stock, visibility, flexible capacity), then random disruptions
   hit a simulated network; score = service maintained vs. money spent. Teaches
   time-to-recover/time-to-survive thinking (Sheffi; Simchi-Levi). The most-requested
   modern topic missing from the current six.
8. **New game — The Forecasting Game.** Players forecast a demand series round by round
   against naive and smoothing benchmarks; debrief on forecast value added and why
   over-reacting to noise feeds the bullwhip (ties directly into Lesson 5).

## Later — reach and scale

9. **Multi-chain rooms**: one host running 2–3 parallel Beer Game chains with a live
   cross-chain leaderboard — tournament mode without splitting the facilitator's screen.
10. **Localization**: per-language static page sets (the architecture makes this a
    translation job, not an engineering job). Pilot with one language where workshops
    actually happen before building any tooling.
11. **PWA packaging** (manifest + service worker): installable and fully offline for
    venues with no internet — everything except multiplayer already works offline.
12. **Social/OG meta tags** and a small landing-page demo GIF, so shared links preview
    properly in chat apps.
13. **Aggregate insight without analytics**: an opt-in "session summary" result code the
    facilitator can archive per workshop — a growing personal dataset of how real groups
    play, with nothing tracked online.

## Deliberately not planned

- **Accounts, databases, backends** — the no-infrastructure property is the product.
- **A game-hosting service** — the host's browser stays the server.
- **LMS/SCORM integration** — revisit only if an institution actually asks.
