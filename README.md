# Agent Grand Prix

A free browser racing game. Your two AI drivers race; you are the team principal and make the calls:
tyres, pit stops, battery, attack or defend, and the rain call. Static site, Three.js r160 vendored, no build step.

- **Daily Grand Prix**: one race a day, same circuit, grid and weather for everyone (seeded by date; #1 = 23 Oct 2026, Abuja). Share card.
- **Season**: 25 rounds, Abuja to Abu Dhabi, saved in the browser.
- **Quick race**: any venue, Short, Medium or Long (`LENGTHS` in `js/game.js`); Sakhir and Singapore are the featured picks, and Race again repeats the last one.

**Racing Academy** (`js/academy.js`, wired up in `js/main.js`): five short lessons on a real race. Each step is taught by the
engineer (voiced in every engineer voice: `assets/voice/<voice>-academy.js`, made with `LINES=academy art/voice/gen.py`), points at
the control and moves on when you do it, through the same `cmd()` path as buttons and the team radio. No AI model: same actions, same
lesson. Lessons run on a staged race (`stage` in `setupRace`: start positions, weather, no failures, a safety car on cue). Progress is
saved as `S.academy`; all five give the Academy graduate trophy. The lessons: Meet your team, Command your drivers (attack, defend,
team orders), Master the circuit (Driver DNA, lent for the lesson), Strategy (tyre rule, a safety car on cue, rain) and Your first
Grand Prix (a full race with the coach on, starting on the engineer's plan). A race that ends mid-lesson offers a rerun. The Race guide
(ten ways to win) lives in the Academy. Free practice (`freePractice()`) is a medium race at Sakhir that counts for nothing.

**Phone race control** (upright phones and tablets, `PHONE_UP` in `js/main.js`): the race fills the screen with your two cars as
cards on top (tap to give a car calls, tap again for its Strategy panel), BOOST, RADIO and BOX in one row, and Strategy, Timing and Radio
in a panel that swipes up from the tab bar (`app.dataset.sheet`: peek, half, full). A lesson opens the panel when it points at a control
in it and closes it again after. The engineer's suggestions show as a card with the call on a button, and every call gets a short
"copied" chip.

**Race coach and beginner assist**: the coach card folds into a small pill (`S.settings.coachMin`). *Engineer calls the stops* on the
pit wall (`S.settings.assist`, the `assist` command in `js/sim.js`) lets the engineer box both cars while you keep pace, battery and battles.

**First visit** (`onboard()` in `js/main.js`): a welcome card offers three ways in: *Racing Academy*, *Jump into a race* (a short guided race at Sakhir with the
default team) and *Free practice*, plus *Build my team first*. Anyone who has raced or done a lesson skips it. Building a team is six screens, one decision each: team name and code, car, colours (the showroom in its `wizard` mode),
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

**Voice team radio** (`js/teamradio.js`, the radio block in `js/main.js`): hold the mic button (or T) and talk. `parseCall()` matches
what the browser's speech recognition heard to the same calls the buttons make, in JavaScript, with no server or AI call (well under
a millisecond). It handles names ("Nova, push", "both cars harvest"), team orders ("let Echo through"), questions ("Echo, why are you
losing time?", "Strategist, what's our best option?" then "do it"), timed calls ("save the tyres for two laps, then push"), conditional
ones ("charge the battery until we're closer"), and asks back on calls that fight ("push and save"), never guessing. Drivers answer in
their own voices from the car's real state and push back once on a call that looks wrong (boxing on fresh tyres, pushing on worn ones,
boost on an empty battery); say it again and they do it. The same call for the same car inside 2 s is dropped. A call can land while you
are still talking: a partial transcript that holds still for 350 ms is acted on. `?radiostats` shows each step's time (mic open, first
words, call understood, done). Test hook: `__agp.radio(text)`. Firefox has no speech recognition, so the button is hidden there.

Phrases the matcher can't place go to the optional interpreter, `server/radio.mjs` (127.0.0.1:8140 behind Caddy at `/api/radio/*`). It
asks Jev (TypeSafe's classifier) three typed questions (call, car, tyre) and returns calls only when it is at least 70% sure, otherwise a
question back. It stays off until the `TYPESAFE_API_KEY` secret is set (key from console.typesafe.ai/keys); the key never reaches the
browser. `tools/jev-bench.mjs` (Actions: *Jev benchmark*) compares Jev with the matcher on the same phrases.

Run: `python3 -m http.server` in this folder. Test hooks: `window.__agp.start(kind, venueId)`, `ff(sec)`, `cam(mode)`, `info()`, `crew(up, big)`, `engineer(carId, kind)`, `pre(o, step)`. Tests: `node tools/test/<name>.test.mjs` (academy, baseline, cars, coach, dna, dna-effects, resume, radio, interp).

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

**SEO and sharing**: `index.html` carries the title, description, canonical URL, Open Graph and X card tags and JSON-LD (`WebSite`, `VideoGame`) in the static HTML. Images in `assets/brand/`: `og-image.jpg` (1200×630 share preview), `agent-grand-prix-thumbnail.jpg` (full 16:9 promo image), icons. `robots.txt`, `sitemap.xml` (update `lastmod` when the page really changes), `llms.txt` (keep it to features that exist) and `site.webmanifest` sit at the root and are copied by `tools/build-site.sh`.

## Server

The deploy builds the site with `tools/build-site.sh`, which minifies the game's own code into `dist/` (three.js and assets are copied as they are). Players get the squashed code; this repo keeps the readable one.

The server can host other sites too. One shared Caddy (`caddy` service) loads every file in `/etc/caddy/sites/*.caddy`; this game writes `agent-grand-prix.caddy`. Another project adds its own file (its domains and its folder) and runs `sudo systemctl reload caddy`. HTTPS certificates come by themselves for every domain pointed at the server. Only one site can answer on the bare IP address (`:80`), and this game does. Its domains come from `SITE_DOMAIN` (default `agentgrandprix.com www.agentgrandprix.com`): the first name serves the game, the others redirect to it.

`.github/workflows/deploy.yml` puts the website and the WhatsApp agent on one server (Oracle Cloud,
Ubuntu) on every push to main, or by hand from the Actions tab (Deploy to server > Run workflow).
`server/install.sh` runs there: Caddy serves the site from `/var/www/agent-grand-prix` (with HTTPS by
itself once the `SITE_DOMAIN` variable names a domain pointed at the server, otherwise plain
`http://<IP>`), and the agent runs as the `agent-grand-prix` service once its key is set. The secrets
and the one Oracle console step (open ports 80 and 443) are listed at the top of the workflow.
