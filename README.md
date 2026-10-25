# Agent Grand Prix

A free browser racing game. Your two AI drivers race; you are the team principal and make the calls:
tyres, pit stops, battery, attack or defend, and the rain call. Static site, Three.js r160 vendored, no build step.

- **Daily Grand Prix**: one race a day, same circuit, grid and weather for everyone (seeded by date; #1 = 23 Oct 2026, Abuja). Share card.
- **Season**: 25 rounds, Abuja to Abu Dhabi, saved in the browser.
- **Quick race**: any venue, Short, Medium or Long (`LENGTHS` in `js/game.js`); Sakhir and Singapore are the featured picks, and Race again repeats the last one.

**First visit** (`onboard()` in `js/main.js`): a welcome card offers *Build my team* or *Just race* (a short guided race at Sakhir with the
default team). Building a team is six screens, one decision each: team name and code, car, colours (the showroom in its `wizard` mode),
driver names, numbers (not those of AI drivers, `TAKEN_NUMS`) and driving style, engineer voice, and who makes the calls. It ends in a
short first race at Sakhir with the coach on. A half-built team is kept as `S.team.draft` and races as the default team until finished.
**Race setup** (`pre(o, step)`) is four screens: circuit (Quick race only), car, tyres (length, starting tyres, engineer's plan, tyre
guide) and race settings (calls, coach, radio voice, Driver DNA, Go to the grid).

**Race calls**: the floating BOX button (and *BOX, BOX* in the pit-wall panel) boxes the car you're running this lap; the engineer says
"Box, box" and the driver answers in his own voice (switch replies off in Radio voices). The radio voice can be changed mid-race from
the Team radio tab or the pause menu. Pit stops show jacks, wheel guns with hoses to the gantry, tyres and the lollipop, and the garage
has two screens: live timing and the race as the TV shows it.

**Refresh**: the engine is deterministic, so the page keeps the race setup and every call you made (`agp.live.v1` in localStorage) and a
refresh rebuilds the race to the same moment. This works on one device; carrying a race across devices needs the game server.

Files: `js/data.js` (calendar, teams), `js/track.js` (original circuit generator), `js/sim.js` (deterministic 20 Hz race engine, Node-testable),
`js/game.js` (race setup), `js/world.js` (3D world), `js/cams.js` (cameras), `js/main.js` (UI). `artifact.html` is `index.html` without the document wrapper, for the hosted preview.

On track both of your cars carry a ring (the one you follow is brightest). The race engineer talks to
your drivers all race (`js/main.js`, `engineer()`): every lap each car hears its position, the gap
ahead and behind and whether it's closing, plus tyres, battery, pace or laps to go; a car in a fight
hears the gap again mid-lap; every button you press is confirmed by voice. These updates only play
when the radio is quiet, so real calls always come first. Radio lines are in `art/voice/lines.json`,
recorded for all 13 voices by `art/voice/gen.py`. Your crew watches a live timing screen at the front
of your garage (`js/paddock.js`) and celebrates places gained (with a quick cut to them in Live and TV
view) or holds their helmets when one is lost; poses come from `art/people/people.py`.

Run: `python3 -m http.server` in this folder. Test hooks: `window.__agp.start(kind, venueId)`, `ff(sec)`, `cam(mode)`, `info()`, `crew(up, big)`, `engineer(carId, kind)`, `pre(o, step)`. Tests: `node tools/test/<name>.test.mjs` (baseline, cars, coach, dna, dna-effects, resume).

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

## Server

The deploy builds the site with `tools/build-site.sh`, which minifies the game's own code into `dist/` (three.js and assets are copied as they are). Players get the squashed code; this repo keeps the readable one.

`.github/workflows/deploy.yml` puts the website and the WhatsApp agent on one server (Oracle Cloud,
Ubuntu) on every push to main, or by hand from the Actions tab (Deploy to server > Run workflow).
`server/install.sh` runs there: Caddy serves the site from `/var/www/agent-grand-prix` (with HTTPS by
itself once the `SITE_DOMAIN` variable names a domain pointed at the server, otherwise plain
`http://<IP>`), and the agent runs as the `agent-grand-prix` service once its key is set. The secrets
and the one Oracle console step (open ports 80 and 443) are listed at the top of the workflow.
