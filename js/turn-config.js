/* ============================================================
   Optional dedicated TURN relay for the multiplayer Beer Game.

   The game ships with free public STUN/TURN servers, which work
   for most rooms but come and go without notice. For reliable
   workshops, create a free account at https://www.metered.ca/
   (the free tier is ample for game traffic; lock the API key to
   your domain), then fill in the credentials below. They are
   tried BEFORE the public relays.

   Example:
   window.TURN_SERVERS = [
     {
       urls: [
         "turn:a.relay.metered.ca:80",
         "turn:a.relay.metered.ca:443",
         "turn:a.relay.metered.ca:443?transport=tcp"
       ],
       username: "YOUR_METERED_USERNAME",
       credential: "YOUR_METERED_CREDENTIAL"
     }
   ];

   Leave the array empty to use only the built-in public servers.

   Deploying via GitHub Pages? You don't need to edit this file:
   set repository secrets TURN_URL (comma-separated urls ok),
   TURN_USERNAME, and TURN_CREDENTIAL, switch Settings → Pages →
   Source to "GitHub Actions", and .github/workflows/pages.yml
   injects them here at deploy time — keeping credentials out of
   git history so they can be rotated by updating the secrets.
   ============================================================ */

window.TURN_SERVERS = [];
