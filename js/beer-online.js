/* ============================================================
   beer-online.js — serverless multiplayer Beer Game.

   Topology: star. The HOST's browser runs the simulation
   (BeerEngine) and is the single source of truth. Guests
   connect over WebRTC data channels (PeerJS); the free public
   PeerJS broker only introduces peers — game data never touches
   a server.

   Protocol v3 (JSON messages):
     guest → host : hello {name, v, token?} · order {qty} · pong
     host  → guest: lobby {players[], token} · reject {reason} ·
                    week {week, weeks, role, tier, ordered?} ·
                    status {ordered[], waiting[]} · ping ·
                    notice {text} · debrief {payload}

   Resilience model: a seat belongs to a TOKEN, not a connection.
   A guest that drops (backgrounded phone, dead wifi, reload)
   keeps its seat and can reclaim it from any tab holding the
   token. A bot covers that seat's order after WEEK_COVER_MS so
   the room never stalls, and the seat converts to a bot for good
   only after SEAT_GRACE_MS. The host heals its own broker socket
   after app-switches, so brief absences don't kill the room.
   ============================================================ */

(() => {
  const E = BeerEngine;
  const { ROLES, ICONS } = E;
  const $ = id => document.getElementById(id);

  // Bumped whenever the message protocol changes; the host rejects guests on
  // an older cached page so mismatched bundles can't silently mis-play.
  const PROTO = 3;

  // Timings. window.__scgTune (set before this script runs) lets the end-to-end
  // tests shrink the minute-scale ones without touching production behavior.
  const TUNE = window.__scgTune || {};
  const HEARTBEAT_MS = TUNE.hb || 5000;
  const HEARTBEAT_TIMEOUT_MS = TUNE.hbTimeout || 15000;
  const RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000];
  const GUEST_REDIAL_ATTEMPTS = TUNE.redials || 4;
  const REDIAL_TIMEOUT_MS = TUNE.redialTimeout || 10000;
  const SEAT_GRACE_MS = TUNE.grace || 3 * 60 * 1000;  // how long a seat waits for its player
  const WEEK_COVER_MS = TUNE.cover || 40 * 1000;      // how long a week waits before a bot covers
  const backoffDelay = n => RECONNECT_BACKOFF_MS[Math.min(n, RECONNECT_BACKOFF_MS.length - 1)];

  const makeToken = () => {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
  };

  // Per-tab so two tabs never fight over one seat; survives reload, which is
  // the whole point. Separate key from the stale-bundle guard's "scg-reload".
  const SESSION_KEY = "scg-beer-session";
  const saveSession = s => { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { } };
  const loadSession = () => { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } };
  const clearSession = () => { try { sessionStorage.removeItem(SESSION_KEY); } catch { } };

  // One dead connection must never abort a broadcast loop and starve the rest.
  const sendTo = (conn, msg) => {
    try { if (conn && conn.open) conn.send(msg); } catch (e) { console.warn("send failed:", e && e.message); }
  };
  const closeConn = conn => { try { if (conn) conn.close(); } catch { } };

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
  const fail = text => { hideBanner(); $("error-text").textContent = text; show("error"); };

  let flashTimer = null;

  // sticky, something is wrong (guest reconnecting)
  function showBanner(text) {
    const b = $("conn-banner");
    if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
    b.textContent = text;
    b.classList.remove("info", "hidden");
    if (!$("play").classList.contains("hidden")) $("wait-note").textContent = text;
  }

  // transient, informational — how the HOST sees room events (a playing host
  // is in the room too, but broadcasts only reach guests)
  function flashBanner(text) {
    const b = $("conn-banner");
    b.textContent = text;
    b.classList.add("info");
    b.classList.remove("hidden");
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => hideBanner(), 8000);
  }

  function hideBanner() {
    if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
    $("conn-banner").classList.add("hidden");
  }

  /* ================================================================
     HOST
     ================================================================ */

  const Host = {
    peer: null, code: null, link: "",
    cfg: null,
    guests: [],            // pre-start seats: {conn, name, token, connected, offlineSince, freeTimer}
    started: false, finished: false, announced: false,
    roles: null,           // in-game seats (see the seat shape in start())
    sim: null, orders: null, weekStart: 0,
    myRole: -1,
    reconnAttempt: 0, reconnTimer: null, hb: null,
    debriefPayload: null, _onVis: null,

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
      this.code = makeCode();
      this._onVis = () => this.onVisible();
      document.addEventListener("visibilitychange", this._onVis);
      this.openPeer(0);
    },

    // Re-runnable: the room's peer id is derived from the code, so re-creating
    // the peer after a fatal broker error puts the SAME room back on the air
    // and existing guests can reclaim their seats.
    openPeer(preAttempt) {
      if (this.peer) { try { this.peer.destroy(); } catch { } }
      const peer = new Peer(peerId(this.code), peerOptions());
      this.peer = peer;

      peer.on("open", () => {
        this.reconnAttempt = 0;
        if (!this.announced) { this.announced = true; this.enterLobby(); return; }
        // re-registered after a drop: nothing to announce, just resync the room
        this.touchAll();
        if (this.started) this.broadcastStatus(); else this.broadcastLobby();
      });

      peer.on("connection", conn => this.onConnection(conn));

      peer.on("disconnected", () => { if (!this.finished) this.scheduleReconnect(); });

      peer.on("error", e => {
        if (this.announced) {
          // A live room never gives up: back off and heal. Note that
          // "unavailable-id" here means a STALE registration of our own id —
          // retry it; picking a new code would orphan every guest.
          if (e.type === "peer-unavailable") return; // guest-side concept, not ours
          console.warn("broker error (healing):", e.type);
          this.scheduleReconnect();
          return;
        }
        // pre-announce: the room isn't on the air yet
        try { peer.destroy(); } catch { }
        if (e.type === "unavailable-id" && (preAttempt || 0) < 2) {
          this.code = makeCode();                       // rare code collision
          this.openPeer((preAttempt || 0) + 1);
        } else {
          $("btn-create").disabled = false;
          fail("Broker error: " + e.type + ". Try again in a moment.");
        }
      });
    },

    scheduleReconnect() {
      if (this.finished || this.reconnTimer) return;
      const wait = backoffDelay(this.reconnAttempt++);
      this.reconnTimer = setTimeout(() => {
        this.reconnTimer = null;
        if (this.finished) return;
        const p = this.peer;
        if (!p || p.destroyed) this.openPeer();          // fatal: full re-create, same id
        else if (p.disconnected) { try { p.reconnect(); } catch { this.openPeer(); } }
      }, wait);
    },

    // every seat we currently hold a live connection to, in either phase
    eachLive(fn) {
      const list = this.started ? this.roles.filter(r => r.type === "guest") : this.guests;
      list.forEach(g => { if (g.connected && g.conn) fn(g); });
    },

    touchAll() {
      const now = Date.now();
      this.eachLive(g => { g.conn._seen = now; });
    },

    onVisible() {
      if (document.visibilityState !== "visible" || this.finished || !this.announced) return;
      // 1. FIRST: background throttling froze our timers, so every connection we
      //    still hold counts as fresh — otherwise the next sweep evicts the room
      this.touchAll();
      // 2. reset backoff and heal the broker socket
      this.reconnAttempt = 0;
      if (this.reconnTimer) { clearTimeout(this.reconnTimer); this.reconnTimer = null; }
      const p = this.peer;
      if (!p || p.destroyed) this.openPeer();
      else if (p.disconnected) { try { p.reconnect(); } catch { this.openPeer(); } }
      // 3. ping everyone and resync
      this.eachLive(g => sendTo(g.conn, { type: "ping" }));
      if (this.started) this.broadcastStatus(); else this.broadcastLobby();
    },

    enterLobby() {
      $("create-status").textContent = "";
      $("lobby-code").textContent = this.code;
      this.link = location.origin + location.pathname + "?join=" + this.code;
      $("lobby-link").innerHTML = `or send them this link: <b>${this.link}</b>`;
      $("btn-start").classList.remove("hidden");
      $("lobby-note").textContent = "Up to 4 players including you; bots fill any empty roles. Roles are assigned in join order: Retailer → Wholesaler → Distributor → Factory. Keep this tab open — switching apps briefly is fine, the room reconnects when you come back.";
      setupShare(this.link);
      this.startHeartbeat();
      this.renderLobby();
      show("lobby");
    },

    // Pings both keep guests' watchdogs quiet and detect silent deaths. It runs
    // from the lobby onward, so a guest waiting in a quiet lobby is never
    // wrongly told it lost the host.
    startHeartbeat() {
      if (this.hb) return;
      this.hb = setInterval(() => {
        const now = Date.now();
        const stale = [];
        this.eachLive(g => {
          sendTo(g.conn, { type: "ping" });
          if (now - (g.conn._seen || now) > HEARTBEAT_TIMEOUT_MS) stale.push(g.conn);
        });
        stale.forEach(c => this.onLeave(c));
      }, HEARTBEAT_MS);
    },

    humanCount() {
      return this.guests.filter(g => g.connected).length + (this.cfg.hostPlays ? 1 : 0);
    },

    onConnection(conn) {
      conn.on("data", msg => {
        conn._seen = Date.now();               // any message, pongs included
        if (!msg) return;
        if (msg.type === "hello") this.onHello(conn, msg);
        else if (msg.type === "order") {
          // only the seat's CURRENT connection may order — a zombie tab can't
          const r = this.roles ? this.roles.findIndex(x => x.type === "guest" && x.conn === conn && x.connected) : -1;
          if (r >= 0 && this.orders[r] == null) this.submitOrder(r, msg.qty);
        }
      });
      conn.on("close", () => this.onLeave(conn));
      conn.on("error", () => this.onLeave(conn));
    },

    onHello(conn, msg) {
      if (msg.v !== PROTO) {
        sendTo(conn, { type: "reject", reason: "Your page is an older cached version of the game — reload the page, then join again." });
        setTimeout(() => closeConn(conn), 300);
        return;
      }
      const name = (msg.name || "Player").slice(0, 20);

      /* ---- reclaim: a token owns a seat ---- */
      if (msg.token) {
        if (this.finished) {                    // came back after the end: show the results
          sendTo(conn, { type: "debrief", payload: this.debriefPayload });
          return;
        }
        if (this.started) {
          const r = this.roles.findIndex(x => x.type === "guest" && x.token === msg.token);
          if (r >= 0) { this.reclaimSeat(r, conn); return; }
          sendTo(conn, { type: "reject", reason: "Your seat was taken over by a bot — the game moved on without you." });
          setTimeout(() => closeConn(conn), 300);
          return;
        }
        const g = this.guests.find(x => x.token === msg.token);
        if (g) {
          if (g.conn && g.conn !== conn) {      // supersede the old tab, don't ping-pong
            sendTo(g.conn, { type: "reject", reason: "You reconnected in another tab." });
            closeConn(g.conn);
          }
          g.conn = conn; g.connected = true; g.offlineSince = null; g.name = name;
          conn._seen = Date.now();
          if (g.freeTimer) { clearTimeout(g.freeTimer); g.freeTimer = null; }
          this.broadcastLobby();
          return;
        }
        // unknown token before the start: their old room is gone — treat as new
      }

      /* ---- fresh join ---- */
      if (this.started) {
        sendTo(conn, { type: "reject", reason: "The game has already started." });
        setTimeout(() => closeConn(conn), 300);
        return;
      }
      if (this.humanCount() >= 4) {
        sendTo(conn, { type: "reject", reason: "The room is full (4 players)." });
        setTimeout(() => closeConn(conn), 300);
        return;
      }
      this.guests.push({ conn, name, token: makeToken(), connected: true, offlineSince: null, freeTimer: null });
      this.broadcastLobby();
    },

    onLeave(conn) {
      if (!this.started) {
        const g = this.guests.find(x => x.conn === conn && x.connected);
        if (!g) return;                        // zombie conn, or already handled
        g.connected = false; g.offlineSince = Date.now(); g.conn = null;
        g.freeTimer = setTimeout(() => {
          const i = this.guests.indexOf(g);
          if (i >= 0 && !g.connected) { this.guests.splice(i, 1); this.broadcastLobby(); }
        }, SEAT_GRACE_MS);
        this.broadcastLobby();                 // renders "⚠ offline"
        return;
      }
      // identity guard: ONLY the seat's current connection can take it offline,
      // so closing a zombie never evicts the tab that just reclaimed the seat
      const r = this.roles.findIndex(x => x.type === "guest" && x.conn === conn && x.connected);
      if (r < 0) return;
      this.markOffline(r);
    },

    markOffline(r) {
      const seat = this.roles[r];
      seat.connected = false;
      seat.offlineSince = Date.now();
      seat.conn = null;
      this.armCover(r);
      if (seat.graceTimer) clearTimeout(seat.graceTimer);
      seat.graceTimer = setTimeout(() => this.convertToBot(r), SEAT_GRACE_MS);
      this.notify(`${ICONS[r]} ${ROLES[r]} lost connection — reconnecting… a bot will cover if they don't make it back.`);
      this.broadcastStatus();
      this.maybeResolve();
    },

    // A disconnected seat blocks the week for WEEK_COVER_MS; after that a bot
    // places just that week's order. The seat itself stays theirs.
    armCover(r) {
      const seat = this.roles[r];
      if (seat.coverTimer) clearTimeout(seat.coverTimer);
      seat.coverTimer = setTimeout(() => {
        seat.coverTimer = null;
        this.broadcastStatus();
        this.maybeResolve();
      }, WEEK_COVER_MS);
    },

    convertToBot(r) {
      const seat = this.roles[r];
      if (!seat || seat.type !== "guest") return;
      if (seat.coverTimer) clearTimeout(seat.coverTimer);
      this.roles[r] = { type: "bot", name: seat.name + " (bot)" };
      this.notify(`${ICONS[r]} ${ROLES[r]} didn't come back — a bot has taken over.`);
      this.broadcastStatus();
      this.maybeResolve();
    },

    reclaimSeat(r, conn) {
      const seat = this.roles[r];
      const old = seat.conn;
      // swap FIRST, then close the zombie: onLeave's identity guard then makes
      // the old connection's close event a harmless no-op
      seat.conn = conn; seat.connected = true; seat.offlineSince = null;
      conn._seen = Date.now();
      if (seat.coverTimer) { clearTimeout(seat.coverTimer); seat.coverTimer = null; }
      if (seat.graceTimer) { clearTimeout(seat.graceTimer); seat.graceTimer = null; }
      if (old && old !== conn) {
        sendTo(old, { type: "reject", reason: "You reconnected in another tab." });
        closeConn(old);
      }
      sendTo(conn, {
        type: "week", week: this.sim.week, weeks: this.cfg.weeks, role: r,
        tier: tierView(this.sim.tiers[r]), ordered: this.orders[r] != null
      });
      sendTo(conn, { type: "status", ...this.orderStatus() });
      this.notify(`${ICONS[r]} ${ROLES[r]} is back.`);
      this.broadcastStatus();
    },

    broadcast(msg) { this.eachLive(g => sendTo(g.conn, msg)); },

    // room events go to the guests AND to the host's own screen
    notify(text) {
      this.broadcast({ type: "notice", text });
      flashBanner(text);
    },

    lobbyPlayers() {
      const p = [];
      if (this.cfg.hostPlays) p.push({ name: this.cfg.name + " (host)" });
      else p.push({ name: this.cfg.name + " (facilitator)", fac: true });
      this.guests.forEach(g => p.push({ name: g.name, off: !g.connected }));
      return p;
    },

    broadcastLobby() {
      this.renderLobby();
      const players = this.lobbyPlayers();
      // each guest's own token rides along: idempotent, and the only delivery path needed
      this.guests.forEach(g => { if (g.connected && g.conn) sendTo(g.conn, { type: "lobby", players, token: g.token }); });
    },

    renderLobby() {
      const players = this.lobbyPlayers();
      renderLobbyTable(players, this.cfg.hostPlays);
      const n = this.humanCount();
      $("btn-start").textContent = `Start with ${n} human${n === 1 ? "" : "s"} + ${4 - n} bot${4 - n === 1 ? "" : "s"}`;
    },

    start() {
      const humans = [];
      if (this.cfg.hostPlays) humans.push({ type: "host", name: this.cfg.name });
      this.guests.forEach(g => humans.push({
        type: "guest", name: g.name, conn: g.conn, token: g.token,
        connected: g.connected, offlineSince: g.offlineSince, coverTimer: null, graceTimer: null, _g: g
      }));
      humans.slice(4).forEach(h => {          // a graced seat may have let a 5th in
        if (h._g) sendTo(h._g.conn, { type: "reject", reason: "The room filled up before the game started." });
      });
      this.guests.forEach(g => { if (g.freeTimer) { clearTimeout(g.freeTimer); g.freeTimer = null; } });

      this.roles = [];
      for (let i = 0; i < 4; i++) {
        const h = humans[i];
        if (!h) { this.roles.push({ type: "bot", name: "Bot" }); continue; }
        delete h._g;
        this.roles.push(h);
      }
      this.myRole = this.cfg.hostPlays ? 0 : -1;
      this.started = true;

      // someone who dropped in the lobby starts the game already graced
      this.roles.forEach((seat, i) => {
        if (seat.type === "guest" && !seat.connected) {
          seat.graceTimer = setTimeout(() => this.convertToBot(i), SEAT_GRACE_MS);
        }
      });

      const seed = (Math.random() * 2 ** 31) | 0;
      this.sim = E.newSim(E.buildDemand(this.cfg.pattern, this.cfg.weeks, seed));
      this.beginWeek();
    },

    beginWeek() {
      E.startWeek(this.sim);
      this.orders = [null, null, null, null];
      this.weekStart = Date.now();
      this.roles.forEach((r, i) => {
        if (r.type !== "guest") return;
        if (r.connected && r.conn) {
          sendTo(r.conn, { type: "week", week: this.sim.week, weeks: this.cfg.weeks, role: i, tier: tierView(this.sim.tiers[i]) });
        } else {
          this.armCover(i);                    // fresh cover window every week
        }
      });
      if (this.myRole >= 0) renderPlayScreen(this.myRole, this.sim.week, this.cfg.weeks, this.sim.tiers[this.myRole]);
      else this.renderFacilitator();
      this.broadcastStatus();
      this.maybeResolve();                     // every seat may already be coverable
    },

    submitOrder(role, qty) {
      this.orders[role] = Math.max(0, Math.round(+qty) || 0);
      this.broadcastStatus();
      this.maybeResolve();
    },

    // A seat stops blocking the week when it's a bot, its order is in, or it has
    // been offline for the whole cover window OF THIS WEEK — the weekStart term
    // stops a long-gone seat from fast-forwarding the rest of the game.
    coverable(r, i) {
      if (r.type === "bot") return true;
      if (this.orders[i] != null) return true;
      if (r.type === "guest" && !r.connected) {
        return Date.now() - Math.max(r.offlineSince || 0, this.weekStart) >= WEEK_COVER_MS;
      }
      return false;
    },

    maybeResolve() {
      if (!this.started || this.finished || !this.orders) return;
      if (!this.roles.some((r, i) => !this.coverable(r, i))) this.resolveWeek();
    },

    resolveWeek() {
      this.sim.tiers.forEach((t, i) => {
        // bots AND seats whose player is away get a bot order for this week
        if (this.orders[i] == null) this.orders[i] = E.botOrder(this.cfg.botKind, t, i);
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
        const away = r.type === "guest" && !r.connected;
        const who = `${ICONS[i]} ${r.name}`;
        if (this.orders[i] != null) ordered.push(away ? who + " (offline)" : who);
        else waiting.push(away ? who + " (reconnecting…)" : who);
      });
      return { ordered, waiting };
    },

    broadcastStatus() {
      const s = this.orderStatus();
      this.broadcast({ type: "status", ...s });
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
        let state;
        if (r.type === "bot") state = "🤖 bot";
        else if (r.type === "guest" && !r.connected) state = this.orders[i] != null ? "📴 offline (order in)" : "📴 reconnecting…";
        else state = this.orders[i] != null ? "✅ ordered" : "⏳ deciding…";
        h += `<tr><td style="text-align:left">${ICONS[i]} ${ROLES[i]}</td><td style="text-align:left">${r.name}</td>
          <td style="text-align:left">${state}</td></tr>`;
      });
      $("fac-table").innerHTML = h + "</tbody>";
      show("facilitate");
    },

    finish() {
      this.finished = true;
      if (this.hb) { clearInterval(this.hb); this.hb = null; }
      if (this.reconnTimer) { clearTimeout(this.reconnTimer); this.reconnTimer = null; }
      if (this._onVis) document.removeEventListener("visibilitychange", this._onVis);
      this.roles.forEach(r => {
        if (r.coverTimer) clearTimeout(r.coverTimer);
        if (r.graceTimer) clearTimeout(r.graceTimer);
      });
      const labels = {};
      this.roles.forEach((r, i) => { if (r.type !== "bot") labels[i] = r.name; });
      const payload = {
        demand: this.sim.demand,
        tiers: this.sim.tiers.map(t => ({ hist: t.hist, cost: t.cost })),
        weeks: this.cfg.weeks, pattern: this.cfg.pattern, humanLabels: labels
      };
      this.debriefPayload = payload;
      this.broadcast({ type: "debrief", payload });
      E.renderDebrief(payload);
      show("debrief");
    }
  };

  /* ================================================================
     GUEST
     ================================================================ */

  const Guest = {
    peer: null, conn: null, name: "", code: "", token: null,
    role: -1, weeks: 0, ordered: false,
    welcomed: false, finished: false,
    reconnecting: false, redialAttempt: 0, redialTimer: null,
    watch: null, lastSeen: 0, _onVis: null,

    join() {
      const code = $("join-code").value.trim().toUpperCase();
      this.name = $("join-name").value.trim() || "Player";
      if (code.length !== 5) { $("join-status").textContent = "Room codes are 5 characters."; return; }
      this.code = code;
      const s = loadSession();
      if (s && s.code === code && s.token) this.token = s.token;  // reclaim our old seat
      $("join-status").textContent = this.token
        ? "Resuming your seat… (up to 15 seconds)"
        : "Connecting… (up to 15 seconds on slow networks)";
      $("btn-join").disabled = true;

      // staged diagnosis for the FIRST join: track how far it got so a failure
      // can say exactly what broke and what to do about it
      this.brokerReached = false;
      this.channelOpened = false;
      this.welcomed = false;
      this.joinTimer = setTimeout(() => this.diagnoseJoin(), 15000);
      this.dial(true);
    },

    // one dial attempt — used by the first join and by every reconnect
    dial(initial) {
      const peer = new Peer(peerOptions());
      this.peer = peer;

      peer.on("disconnected", () => { try { peer.reconnect(); } catch { } });

      peer.on("error", e => {
        if (initial && !this.welcomed) {
          if (e.type === "peer-unavailable") {
            clearTimeout(this.joinTimer);
            try { peer.destroy(); } catch { }
            $("btn-join").disabled = false;
            $("join-status").textContent = "No room with that code — check it with your host, and that the host's tab is still open.";
          }
          return;                       // other errors: let the 15s diagnosis speak
        }
        if (this.reconnecting && e.type === "peer-unavailable") {
          // the host is probably healing its own broker registration — retry sooner
          if (this.redialTimer) { clearTimeout(this.redialTimer); this.redialTimer = null; }
          this.attemptReconnect();
        }
      });

      peer.on("open", () => {
        this.brokerReached = true;
        const conn = peer.connect(peerId(this.code), { reliable: true });
        this.conn = conn;
        conn.on("open", () => {
          this.channelOpened = true;
          sendTo(conn, { type: "hello", name: this.name, v: PROTO, token: this.token || undefined });
        });
        conn.on("data", msg => this.onMessage(msg));
        conn.on("close", () => this.onConnDown());
        conn.on("error", () => this.onConnDown());
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

    onConnDown() {
      if (this.finished) return;
      if (!this.welcomed) return;             // first join: the staged diagnosis owns this
      this.tryReconnect();
    },

    tryReconnect() {
      if (this.reconnecting || this.finished) return;
      if (!this.token) { this.finalFail("Lost the connection to the host."); return; }
      this.reconnecting = true;
      this.redialAttempt = 0;
      this.attemptReconnect();
    },

    attemptReconnect() {
      if (!this.reconnecting || this.finished) return;
      this.redialAttempt++;
      if (this.redialAttempt > GUEST_REDIAL_ATTEMPTS) {
        this.finalFail("Couldn't reconnect to the host after several tries. If the host closed their tab, the room is gone.");
        return;
      }
      showBanner(`⚠️ Connection lost — reconnecting (attempt ${this.redialAttempt} of ${GUEST_REDIAL_ATTEMPTS})…`);
      try { if (this.peer) this.peer.destroy(); } catch { }   // peer only: session and token survive
      this.conn = null;
      setTimeout(() => {
        if (!this.reconnecting || this.finished) return;
        this.dial(false);
        this.redialTimer = setTimeout(() => {
          if (this.reconnecting) this.attemptReconnect();
        }, REDIAL_TIMEOUT_MS);
      }, backoffDelay(this.redialAttempt - 1));
    },

    reconnected() {
      this.reconnecting = false;
      this.redialAttempt = 0;
      if (this.redialTimer) { clearTimeout(this.redialTimer); this.redialTimer = null; }
      hideBanner();
    },

    finalFail(text) {
      this.reconnecting = false;
      if (this.redialTimer) { clearTimeout(this.redialTimer); this.redialTimer = null; }
      if (this.watch) { clearInterval(this.watch); this.watch = null; }
      clearSession();
      fail(text);
    },

    // Watches for host silence. Two rules make phones survivable: a hidden tab
    // is never judged (it hears nothing by design), and coming back to the
    // foreground grants a fresh grace period.
    startWatch() {
      if (this.watch) return;
      this._onVis = () => {
        if (document.visibilityState !== "visible" || this.finished) return;
        this.lastSeen = Date.now();
        if (!this.conn || !this.conn.open) this.tryReconnect();
      };
      document.addEventListener("visibilitychange", this._onVis);
      this.watch = setInterval(() => {
        if (this.finished) { clearInterval(this.watch); this.watch = null; return; }
        if (document.visibilityState === "hidden") return;
        if (this.reconnecting) return;
        if (Date.now() - this.lastSeen > HEARTBEAT_TIMEOUT_MS) this.tryReconnect();
      }, 2000);
    },

    onMessage(msg) {
      if (!msg) return;
      if (!this.welcomed) { this.welcomed = true; clearTimeout(this.joinTimer); }
      if (this.reconnecting) this.reconnected();
      this.lastSeen = Date.now();
      this.startWatch();

      switch (msg.type) {
        case "ping":
          sendTo(this.conn, { type: "pong" });
          break;
        case "lobby":
          if (msg.token && msg.token !== this.token) {
            this.token = msg.token;
            saveSession({ code: this.code, name: this.name, token: msg.token });
          }
          $("lobby-code").textContent = this.code;
          $("lobby-link").textContent = "You're in — waiting for the host to start.";
          $("btn-start").classList.add("hidden");
          $("btn-share").classList.add("hidden");
          $("btn-copy").classList.add("hidden");
          $("lobby-note").textContent = "Roles are assigned when the host starts the game. If your phone locks or you switch apps, your seat is held — just come back.";
          renderLobbyTable(msg.players, true);
          show("lobby");
          break;
        case "reject":
          this.finalFail(msg.reason);
          break;
        case "week":
          this.role = msg.role; this.weeks = msg.weeks;
          this.ordered = !!msg.ordered;
          renderPlayScreen(msg.role, msg.week, msg.weeks, msg.tier, this.ordered);
          break;
        case "status":
          renderWaitNote(msg, this.ordered);
          break;
        case "notice":
          $("wait-note").textContent = msg.text;
          break;
        case "debrief":
          this.finished = true;
          clearSession();
          if (this.watch) { clearInterval(this.watch); this.watch = null; }
          if (this._onVis) document.removeEventListener("visibilitychange", this._onVis);
          hideBanner();
          E.renderDebrief(msg.payload);
          show("debrief");
          break;
      }
    },

    sendOrder(qty) {
      this.ordered = true;
      sendTo(this.conn, { type: "order", qty });
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
      const off = p.off ? ' <span class="muted">⚠ offline</span>' : "";
      h += `<tr><td style="text-align:left">${i + 1}</td><td style="text-align:left"><b>${(p.name || "").replace(/</g, "&lt;")}</b>${off}</td><td style="text-align:left">${role}</td></tr>`;
    });
    for (; roleIdx < 4; roleIdx++) {
      h += `<tr><td style="text-align:left">–</td><td style="text-align:left" class="muted">🤖 Bot</td><td style="text-align:left">${ICONS[roleIdx]} ${ROLES[roleIdx]}</td></tr>`;
    }
    $("lobby-table").innerHTML = h + "</tbody>";
  }

  function renderPlayScreen(role, week, weeks, tier, ordered) {
    $("play-title").textContent = `${ICONS[role]} ${ROLES[role]}`;
    $("play-week").textContent = `Week ${week} of ${weeks}`;
    BeerUI.renderStation($("pipeline"), role, tier);
    BeerUI.renderTiles($("play-tiles"), role, tier);
    $("order-hint").textContent =
      `Ordered but not yet received: ${tier.onOrder} cases (arrives over the next ~3 weeks).`;
    $("order-input").value = tier.hist.order.length ? tier.hist.order[tier.hist.order.length - 1] : 4;
    // a reclaimed seat whose order is already in waits for the next week
    $("order-input").disabled = !!ordered;
    $("btn-order").disabled = !!ordered;
    $("wait-note").textContent = ordered ? "Your order for this week is already in — the next week starts shortly." : "";
    BeerUI.renderHistory($("history-table"), tier);
    show("play");
    if (!ordered) { $("order-input").focus(); $("order-input").select(); }
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

  // Sharing the invite from inside the page keeps the host's tab alive — the
  // native share sheet doesn't background the browser the way app-switching does.
  function setupShare(link) {
    $("copy-url").value = link;
    if (navigator.share) $("btn-share").classList.remove("hidden");
    $("btn-share").onclick = () => {
      navigator.share({ title: "The Beer Game", text: "Join my Beer Game room", url: link }).catch(() => { });
    };
    $("btn-copy").onclick = () => {
      // iOS in-app browsers block the clipboard entirely — synchronously AND
      // by rejection, so both paths need the visible-URL fallback
      const fallback = () => { $("copy-fallback").classList.remove("hidden"); $("copy-url").select(); };
      try {
        navigator.clipboard.writeText(link).then(() => {
          $("btn-copy").textContent = "Copied ✓";
          setTimeout(() => { $("btn-copy").textContent = "📋 Copy link"; }, 2000);
        }, fallback);
      } catch { fallback(); }
    };
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

  // A stored session means this tab was in a room: resume the seat automatically
  // (a reload mid-game is the common case). Otherwise honour a ?join=CODE link.
  const deepJoin = new URLSearchParams(location.search).get("join");
  const saved = loadSession();
  if (saved && saved.code && (!deepJoin || deepJoin.toUpperCase() === saved.code)) {
    $("join-code").value = saved.code;
    $("join-name").value = saved.name || "";
    show("join-setup");
    Guest.join();
  } else if (deepJoin) {
    $("join-code").value = deepJoin.toUpperCase();
    show("join-setup");
    $("join-name").focus();
  }
})();
