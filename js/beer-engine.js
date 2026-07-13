/* ============================================================
   beer-engine.js — shared Beer Game simulation + debrief.
   Used by beer-game.js (solo / hot-seat) and beer-online.js
   (multiplayer). Pure logic + the debrief renderer; no game
   flow. Depends on Charts and Results for renderDebrief.

   4 tiers: 0 Retailer, 1 Wholesaler, 2 Distributor, 3 Factory.
   Delays: orders 1 week in the mail; shipments 2 weeks in
   transit (the factory's own orders start a 2-week brew).
   Costs: $0.50/case/week holding, $1.00/case/week backlog.
   ============================================================ */

const BeerEngine = (() => {
  const ROLES = ["Retailer", "Wholesaler", "Distributor", "Factory"];
  const ICONS = ["🏪", "📦", "🚚", "🏭"];
  const HOLD_COST = 0.5, BACK_COST = 1.0;
  const INIT_INV = 12, INIT_FLOW = 4;

  const money = v => "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });

  // seeded RNG so a demand series can be replayed exactly
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

  /* ---------------- stats & benchmark ---------------- */

  const sd = a => {
    const m = a.reduce((x, y) => x + y, 0) / a.length;
    return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
  };

  // chain cost if four disciplined base-stock bots faced this exact demand
  function benchmarkCost(demand) {
    const sim = newSim(demand.slice());
    for (let w = 0; w < demand.length; w++) {
      startWeek(sim);
      endWeek(sim, sim.tiers.map((t, i) => botSmart(t, i === 3)));
    }
    return sim.tiers.reduce((s, t) => s + t.cost, 0);
  }

  /* ---------------- debrief renderer ----------------
     Renders into the shared debrief DOM (ids: debrief-lede,
     debrief-tiles, chart-orders, chart-amp, chart-inventory,
     benchmark-note, chart-costs, debrief-table, result-widget).
     opts = {
       demand: [..], tiers: [{hist, cost}], weeks, pattern,
       humanLabels: { roleIdx: "you" | "Alice" | ... }
     }
  --------------------------------------------------- */
  function renderDebrief(opts) {
    const $ = id => document.getElementById(id);
    const { demand, tiers, weeks, pattern, humanLabels } = opts;
    const weeksLbl = Array.from({ length: weeks }, (_, i) => "Wk " + (i + 1));
    const custSd = sd(demand);
    const totalCost = tiers.reduce((s, t) => s + t.cost, 0);
    const patternName = {
      classic: "a single step: 4 cases/week for 4 weeks, then 8 cases/week — it never changed again",
      seasonal: "a smooth seasonal cycle", random: "random between 0 and 8 cases/week"
    }[pattern];

    $("debrief-lede").textContent =
      `Customer demand was ${patternName}. Here is what the supply chain did with that information.`;

    const ampTop = custSd > 0 ? (sd(tiers[3].hist.order) / custSd) : 0;
    $("debrief-tiles").innerHTML = `
      <div class="tile"><div class="label">Total chain cost</div><div class="value">${money(totalCost)}</div></div>
      <div class="tile"><div class="label">Customer demand σ</div><div class="value">${custSd.toFixed(1)}</div></div>
      <div class="tile"><div class="label">Factory order σ</div><div class="value">${sd(tiers[3].hist.order).toFixed(1)}</div>
        <div class="delta ${ampTop > 1.05 ? "bad" : "good"}">${custSd > 0 ? "×" + ampTop.toFixed(1) + " amplification" : "—"}</div></div>
      ${tiers.map((t, i) => humanLabels[i] != null
        ? `<div class="tile"><div class="label">${ROLES[i]} (${humanLabels[i]})</div><div class="value small">${money(t.cost)}</div></div>` : "").join("")}
    `;

    Charts.line($("chart-orders"), {
      series: [
        { name: "Customer demand", values: demand, color: "var(--series-1)" },
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

    const bench = benchmarkCost(demand);
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
    for (let w = 0; w < weeks; w++) {
      body += `<tr><td>${w + 1}</td><td>${demand[w]}</td>`;
      tiers.forEach(t => body += `<td>${t.hist.order[w]}</td><td>${t.hist.inv[w] - t.hist.backlog[w]}</td>`);
      body += "</tr>";
    }
    $("debrief-table").innerHTML = head + body + "</tbody>";

    Results.emit($("result-widget"), () => ({
      g: "beer",
      cost: Math.round(totalCost),
      amp: Math.round(ampTop * 10) / 10,
      weeks,
      humans: Object.entries(humanLabels).map(([i, l]) => l === "you" ? ROLES[i] : l).join("+") || "none"
    }));
  }

  return {
    ROLES, ICONS, HOLD_COST, BACK_COST, INIT_INV, INIT_FLOW,
    buildDemand, newSim, startWeek, endWeek,
    botHuman, botSmart, botOrder,
    sd, benchmarkCost, renderDebrief, money
  };
})();

/* ============================================================
   BeerUI — shared play-screen rendering (pipeline strip, tiles,
   recent-history table). Renders one tier's view; other tiers
   stay hidden, as the game demands.
   ============================================================ */

const BeerUI = (() => {
  const { ROLES, ICONS } = BeerEngine;
  const money = BeerEngine.money;

  // pipeline strip — own station only; others hidden
  function renderStation(el, roleIdx, t) {
    el.innerHTML = "";
    const stations = [{ name: "Customer", icon: "🛒" },
      ...ROLES.map((r, k) => ({ name: r, icon: ICONS[k], idx: k })),
    ];
    stations.forEach((s, k) => {
      if (k > 0) {
        const a = document.createElement("div");
        a.className = "flow-arrow";
        a.innerHTML = "→<br>←";
        a.title = "orders flow right, beer flows left";
        el.appendChild(a);
      }
      const d = document.createElement("div");
      d.className = "station" + (s.idx === roleIdx ? " me" : "");
      const isMe = s.idx === roleIdx;
      d.innerHTML = `<div class="role">${s.icon} ${s.name}</div>
        <div class="figure">${isMe ? t.inv : "•••"}</div>
        <div class="sub">${s.name === "Customer" ? "demand hidden" : isMe ? "cases on hand" : "hidden"}</div>`;
      el.appendChild(d);
    });
  }

  function renderTiles(el, roleIdx, t) {
    const tiles = [
      ["Arrived this week", t.arrived + " cases", ""],
      ["New order from " + (roleIdx === 0 ? "customers" : ROLES[roleIdx - 1].toLowerCase()), t.demand + " cases", ""],
      ["Inventory", t.inv + " cases", ""],
      ["Backlog", t.backlog + " cases", t.backlog > 0 ? "alert" : ""],
      ["Your cost so far", money(t.cost), ""]
    ];
    el.innerHTML = tiles.map(([l, v, cls]) =>
      `<div class="tile ${cls}"><div class="label">${l}</div><div class="value small">${v}</div></div>`).join("");
  }

  function renderHistory(el, t) {
    const h = t.hist, n = h.order.length, from = Math.max(0, n - 8);
    let rows = "<thead><tr><th>Week</th><th>Order in</th><th>Received</th><th>Shipped</th><th>Inventory</th><th>Backlog</th><th>You ordered</th></tr></thead><tbody>";
    for (let w = from; w < n; w++) {
      rows += `<tr><td>${w + 1}</td><td>${h.demand[w]}</td><td>${h.arrived[w]}</td><td>${h.shipped[w]}</td><td>${h.inv[w]}</td><td>${h.backlog[w]}</td><td><b>${h.order[w]}</b></td></tr>`;
    }
    rows += n === 0 ? "<tr><td colspan='7' style='text-align:center;color:var(--text-muted)'>First week — no history yet</td></tr>" : "";
    el.innerHTML = rows + "</tbody>";
  }

  return { renderStation, renderTiles, renderHistory };
})();
