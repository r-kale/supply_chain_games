/* ============================================================
   The Contract Game — double marginalization & buyback contracts.
   Player = manufacturer (cost c=3). Retailer sells at p=12,
   demand ~ Normal(100, 30). Each season the player offers
   (wholesale w, buyback b); a rational retailer orders its
   newsvendor-optimal quantity, or nothing if it would lose money.
   Scores are expected profits — strategy, not luck.
   ============================================================ */

(() => {
  const P = 12, C = 3, MEAN = 100, SD = 30, SEASONS = 8;
  const $ = id => document.getElementById(id);
  const money = v => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });

  function normCdf(x) {
    const z = (x - MEAN) / SD;
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }

  // E[min(D,Q)] and E[(Q-D)+] by discretizing demand
  function expSales(Q) {
    let s = 0;
    for (let d = 0; d <= MEAN + 4 * SD; d++) {
      s += (normCdf(d + 0.5) - normCdf(d - 0.5)) * Math.min(d, Q);
    }
    return s;
  }
  const expLeftover = Q => Q - expSales(Q);

  function quantile(cr) {
    if (cr <= 0) return 0;
    for (let q = 0; q <= MEAN + 4 * SD; q++) if (normCdf(q) >= cr) return q;
    return MEAN + 4 * SD;
  }

  // rational retailer facing (w, b): newsvendor with Cu = P-w, Co = w-b
  function retailerOrder(w, b) {
    if (w >= P) return 0;                    // no margin at all
    const cr = (P - w) / (P - b);            // critical ratio
    const q = quantile(Math.min(cr, 0.999));
    const profit = P * expSales(q) - w * q + b * expLeftover(q);
    return profit > 0 ? q : 0;               // walks away from a losing deal
  }

  function outcomes(w, b) {
    const q = retailerOrder(w, b);
    const sales = expSales(q), left = expLeftover(q);
    return {
      q,
      retailer: P * sales - w * q + b * left,
      maker: (w - C) * q - b * left,
      chain: P * sales - C * q
    };
  }

  // first-best: integrated chain, CR = (P-C)/P
  const Q_STAR = quantile((P - C) / P);
  const FIRST_BEST = P * expSales(Q_STAR) - C * Q_STAR;

  /* ---------------- state ---------------- */

  let season = 0;
  const seasons = []; // {w, b, q, maker, retailer, chain}

  const sections = ["intro", "play", "debrief"];
  const show = id => sections.forEach(s => $(s).classList.toggle("hidden", s !== id));
  const cum = () => seasons.reduce((s, x) => s + x.maker, 0);

  function renderPlay() {
    $("season-pill").textContent = `Season ${season + 1} of ${SEASONS}`;
    $("cum-profit").textContent = money(cum());
    $("season-result").classList.add("hidden");
    $("btn-offer").disabled = false;
    $("offer-hint").textContent = season === 3 && !seasons.some(s => s.b > 0)
      ? "💡 Hint: your margin is fine — the problem is how little the retailer dares to order. What would make over-ordering less scary for them?"
      : "";
    renderSeasonsTable();
    show("play");
  }

  function renderSeasonsTable() {
    let h = "<thead><tr><th>Season</th><th>Wholesale</th><th>Buyback</th><th>Retailer ordered</th><th>Your profit</th><th>Retailer profit</th><th>Chain total</th><th>% of best possible</th></tr></thead><tbody>";
    seasons.forEach((s, i) => {
      h += `<tr><td>${i + 1}</td><td>$${s.w}</td><td>$${s.b}</td><td>${s.q}</td><td><b>${money(s.maker)}</b></td>
        <td>${money(s.retailer)}</td><td>${money(s.chain)}</td><td>${Math.round(100 * s.chain / FIRST_BEST)}%</td></tr>`;
    });
    if (!seasons.length) h += "<tr><td colspan='8' style='text-align:center;color:var(--text-muted)'>No seasons yet</td></tr>";
    $("seasons-table").innerHTML = h + "</tbody>";
  }

  function offer() {
    let w = +$("w-input").value, b = +$("b-input").value;
    if (!isFinite(w) || !isFinite(b)) return;
    w = Math.min(12, Math.max(3, w));
    b = Math.max(0, b);
    if (b > w) { alert("Buyback can't exceed the wholesale price — the retailer would order infinite units and return them."); return; }
    $("w-input").value = w; $("b-input").value = b;
    const o = outcomes(w, b);
    seasons.push({ w, b, ...o, maker: Math.round(o.maker), retailer: Math.round(o.retailer), chain: Math.round(o.chain) });
    const s = seasons[seasons.length - 1];
    $("result-tiles").innerHTML = `
      <div class="tile ${s.q === 0 ? "alert" : ""}"><div class="label">Retailer ordered</div><div class="value">${s.q}</div>
        <div class="delta">${s.q === 0 ? "declined your terms!" : "chain-optimal is " + Q_STAR}</div></div>
      <div class="tile"><div class="label">Your expected profit</div><div class="value small">${money(s.maker)}</div></div>
      <div class="tile"><div class="label">Retailer's expected profit</div><div class="value small">${money(s.retailer)}</div></div>
      <div class="tile"><div class="label">Chain total</div><div class="value small">${money(s.chain)}</div>
        <div class="delta ${s.chain >= FIRST_BEST * 0.97 ? "good" : "bad"}">${Math.round(100 * s.chain / FIRST_BEST)}% of the ${money(FIRST_BEST)} ceiling</div></div>`;
    $("pie-note").textContent = s.chain < FIRST_BEST * 0.97
      ? `Money left on the table this season: ${money(FIRST_BEST - s.chain)}. Nobody gets it — the contract destroyed it.`
      : "The chain is (nearly) fully coordinated — you're only negotiating over how to split the maximum pie.";
    $("season-result").classList.remove("hidden");
    $("cum-profit").textContent = money(cum());
    $("btn-offer").disabled = true;
    $("btn-next").textContent = season + 1 >= SEASONS ? "See the debrief →" : "Next season →";
    renderSeasonsTable();
    $("btn-next").focus();
  }

  function next() {
    season++;
    if (season < SEASONS) renderPlay();
    else renderDebrief();
  }

  /* ---------------- debrief ---------------- */

  function renderDebrief() {
    const total = cum();
    const best = Math.max(...seasons.map(s => s.chain));
    const usedBuyback = seasons.some(s => s.b > 0);
    // theoretical max for the maker per season: coordinated chain, retailer squeezed to ~0
    const makerCeiling = Math.round(FIRST_BEST);

    $("debrief-lede").textContent =
      `You earned ${money(total)} over ${SEASONS} seasons. ` +
      (usedBuyback
        ? "You discovered the coordinating trick: refunding leftovers grows the pie before you split it."
        : "You never offered a buyback — every season, double marginalization quietly shrank the pie you were splitting.");

    $("debrief-tiles").innerHTML = `
      <div class="tile"><div class="label">Your total profit</div><div class="value">${money(total)}</div></div>
      <div class="tile"><div class="label">Best chain season</div><div class="value">${Math.round(100 * best / FIRST_BEST)}%</div>
        <div class="delta">of the ${money(FIRST_BEST)}/season ceiling</div></div>
      <div class="tile"><div class="label">Theoretical max (yours)</div><div class="value small">${money(makerCeiling * SEASONS)}</div>
        <div class="delta">coordinate, then take ~all of it</div></div>`;

    Charts.bar($("chart-seasons"), {
      categories: seasons.map((_, i) => "S" + (i + 1)),
      series: [
        { name: "You (manufacturer)", values: seasons.map(s => s.maker), color: "var(--series-1)" },
        { name: "Retailer", values: seasons.map(s => s.retailer), color: "var(--series-2)" },
        { name: "Lost to the contract", values: seasons.map(s => Math.max(0, Math.round(FIRST_BEST - s.chain))), color: "var(--series-6)" }
      ],
      yMin: 0, height: 280, yFormat: money
    });

    // chain profit vs wholesale price, no buyback
    const ws = [], chain = [], maker = [];
    for (let w = 3; w <= 11.5; w += 0.5) {
      const o = outcomes(w, 0);
      ws.push("$" + w);
      chain.push(Math.round(o.chain));
      maker.push(Math.round(o.maker));
    }
    Charts.line($("chart-dm"), {
      series: [
        { name: "Integrated-chain ceiling", values: ws.map(() => Math.round(FIRST_BEST)), color: "var(--series-4)" },
        { name: "Chain total (wholesale only)", values: chain, color: "var(--series-6)" },
        { name: "Your share (wholesale only)", values: maker, color: "var(--series-1)" }
      ],
      xLabels: ws, yMin: 0, height: 300, xTitle: "wholesale price", yFormat: money
    });

    Results.emit($("result-widget"), () => ({
      g: "contract",
      profit: total,
      bestPct: Math.round(100 * best / FIRST_BEST),
      buyback: usedBuyback ? 1 : 0
    }));

    show("debrief");
    window.scrollTo(0, 0);
  }

  /* ---------------- wire up ---------------- */

  $("btn-begin").addEventListener("click", () => { renderPlay(); window.scrollTo(0, 0); });
  $("btn-offer").addEventListener("click", offer);
  $("btn-next").addEventListener("click", next);
  $("btn-again").addEventListener("click", () => location.reload());
})();
