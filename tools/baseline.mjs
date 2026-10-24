// Race fingerprints for regression checks: a set of seeded races on a spread of circuits, each
// reduced to its finishing order, rounded times and a count of every kind of race event.
// node tools/baseline.mjs            prints the fingerprints
// node tools/baseline.mjs --write    saves them to tools/baseline.json (only when the engine is meant to change)
import { writeFileSync } from 'node:fs';
import { VENUES } from '../js/data.js';
import { setupRace, DEFAULT_TEAM } from '../js/game.js';

export const CASES = [
  ['abuja', 1, true], ['abuja', 2, false], ['lagos', 1, true], ['iceland', 3, true], ['monaco', 1, true],
  ['ardennes', 4, true], ['singapore', 5, false], ['kingston', 6, true], ['anchorage', 7, true], ['lasvegas', 8, false],
];

export function fingerprint([id, seed, auto], opts = {}) {
  const venue = VENUES.find((v) => v.id === id); if (!venue) throw new Error('no venue ' + id);
  const t0 = performance.now();
  const s = setupRace({ venue, seed, team: DEFAULT_TEAM, auto, ...opts });
  const R = s.make(); R.start();
  let steps = 0;
  while (!R.done && steps < 400000) { R.step(); steps++; }
  const ms = performance.now() - t0;
  const ev = {};
  for (const e of R.events) ev[e.type] = (ev[e.type] || 0) + 1;
  return {
    case: `${venue.id}#${seed}${auto ? ' auto' : ''}`,
    laps: R.laps, wet: !!(R.weather.wet0 || R.weather.showers.length),
    order: R.result.map((x) => x.car.code + (x.car.dnf ? '*' : '')).join(' '),
    time: +R.result[0].time.toFixed(3),
    you: R.result.filter((x) => x.car.team.you).map((x) => x.pos).join('/'),
    events: ev, steps, ms: Math.round(ms),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = CASES.map((c) => fingerprint(c));
  for (const f of out) console.log(f.case.padEnd(18), f.order.slice(0, 32), f.time, 'you', f.you, `${f.steps} steps ${f.ms} ms`);
  if (process.argv.includes('--write')) {
    writeFileSync(new URL('./baseline.json', import.meta.url), JSON.stringify(out.map(({ ms, ...f }) => f), null, 1) + '\n');
    console.log('wrote tools/baseline.json');
  }
}
