/* ============================================================
   The Beer Game — solo / hot-seat flow and play UI.
   Simulation, bots, and the debrief renderer live in
   js/beer-engine.js (shared with the multiplayer mode).
   ============================================================ */

(() => {
  const E = BeerEngine;
  const { ROLES, ICONS } = E;

  const $ = id => document.getElementById(id);
  const money = E.money;

  /* ---------------- game state / flow ---------------- */

  let G = null; // { sim, weeks, humans[4], botKind, pattern, seed, orders, turn }

  const sections = ["setup", "handoff", "play", "debrief"];
  function show(id) { sections.forEach(s => $(s).classList.toggle("hidden", s !== id)); window.scrollTo(0, 0); }

  // setup: one Human/Bot toggle per role
  function buildRolePickers() {
    const box = $("role-pickers");
    ROLES.forEach((r, i) => {
      const lab = document.createElement("label");
      lab.className = "field";
      lab.textContent = ICONS[i] + " " + r;
      const seg = document.createElement("div");
      seg.className = "seg";
      seg.dataset.role = i;
      ["Human", "Bot"].forEach((kind, k) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = kind;
        const on = (i === 0 && k === 0) || (i > 0 && k === 1); // default: human retailer
        if (on) b.classList.add("on");
        b.addEventListener("click", () => {
          seg.querySelectorAll("button").forEach(x => x.classList.remove("on"));
          b.classList.add("on");
        });
        seg.appendChild(b);
      });
      lab.appendChild(seg);
      box.appendChild(lab);
    });
  }

  function startGame() {
    const humans = [...document.querySelectorAll("#role-pickers .seg")].map(
      seg => seg.querySelectorAll("button")[0].classList.contains("on"));
    if (!humans.some(Boolean)) { alert("Pick at least one human role."); return; }
    const weeks = +$("cfg-weeks").value;
    const pattern = $("cfg-demand").value;
    const seed = (Math.random() * 2 ** 31) | 0;
    G = {
      humans, weeks, pattern, seed,
      botKind: $("cfg-bots").value,
      humanCount: humans.filter(Boolean).length,
      sim: E.newSim(E.buildDemand(pattern, weeks, seed)),
      orders: [null, null, null, null],
      turn: -1
    };
    beginWeek();
  }

  function beginWeek() {
    E.startWeek(G.sim);
    G.orders = [null, null, null, null];
    G.turn = -1;
    nextTurn();
  }

  function nextTurn() {
    // find the next human role without an order this week
    let next = -1;
    for (let i = 0; i < 4; i++) if (G.humans[i] && G.orders[i] == null) { next = i; break; }
    if (next === -1) { resolveWeek(); return; }
    G.turn = next;
    if (G.humanCount > 1) {
      $("handoff-week").textContent = `Week ${G.sim.week} of ${G.weeks}`;
      $("handoff-title").textContent = `${ICONS[next]} ${ROLES[next]}'s turn`;
      $("btn-handoff").textContent = `I'm the ${ROLES[next]} — show my numbers`;
      show("handoff");
    } else {
      renderPlay();
    }
  }

  function resolveWeek() {
    G.sim.tiers.forEach((t, i) => {
      if (!G.humans[i]) G.orders[i] = E.botOrder(G.botKind, t, i);
      else t.lhat = 0.36 * t.demand + 0.64 * t.lhat; // keep forecast state consistent
    });
    E.endWeek(G.sim, G.orders);
    if (G.sim.week > G.weeks) renderDebrief();
    else beginWeek();
  }

  /* ---------------- play screen ---------------- */

  function renderPlay() {
    const i = G.turn, t = G.sim.tiers[i];
    $("play-title").textContent = `${ICONS[i]} ${ROLES[i]}`;
    $("play-week").textContent = `Week ${G.sim.week} of ${G.weeks}`;
    BeerUI.renderStation($("pipeline"), i, t);
    BeerUI.renderTiles($("play-tiles"), i, t);
    $("order-hint").textContent =
      `Ordered but not yet received: ${t.onOrder} cases (arrives over the next ~3 weeks).`;
    $("order-input").value = t.hist.order.length ? t.hist.order[t.hist.order.length - 1] : 4;
    BeerUI.renderHistory($("history-table"), t);
    show("play");
    $("order-input").focus();
    $("order-input").select();
  }

  function placeOrder() {
    const v = Math.max(0, Math.round(+$("order-input").value));
    if (!isFinite(v)) return;
    G.orders[G.turn] = v;
    nextTurn();
  }

  /* ---------------- debrief ---------------- */

  function renderDebrief() {
    const humanLabels = {};
    G.humans.forEach((h, i) => { if (h) humanLabels[i] = "you"; });
    E.renderDebrief({
      demand: G.sim.demand, tiers: G.sim.tiers,
      weeks: G.weeks, pattern: G.pattern, humanLabels
    });
    show("debrief");
  }

  /* ---------------- wire up ---------------- */

  buildRolePickers();
  $("btn-start").addEventListener("click", startGame);
  $("btn-handoff").addEventListener("click", renderPlay);
  $("btn-order").addEventListener("click", placeOrder);
  $("order-input").addEventListener("keydown", e => { if (e.key === "Enter") placeOrder(); });
  $("btn-again").addEventListener("click", () => location.reload());
})();
