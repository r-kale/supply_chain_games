/* ============================================================
   charts.js — tiny dependency-free SVG chart library
   Line charts (crosshair + tooltip) and bar charts (per-mark
   hover). Colors are CSS custom properties so charts follow
   light/dark mode automatically.
   ============================================================ */

const Charts = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const PALETTE = [1, 2, 3, 4, 5, 6, 7, 8].map(i => `var(--series-${i})`);

  function el(name, attrs = {}, parent = null) {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }

  function html(tag, cls, parent) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (parent) parent.appendChild(node);
    return node;
  }

  const fmtDefault = v =>
    Math.abs(v) >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 })
      : Math.round(v * 100) / 100 + "";

  // clean ticks: round bounds outward to a nice step
  function niceTicks(min, max, count = 5) {
    if (min === max) { max = min + 1; }
    const span = max - min;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step * 0.001; v += step) ticks.push(Math.round(v * 1e9) / 1e9);
    return { lo, hi, ticks };
  }

  function legend(container, series) {
    if (series.length < 2) return; // single series: title carries identity
    const box = html("div", "chart-legend", container);
    for (const s of series) {
      const item = html("span", "chart-legend-item", box);
      const key = html("span", "chart-legend-key", item);
      key.style.background = s.color;
      item.appendChild(document.createTextNode(s.name));
    }
  }

  function tooltip(container) {
    const tip = html("div", "chart-tip hidden", container);
    return {
      show(x, y, htmlContent) {
        tip.innerHTML = htmlContent;
        tip.classList.remove("hidden");
        const cw = container.clientWidth;
        const tw = tip.offsetWidth, th = tip.offsetHeight;
        let left = x + 14;
        if (left + tw > cw - 4) left = x - tw - 14;
        let top = y - th - 10;
        if (top < 0) top = y + 14;
        tip.style.left = left + "px";
        tip.style.top = top + "px";
      },
      hide() { tip.classList.add("hidden"); }
    };
  }

  /* ------------------------------------------------------------
     Line chart
     opts = {
       series: [{ name, values:[num|null], color? }],
       xLabels: [str],           // one per index
       yFormat, xTitle, yTitle,
       height (px, default 300),
       yMin (default auto; pass 0 to pin baseline)
     }
     ------------------------------------------------------------ */
  function line(container, opts) {
    container.classList.add("chart");
    container.innerHTML = "";
    const series = opts.series.map((s, i) => ({ ...s, color: s.color || PALETTE[i % 8] }));
    legend(container, series);
    const holder = html("div", "chart-holder", container);
    const tip = tooltip(holder);

    function render() {
      holder.querySelectorAll("svg").forEach(n => n.remove());
      const W = Math.max(holder.clientWidth, 320);
      const H = opts.height || 300;
      const m = { top: 14, right: 18, bottom: 34, left: 52 };
      const iw = W - m.left - m.right, ih = H - m.top - m.bottom;

      const all = series.flatMap(s => s.values).filter(v => v != null && isFinite(v));
      let vMin = Math.min(...all), vMax = Math.max(...all);
      if (opts.yMin != null) vMin = Math.min(opts.yMin, vMin);
      const { lo, hi, ticks } = niceTicks(vMin, vMax);
      const n = Math.max(...series.map(s => s.values.length));
      const X = i => m.left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
      const Y = v => m.top + ih - ((v - lo) / (hi - lo)) * ih;

      const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img" }, holder);

      // gridlines + y ticks
      for (const t of ticks) {
        el("line", { x1: m.left, x2: m.left + iw, y1: Y(t), y2: Y(t), stroke: "var(--grid)", "stroke-width": 1 }, svg);
        const lab = el("text", { x: m.left - 8, y: Y(t) + 4, "text-anchor": "end", class: "tick" }, svg);
        lab.textContent = (opts.yFormat || fmtDefault)(t);
      }
      // baseline
      el("line", { x1: m.left, x2: m.left + iw, y1: m.top + ih, y2: m.top + ih, stroke: "var(--baseline)", "stroke-width": 1 }, svg);

      // x labels — thin to at most ~10
      const xl = opts.xLabels || Array.from({ length: n }, (_, i) => i + 1 + "");
      const every = Math.max(1, Math.ceil(n / 10));
      xl.forEach((s, i) => {
        if (i % every !== 0 && i !== n - 1) return;
        const lab = el("text", { x: X(i), y: m.top + ih + 20, "text-anchor": "middle", class: "tick" }, svg);
        lab.textContent = s;
      });
      if (opts.xTitle) {
        const t = el("text", { x: m.left + iw / 2, y: H - 2, "text-anchor": "middle", class: "axis-title" }, svg);
        t.textContent = opts.xTitle;
      }

      // series paths
      for (const s of series) {
        let d = "", pen = false;
        s.values.forEach((v, i) => {
          if (v == null || !isFinite(v)) { pen = false; return; }
          d += (pen ? " L" : " M") + X(i).toFixed(1) + " " + Y(v).toFixed(1);
          pen = true;
        });
        el("path", {
          d, fill: "none", stroke: s.color, "stroke-width": 2,
          "stroke-linejoin": "round", "stroke-linecap": "round"
        }, svg);
        // end marker with surface ring
        for (let i = s.values.length - 1; i >= 0; i--) {
          const v = s.values[i];
          if (v != null && isFinite(v)) {
            el("circle", { cx: X(i), cy: Y(v), r: 6, fill: "var(--surface-1)" }, svg);
            el("circle", { cx: X(i), cy: Y(v), r: 4, fill: s.color }, svg);
            break;
          }
        }
      }

      // crosshair + hover dots + tooltip
      const cross = el("line", { y1: m.top, y2: m.top + ih, stroke: "var(--baseline)", "stroke-width": 1, opacity: 0 }, svg);
      const dots = series.map(s => {
        const ring = el("circle", { r: 6, fill: "var(--surface-1)", opacity: 0 }, svg);
        const dot = el("circle", { r: 4, fill: s.color, opacity: 0 }, svg);
        return { ring, dot };
      });

      svg.addEventListener("mousemove", ev => {
        const rect = svg.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        let i = Math.round(((px - m.left) / iw) * (n - 1));
        i = Math.max(0, Math.min(n - 1, i));
        const cx = X(i);
        cross.setAttribute("x1", cx); cross.setAttribute("x2", cx);
        cross.setAttribute("opacity", 1);
        let rows = "";
        series.forEach((s, k) => {
          const v = s.values[i];
          if (v == null || !isFinite(v)) { dots[k].ring.setAttribute("opacity", 0); dots[k].dot.setAttribute("opacity", 0); return; }
          dots[k].ring.setAttribute("cx", cx); dots[k].ring.setAttribute("cy", Y(v)); dots[k].ring.setAttribute("opacity", 1);
          dots[k].dot.setAttribute("cx", cx); dots[k].dot.setAttribute("cy", Y(v)); dots[k].dot.setAttribute("opacity", 1);
          rows += `<div class="tip-row"><span class="tip-key" style="background:${s.color}"></span>${s.name}<b>${(opts.yFormat || fmtDefault)(v)}</b></div>`;
        });
        tip.show(px, ev.clientY - rect.top, `<div class="tip-title">${xl[i] || ""}</div>${rows}`);
      });
      svg.addEventListener("mouseleave", () => {
        cross.setAttribute("opacity", 0);
        dots.forEach(d => { d.ring.setAttribute("opacity", 0); d.dot.setAttribute("opacity", 0); });
        tip.hide();
      });
    }

    render();
    new ResizeObserver(render).observe(holder);
  }

  /* ------------------------------------------------------------
     Bar chart (grouped if >1 series)
     opts = {
       categories: [str],
       series: [{ name, values, color? }],
       yFormat, height, yMin
     }
     ------------------------------------------------------------ */
  function bar(container, opts) {
    container.classList.add("chart");
    container.innerHTML = "";
    const series = opts.series.map((s, i) => ({ ...s, color: s.color || PALETTE[i % 8] }));
    legend(container, series);
    const holder = html("div", "chart-holder", container);
    const tip = tooltip(holder);

    function render() {
      holder.querySelectorAll("svg").forEach(n => n.remove());
      const W = Math.max(holder.clientWidth, 320);
      const H = opts.height || 280;
      const m = { top: 14, right: 12, bottom: 34, left: 56 };
      const iw = W - m.left - m.right, ih = H - m.top - m.bottom;

      const all = series.flatMap(s => s.values);
      let vMin = Math.min(0, ...all), vMax = Math.max(0, ...all);
      if (opts.yMin != null) vMin = Math.min(opts.yMin, vMin);
      const { lo, hi, ticks } = niceTicks(vMin, vMax);
      const Y = v => m.top + ih - ((v - lo) / (hi - lo)) * ih;
      const y0 = Y(Math.max(lo, Math.min(hi, 0)));

      const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img" }, holder);

      for (const t of ticks) {
        el("line", { x1: m.left, x2: m.left + iw, y1: Y(t), y2: Y(t), stroke: "var(--grid)", "stroke-width": 1 }, svg);
        const lab = el("text", { x: m.left - 8, y: Y(t) + 4, "text-anchor": "end", class: "tick" }, svg);
        lab.textContent = (opts.yFormat || fmtDefault)(t);
      }
      el("line", { x1: m.left, x2: m.left + iw, y1: y0, y2: y0, stroke: "var(--baseline)", "stroke-width": 1 }, svg);

      const nCat = opts.categories.length, nSer = series.length;
      const band = iw / nCat;
      const barW = Math.min(24, (band * 0.7) / nSer);
      const groupW = barW * nSer + 2 * (nSer - 1);

      opts.categories.forEach((cat, ci) => {
        const cx = m.left + band * ci + band / 2;
        const lab = el("text", { x: cx, y: m.top + ih + 20, "text-anchor": "middle", class: "tick" }, svg);
        lab.textContent = cat;

        series.forEach((s, si) => {
          const v = s.values[ci];
          if (v == null) return;
          const x = cx - groupW / 2 + si * (barW + 2);
          const top = Math.min(Y(v), y0), bot = Math.max(Y(v), y0);
          const h = Math.max(bot - top, 0.5);
          const r = Math.min(4, barW / 2, h);
          // rounded at the data end, square at the baseline
          const dataEndTop = v >= 0;
          const d = dataEndTop
            ? `M${x} ${bot} V${top + r} Q${x} ${top} ${x + r} ${top} H${x + barW - r} Q${x + barW} ${top} ${x + barW} ${top + r} V${bot} Z`
            : `M${x} ${top} V${bot - r} Q${x} ${bot} ${x + r} ${bot} H${x + barW - r} Q${x + barW} ${bot} ${x + barW} ${bot - r} V${top} Z`;
          const path = el("path", { d, fill: s.color }, svg);
          const hit = el("rect", { x: x - 2, y: m.top, width: barW + 4, height: ih, fill: "transparent" }, svg);
          hit.addEventListener("mousemove", ev => {
            const rect = svg.getBoundingClientRect();
            path.setAttribute("opacity", 0.8);
            tip.show(ev.clientX - rect.left, ev.clientY - rect.top,
              `<div class="tip-title">${cat}</div><div class="tip-row"><span class="tip-key" style="background:${s.color}"></span>${s.name}<b>${(opts.yFormat || fmtDefault)(v)}</b></div>`);
          });
          hit.addEventListener("mouseleave", () => { path.setAttribute("opacity", 1); tip.hide(); });
        });
      });
    }

    render();
    new ResizeObserver(render).observe(holder);
  }

  return { line, bar, PALETTE };
})();

/* chart chrome styles (kept with the library so pages only link one file) */
(() => {
  const css = `
  .chart-holder { position: relative; width: 100%; }
  .chart svg { display: block; }
  .chart text.tick { font: 12px system-ui, sans-serif; fill: var(--text-muted); }
  .chart text.axis-title { font: 12px system-ui, sans-serif; fill: var(--text-secondary); font-weight: 600; }
  .chart-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0 0 8px; font-size: 13px; color: var(--text-secondary); }
  .chart-legend-item { display: inline-flex; align-items: center; gap: 7px; }
  .chart-legend-key { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
  .chart-tip { position: absolute; z-index: 5; pointer-events: none; background: var(--surface-1);
    border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.12);
    padding: 8px 12px; font-size: 13px; color: var(--text-secondary); min-width: 120px; }
  .chart-tip .tip-title { font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
  .chart-tip .tip-row { display: flex; align-items: center; gap: 7px; padding: 1px 0; }
  .chart-tip .tip-row b { margin-left: auto; color: var(--text-primary); font-variant-numeric: tabular-nums; padding-left: 14px; }
  .chart-tip .tip-key { width: 10px; height: 10px; border-radius: 3px; display: inline-block; flex: 0 0 auto; }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();
