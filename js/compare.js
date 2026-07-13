/* ============================================================
   compare.js — facilitator leaderboards from pasted result codes.
   Each game defines: display columns, the headline metric, and
   whether lower or higher is better.
   ============================================================ */

(() => {
  const $ = id => document.getElementById(id);
  const money = v => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });

  const GAMES = {
    beer: {
      title: "🍺 The Beer Game",
      headline: { key: "cost", label: "Total chain cost", fmt: money, lowerIsBetter: true },
      cols: [
        ["cost", "Chain cost", money],
        ["amp", "Bullwhip amplification", v => "×" + v],
        ["weeks", "Weeks", v => v],
        ["humans", "Human roles", v => v]
      ]
    },
    news: {
      title: "📰 The Newsvendor Game",
      headline: { key: "profit", label: "Total profit", fmt: money, lowerIsBetter: false },
      cols: [
        ["profit", "Total profit", money],
        ["hi", "Avg order, high margin (opt ≈ 121)", v => v],
        ["lo", "Avg order, low margin (opt ≈ 80)", v => v]
      ]
    },
    pool: {
      title: "🏭 Warehouse Consolidation",
      headline: { key: "total", label: "Total inventory (both phases)", fmt: v => v.toLocaleString(), lowerIsBetter: true },
      cols: [
        ["total", "Combined inventory", v => v.toLocaleString()],
        ["reg", "Regional total", v => v.toLocaleString()],
        ["cen", "Central total", v => v.toLocaleString()],
        ["saved", "Saved by pooling", v => v + "%"]
      ]
    },
    dice: {
      title: "🎲 The Dice Game",
      headline: { key: "out", label: "Units delivered", fmt: v => v, lowerIsBetter: false },
      cols: [
        ["out", "Delivered / 20 rounds", v => v],
        ["pred", "Prediction", v => v]
      ]
    },
    contract: {
      title: "🤝 The Contract Game",
      headline: { key: "profit", label: "Manufacturer profit", fmt: money, lowerIsBetter: false },
      cols: [
        ["profit", "Your total profit", money],
        ["bestPct", "Best season, % of ceiling", v => v + "%"],
        ["buyback", "Used buyback?", v => (v ? "yes" : "no")]
      ]
    },
    batch: {
      title: "⚖️ The Batch Size Game",
      headline: { key: "cost", label: "Best weekly cost", fmt: money, lowerIsBetter: true },
      cols: [
        ["cost", "Weekly cost (opt ≈ $155)", money],
        ["q", "Batch size (EOQ ≈ 516)", v => v],
        ["attempts", "Attempts", v => v]
      ]
    }
  };

  function build() {
    const lines = $("codes").value.split(/\s+/).filter(Boolean);
    const parsed = [], bad = [];
    for (const line of lines) {
      const r = Results.decode(line);
      if (r && GAMES[r.g]) parsed.push(r); else bad.push(line);
    }
    $("parse-note").textContent =
      `${parsed.length} result${parsed.length === 1 ? "" : "s"} read` +
      (bad.length ? ` · ${bad.length} unreadable code${bad.length === 1 ? "" : "s"} skipped` : "");

    const boards = $("boards");
    boards.innerHTML = "";
    for (const [gid, spec] of Object.entries(GAMES)) {
      const rows = parsed.filter(r => r.g === gid);
      if (!rows.length) continue;
      const h = spec.headline;
      rows.sort((a, b) => h.lowerIsBetter ? a[h.key] - b[h.key] : b[h.key] - a[h.key]);

      const sec = document.createElement("div");
      sec.className = "card chart-block";
      sec.innerHTML = `<h3>${spec.title}</h3>
        <p class="sub">Ranked by ${h.label.toLowerCase()} (${h.lowerIsBetter ? "lower" : "higher"} is better).</p>
        <div class="chart-box"></div>
        <div class="table-scroll" style="margin-top:14px"><table class="data"></table></div>`;
      boards.appendChild(sec);

      Charts.bar(sec.querySelector(".chart-box"), {
        categories: rows.map(r => r.t || "Team"),
        series: [{ name: h.label, values: rows.map(r => r[h.key]), color: "var(--series-1)" }],
        yMin: 0, height: Math.max(200, 60 + rows.length * 8),
        yFormat: h.fmt
      });

      let th = "<thead><tr><th>Rank</th><th style='text-align:left'>Team</th>";
      spec.cols.forEach(([, label]) => th += `<th>${label}</th>`);
      th += "</tr></thead><tbody>";
      let tb = "";
      rows.forEach((r, i) => {
        tb += `<tr><td>${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</td>
          <td style="text-align:left"><b>${(r.t || "Team").replace(/</g, "&lt;")}</b></td>`;
        spec.cols.forEach(([key, , fmt]) => {
          tb += `<td>${r[key] != null ? fmt(r[key]) : "—"}</td>`;
        });
        tb += "</tr>";
      });
      sec.querySelector("table").innerHTML = th + tb + "</tbody>";
    }

    if (!parsed.length) {
      boards.innerHTML = "<div class='card'><p class='muted' style='margin:0'>No valid result codes yet — paste codes above and click Build leaderboards.</p></div>";
    }
  }

  $("btn-build").addEventListener("click", build);
})();
