/* ============================================================
   The Dice Game — variability + dependent events (The Goal).
   5 stations in series. Each round every station rolls a die;
   it passes min(roll, upstream buffer) downstream. Station 1
   has unlimited raw material. Output of station 5 = throughput.
   ============================================================ */

(() => {
  const STATIONS = 5, ROUNDS = 20, START_WIP = 4;
  const DIE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  const $ = id => document.getElementById(id);

  /* ---------------- simulation ---------------- */

  function newLine(startWip) {
    // buffers[i] = WIP waiting in front of station i (i>0); station 0 is unlimited
    return { buffers: Array(STATIONS).fill(startWip), out: 0, history: [] };
  }

  // one round; roll() supplies each station's capacity
  function playRound(line, roll) {
    const rolls = Array.from({ length: STATIONS }, roll);
    // process from the END of the line so a unit can't cross two stations in one round
    for (let i = STATIONS - 1; i >= 0; i--) {
      const avail = i === 0 ? Infinity : line.buffers[i];
      const moved = Math.min(rolls[i], avail);
      if (i > 0) line.buffers[i] -= moved;
      if (i < STATIONS - 1) line.buffers[i + 1] += moved;
      else line.out += moved;
      rolls[i] = { cap: rolls[i], moved };
    }
    line.history.push({ rolls, out: line.out, wip: line.buffers.slice(1).reduce((a, b) => a + b, 0) });
    return rolls;
  }

  const d6 = () => 1 + Math.floor(Math.random() * 6);
  const d34 = () => 3 + Math.floor(Math.random() * 2);
  const d8 = () => 1 + Math.floor(Math.random() * 8);

  function batchAverage(roll, startWip, trials) {
    let out = 0, wip = 0;
    for (let t = 0; t < trials; t++) {
      const line = newLine(startWip);
      for (let r = 0; r < ROUNDS; r++) playRound(line, roll);
      out += line.out;
      wip += line.history[line.history.length - 1].wip;
    }
    return { avgOut: out / trials, avgWip: wip / trials };
  }

  /* ---------------- interactive run ---------------- */

  let line = null, round = 0, prediction = 70, lastRolls = null;
  const variantRows = [];

  const sections = ["intro", "play", "results"];
  const show = id => sections.forEach(s => $(s).classList.toggle("hidden", s !== id));

  function begin() {
    prediction = Math.max(0, Math.round(+$("predict-input").value) || 0);
    line = newLine(START_WIP);
    round = 0;
    lastRolls = null;
    show("play");
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    $("round-pill").textContent = round < ROUNDS ? `Round ${round + 1} of ${ROUNDS}` : "Finished";

    const box = $("line");
    box.innerHTML = "";
    for (let i = 0; i < STATIONS; i++) {
      if (i > 0) {
        const a = document.createElement("div");
        a.className = "flow-arrow";
        a.textContent = "→";
        box.appendChild(a);
      }
      const d = document.createElement("div");
      d.className = "station";
      const buf = i === 0 ? "∞" : line.buffers[i];
      const r = lastRolls ? lastRolls[i] : null;
      d.innerHTML = `<div class="role">Station ${i + 1}</div>
        <div class="figure">${r ? DIE_FACES[Math.min(r.cap, 6)] + " " + r.cap : "–"}</div>
        <div class="sub">${r ? "moved " + r.moved : "capacity roll"}</div>
        <div class="sub" style="margin-top:6px"><b>${buf}</b> waiting</div>`;
      box.appendChild(d);
    }
    const doneD = document.createElement("div");
    doneD.className = "flow-arrow"; doneD.textContent = "→";
    box.appendChild(doneD);
    const fin = document.createElement("div");
    fin.className = "station me";
    fin.innerHTML = `<div class="role">✅ Shipped</div><div class="figure">${line.out}</div><div class="sub">units delivered</div>`;
    box.appendChild(fin);

    const wip = line.buffers.slice(1).reduce((a, b) => a + b, 0);
    const naive = Math.round(3.5 * round * 10) / 10;
    $("play-tiles").innerHTML = `
      <div class="tile"><div class="label">Delivered so far</div><div class="value">${line.out}</div></div>
      <div class="tile"><div class="label">Naive promise (3.5/round)</div><div class="value">${naive}</div></div>
      <div class="tile ${line.out < naive ? "alert" : ""}"><div class="label">Gap</div><div class="value">${Math.round((line.out - naive) * 10) / 10}</div></div>
      <div class="tile"><div class="label">Work-in-process</div><div class="value">${wip}</div>
        <div class="delta">started at ${START_WIP * (STATIONS - 1)}</div></div>`;

    drawCumChart();

    $("btn-roll").disabled = round >= ROUNDS;
    $("btn-auto").disabled = round >= ROUNDS;
    if (round >= ROUNDS) setTimeout(finish, 600);
  }

  function drawCumChart() {
    const n = line.history.length;
    if (n === 0) { $("chart-cum").innerHTML = "<p class='muted'>Roll to start.</p>"; return; }
    const labels = [], actual = [], naive = [];
    for (let r = 1; r <= ROUNDS; r++) {
      labels.push("R" + r);
      actual.push(r <= n ? line.history[r - 1].out : null);
      naive.push(Math.round(3.5 * r * 10) / 10);
    }
    Charts.line($("chart-cum"), {
      series: [
        { name: "Naive promise (3.5 × rounds)", values: naive, color: "var(--series-3)" },
        { name: "Actual output", values: actual, color: "var(--series-1)" }
      ],
      xLabels: labels, yMin: 0, height: 260, xTitle: "round"
    });
  }

  function rollOnce() {
    if (round >= ROUNDS) return;
    lastRolls = playRound(line, d6);
    round++;
    render();
  }

  function autoRun() {
    while (round < ROUNDS) { lastRolls = playRound(line, d6); round++; }
    render();
  }

  /* ---------------- results & variants ---------------- */

  function finish() {
    const wip = line.buffers.slice(1).reduce((a, b) => a + b, 0);
    const perRound = line.out / ROUNDS;
    $("result-tiles").innerHTML = `
      <div class="tile"><div class="label">Your prediction</div><div class="value">${prediction}</div></div>
      <div class="tile"><div class="label">Naive promise</div><div class="value">70</div></div>
      <div class="tile ${line.out < 70 ? "alert" : ""}"><div class="label">Actual delivered</div><div class="value">${line.out}</div>
        <div class="delta ${line.out < 70 ? "bad" : "good"}">${perRound.toFixed(2)} per round</div></div>
      <div class="tile"><div class="label">Ending WIP</div><div class="value">${wip}</div>
        <div class="delta">started at ${START_WIP * (STATIONS - 1)}</div></div>`;

    variantRows.length = 0;
    variantRows.push({ name: "Your run (standard d6, buffers of 4)", out: line.out, wip, single: true });
    const base = batchAverage(d6, START_WIP, 200);
    variantRows.push({ name: "Standard line — average of 200 runs", out: base.avgOut, wip: base.avgWip });
    renderVariants();
    show("results");
    window.scrollTo(0, 0);
  }

  function addVariant(name, roll, startWip, btn) {
    const r = batchAverage(roll, startWip, 200);
    variantRows.push({ name, out: r.avgOut, wip: r.avgWip });
    btn.disabled = true;
    renderVariants();
  }

  function renderVariants() {
    let h = "<thead><tr><th style='text-align:left'>Configuration</th><th>Delivered / 20 rounds</th><th>Per round</th><th>Ending WIP</th></tr></thead><tbody>";
    variantRows.forEach(v => {
      h += `<tr><td style="text-align:left">${v.name}</td><td><b>${v.single ? v.out : v.out.toFixed(1)}</b></td>
        <td>${(v.out / ROUNDS).toFixed(2)}</td><td>${v.single ? v.wip : v.wip.toFixed(1)}</td></tr>`;
    });
    $("variants-table").innerHTML = h + "</tbody>";
  }

  /* ---------------- wire up ---------------- */

  $("btn-begin").addEventListener("click", begin);
  $("btn-roll").addEventListener("click", rollOnce);
  $("btn-auto").addEventListener("click", autoRun);
  $("btn-var-lowvar").addEventListener("click", e =>
    addVariant("Less variability (die shows 3–4, same 3.5 avg)", d34, START_WIP, e.target));
  $("btn-var-buffer").addEventListener("click", e =>
    addVariant("Bigger buffers (12 per station, d6)", d6, 12, e.target));
  $("btn-var-capacity").addEventListener("click", e =>
    addVariant("More capacity (d8, 4.5 avg)", d8, START_WIP, e.target));
  $("btn-again").addEventListener("click", () => location.reload());
})();
