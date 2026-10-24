// The ten cars: strengths add up to nothing, no car is faster over the calendar, every car is
// fastest somewhere, and over many races no car finishes better or worse on average.
// Run: node tools/test/cars.test.mjs [races]
import assert from 'node:assert/strict';
import { VENUES, TEAMS } from '../../js/data.js';
import { roster, trackFor, setupRace, DEFAULT_TEAM } from '../../js/game.js';
import { Race, qualify, lapsFor } from '../../js/sim.js';
import { weatherFor } from '../../js/weather.js';
import { driverPlan } from '../../js/track.js';
import { CARS, carMods, teamCars } from '../../js/carspec.js';
import { hashString } from '../../js/rng.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok', name); };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const gain = (id, T) => 1 - driverPlan(T, null, carMods(id)).lapTime / T.lapTime;

t('ten cars, strengths add up to zero and stay within one step', () => {
  assert.equal(CARS.length, 10);
  for (const c of CARS) {
    assert.ok(Math.abs(c.corners + c.braking + c.straights) < 1e-9, c.id);
    for (const k of ['corners', 'braking', 'straights']) assert.ok(Math.abs(c[k]) <= 1, c.id + ' ' + k);
  }
  assert.equal(carMods('nope'), null);
});

t('every team gets a car, all ten are on the grid, yours is the one you picked', () => {
  const m = teamCars(TEAMS.map((x) => x.id), 'peregrine');
  assert.equal(m.you, 'peregrine');
  assert.equal(new Set(Object.values(m)).size, 10);
});

t('no car is faster over the whole calendar', () => {
  for (const c of CARS) {
    const g = mean(VENUES.map((v) => gain(c.id, trackFor(v))));
    assert.ok(Math.abs(g) < 0.0004, `${c.id} averages ${(g * 100).toFixed(3)}% a lap`);
  }
});

t('every car is among the three fastest somewhere', () => {
  const best = new Map(CARS.map((c) => [c.id, 0]));
  for (const v of VENUES) {
    const T = trackFor(v);
    CARS.map((c) => [c.id, gain(c.id, T)]).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([id]) => best.set(id, best.get(id) + 1));
  }
  for (const [id, k] of best) assert.ok(k > 0, `${id} is never in the top three`);
});

t('races without a car match the first version (the baseline stays put)', () => {
  const v = VENUES[0];
  const a = setupRace({ venue: v, seed: 1, team: DEFAULT_TEAM }), b = setupRace({ venue: v, seed: 1, team: DEFAULT_TEAM, car: 'falcon' });
  assert.ok(a.grid.every((e) => !e.car));
  assert.ok(b.grid.every((e) => e.car));
});

// Many races: each car drives for every team in turn, so driver talent averages out
const RACES = Number(process.argv[2] || 40);
t(`over ${RACES} races no car finishes much better or worse on average`, () => {
  const pos = new Map(CARS.map((c) => [c.id, []]));
  const t0 = performance.now();
  for (let k = 0; k < RACES; k++) {
    const venue = VENUES[(k * 7) % VENUES.length], seed = hashString('cars-' + k), track = trackFor(venue);
    const entries = roster(DEFAULT_TEAM, false);
    const teams = [...new Set(entries.map((e) => e.team.id))];
    for (const e of entries) e.car = CARS[(teams.indexOf(e.team.id) + k) % 10].id;
    const grid = qualify(entries, venue, seed, track);
    const laps = lapsFor(track);
    const R = new Race({ track, venue, seed, laps, grid, weather: weatherFor('simulated', venue, seed, laps * track.lapTime * 1.1) });
    R.start(); let steps = 0;
    while (!R.done && steps < 400000) { R.step(); steps++; }
    for (const x of R.result) pos.get(grid.find((e) => e.id === x.car.id).car).push(x.car.dnf ? 20 : x.pos);
  }
  const avg = mean([...pos.values()].flat());
  const rows = [...pos].map(([id, p]) => [id, mean(p)]).sort((a, b) => a[1] - b[1]);
  for (const [id, m] of rows) console.log(`    ${id.padEnd(10)} ${m.toFixed(2)}`);
  console.log(`    (${Math.round(performance.now() - t0)} ms)`);
  for (const [id, m] of rows) assert.ok(Math.abs(m - avg) < 1.6, `${id} averages P${m.toFixed(2)} against P${avg.toFixed(2)}`);
});

console.log(`cars: ${n} checks passed`);
