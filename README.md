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
in it and closes it again after. Every call gets a short "copied" chip.

**Who's in charge** (`Race.may()` in `js/sim.js`): every command carries who made it (`principal`, `engineer`, `strategist`), and the
engine refuses what that caller may not do. In Team Principal mode only you command your cars: the strategist never pits, paces,
deploys, attacks or swaps them, and the engineer shows facts only (a *Race info* card with the plain reading, the event's `fact`) and
gives a view when you tap *Ask the engineer* (card or pit wall); its call still goes through your own command path. Beginner assist
lets the engineer make pit calls and nothing else. In Autonomous mode the strategist runs the car. Switching modes is yours alone; on a
handover your queued calls ("in two laps", a boost) are dropped, a box call already made stays and the pit wall says whose it is
(`car.pitBy`), and a strategist call never replaces one of yours. Replays record the caller. Tests: `tools/test/authority.test.mjs`.
In Team Principal mode the engineer is also off the radio (`engineerQuiet()` in `js/main.js`): no lap updates, plan or coach lines in
its voice; race information goes to the radio log as *Pit wall* text. It speaks when you ask (Ask the engineer, "strategist, …"), for a
car in Autonomous mode, for its own stop calls in beginner assist, and in Academy lessons. Your drivers always answer you.

**Driver brains** (`js/brain.js`, rules version): Nova and Echo each have a brain whose manner comes from their Driver DNA (fiery,
cool or even). Ask on the radio ("Nova, how are the tyres?", "can you pass him?", "what do you think?", "what are my orders?",
"good job") or with the *Talk to* buttons on the pit wall. A driver reads the race only from the engine (`read()`), remembers your last
calls and its own worries, recommends a call (an offer you accept with "do it" or the card's button, through your own command path),
says once when a call you made worries it (and obeys), and calls you when the tyres are finished or it's raining on slicks. A brain
never commands the car. Lines are recorded per driver voice: `node tools/brain-lines.mjs`, then `LINES=brain python3 art/voice/gen.py …`
writes `assets/voice/<voice>-brain.js`. Tests: `tools/test/brain.test.mjs` (every number said comes from the engine).

**Pre-race briefing** (`js/briefing.js`, run in `js/briefing.worker.js`): before a quick, daily or season race the engineer offers
Plan A and Plan B for each driver (start tyre and stops). The real engine races the same grid and forecast several times in the
background with different race dice, your cars following each plan, and the briefing shows the projected finish, the range and how often
each plan finished ahead; the better one is picked unless you chose. *Accept plan* sends the stops into the race (`setupRace({ stops })`,
`car.plan`, then `car.stopsLeft`), so the pit wall, the BOX button and the engineer's radio follow it. *Customize* picks your own start
tyres instead, and the tyre guide sits behind *Learn about tyres*. Tests: `tools/test/briefing.test.mjs`.

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

**Driver Evolution** (`js/career.js`): your drivers get better through experience, never through a hidden bonus. Every race that counts
(not Academy or practice) is added to each driver's career from the race engine's own numbers: laps, finishes, retirements, wins,
podiums, overtakes made and lost, lock-ups, contacts, spins, pit stops, wet races, clean races, circuits seen and a best lap. Experience
(`XP`) is weighted so finishing and hard conditions teach more than where you finished, and it earns five ranks: Rookie, Racer,
Contender, Veteran, Master. A rank does nothing to the car; it only widens what a driver may be taught. The Team Strategist's career
lessons (`lessonFor()`) read the whole record rather than one bad afternoon: a pattern of lock-ups over several races earns "braking
later costs more than it gains", a career of being overtaken earns "holding a place under pressure". Each lesson is offered once, is
gated by rank and a number of races, moves one Driver DNA slider inside the same bounds everyone races under, and is only marked learned
when you approve it, so a lesson you reject can come back. The results sheet shows what each race taught (`.xp` rows, tap one for the
driver), and a driver's career page has the record, the rank, what it is good at (`strengths()`), what it has learned and what is still
ahead. Tests: `tools/test/career.test.mjs`.

Run: `python3 -m http.server` in this folder. Test hooks: `window.__agp.start(kind, venueId)`, `ff(sec)`, `cam(mode)`, `info()`, `crew(up, big)`, `engineer(carId, kind)`, `pre(o, step)`. Tests: `node tools/test/<name>.test.mjs` (academy, baseline, cars, career, coach, dna, dna-effects, resume, radio, interp, report, agent, accounts).

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

## Accounts (Novenique Core)

The game works with no account: everything is saved in the browser. When the accounts service is
running, the same save is also kept on the server under whoever you are, so signing in on another
device brings your team with you.

- `server/accounts.mjs` runs on 127.0.0.1:8141 behind Caddy at `/api/me/*` and
  `/auth/novenique/*`. Everyone starts as a guest (no sign-up before a first race); signing in
  attaches that guest to a Novenique account, or merges it into one that already exists.
- It needs `NOVENIQUE_URL` (a repository variable in Actions > Variables) and the client id and
  secret, which Novenique Core writes on the server at `/etc/novenique/clients/agp.env`. With
  either missing the service still runs and answers `{ "accounts": false }`, and the game stays
  on this-device saves. No key is ever sent from GitHub.
- Saves live in `/var/lib/agp-accounts/<user id>.json`. Identity stays with Novenique; this
  service only holds the game's own save.

## Leaderboards (the Daily, checked rather than trusted)

Everyone races the same Daily Grand Prix, so the day's results can be ranked. The game never tells
the server where it finished: it sends the race it ran — the setup and every call, with the engine
step each was made on, the same record that lets a race survive a refresh. The server rebuilds that
race with the game's own engine and reads the finish from its own run, so a made-up result cannot be
submitted and a tampered Driver DNA is put back inside the bounds everyone races under.

- `server/leaders.mjs` runs on 127.0.0.1:8142 behind Caddy at `/api/board/*`, saving one small file
  a day in `/var/lib/agp-board`. `js/board.js` is the browser side; the board opens from the home
  page and from a race result.
- People and agents are ranked apart: a Daily your agent raced while you were away (`js/agent.js`)
  stands on the agents' board, never against people on the radio. Its race is recorded the same way
  and checked the same way.
- Your first scored run of the day is the one that counts, the same rule the game already keeps. A
  board shows team names and driver codes, never account names.
- Who you are comes from the session cookie the accounts service sets, so the board needs no key of
  its own; with the service off the game simply doesn't show a board. Tests:
  `tools/test/board.test.mjs`.

## Live Grand Prix (ten teams on one grid)

A race starts every five minutes for up to ten teams of people. Every browser runs the whole race
itself, with the same engine, circuit, seed and the same twenty cars; the room service only agrees on
who is in the race and which engine step each call lands on.

- `server/live.mjs` runs on 127.0.0.1:8143 behind Caddy at `/api/live/*`. A person takes a seat with
  their team, car and Driver DNA; seat k races in team slot k (the nine series teams, then the tenth
  box), so every browser builds the same grid (`seatRoster()` in `js/game.js`). Empty seats keep their
  series team, raced by the engine, and every person's cars race with the same driver traits.
- Your calls go to the room, which gives each one a step one second ahead of its clock and sends it to
  everyone, you included (`js/live.js`, `liveCatchUp()` in `js/main.js`). The race runs on the room's
  clock and catches up after a slow frame; a call that arrives late makes the browser build the race
  again from the start with every call, in a blink. Your seat's cars are `you-0` and `you-1` in your
  browser only, after qualifying, so the rest of the page works as it does for any race.
- Rooms live in memory: a room is one race, kept half an hour for a refresh. Tests:
  `tools/test/live.test.mjs` (every browser runs the identical race whichever seat is "you").

**Sessions before Novenique Core is connected.** The session cookie is signed with this server's own
key (`/etc/agp-session.env`, made once by `server/install.sh`), so the leaderboard and live races know
who a player is even with Core off: a player is then a guest of this game alone, with the save still
kept on the server, and there is nothing to sign in to. Core is reached at `127.0.0.1:8200` on the
same server; its public address (`NOVENIQUE_URL`, default `https://accounts.129-146-26-28.sslip.io`)
is only for the browser's sign-in redirects. Tests: `tools/test/sessions.test.mjs`.
