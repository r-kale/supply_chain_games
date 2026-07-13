/* ============================================================
   The Newsvendor Game — ordering under demand uncertainty.
   Demand ~ Normal(100, 30), truncated at 0, rounded.
   Scenario 1 (high margin): price 12, cost 3  → CR 0.75
   Scenario 2 (low margin):  price 12, cost 9  → CR 0.25
   ============================================================ */

(() => {
  const MEAN = 100, SD = 30, DAYS = 10;
  const SCEN = [
    { name: "Scenario 1 — the premium stand", price: 12, cost: 3,
      desc: "Croissants sell for $12 and cost you $3 to bake. Unsold ones are thrown away." },
    { name: "Scenario 2 — the discount stand", price: 12, cost: 9,
      desc: "Same customers, but now croissants cost you $9 to bake and still sell for $12. Unsold ones are thrown away." }
  ];

  const $ = id => document.getElementById(id);
  const money = v => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });

  // standard normal helpers
  let spare = null;
  function randn() {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const r = Math.sqrt(-2 * Math.log(u)), t = 2 * Math.PI * v;
    spare = r * Math.sin(t);
    return r * Math.cos(t);
  }
  const drawDemand = () => Math.max(0, Math.round(MEAN + SD * randn()));

  function normCdf(x) { // Abramowitz & Stegun 7.1.26
    const z = (x - MEAN) / SD;
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }

  // expected profit at order Q (numeric over the demand distribution)
  function expectedProfit(Q, price, cost) {
    let expSales = 0;
    for (let d = 0; d <= MEAN + 4 * SD; d++) {
      const p = normCdf(d + 0.5) - normCdf(d - 0.5);
      expSales += p * Math.min(d, Q);
    }
    return price * expSales - cost * Q;
  }

  function optimalQ(price, cost) {
    const cr = (price - cost) / price; // Cu/(Cu+Co) with zero salvage
    // invert the CDF by scan
    for (let q = 0; q <= MEAN + 4 * SD; q++) if (normCdf(q) >= cr) return q;
    return MEAN;
  }

  /* ---------------- state ---------------- */

  let scen = 0;           // 0 or 1
  let day = 0;
  const log = [[], []];   // per scenario: {q, d, sold, left, lost, profit}

  const sections = ["intro", "play", "between", "debrief"];
  const show = id => sections.forEach(s => $(s).classList.toggle("hidden", s !== id));

  function startScenario(k) {
    scen = k; day = 0;
    renderScenario();
    show("play");
    window.scrollTo(0, 0);
  }

  function renderScenario() {
    const s = SCEN[scen];
    $("scenario-title").textContent = (scen === 0 ? "🥐 " : "🥐 ") + s.name;
    $("scenario-desc").textContent = s.desc;
    $("day-pill").textContent = `Day ${day + 1} of ${DAYS}`;
    const cu = s.price - s.cost, co = s.cost;
    $("price-tiles").innerHTML = `
      <div class="tile"><div class="label">Selling price</div><div class="value">${money(s.price)}</div></div>
      <div class="tile"><div class="label">Cost to bake</div><div class="value">${money(s.cost)}</div></div>
      <div class="tile"><div class="label">Profit per sale</div><div class="value">${money(cu)}</div></div>
      <div class="tile"><div class="label">Loss per leftover</div><div class="value">${money(co)}</div></div>
      <div class="tile"><div class="label">Profit this scenario</div><div class="value small" id="run-profit">${money(total(scen))}</div></div>`;
    drawDistChart();
    renderDaysTable();
    $("day-result").classList.add("hidden");
    $("btn-bake").disabled = false;
    $("qty-input").disabled = false;
    $("qty-input").focus(); $("qty-input").select();
  }

  const total = k => log[k].reduce((s, r) => s + r.profit, 0);

  function drawDistChart() {
    // histogram of the demand distribution in 10-unit bins
    const bins = [], labels = [];
    for (let lo = 0; lo <= 200; lo += 10) {
      bins.push(Math.round((normCdf(lo + 10) - normCdf(lo)) * 1000) / 10);
      labels.push(lo + "–" + (lo + 9));
    }
    Charts.bar($("chart-dist"), {
      categories: labels,
      series: [{ name: "Chance of the day's demand landing here", values: bins, color: "var(--series-1)" }],
      yMin: 0, height: 220, yFormat: v => v + "%"
    });
  }

  function renderDaysTable() {
    const rows = log[scen];
    let h = "<thead><tr><th>Day</th><th>You baked</th><th>Demand</th><th>Sold</th><th>Tossed</th><th>Missed sales</th><th>Profit</th></tr></thead><tbody>";
    rows.forEach((r, i) => {
      h += `<tr><td>${i + 1}</td><td>${r.q}</td><td>${r.d}</td><td>${r.sold}</td><td>${r.left}</td><td>${r.lost}</td><td><b>${money(r.profit)}</b></td></tr>`;
    });
    if (!rows.length) h += "<tr><td colspan='7' style='text-align:center;color:var(--text-muted)'>No days played yet</td></tr>";
    $("days-table").innerHTML = h + "</tbody>";
  }

  function bake() {
    const s = SCEN[scen];
    const q = Math.max(0, Math.round(+$("qty-input").value) || 0);
    const d = drawDemand();
    const sold = Math.min(q, d);
    const r = { q, d, sold, left: q - sold, lost: d - sold, profit: s.price * sold - s.cost * q };
    log[scen].push(r);
    $("result-tiles").innerHTML = `
      <div class="tile"><div class="label">Demand today</div><div class="value">${r.d}</div></div>
      <div class="tile"><div class="label">Sold</div><div class="value">${r.sold}</div></div>
      <div class="tile ${r.left ? "alert" : ""}"><div class="label">Tossed at closing</div><div class="value">${r.left}</div></div>
      <div class="tile ${r.lost ? "alert" : ""}"><div class="label">Customers turned away</div><div class="value">${r.lost}</div></div>
      <div class="tile"><div class="label">Today's profit</div><div class="value small ${r.profit < 0 ? "alert" : ""}">${money(r.profit)}</div></div>`;
    $("day-result").classList.remove("hidden");
    $("run-profit").textContent = money(total(scen));
    $("btn-bake").disabled = true;
    $("qty-input").disabled = true;
    renderDaysTable();
    $("btn-next").textContent = day + 1 >= DAYS
      ? (scen === 0 ? "Finish scenario 1 →" : "See the debrief →") : "Next day →";
    $("btn-next").focus();
  }

  function nextDay() {
    day++;
    if (day < DAYS) {
      $("day-pill").textContent = `Day ${day + 1} of ${DAYS}`;
      $("day-result").classList.add("hidden");
      $("btn-bake").disabled = false;
      $("qty-input").disabled = false;
      $("qty-input").focus(); $("qty-input").select();
    } else if (scen === 0) {
      $("between-summary").textContent =
        `You made ${money(total(0))} over ${DAYS} days at the premium stand.`;
      show("between");
      window.scrollTo(0, 0);
    } else {
      renderDebrief();
    }
  }

  /* ---------------- debrief ---------------- */

  function profitCurve(container, k, note) {
    const s = SCEN[k];
    const qs = [], ev = [];
    for (let q = 40; q <= 180; q += 5) { qs.push(q + ""); ev.push(Math.round(expectedProfit(q, s.price, s.cost))); }
    const qStar = optimalQ(s.price, s.cost);
    const avgQ = Math.round(log[k].reduce((x, r) => x + r.q, 0) / log[k].length);
    // markers as extra "series" of nulls with one point each
    const mark = (q, v) => qs.map(x => (+x === q ? v : null));
    const snap = q => Math.round(q / 5) * 5;
    Charts.line(container, {
      series: [
        { name: "Expected profit per day", values: ev, color: "var(--series-1)" },
        { name: `Your average order (${avgQ})`, values: mark(snap(avgQ), Math.round(expectedProfit(snap(avgQ), s.price, s.cost))), color: "var(--series-6)" },
        { name: `Optimal order Q* (${qStar})`, values: mark(snap(qStar), Math.round(expectedProfit(snap(qStar), s.price, s.cost))), color: "var(--series-4)" }
      ],
      xLabels: qs, height: 280, xTitle: "order quantity (croissants)", yFormat: v => money(v)
    });
    const gap = expectedProfit(qStar, s.price, s.cost) - expectedProfit(avgQ, s.price, s.cost);
    note.textContent = `Critical ratio ${(100 * (s.price - s.cost) / s.price).toFixed(0)}% → optimal order ${qStar}. ` +
      `Your average order of ${avgQ} left about ${money(Math.max(0, Math.round(gap)))} per day on the table.`;
  }

  function renderDebrief() {
    const avg = k => Math.round(log[k].reduce((x, r) => x + r.q, 0) / log[k].length);
    const grand = total(0) + total(1);
    $("debrief-tiles").innerHTML = `
      <div class="tile"><div class="label">Total profit (both stands)</div><div class="value">${money(grand)}</div></div>
      <div class="tile"><div class="label">Avg order — high margin</div><div class="value">${avg(0)}</div>
        <div class="delta">optimal ≈ ${optimalQ(SCEN[0].price, SCEN[0].cost)}</div></div>
      <div class="tile"><div class="label">Avg order — low margin</div><div class="value">${avg(1)}</div>
        <div class="delta">optimal ≈ ${optimalQ(SCEN[1].price, SCEN[1].cost)}</div></div>
      <div class="tile"><div class="label">Average demand</div><div class="value">${MEAN}</div>
        <div class="delta">did your orders drift toward it?</div></div>`;
    profitCurve($("chart-curve1"), 0, $("curve1-note"));
    profitCurve($("chart-curve2"), 1, $("curve2-note"));
    Results.emit($("result-widget"), () => ({
      g: "news", profit: Math.round(grand), hi: avg(0), lo: avg(1)
    }));
    show("debrief");
    window.scrollTo(0, 0);
  }

  /* ---------------- wire up ---------------- */

  $("btn-begin").addEventListener("click", () => startScenario(0));
  $("btn-scen2").addEventListener("click", () => startScenario(1));
  $("btn-bake").addEventListener("click", bake);
  $("qty-input").addEventListener("keydown", e => { if (e.key === "Enter" && !$("btn-bake").disabled) bake(); });
  $("btn-next").addEventListener("click", nextDay);
  $("btn-again").addEventListener("click", () => location.reload());
})();
