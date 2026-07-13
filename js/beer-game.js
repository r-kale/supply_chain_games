/* ============================================================
   The Beer Game — bullwhip effect
   4 tiers: 0 Retailer, 1 Wholesaler, 2 Distributor, 3 Factory.
   Goods flow down (factory → customer), orders flow up.
   Delays: orders 1 week in the mail; shipments 2 weeks in
   transit (the factory's own orders start a 2-week brew).
   Costs: $0.50/case/week holding, $1.00/case/week backlog.
   ============================================================ */

(() => {
  const ROLES = ["Retailer", "Wholesaler", "Distributor", "Factory"];
  const ICONS = ["🏪", "📦", "🚚", "🏭"];
  const HOLD_COST = 0.5, BACK_COST = 1.0;
  const INIT_INV = 12, INIT_FLOW = 4;

  const $ = id => document.getElementById(id);
  const money = v => "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });

  // seeded RNG so the debrief benchmark can replay the exact demand
  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildDemand(pattern, weeks, seed) {
    const rng = mulberry32(seed);
    const d = [];
    for (let w = 1; w <= weeks; w++) {
      if (pattern === "classic") d.push(w <= 4 ? 4 : 8);
      else if (pattern === "seasonal") d.push(Math.max(0, Math.round(8 + 4 * Math.sin((2 * Math.PI * (w - 1)) / 18))));
      else d.push(Math.floor(rng() * 9)); // random: uniform 0..8
    }
    return d;
  }

  /* ---------------- simulation core ---------------- */

  function newTier(isFactory) {
    return {
      inv: INIT_INV, backlog: 0,
      transit: [INIT_FLOW, INIT_FLOW],   // [0] arrives at next startWeek
      orderMail: [INIT_FLOW],            // orders from downstream, 1-week mail
      // placed but not received: 2 wks in transit (+1 wk in the mail, except the factory)
      onOrder: isFactory ? INIT_FLOW * 2 : INIT_FLOW * 3,
      lhat: INIT_FLOW,                   // smoothed incoming-order forecast
      arrived: 0, demand: 0,             // this week's values (set in startWeek)
      hist: { demand: [], order: [], inv: [], backlog: [], arrived: [], shipped: [], cost: [] },
      cost: 0
    };
  }

  function newSim(demand) {
    return { week: 1, demand, tiers: [newTier(false), newTier(false), newTier(false), newTier(true)] };
  }

  // phase A: receive shipments and this week's incoming order
  function startWeek(sim) {
    sim.tiers.forEach((t, i) => {
      t.arrived = t.transit.shift();
      t.inv += t.arrived;
      t.onOrder -= t.arrived;
      t.demand = i === 0 ? sim.demand[sim.week - 1] : t.orderMail.shift();
    });
  }

  // phase B: ship downstream, place orders, book costs
  function endWeek(sim, orders) {
    sim.tiers.forEach((t, i) => {
      const owed = t.backlog + t.demand;
      const ship = Math.min(t.inv, owed);
      t.inv -= ship;
      t.backlog = owed - ship;
      if (i > 0) sim.tiers[i - 1].transit.push(ship);
      t._shipped = ship;
    });
    sim.tiers.forEach((t, i) => {
      const o = Math.max(0, Math.round(orders[i]) || 0);
      if (i < 3) sim.tiers[i + 1].orderMail.push(o);
      else t.transit.push(o); // factory schedules its own 2-week brew
      t.onOrder += o;
      const wcost = t.inv * HOLD_COST + t.backlog * BACK_COST;
      t.cost += wcost;
      const h = t.hist;
      h.demand.push(t.demand); h.order.push(o); h.inv.push(t.inv);
      h.backlog.push(t.backlog); h.arrived.push(t.arrived);
      h.shipped.push(t._shipped); h.cost.push(wcost);
    });
    sim.week++;
  }

  /* ---------------- bots ---------------- */

  // Sterman (1989) anchoring-and-adjustment: people underweight the supply line.
  function botHuman(t) {
    t.lhat = 0.36 * t.demand + 0.64 * t.lhat;
    const stock = t.inv - t.backlog;
    const wantSL = 3 * t.lhat;
    return Math.max(0, Math.round(t.lhat + 0.3 * (INIT_INV - stock) + 0.3 * 0.35 * (wantSL - t.onOrder)));
  }

  // disciplined base-stock: fully accounts for the supply line
  function botSmart(t, isFactory) {
    t.lhat = 0.36 * t.demand + 0.64 * t.lhat;
    const lt = isFactory ? 2 : 3;
    const target = t.lhat * (lt + 1) + 4;
    return Math.max(0, Math.round(target - (t.inv - t.backlog) - t.onOrder));
  }

  function botOrder(kind, t, i) {
    return kind === "smart" ? botSmart(t, i === 3) : botHuman(t);
  }

  /* ---------------- game state / flow ---------------- */

  let G = null; // { sim, weeks, humans[4], botKind, pattern, queue, humanCount }

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
      sim: newSim(buildDemand(pattern, weeks, seed)),
      orders: [null, null, null, null],
      turn: -1
    };
    beginWeek();
  }

  function beginWeek() {
    startWeek(G.sim);
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
      if (!G.humans[i]) G.orders[i] = botOrder(G.botKind, t, i);
      else t.lhat = 0.36 * t.demand + 0.64 * t.lhat; // keep forecast state consistent
    });
    endWeek(G.sim, G.orders);
    if (G.sim.week > G.weeks) renderDebrief();
    else beginWeek();
  }

  /* ---------------- play screen ---------------- */

  function renderPlay() {
    const i = G.turn, t = G.sim.tiers[i];
    $("play-title").textContent = `${ICONS[i]} ${ROLES[i]}`;
    $("play-week").textContent = `Week ${G.sim.week} of ${G.weeks}`;

    // pipeline strip — own station only; others hidden
    const pipe = $("pipeline");
    pipe.innerHTML = "";
    const stations = [{ name: "Customer", icon: "🛒" },
      ...ROLES.map((r, k) => ({ name: r, icon: ICONS[k], idx: k })),
    ];
    stations.forEach((s, k) => {
      if (k > 0) {
        const a = document.createElement("div");
        a.className = "flow-arrow";
        a.innerHTML = "→<br>←";
        a.title = "orders flow right, beer flows left";
        pipe.appendChild(a);
      }
      const d = document.createElement("div");
      d.className = "station" + (s.idx === i ? " me" : "");
      const isMe = s.idx === i;
      d.innerHTML = `<div class="role">${s.icon} ${s.name}</div>
        <div class="figure">${isMe ? t.inv : "•••"}</div>
        <div class="sub">${s.name === "Customer" ? "demand hidden" : isMe ? "cases on hand" : "hidden"}</div>`;
      pipe.appendChild(d);
    });

    // tiles
    const tiles = [
      ["Arrived this week", t.arrived + " cases", ""],
      ["New order from " + (i === 0 ? "customers" : ROLES[i - 1].toLowerCase()), t.demand + " cases", ""],
      ["Inventory", t.inv + " cases", ""],
      ["Backlog", t.backlog + " cases", t.backlog > 0 ? "alert" : ""],
      ["Your cost so far", money(t.cost), ""]
    ];
    $("play-tiles").innerHTML = tiles.map(([l, v, cls]) =>
      `<div class="tile ${cls}"><div class="label">${l}</div><div class="value small">${v}</div></div>`).join("");

    $("order-hint").textContent =
      `Ordered but not yet received: ${t.onOrder} cases (arrives over the next ~3 weeks).`;
    $("order-input").value = t.hist.order.length ? t.hist.order[t.hist.order.length - 1] : 4;

    // recent history table
    const h = t.hist, n = h.order.length, from = Math.max(0, n - 8);
    let rows = "<thead><tr><th>Week</th><th>Order in</th><th>Received</th><th>Shipped</th><th>Inventory</th><th>Backlog</th><th>You ordered</th></tr></thead><tbody>";
    for (let w = from; w < n; w++) {
      rows += `<tr><td>${w + 1}</td><td>${h.demand[w]}</td><td>${h.arrived[w]}</td><td>${h.shipped[w]}</td><td>${h.inv[w]}</td><td>${h.backlog[w]}</td><td><b>${h.order[w]}</b></td></tr>`;
    }
    rows += n === 0 ? "<tr><td colspan='7' style='text-align:center;color:var(--text-muted)'>First week — no history yet</td></tr>" : "";
    $("history-table").innerHTML = rows + "</tbody>";

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

  const sd = a => {
    const m = a.reduce((x, y) => x + y, 0) / a.length;
    return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
  };

  function runBenchmark() {
    // same demand, four disciplined base-stock bots
    const sim = newSim(buildDemand(G.pattern, G.weeks, G.seed));
    for (let w = 1; w <= G.weeks; w++) {
      startWeek(sim);
      endWeek(sim, sim.tiers.map((t, i) => botSmart(t, i === 3)));
    }
    return sim.tiers.reduce((s, t) => s + t.cost, 0);
  }

  function renderDebrief() {
    const sim = G.sim, tiers = sim.tiers;
    const weeksLbl = Array.from({ length: G.weeks }, (_, i) => "Wk " + (i + 1));
    const custSd = sd(sim.demand);
    const totalCost = tiers.reduce((s, t) => s + t.cost, 0);
    const patternName = { classic: "a single step: 4 cases/week for 4 weeks, then 8 cases/week — it never changed again",
      seasonal: "a smooth seasonal cycle", random: "random between 0 and 8 cases/week" }[G.pattern];

    $("debrief-lede").textContent =
      `Customer demand was ${patternName}. Here is what the supply chain did with that information.`;

    const ampTop = custSd > 0 ? (sd(tiers[3].hist.order) / custSd) : 0;
    $("debrief-tiles").innerHTML = `
      <div class="tile"><div class="label">Total chain cost</div><div class="value">${money(totalCost)}</div></div>
      <div class="tile"><div class="label">Customer demand σ</div><div class="value">${custSd.toFixed(1)}</div></div>
      <div class="tile"><div class="label">Factory order σ</div><div class="value">${sd(tiers[3].hist.order).toFixed(1)}</div>
        <div class="delta ${ampTop > 1.05 ? "bad" : "good"}">${custSd > 0 ? "×" + ampTop.toFixed(1) + " amplification" : "—"}</div></div>
      ${tiers.map((t, i) => G.humans[i] ? `<div class="tile"><div class="label">${ROLES[i]} (you)</div><div class="value small">${money(t.cost)}</div></div>` : "").join("")}
    `;

    Charts.line($("chart-orders"), {
      series: [
        { name: "Customer demand", values: sim.demand, color: "var(--series-1)" },
        { name: "Retailer", values: tiers[0].hist.order, color: "var(--series-2)" },
        { name: "Wholesaler", values: tiers[1].hist.order, color: "var(--series-3)" },
        { name: "Distributor", values: tiers[2].hist.order, color: "var(--series-5)" },
        { name: "Factory", values: tiers[3].hist.order, color: "var(--series-6)" }
      ],
      xLabels: weeksLbl, yMin: 0, height: 340, xTitle: "week",
      yFormat: v => Math.round(v) + ""
    });

    Charts.bar($("chart-amp"), {
      categories: ["Customer", ...ROLES],
      series: [{ name: "Std dev of orders (cases/week)", values: [custSd, ...tiers.map(t => sd(t.hist.order))].map(v => Math.round(v * 10) / 10), color: "var(--series-1)" }],
      yMin: 0, height: 240
    });

    Charts.line($("chart-inventory"), {
      series: tiers.map((t, i) => ({
        name: ROLES[i],
        values: t.hist.inv.map((v, w) => v - t.hist.backlog[w]),
        color: ["var(--series-2)", "var(--series-3)", "var(--series-5)", "var(--series-6)"][i]
      })),
      xLabels: weeksLbl, height: 300, xTitle: "week", yFormat: v => Math.round(v) + ""
    });

    const bench = runBenchmark();
    $("benchmark-note").textContent =
      `Benchmark: four disciplined base-stock bots facing the exact same demand would have spent ${money(bench)} in total` +
      (bench < totalCost ? ` — ${Math.round((1 - bench / totalCost) * 100)}% less than this chain.` : ".");

    Charts.bar($("chart-costs"), {
      categories: ROLES,
      series: [{ name: "Total cost", values: tiers.map(t => Math.round(t.cost)), color: "var(--series-1)" }],
      yMin: 0, height: 240, yFormat: money
    });

    // full data table
    let head = "<thead><tr><th>Week</th><th>Customer</th>";
    ROLES.forEach(r => head += `<th>${r} order</th><th>${r} net inv</th>`);
    head += "</tr></thead><tbody>";
    let body = "";
    for (let w = 0; w < G.weeks; w++) {
      body += `<tr><td>${w + 1}</td><td>${sim.demand[w]}</td>`;
      tiers.forEach(t => body += `<td>${t.hist.order[w]}</td><td>${t.hist.inv[w] - t.hist.backlog[w]}</td>`);
      body += "</tr>";
    }
    $("debrief-table").innerHTML = head + body + "</tbody>";

    Results.emit($("result-widget"), () => ({
      g: "beer",
      cost: Math.round(totalCost),
      amp: Math.round(ampTop * 10) / 10,
      weeks: G.weeks,
      humans: ROLES.filter((_, i) => G.humans[i]).join("+") || "none"
    }));

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
