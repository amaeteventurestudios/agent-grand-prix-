// Skipping qualifying: your cars set no lap and start from P12 to P20, never in the top ten, and the
// grid is the same every time, so a leaderboard that replays the race rebuilds it exactly.
// Run: node tools/test/quali-skip.test.mjs
import assert from 'node:assert/strict';
import { VENUES } from '../../js/data.js';
import { setupRace, DEFAULT_TEAM } from '../../js/game.js';

const skip = { 'you-0': { skip: true }, 'you-1': { skip: true } };
const seen = new Set();
for (let s = 1; s <= 200; s++) {
  const v = VENUES[s % VENUES.length], seed = s * 7919;
  const ids = setupRace({ venue: v, seed, team: DEFAULT_TEAM, quali: skip }).grid.map((e) => e.id);
  for (const id of ['you-0', 'you-1']) { const p = ids.indexOf(id) + 1; seen.add(p); assert.ok(p >= 12 && p <= 20, `${id} P${p} at seed ${seed}`); }
  assert.deepEqual(setupRace({ venue: v, seed, team: DEFAULT_TEAM, quali: JSON.parse(JSON.stringify(skip)) }).grid.map((e) => e.id), ids);
  // skip only counts for your own cars
  const other = setupRace({ venue: v, seed, team: DEFAULT_TEAM }).grid.map((e) => e.id);
  const rival = other.find((id) => !id.startsWith('you-'));
  assert.deepEqual(setupRace({ venue: v, seed, team: DEFAULT_TEAM, quali: { [rival]: { skip: true } } }).grid.map((e) => e.id), other);
}
assert.ok(seen.size >= 6, 'skipped cars spread across P12 to P20');
console.log('quali skip ok: always P12 to P20, same grid every time');
