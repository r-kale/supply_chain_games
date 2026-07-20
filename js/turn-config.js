/* ============================================================
   Dedicated TURN relay (metered.ca) — tried before the built-in
   public relays. Copied verbatim from the metered dashboard's
   RTCPeerConnection snippet.

   These credentials are client-visible BY DESIGN: every player's
   browser must present them to the relay, so they appear in the
   deployed JS no matter where they're stored. The protection is
   the domain lock on the metered API key (r-kale.github.io).
   To rotate: generate new credentials in the metered dashboard
   and update this file.

   Note: the Pages deploy workflow injects from the repo secrets
   (TURN_URL / TURN_USERNAME / TURN_CREDENTIAL) ONLY when the
   array below is empty — a filled-in config here is the source
   of truth.
   ============================================================ */

window.TURN_SERVERS = [
  { urls: "stun:stun.relay.metered.ca:80" },
  {
    urls: [
      "turn:global.relay.metered.ca:80",
      "turn:global.relay.metered.ca:80?transport=tcp",
      "turn:global.relay.metered.ca:443",
      "turns:global.relay.metered.ca:443?transport=tcp"
    ],
    username: "f72a72a378c1c1724ddf0c9c",
    credential: "lGORUsB3imVfLDKS"
  }
];
