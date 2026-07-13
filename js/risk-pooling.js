/* ============================================================
   The Warehouse Consolidation Challenge — risk pooling.
   Phase 1: four regional warehouses, each Normal(100, 30) iid.
   Phase 2: one central warehouse serving all four regions.
   Find the least stock giving ≥95% fill rate. Lost sales.
   Each warehouse is restocked to its level every week.
   ============================================================ */

(() => {
  const MEAN = 100, SD = 30, REGIONS = 4, WEEKS = 52, TARGET = 0.95;
  const $ = id => document.getElementById(id);
  const pct = v => (100 * v).toFixed(1) + "%";

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

  /* ---------------- state ---------------- */

  let phase = 0; // 0 = regional, 1 = central
  const attempts = [[], []];
  const locked = [null, null]; // stock level locked per phase

  const sections = ["intro", "play", "debrief"];
  const show = id => sections.forEach(s => $(s).classList.toggle("hidden", s !== id));

  const PHASES = [
    {
      title: "Phase 1 — four regional warehouses",
      desc: "Each of the four warehouses serves its own region (demand ~ 100 ± 30 per week, independent). " +
            "You set ONE stock level used by every warehouse; each restocks to that level weekly.",
      stockLabel: "Stock level per regional warehouse",
      start: 130
    },
    {
      title: "Phase 2 — one central warehouse",
      desc: "Same four regions, same customers — but now a single warehouse serves everyone. " +
            "Its weekly demand is the four regions combined. Set its stock level.",
      stockLabel: "Stock level of the central warehouse",
      start: 520
    }
  ];

  function beginPhase(k) {
    phase = k;
    $("phase-title").textContent = PHASES[k].title;
    $("phase-desc").textContent = PHASES[k].desc;
    $("stock-label").textContent = PHASES[k].stockLabel;
    $("stock-input").value = attempts[k].length ? attempts[k][attempts[k].length - 1].stock : PHASES[k].start;
    $("run-tiles").classList.add("hidden");
    $("btn-lock").classList.add("hidden");
    $("run-verdict").textContent = "";
    renderAttempts();
    show("play");
    window.scrollTo(0, 0);
    $("stock-input").focus(); $("stock-input").select();
  }

  function simulate(stock) {
    // returns { fill, avgLeftover, totalStock }
    let demanded = 0, filled = 0, leftover = 0;
    for (let w = 0; w < WEEKS; w++) {
      if (phase === 0) {
        for (let r = 0; r < REGIONS; r++) {
          const d = Math.max(0, Math.round(MEAN + SD * randn()));
          demanded += d; filled += Math.min(stock, d);
          leftover += Math.max(0, stock - d);
        }
      } else {
        let d = 0;
        for (let r = 0; r < REGIONS; r++) d += Math.max(0, Math.round(MEAN + SD * randn()));
        demanded += d; filled += Math.min(stock, d);
        leftover += Math.max(0, stock - d);
      }
    }
    const weeksCount = WEEKS * (phase === 0 ? REGIONS : 1);
    return {
      fill: filled / demanded,
      avgLeftover: leftover / weeksCount,
      totalStock: stock * (phase === 0 ? REGIONS : 1)
    };
  }

  function run() {
    const stock = Math.max(0, Math.round(+$("stock-input").value) || 0);
    const r = simulate(stock);
    attempts[phase].push({ stock, ...r });
    const ok = r.fill >= TARGET;
    $("run-tiles").classList.remove("hidden");
    $("run-tiles").innerHTML = `
      <div class="tile ${ok ? "" : "alert"}"><div class="label">Fill rate achieved</div><div class="value">${pct(r.fill)}</div>
        <div class="delta ${ok ? "good" : "bad"}">${ok ? "✓ target met" : "✗ below 95%"}</div></div>
      <div class="tile"><div class="label">Total stock held</div><div class="value">${r.totalStock.toLocaleString()}</div>
        <div class="delta">${phase === 0 ? "4 × " + stock : "one warehouse"}</div></div>
      <div class="tile"><div class="label">Avg unsold per warehouse-week</div><div class="value">${Math.round(r.avgLeftover)}</div></div>`;
    $("run-verdict").textContent = ok
      ? "Target met — you can lock this in, or try trimming stock further to see how lean you can go."
      : "Missed the target. Add stock (or you just had an unlucky year — you can rerun the same level).";
    const lock = $("btn-lock");
    lock.classList.toggle("hidden", !ok);
    if (ok) {
      lock.textContent = phase === 0 ? `Lock in ${stock}/warehouse → phase 2` : `Lock in ${stock} → debrief`;
      lock.classList.add("primary");
    }
    renderAttempts();
  }

  function renderAttempts() {
    const rows = attempts[phase];
    let h = "<thead><tr><th>#</th><th>Stock level</th><th>Total stock</th><th>Fill rate</th><th>Result</th></tr></thead><tbody>";
    rows.forEach((a, i) => {
      h += `<tr><td>${i + 1}</td><td>${a.stock}</td><td>${a.totalStock.toLocaleString()}</td><td>${pct(a.fill)}</td>
        <td style="text-align:left">${a.fill >= TARGET ? "✅ met" : "❌ missed"}</td></tr>`;
    });
    if (!rows.length) h += "<tr><td colspan='5' style='text-align:center;color:var(--text-muted)'>No attempts yet</td></tr>";
    $("attempts-table").innerHTML = h + "</tbody>";
  }

  function lockIn() {
    locked[phase] = attempts[phase][attempts[phase].length - 1].stock;
    if (phase === 0) beginPhase(1);
    else renderDebrief();
  }

  /* ---------------- debrief ---------------- */

  const Z95 = 1.645;

  function renderDebrief() {
    const regTotal = locked[0] * REGIONS;
    const cenTotal = locked[1];
    const saved = regTotal - cenTotal;
    const savedPct = Math.round((saved / regTotal) * 100);

    $("debrief-lede").textContent =
      `You needed ${regTotal.toLocaleString()} units across four regional warehouses, but only ` +
      `${cenTotal.toLocaleString()} in one central warehouse — ${saved > 0 ? savedPct + "% less inventory for the same service."
        : "hmm, pooling should have needed less; try trimming the central level further!"}`;

    const theoryReg = Math.round(REGIONS * (MEAN + Z95 * SD));
    const theoryCen = Math.round(REGIONS * MEAN + Z95 * SD * Math.sqrt(REGIONS));
    $("debrief-tiles").innerHTML = `
      <div class="tile"><div class="label">Your regional total</div><div class="value">${regTotal.toLocaleString()}</div>
        <div class="delta">theory ≈ ${theoryReg.toLocaleString()}</div></div>
      <div class="tile"><div class="label">Your central total</div><div class="value">${cenTotal.toLocaleString()}</div>
        <div class="delta">theory ≈ ${theoryCen.toLocaleString()}</div></div>
      <div class="tile"><div class="label">Inventory saved</div><div class="value">${saved > 0 ? savedPct + "%" : "—"}</div>
        <div class="delta">theory ≈ ${Math.round((1 - theoryCen / theoryReg) * 100)}%</div></div>
      <div class="tile"><div class="label">Safety stock saved</div><div class="value">~50%</div>
        <div class="delta">1 − 1/√4</div></div>`;

    Charts.bar($("chart-compare"), {
      categories: ["Cycle stock (covers averages)", "Safety stock (covers swings)", "Total"],
      series: [
        { name: "4 regional warehouses", values: [REGIONS * MEAN, Math.max(0, regTotal - REGIONS * MEAN), regTotal], color: "var(--series-1)" },
        { name: "1 central warehouse", values: [REGIONS * MEAN, Math.max(0, cenTotal - REGIONS * MEAN), cenTotal], color: "var(--series-2)" }
      ],
      yMin: 0, height: 280
    });

    drawExplore();
    Results.emit($("result-widget"), () => ({
      g: "pool", total: regTotal + cenTotal, reg: regTotal, cen: cenTotal, saved: savedPct
    }));
    show("debrief");
    window.scrollTo(0, 0);
  }

  function drawExplore() {
    const rho = +$("rho").value / 100;
    $("rho-val").textContent = rho.toFixed(1);
    const ns = [1, 2, 4, 6, 8, 12, 16];
    const dec = ns.map(n => Math.round(n * Z95 * SD));
    const pool = ns.map(n => Math.round(Z95 * SD * Math.sqrt(n + n * (n - 1) * rho)));
    Charts.line($("chart-explore"), {
      series: [
        { name: "Separate warehouses", values: dec, color: "var(--series-1)" },
        { name: "One pooled warehouse", values: pool, color: "var(--series-2)" }
      ],
      xLabels: ns.map(n => n + ""), yMin: 0, height: 260,
      xTitle: "number of locations pooled", yFormat: v => Math.round(v).toLocaleString()
    });
  }

  /* ---------------- wire up ---------------- */

  $("btn-begin").addEventListener("click", () => beginPhase(0));
  $("btn-run").addEventListener("click", run);
  $("stock-input").addEventListener("keydown", e => { if (e.key === "Enter") run(); });
  $("btn-lock").addEventListener("click", lockIn);
  $("rho").addEventListener("input", drawExplore);
  $("btn-again").addEventListener("click", () => location.reload());
})();
