/* ============================================================
   beer-online.js — serverless multiplayer Beer Game.

   Topology: star. The HOST's browser runs the simulation
   (BeerEngine) and is the single source of truth. Guests
   connect over WebRTC data channels (PeerJS); the free public
   PeerJS broker only introduces peers — game data never touches
   a server.

   Protocol (JSON messages):
     guest → host : hello {name} · order {qty}
     host  → guest: lobby {players[]} · reject {reason} ·
                    week {week, weeks, role, tier} ·
                    status {ordered[], waiting[]} ·
                    notice {text} · debrief {payload}
   ============================================================ */

(() => {
  const E = BeerEngine;
  const { ROLES, ICONS } = E;
  const $ = id => document.getElementById(id);

  // Bumped whenever the message protocol changes; the host rejects guests on
  // an older cached page so mismatched bundles can't silently mis-play.
  const PROTO = 2;

  // STUN discovers a direct path; TURN relays traffic when no direct path
  // exists (cellular NATs, wifi routers with client isolation). Without TURN,
  // cross-network joins frequently fail. A dedicated relay from
  // js/turn-config.js (see that file) is tried first when configured.
  const DEFAULT_ICE = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp"
      ],
      username: "openrelayproject",
      credential: "openrelayproject"
    },
    {
      urls: ["turn:freeturn.net:3478", "turn:freeturn.net:5349"],
      username: "free",
      credential: "free"
    }
  ];

  // Chrome THROWS on RTCPeerConnection construction if an ICE entry has a url
  // without a stun:/turn:/turns: scheme, or a TURN url with empty credentials.
  // One bad injected value must degrade to "that entry is skipped", never
  // "nobody can connect" — so sanitize everything before use.
  function sanitizeIce(list) {
    const out = [];
    for (const s of list || []) {
      if (!s || !s.urls) continue;
      const urls = (Array.isArray(s.urls) ? s.urls : [s.urls])
        .filter(u => typeof u === "string" && /^(stun|turn|turns):/i.test(u.trim()))
        .map(u => u.trim());
      if (!urls.length) { console.warn("Ignoring ICE entry with no valid stun:/turn:/turns: url", s.urls); continue; }
      const isTurn = urls.some(u => /^turns?:/i.test(u));
      if (isTurn && (!s.username || !s.credential)) { console.warn("Ignoring TURN entry with empty credentials", urls[0]); continue; }
      const entry = { urls: urls.length > 1 ? urls : urls[0] };
      if (s.username) { entry.username = s.username; entry.credential = s.credential; }
      out.push(entry);
    }
    return out.length ? out : DEFAULT_ICE;
  }

  // Optional self-hosted signaling server: beer-online.html?srv=host:port
  function peerOptions() {
    const ice = sanitizeIce([
      ...(Array.isArray(window.TURN_SERVERS) ? window.TURN_SERVERS : []),
      ...DEFAULT_ICE
    ]);
    const base = { config: { iceServers: ice } };
    const srv = new URLSearchParams(location.search).get("srv");
    if (!srv) return base; // PeerJS free public broker
    const [host, port] = srv.split(":");
    return { ...base, host, port: +port || 443, path: "/", key: "peerjs", secure: srv.startsWith("localhost") || srv.startsWith("127.") ? false : true };
  }
  window.__scgIce = peerOptions().config.iceServers; // test hook

  const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  const makeCode = () => Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
  const peerId = code => "scg-beer-" + code.toLowerCase();

  // what a guest needs to render its own dashboard — nothing about other tiers
  const tierView = t => ({
    inv: t.inv, backlog: t.backlog, arrived: t.arrived, demand: t.demand,
    onOrder: t.onOrder, cost: t.cost, hist: t.hist
  });

  const sections = ["home", "host-setup", "join-setup", "lobby", "play", "facilitate", "debrief", "error"];
  const show = id => { sections.forEach(s => $(s).classList.toggle("hidden", s !== id)); window.scrollTo(0, 0); };
  const fail = text => { $("error-text").textContent = text; show("error"); };

  /* ================================================================
     HOST
     ================================================================ */

  const Host = {
    peer: null, code: null,
    cfg: null,                 // {weeks, pattern, botKind, hostPlays, name}
    guests: [],                // [{conn, name}] in join order
    started: false,
    roles: null,               // [{type:'host'|'guest'|'bot', name, conn?}] x4
    sim: null, orders: null,
    myRole: -1,

    create() {
      const name = $("host-name").value.trim() || "Host";
      this.cfg = {
        weeks: Math.max(8, Math.min(104, Math.round(+$("cfg-weeks").value) || 36)),
        pattern: $("cfg-demand").value,
        botKind: $("cfg-bots").value,
        hostPlays: $("cfg-host-plays").checked,
        name
      };
      $("create-status").textContent = "Contacting the matchmaking broker…";
      $("btn-create").disabled = true;
      this.tryOpen(0);
    },

    tryOpen(attempt) {
      if (attempt > 2) { $("btn-create").disabled = false; return fail("Couldn't reach the matchmaking broker. Check your connection (or a firewall may be blocking it) and try again."); }
      this.code = makeCode();
      const peer = new Peer(peerId(this.code), peerOptions());
      this.peer = peer;
      peer.on("open", () => {
        peer.off("error");
        peer.on("error", e => { if (this.started) console.warn(e); });
        this.enterLobby();
      });
      peer.on("error", e => {
        peer.destroy();
        if (e.type === "unavailable-id") this.tryOpen(attempt + 1); // code collision — rare
        else { $("btn-create").disabled = false; fail("Broker error: " + e.type + ". Try again in a moment."); }
      });
      peer.on("connection", conn => this.onConnection(conn));
    },

    enterLobby() {
      $("lobby-code").textContent = this.code;
      const link = location.origin + location.pathname + "?join=" + this.code;
      $("lobby-link").innerHTML = `or send them this link: <b>${link}</b>`;
      $("btn-start").classList.remove("hidden");
      $("lobby-note").textContent = "Up to 4 players including you; bots fill any empty roles. Roles are assigned in join order: Retailer → Wholesaler → Distributor → Factory.";
      this.renderLobby();
      show("lobby");
    },

    humanCount() { return this.guests.length + (this.cfg.hostPlays ? 1 : 0); },

    onConnection(conn) {
      conn.on("data", msg => {
        conn._seen = Date.now(); // any message counts as a heartbeat
        if (msg && msg.type === "hello") {
          if (msg.v !== PROTO) { conn.send({ type: "reject", reason: "Your page is an older cached version of the game — reload the page, then join again." }); setTimeout(() => conn.close(), 300); return; }
          if (this.started) { conn.send({ type: "reject", reason: "The game has already started." }); setTimeout(() => conn.close(), 300); return; }
          if (this.humanCount() >= 4) { conn.send({ type: "reject", reason: "The room is full (4 players)." }); setTimeout(() => conn.close(), 300); return; }
          conn._name = (msg.name || "Player").slice(0, 20);
          this.guests.push({ conn, name: conn._name });
          this.broadcastLobby();
        } else if (msg && msg.type === "order") {
          const r = this.roles ? this.roles.findIndex(x => x.type === "guest" && x.conn === conn) : -1;
          if (r >= 0 && this.orders[r] == null) this.submitOrder(r, msg.qty);
        }
      });
      conn.on("close", () => this.onLeave(conn));
      conn.on("error", () => this.onLeave(conn));
    },

    onLeave(conn) {
      const gi = this.guests.findIndex(g => g.conn === conn);
      if (!this.started) {
        if (gi >= 0) { this.guests.splice(gi, 1); this.broadcastLobby(); }
        return;
      }
      const r = this.roles.findIndex(x => x.type === "guest" && x.conn === conn);
      if (r >= 0) {
        this.roles[r] = { type: "bot", name: this.roles[r].name + " (bot)" };
        this.broadcast({ type: "notice", text: `${ICONS[r]} ${ROLES[r]} lost connection — a bot is taking over.` });
        this.broadcastStatus();
        this.maybeResolve(); // the drop may have been the last order the week was waiting on
      }
    },

    broadcast(msg) {
      this.roles.forEach(r => { if (r.type === "guest") r.conn.send(msg); });
    },

    lobbyPlayers() {
      const p = [];
      if (this.cfg.hostPlays) p.push({ name: this.cfg.name + " (host)" });
      else p.push({ name: this.cfg.name + " (facilitator)", fac: true });
      this.guests.forEach(g => p.push({ name: g.name }));
      return p;
    },

    broadcastLobby() {
      this.renderLobby();
      const players = this.lobbyPlayers();
      this.guests.forEach(g => g.conn.send({ type: "lobby", players }));
    },

    renderLobby() {
      const players = this.lobbyPlayers();
      renderLobbyTable(players, this.cfg.hostPlays);
      $("btn-start").textContent = `Start with ${this.humanCount()} human${this.humanCount() === 1 ? "" : "s"} + ${4 - this.humanCount()} bot${4 - this.humanCount() === 1 ? "" : "s"}`;
    },

    start() {
      this.started = true;
      // heartbeat: browsers don't reliably signal an abrupt peer death (closed
      // laptop, dead wifi), so ping guests and drop anyone silent for 12s
      this.hb = setInterval(() => {
        const now = Date.now();
        this.roles.forEach(r => {
          if (r.type !== "guest") return;
          try { r.conn.send({ type: "ping" }); } catch { /* drop detected below */ }
          if (now - (r.conn._seen || now) > 12000) this.onLeave(r.conn);
        });
      }, 4000);
      // assign roles in join order (host first if playing)
      this.roles = [];
      const humans = [];
      if (this.cfg.hostPlays) humans.push({ type: "host", name: this.cfg.name });
      this.guests.forEach(g => humans.push({ type: "guest", name: g.name, conn: g.conn }));
      for (let i = 0; i < 4; i++) this.roles.push(humans[i] || { type: "bot", name: "Bot" });
      this.myRole = this.cfg.hostPlays ? 0 : -1;

      const seed = (Math.random() * 2 ** 31) | 0;
      this.sim = E.newSim(E.buildDemand(this.cfg.pattern, this.cfg.weeks, seed));
      this.beginWeek();
    },

    beginWeek() {
      E.startWeek(this.sim);
      this.orders = [null, null, null, null];
      this.roles.forEach((r, i) => {
        if (r.type === "guest") r.conn.send({ type: "week", week: this.sim.week, weeks: this.cfg.weeks, role: i, tier: tierView(this.sim.tiers[i]) });
      });
      if (this.myRole >= 0) renderPlayScreen(this.myRole, this.sim.week, this.cfg.weeks, this.sim.tiers[this.myRole]);
      else this.renderFacilitator();
      this.broadcastStatus();
      this.maybeResolve(); // every seat may be a bot (all humans dropped)
    },

    submitOrder(role, qty) {
      this.orders[role] = Math.max(0, Math.round(+qty) || 0);
      this.broadcastStatus();
      this.maybeResolve();
    },

    maybeResolve() {
      const pending = this.roles.some((r, i) => r.type !== "bot" && this.orders[i] == null);
      if (!pending) this.resolveWeek();
    },

    resolveWeek() {
      this.sim.tiers.forEach((t, i) => {
        if (this.roles[i].type === "bot") this.orders[i] = E.botOrder(this.cfg.botKind, t, i);
        else t.lhat = 0.36 * t.demand + 0.64 * t.lhat; // keep forecast state consistent
      });
      E.endWeek(this.sim, this.orders);
      if (this.sim.week > this.cfg.weeks) this.finish();
      else this.beginWeek();
    },

    orderStatus() {
      const ordered = [], waiting = [];
      this.roles.forEach((r, i) => {
        if (r.type === "bot") return;
        (this.orders[i] != null ? ordered : waiting).push(`${ICONS[i]} ${r.name}`);
      });
      return { ordered, waiting };
    },

    broadcastStatus() {
      const s = this.orderStatus();
      this.roles.forEach(r => { if (r.type === "guest") r.conn.send({ type: "status", ...s }); });
      if (this.myRole >= 0) renderWaitNote(s, this.orders[this.myRole] != null);
      else this.renderFacilitator();
    },

    renderFacilitator() {
      $("fac-week").textContent = `Week ${Math.min(this.sim.week, this.cfg.weeks)} of ${this.cfg.weeks}`;
      const chainCost = this.sim.tiers.reduce((s, t) => s + t.cost, 0);
      $("fac-tiles").innerHTML = `
        <div class="tile"><div class="label">Room code</div><div class="value small" style="font-family:ui-monospace,Menlo,monospace">${this.code}</div></div>
        <div class="tile"><div class="label">Chain cost so far</div><div class="value small">${E.money(chainCost)}</div></div>`;
      let h = "<thead><tr><th style='text-align:left'>Role</th><th style='text-align:left'>Player</th><th style='text-align:left'>This week</th></tr></thead><tbody>";
      this.roles.forEach((r, i) => {
        h += `<tr><td style="text-align:left">${ICONS[i]} ${ROLES[i]}</td><td style="text-align:left">${r.name}</td>
          <td style="text-align:left">${r.type === "bot" ? "🤖 bot" : this.orders[i] != null ? "✅ ordered" : "⏳ deciding…"}</td></tr>`;
      });
      $("fac-table").innerHTML = h + "</tbody>";
      show("facilitate");
    },

    finish() {
      clearInterval(this.hb);
      const labels = {};
      this.roles.forEach((r, i) => { if (r.type !== "bot") labels[i] = r.name; });
      const payload = {
        demand: this.sim.demand,
        tiers: this.sim.tiers.map(t => ({ hist: t.hist, cost: t.cost })),
        weeks: this.cfg.weeks, pattern: this.cfg.pattern, humanLabels: labels
      };
      this.roles.forEach(r => { if (r.type === "guest") r.conn.send({ type: "debrief", payload }); });
      E.renderDebrief(payload);
      show("debrief");
    }
  };

  /* ================================================================
     GUEST
     ================================================================ */

  const Guest = {
    peer: null, conn: null, name: "", role: -1, weeks: 0,
    ordered: false, gotWeek: false,

    join() {
      const code = $("join-code").value.trim().toUpperCase();
      this.name = $("join-name").value.trim() || "Player";
      if (code.length !== 5) { $("join-status").textContent = "Room codes are 5 characters."; return; }
      $("join-status").textContent = "Connecting… (up to 15 seconds on slow networks)";
      $("btn-join").disabled = true;

      // staged diagnosis: track how far the join got so a failure can say
      // exactly what broke and what to do about it
      this.brokerReached = false;  // matchmaking broker answered
      this.channelOpened = false;  // WebRTC data channel to the host opened
      this.welcomed = false;       // host sent its first app-level message

      const peer = new Peer(peerOptions());
      this.peer = peer;
      // TURN relay negotiation is slower than a direct path — a short timeout
      // would abandon connections that were about to succeed
      this.joinTimer = setTimeout(() => this.diagnoseJoin(), 15000);

      peer.on("error", e => {
        if (this.welcomed) return;
        if (e.type === "peer-unavailable") {
          clearTimeout(this.joinTimer);
          try { peer.destroy(); } catch { }
          $("btn-join").disabled = false;
          $("join-status").textContent = "No room with that code — check it with your host, and that the host's tab is still open.";
        }
        // other error types can be transient during ICE — let the 15s diagnosis speak
      });
      peer.on("open", () => {
        this.brokerReached = true;
        const conn = peer.connect(peerId(code), { reliable: true });
        this.conn = conn;
        conn.on("open", () => { this.channelOpened = true; conn.send({ type: "hello", name: this.name, v: PROTO }); });
        conn.on("data", msg => this.onMessage(msg));
        conn.on("close", () => {
          if (!$("debrief").classList.contains("hidden")) return;
          if (this.welcomed) fail("Lost the connection to the host.");
        });
      });
    },

    diagnoseJoin() {
      if (this.welcomed) return;
      try { this.peer.destroy(); } catch { }
      $("btn-join").disabled = false;
      let msg;
      if (!this.brokerReached)
        msg = "Can't reach the connection broker — this network is blocking it. Try a different network, or switch this device to mobile data.";
      else if (!this.channelOpened)
        msg = "Found the room, but couldn't connect to the host. If this link opened inside WhatsApp or Instagram, open it in Safari or Chrome instead. On shared wifi the router may isolate devices — switching one device to mobile data fixes it.";
      else
        msg = "Connected, but the host didn't respond. Ask the host to check their tab is still open, then try again.";
      $("join-status").textContent = "⚠️ " + msg;
    },

    onMessage(msg) {
      if (!this.welcomed) { this.welcomed = true; clearTimeout(this.joinTimer); }
      this.lastSeen = Date.now();
      if (!this.watch) {
        // if the host goes silent (closed tab, dead wifi), tell the player
        this.watch = setInterval(() => {
          if (!$("debrief").classList.contains("hidden")) { clearInterval(this.watch); return; }
          if (Date.now() - this.lastSeen > 15000) { clearInterval(this.watch); fail("Lost the connection to the host."); }
        }, 5000);
      }
      switch (msg.type) {
        case "ping":
          this.conn.send({ type: "pong" });
          break;
        case "lobby":
          $("lobby-code").textContent = $("join-code").value.trim().toUpperCase();
          $("lobby-link").textContent = "You're in — waiting for the host to start.";
          $("btn-start").classList.add("hidden");
          $("lobby-note").textContent = "Roles are assigned when the host starts the game.";
          renderLobbyTable(msg.players, true);
          show("lobby");
          break;
        case "reject":
          fail(msg.reason);
          break;
        case "week":
          this.role = msg.role; this.weeks = msg.weeks;
          this.ordered = false; this.gotWeek = true;
          renderPlayScreen(msg.role, msg.week, msg.weeks, msg.tier);
          break;
        case "status":
          renderWaitNote(msg, this.ordered);
          break;
        case "notice":
          $("wait-note").textContent = msg.text;
          break;
        case "debrief":
          E.renderDebrief(msg.payload);
          show("debrief");
          break;
      }
    },

    sendOrder(qty) {
      this.ordered = true;
      this.conn.send({ type: "order", qty });
      $("btn-order").disabled = true;
      $("order-input").disabled = true;
    }
  };

  /* ================================================================
     shared rendering
     ================================================================ */

  function renderLobbyTable(players, _hostPlays) {
    let h = "<thead><tr><th style='text-align:left'>#</th><th style='text-align:left'>Player</th><th style='text-align:left'>Role</th></tr></thead><tbody>";
    let roleIdx = 0;
    players.forEach((p, i) => {
      const role = p.fac ? "Facilitator" : roleIdx < 4 ? `${ICONS[roleIdx]} ${ROLES[roleIdx]}` : "Spectator";
      if (!p.fac) roleIdx++;
      h += `<tr><td style="text-align:left">${i + 1}</td><td style="text-align:left"><b>${(p.name || "").replace(/</g, "&lt;")}</b></td><td style="text-align:left">${role}</td></tr>`;
    });
    for (; roleIdx < 4; roleIdx++) {
      h += `<tr><td style="text-align:left">–</td><td style="text-align:left" class="muted">🤖 Bot</td><td style="text-align:left">${ICONS[roleIdx]} ${ROLES[roleIdx]}</td></tr>`;
    }
    $("lobby-table").innerHTML = h + "</tbody>";
  }

  function renderPlayScreen(role, week, weeks, tier) {
    $("play-title").textContent = `${ICONS[role]} ${ROLES[role]}`;
    $("play-week").textContent = `Week ${week} of ${weeks}`;
    BeerUI.renderStation($("pipeline"), role, tier);
    BeerUI.renderTiles($("play-tiles"), role, tier);
    $("order-hint").textContent =
      `Ordered but not yet received: ${tier.onOrder} cases (arrives over the next ~3 weeks).`;
    $("order-input").value = tier.hist.order.length ? tier.hist.order[tier.hist.order.length - 1] : 4;
    $("order-input").disabled = false;
    $("btn-order").disabled = false;
    $("wait-note").textContent = "";
    BeerUI.renderHistory($("history-table"), tier);
    show("play");
    $("order-input").focus();
    $("order-input").select();
  }

  function renderWaitNote(status, iOrdered) {
    if (!iOrdered) {
      $("wait-note").textContent = status.ordered.length ? `Already ordered: ${status.ordered.join(", ")}` : "";
      return;
    }
    $("wait-note").textContent = status.waiting.length
      ? `✅ Order placed. Waiting for: ${status.waiting.join(", ")}…`
      : "✅ Order placed. Resolving the week…";
  }

  function placeOrder() {
    const v = Math.max(0, Math.round(+$("order-input").value));
    if (!isFinite(v)) return;
    // disable BEFORE submitting: the host's submit can synchronously start
    // the next week, which re-enables the inputs for the new decision
    $("btn-order").disabled = true;
    $("order-input").disabled = true;
    if (Host.started) Host.submitOrder(Host.myRole, v);
    else Guest.sendOrder(v);
  }

  /* ================================================================
     connection self-test — probes each configured ICE server from
     THIS device and reports which candidate types come back.
     srflx = STUN worked (direct path possible); relay = TURN worked
     (connection possible even across hostile networks).
     ================================================================ */

  async function probeIceServer(server, ms) {
    const types = new Set();
    let pc;
    try { pc = new RTCPeerConnection({ iceServers: [server] }); }
    catch { return { error: "rejected by browser", types } }
    pc.createDataChannel("probe");
    pc.onicecandidate = e => {
      if (e.candidate) {
        const m = / typ (\w+)/.exec(e.candidate.candidate);
        if (m) types.add(m[1]);
      }
    };
    try { await pc.setLocalDescription(await pc.createOffer()); } catch { }
    await new Promise(r => setTimeout(r, ms));
    pc.close();
    return { types };
  }

  async function runIceTest() {
    const btn = $("btn-icetest");
    btn.disabled = true;
    $("icetest-status").textContent = "Testing… (~8 seconds)";
    $("icetest-verdict").textContent = "";
    const servers = peerOptions().config.iceServers;
    const dedicated = new Set((Array.isArray(window.TURN_SERVERS) ? window.TURN_SERVERS : [])
      .flatMap(s => Array.isArray(s.urls) ? s.urls : [s.urls]));
    const results = await Promise.all(servers.map(s => probeIceServer(s, 7000)));

    let anyStun = false, anyRelay = false, dedicatedRelay = null;
    let h = "<thead><tr><th style='text-align:left'>Server</th><th style='text-align:left'>Kind</th><th style='text-align:left'>Result</th></tr></thead><tbody>";
    servers.forEach((s, i) => {
      const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
      const isTurn = urls.some(u => /^turns?:/i.test(u));
      const isDedicated = urls.some(u => dedicated.has(u));
      const r = results[i];
      const ok = r.error ? false : (isTurn ? r.types.has("relay") : r.types.has("srflx"));
      if (!isTurn && ok) anyStun = true;
      if (isTurn && ok) anyRelay = true;
      if (isTurn && isDedicated) dedicatedRelay = ok;
      const host = (urls[0].split(":")[1] || urls[0]).replace(/^\/\//, "");
      h += `<tr><td style="text-align:left">${host}${isDedicated ? " <b>(dedicated)</b>" : ""}</td>
        <td style="text-align:left">${isTurn ? "TURN relay" : "STUN"}</td>
        <td style="text-align:left">${r.error ? "⚠️ " + r.error : ok ? "✅ working" : "❌ no " + (isTurn ? "relay" : "srflx") + " candidate"}</td></tr>`;
    });
    $("icetest-table").innerHTML = h + "</tbody>";
    $("icetest-table").classList.remove("hidden");
    $("icetest-status").textContent = "";
    btn.disabled = false;

    let verdict;
    if (anyRelay) {
      verdict = "✅ A relay is reachable — joins from this device should work on any network." +
        (dedicatedRelay === false ? " (Note: the dedicated relay failed and a public one is covering — check the metered.ca credentials and domain lock.)" : "");
    } else if (dedicatedRelay === false) {
      verdict = "❌ The dedicated relay refused this device — on metered.ca, verify you copied the TURN username/password (not the API key) and that the domain lock matches r-kale.github.io exactly. Public relays also failed, so cross-network joins will not work until this is fixed.";
    } else if (anyStun) {
      verdict = "⚠️ STUN works but no TURN relay is reachable: joins succeed on open networks but fail across strict ones (or client-isolated wifi). Configure a dedicated relay (js/turn-config.js / repo secrets).";
    } else {
      verdict = "❌ This network blocks WebRTC entirely (not even STUN). Switch this device to mobile data or another network.";
    }
    $("icetest-verdict").textContent = verdict;
  }

  /* ================================================================
     wire up
     ================================================================ */

  $("btn-icetest").addEventListener("click", runIceTest);

  // the join/error screens link back to the self-test on the home screen
  function gotoIceTest(e) {
    e.preventDefault();
    show("home");
    $("btn-icetest").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  $("link-icetest-join").addEventListener("click", gotoIceTest);
  $("link-icetest-err").addEventListener("click", gotoIceTest);

  $("btn-go-host").addEventListener("click", () => show("host-setup"));
  $("btn-go-join").addEventListener("click", () => show("join-setup"));
  $("btn-create").addEventListener("click", () => Host.create());
  $("btn-start").addEventListener("click", () => Host.start());
  $("btn-join").addEventListener("click", () => Guest.join());
  $("join-code").addEventListener("keydown", e => { if (e.key === "Enter") Guest.join(); });
  $("btn-order").addEventListener("click", placeOrder);
  $("order-input").addEventListener("keydown", e => { if (e.key === "Enter" && !$("btn-order").disabled) placeOrder(); });

  // ?join=CODE deep link
  const deepJoin = new URLSearchParams(location.search).get("join");
  if (deepJoin) {
    $("join-code").value = deepJoin.toUpperCase();
    show("join-setup");
    $("join-name").focus();
  }

  // host: place-order path when the host also plays
  // (Host.submitOrder is called directly from placeOrder above)
})();
