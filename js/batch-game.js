/* ============================================================
   The Batch Size Game — EOQ: ordering cost vs holding cost.
   Steady demand D=100/wk, order cost K=$400, holding h=$0.30/u/wk.
   Weekly cost(Q) = K*D/Q + h*Q/2.  EOQ = sqrt(2KD/h) ≈ 516.
   ============================================================ */

(() => {
  const D = 100, K = 400, H = 0.30, TOL = 1.02;
  const EOQ = Math.sqrt(2 * K * D / H);
  const BEST = Math.sqrt(2 * K * D * H); // weekly cost at EOQ
  const weeklyCost = q => K * D / q + H * q / 2;

  const $ = id => document.getElementById(id);
  const money = v => "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });

  let tries = [];
  let hitTarget = false;

  const sections = ["intro", "play", "debrief"];
  const show = id => sections.forEach(s => $(s).classList.toggle("hidden", s !== id));

  function tryQ() {
    const q = Math.max(1, Math.round(+$("q-input").value) || 1);
    const cost = weeklyCost(q);
    const ratio = cost / BEST;
    const ok = ratio <= TOL;
    hitTarget = hitTarget || ok;
    tries.push({ q, cost, ok });

    const orders = D * 52 / q;
    $("try-tiles").classList.remove("hidden");
    $("try-tiles").innerHTML = `
      <div class="tile"><div class="label">Orders per year</div><div class="value">${orders.toFixed(1)}</div></div>
      <div class="tile"><div class="label">Ordering cost / week</div><div class="value small">${money(K * D / q)}</div></div>
      <div class="tile"><div class="label">Holding cost / week</div><div class="value small">${money(H * q / 2)}</div></div>
      <div class="tile ${ok ? "" : "alert"}"><div class="label">Total / week</div><div class="value small">${money(cost)}</div>
        <div class="delta ${ok ? "good" : "bad"}">${ok ? "✓ within 2% of optimal" : "+" + Math.round((ratio - 1) * 100) + "% above the minimum"}</div></div>`;
    $("try-verdict").textContent = ok
      ? "That's the zone. You can keep hunting for the exact bottom, or head to the debrief."
      : (K * D / q > H * q / 2
        ? "Ordering cost dominates — you're ordering too often. Try bigger batches."
        : "Holding cost dominates — stock is sitting too long. Try smaller batches.");
    $("btn-done").classList.toggle("hidden", !hitTarget);

    drawSawtooth(q);
    renderTries();
  }

  function drawSawtooth(q) {
    $("sawtooth-block").classList.remove("hidden");
    const cycle = q / D; // weeks between orders
    const pts = [], labels = [];
    for (let t = 0; t <= 12.0001; t += 0.1) {
      const phase = t % cycle;
      pts.push(Math.round(q - phase * D));
      labels.push("wk " + t.toFixed(1));
    }
    Charts.line($("chart-saw"), {
      series: [{ name: "Units in the warehouse", values: pts, color: "var(--series-1)" }],
      xLabels: labels, yMin: 0, height: 220,
      yFormat: v => Math.round(v) + ""
    });
  }

  function renderTries() {
    let h = "<thead><tr><th>#</th><th>Batch size</th><th>Orders/yr</th><th>Weekly cost</th><th>vs. optimal</th></tr></thead><tbody>";
    tries.forEach((t, i) => {
      h += `<tr><td>${i + 1}</td><td>${t.q}</td><td>${(D * 52 / t.q).toFixed(1)}</td><td><b>${money(t.cost)}</b></td>
        <td>${t.ok ? "✅" : ""} +${((t.cost / BEST - 1) * 100).toFixed(1)}%</td></tr>`;
    });
    if (!tries.length) h += "<tr><td colspan='5' style='text-align:center;color:var(--text-muted)'>No attempts yet</td></tr>";
    $("tries-table").innerHTML = h + "</tbody>";
  }

  /* ---------------- debrief ---------------- */

  function renderDebrief() {
    const best = tries.reduce((a, b) => (a.cost < b.cost ? a : b));
    $("debrief-lede").textContent =
      `You found ${best.q} units per order (${money(best.cost)}/week) in ${tries.length} attempt${tries.length > 1 ? "s" : ""}. ` +
      `The true optimum is ${Math.round(EOQ)} units at ${money(BEST)}/week.`;

    $("debrief-tiles").innerHTML = `
      <div class="tile"><div class="label">Your best batch</div><div class="value">${best.q}</div>
        <div class="delta">EOQ = ${Math.round(EOQ)}</div></div>
      <div class="tile"><div class="label">Your best cost</div><div class="value small">${money(best.cost)}/wk</div>
        <div class="delta">optimum ${money(BEST)}/wk</div></div>
      <div class="tile"><div class="label">Attempts</div><div class="value">${tries.length}</div></div>`;

    // cost curve with attempts marked
    const qs = [], total = [], ordering = [], holding = [];
    for (let q = 100; q <= 1400; q += 25) {
      qs.push(q + ""); total.push(Math.round(weeklyCost(q)));
      ordering.push(Math.round(K * D / q)); holding.push(Math.round(H * q / 2));
    }
    const snap = q => Math.max(100, Math.min(1400, Math.round(q / 25) * 25));
    const marks = qs.map(() => null);
    tries.forEach(t => { marks[qs.indexOf(snap(t.q) + "")] = Math.round(weeklyCost(snap(t.q))); });
    Charts.line($("chart-curve"), {
      series: [
        { name: "Total cost", values: total, color: "var(--series-1)" },
        { name: "Ordering cost", values: ordering, color: "var(--series-3)" },
        { name: "Holding cost", values: holding, color: "var(--series-2)" },
        { name: "Your attempts", values: marks, color: "var(--series-6)" }
      ],
      xLabels: qs, yMin: 0, height: 300, xTitle: "batch size (units per order)", yFormat: money
    });

    Results.emit($("result-widget"), () => ({
      g: "batch",
      q: best.q,
      cost: Math.round(best.cost),
      attempts: tries.length
    }));

    show("debrief");
    window.scrollTo(0, 0);
  }

  /* ---------------- wire up ---------------- */

  $("btn-begin").addEventListener("click", () => { show("play"); $("q-input").focus(); });
  $("btn-try").addEventListener("click", tryQ);
  $("q-input").addEventListener("keydown", e => { if (e.key === "Enter") tryQ(); });
  $("btn-done").addEventListener("click", renderDebrief);
  $("btn-again").addEventListener("click", () => location.reload());
})();
