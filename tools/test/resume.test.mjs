// A race survives a refresh: the same setup and the same calls on the same engine steps give the
// same race, so main.js can rebuild it from a saved list of calls (live.replay).
// Run: node tools/test/resume.test.mjs
import assert from 'node:assert/strict';
import { VENUES } from '../../js/data.js';
import { setupRace, DEFAULT_TEAM, raceLaps, trackFor } from '../../js/game.js';

const v = VENUES.find((x) => x.id === 'lagos') || VENUES[0];
const args = JSON.parse(JSON.stringify({ team: DEFAULT_TEAM, startCompounds: { 'you-0': 'S', 'you-1': 'H' }, auto: false, car: 'peregrine', laps: raceLaps(trackFor(v), 'medium') }));
const calls = [[400, 'you-0', { pace: 'push' }], [900, 'you-1', { ers: 'deploy' }], [1500, 'you-0', { box: 'M' }], [2600, 'you-1', { box: 'M' }], [3000, 'you-0', { battle: 'attack' }]];
const run = (stopAt) => {
  const R = setupRace({ venue: v, seed: 77, ...JSON.parse(JSON.stringify(args)) }).make();
  R.start(); let n = 0, k = 0;
  while (n < stopAt && !R.done) { while (k < calls.length && calls[k][0] <= n) { R.command(calls[k][1], calls[k][2]); k++; } R.step(); n++; }
  return R;
};
const snap = (R) => R.cars.map((c) => [c.id, c.dist.toFixed(4), c.tyre.c, c.pos, c.lapsDone].join(':')).join('|');
let ok = 0;
for (const n of [500, 2000, 4000]) { assert.equal(snap(run(n)), snap(run(n)), `replay to step ${n} matches`); ok++; console.log('  ok replay to step', n); }
console.log(`resume: ${ok} checks passed`);
