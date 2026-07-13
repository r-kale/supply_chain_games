/* ============================================================
   results.js — team result codes for tournament play.
   Each game's debrief emits a compact copyable code; the
   facilitator pastes codes into compare.html for leaderboards.
   No server involved — the code IS the data.
   ============================================================ */

const Results = (() => {
  const PREFIX = "SCG1-";

  function encode(data) {
    const json = JSON.stringify(data);
    return PREFIX + btoa(unescape(encodeURIComponent(json)));
  }

  function decode(code) {
    const s = code.trim();
    if (!s.startsWith(PREFIX)) return null;
    try {
      const obj = JSON.parse(decodeURIComponent(escape(atob(s.slice(PREFIX.length)))));
      return obj && obj.g ? obj : null;
    } catch { return null; }
  }

  /* Render the "share your result" widget into a container.
     getData() is called at copy time so the team name is included. */
  function emit(container, getData) {
    container.innerHTML = `
      <h3 style="margin-top:0">🏆 Playing as a team? Share your result</h3>
      <p class="muted">Copy your result code and paste it into the
        <a href="compare.html">comparison board</a> — the facilitator can rank every team's run.</p>
      <div class="actions" style="margin:12px 0">
        <label class="field">Team name
          <input type="text" class="team-name" maxlength="24" placeholder="e.g. Chain Gang"
                 style="font:inherit;background:var(--surface-1);color:var(--text-primary);
                        border:1px solid var(--baseline);border-radius:8px;padding:8px 10px;width:180px">
        </label>
        <button class="primary copy-btn" type="button">Copy result code</button>
      </div>
      <div class="formula code-out hidden" style="max-width:100%;overflow-wrap:anywhere"></div>`;
    const btn = container.querySelector(".copy-btn");
    const out = container.querySelector(".code-out");
    btn.addEventListener("click", async () => {
      const team = container.querySelector(".team-name").value.trim() || "Team";
      const code = encode({ t: team, ...getData() });
      out.textContent = code;
      out.classList.remove("hidden");
      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = "Copied ✓";
      } catch {
        btn.textContent = "Copy manually below";
      }
      setTimeout(() => { btn.textContent = "Copy result code"; }, 2500);
    });
  }

  return { encode, decode, emit };
})();
