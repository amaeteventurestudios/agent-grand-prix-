# Agent Grand Prix

A free browser racing game. Your two AI drivers race; you are the team principal and make the calls:
tyres, pit stops, battery, attack or defend, and the rain call. Static site, Three.js r160 vendored, no build step.

- **Daily Grand Prix**: one race a day, same circuit, grid and weather for everyone (seeded by date; #1 = 23 Oct 2026, Abuja). Share card.
- **Season**: 25 rounds, Abuja to Abu Dhabi, saved in the browser.
- **Quick race**: any venue.

Files: `js/data.js` (calendar, teams), `js/track.js` (original circuit generator), `js/sim.js` (deterministic 20 Hz race engine, Node-testable),
`js/game.js` (race setup), `js/world.js` (3D world), `js/cams.js` (cameras), `js/main.js` (UI). `artifact.html` is `index.html` without the document wrapper, for the hosted preview.

Run: `python3 -m http.server` in this folder. Test hooks: `window.__agp.start(kind, venueId)`, `ff(sec)`, `cam(mode)`, `info()`.

## WhatsApp agent

`agent/whatsapp.mjs` races the same Grand Prix over WhatsApp, using the WhatsApp Agent Platform
(`https://api.whatsapp.com/agent/v1`, long-polling `GET /updates`, `POST /messages`). It needs no
packages, only Node 18 or newer.

1. In WhatsApp: Settings > Agents > Add an agent, then the agent's Chat info > API key > Copy key.
2. Run `npm start` on an always-on host with the environment variable `WHATSAPP_AGENT_TOKEN` set
   to that key. Never commit the key. Optional: `SITE_URL` (link sent after a daily race),
   `STATE_FILE` (where the poll offset and results are kept), `RACE_SPEED`.
3. Message the agent `hi`.

Commands: `today`, `race <city>`, `auto`, `take over`, `team <name>`, `results`, `circuits`; during a
race `box softs` (mediums, hards, inters, wets), `stay out`, `boost`, `harvest`, `push`, `save`,
`normal`, `attack`, `defend`, `car 2`, `status`, `stop`.

Limits from the platform: 12 outbound messages a minute (the agent keeps to 10 and merges lines),
15 polls a minute, text up to 4096 characters. Only the agent's creator can chat with it.
