# Driver DNA

How each of your two drivers drives: how late they brake, how hard they attack, how they treat
tyres and the rain. You tune it in the Driver DNA Studio, test it in the Proving Ground, and the
Team Strategist suggests changes after each race. Nothing changes without your approval.

## What was built

| Phase | What | Where |
|---|---|---|
| 0 Baseline | 10 seeded race fingerprints (finishing order, times, every event count) taken before any DNA code. A Balanced DNA must reproduce them exactly. | `tools/baseline.mjs`, `tools/baseline.json` |
| 1 Schema | 17 settings (0 to 100, 50 = balanced) in 6 groups, 8 Quick dials, 9 original presets, blending, validation, versioned storage with history and a change log. | `js/dna.js`, `js/dnastore.js` |
| 2 Engine | Each setting maps to a bounded change in a real mechanism of the race engine, and every gain has a cost. A separate random stream for DNA risks, so other dice never shift. Qualifying uses DNA too (one-lap pace against the risk of a spoiled lap). | `js/sim.js`, `js/track.js` (`driverPlan`), `simInputs()` in `js/dna.js` |
| 3 Studio | Car 1 / Car 2 tabs, presets and blends, Quick (8 dials) and Advanced (all 17, grouped), the DNA shape against Balanced, plain-words trade-offs, drafts you save as versions, undo, restore, export and import. Open from home, the pre-race screen and the pause menu. During a race the race keeps the DNA it started with. | `js/studio.js` |
| 4 Proving Ground | The same races run twice (same circuit, seeds, weather, rivals), once with each version; 6, 12 or 24 races; any, dry or wet weather; compare with the saved version or Balanced. Runs in a Web Worker. Shows how often the change finished ahead or behind, the median best-lap change and 12 counts (passes, lock-ups, trips wide, contacts, tyre wear...). | `js/proving.js`, `js/proving.worker.js` |
| 5 Strategist | After each race the rule-based Team Strategist reads each driver's numbers and may suggest one change per car, with the evidence, the exact change, what it gains and costs. Approve, Test it first (opens the Proving Ground with the change loaded) or Not now. Approved changes are new versions, logged as "Strategist". An AI strategist slot is ready for later. | `js/coach.js`, `js/strategist.js` |
| 6 Radio and roll-out | Lock-ups, trips wide and spins come over the radio with the settings behind them, and are spoken (new clips in all 13 voices); the engineer says when the Strategist has notes. | `js/main.js`, `art/voice/lines.json` |

## The 17 settings

Braking and corners: late braking, entry vs exit, corner commitment, kerb use, throttle aggression.
Overtaking and defending: overtaking eagerness, gap acceptance, slipstream patience, defending, side-by-side caution.
Tyres and energy: tyre care, battery use. Weather: wet confidence, tyre-change timing.
Judgement: consistency. Team play: team-order compliance, teammate cooperation.

The original brief listed about 30 settings. The other 13 had no mechanism in the race engine to
act on, so they were left out rather than shown as dials that do nothing.

## Balance

Every preset was raced against Balanced on Abuja, Monaco and the Ardennes with matched seeds
(48 to 96 races per preset). All nine finish within about one place of Balanced on average, which
is inside the noise for that many races, and each one finishes ahead in some races and behind in
others (the Attacker, for example: ahead 49 times, behind 45). Lock-up and running-wide odds grow
with the square of the setting, so a moderate style is cheap and an extreme one is not. Maxing
every setting makes a driver slower, not faster (checked in `dna-effects.test.mjs`).

## Tests

Run from the repo root:

- `node tools/test/baseline.test.mjs`: the 10 baseline races still match, and a seed repeats exactly.
- `node tools/test/dna.test.mjs`: schema, presets, blends, Quick dials, validation, storage, engine bounds.
- `node tools/test/dna-effects.test.mjs` (about a minute): each setting changes what it says, and maxing everything is not a free win.
- `node tools/test/coach.test.mjs`: Strategist rules, evidence, approval, out-of-date suggestions, same race gives the same advice.

## Rollback

- `?dna=off` in the address bar races with the engine's own driving (no DNA, no Strategist), exactly as before Driver DNA.
- In the game: Driver DNA, History, Restore any earlier version (the last 30 are kept per car).
- In the code: every phase is its own commit on the branch; reverting the Driver DNA commits restores the old game. Saved DNA lives under `dna` in the `agp.v1` localStorage entry and is ignored by older code.

## Ready for later (not built)

- Server storage: profiles, history and the log are plain JSON shaped for a server; `validate()` checks anything coming in.
- AI strategist: `STRATEGISTS.llm` in `js/coach.js`. It must run on a server that holds the OpenRouter key (never in the page), return proposals in the same shape, and pass `checkProposal()` and your approval.
- Real weather: `WEATHER_SOURCES` in `js/weather.js`; a live source turns a forecast into the same seeded timeline at race start.
- Not in scope: ranked multiplayer, payments, subscriptions, server infrastructure.
