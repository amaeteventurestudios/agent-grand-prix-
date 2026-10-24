// The Proving Ground's engine: seed-matched races. A trial runs the same races (same circuit,
// seeds, weather, rivals and calls) twice, once with each Driver DNA, and compares what the two
// drivers actually did. Pure and DOM-free: runs in a Web Worker, in Node tests, or on a server.
import { setupRace, DEFAULT_TEAM } from './game.js';
import { lockForRace, defaultProfile } from './dna.js';
import { hashString } from './rng.js';

// one race; returns per-car measurements for your two cars
export function runRace({ venue, seed, dna, laps, weather = 'simulated', auto = true, team = DEFAULT_TEAM }) {
  const s = setupRace({ venue, seed, team, auto, dna: dna ? lockForRace(dna) : null, laps, weather });
  const R = s.make(); R.start();
  let guard = 0;
  while (!R.done && guard++ < 500000) R.step();
  const out = {};
  for (const [slot, id] of [['car1', 'you-0'], ['car2', 'you-1']]) out[slot] = carMetrics(R, id);
  return { laps: R.laps, winner: R.result[0].car.code, cars: out };
}

// what one car did in a finished race (also read by the Strategist after a real race)
export function carMetrics(R, id) {
  const c = R.byId.get(id), res = R.result.find((x) => x.car.id === id);
  const made = R.events.filter((e) => e.type === 'pass' && e.car === id).length;
  const lost = R.events.filter((e) => e.type === 'pass' && e.other === id).length;
  return {
    pos: res.pos, grid: c.grid, laps: res.laps, time: c.dnf || res.laps < R.laps ? null : +(res.time + (c.penalty || 0)).toFixed(2), best: Number.isFinite(c.best) ? c.best : null, dnf: c.dnf,
    gained: c.grid - res.pos, passes: made, lost, attempts: c.tele.att, contacts: c.tele.contacts,
    lockups: c.tele.lockups, wides: c.tele.wides, spins: c.tele.spins, mistakes: c.tele.mistakes, stops: c.stops,
    wearPerLap: +(c.tele.wearSum / Math.max(1, c.tele.dist / R.track.L)).toFixed(4),
    wear: +(c.used.length ? c.tyre.wear : 0).toFixed(3), wet: !!(R.weather.wet0 || R.weather.showers.length),
    events: R.events.filter((e) => (e.car === id || e.other === id) && (e.type === 'dna' || e.type === 'pass' || e.type === 'incident' || e.type === 'pit')).slice(0, 40)
      .map((e) => ({ t: +e.t.toFixed(1), type: e.type, text: e.text, keys: e.keys || null })),
  };
}

// a matched A/B trial over n seeds: baseline profiles A against candidate profiles B
export function* trial({ venue, seeds, a, b, laps, weather }) {
  for (const seed of seeds) yield { seed, a: runRace({ venue, seed, dna: a, laps, weather }), b: runRace({ venue, seed, dna: b, laps, weather }) };
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// summary for one car slot across paired runs: counts are from the races, nothing is estimated
export function summarize(pairs, slot) {
  const A = pairs.map((p) => p.a.cars[slot]), B = pairs.map((p) => p.b.cars[slot]);
  const laps = pairs.filter((p) => p.a.cars[slot].best && p.b.cars[slot].best);
  const metric = (f) => ({ a: mean(A.map(f)), b: mean(B.map(f)) });
  return {
    n: pairs.length,
    better: pairs.filter((p) => p.b.cars[slot].pos < p.a.cars[slot].pos).length,
    worse: pairs.filter((p) => p.b.cars[slot].pos > p.a.cars[slot].pos).length,
    // race times are not compared: a safety car in one run and not the other swamps them. Best laps are.
    lapDelta: median(laps.map((p) => p.b.cars[slot].best - p.a.cars[slot].best)), timed: laps.length,
    pos: metric((c) => c.pos), gained: metric((c) => c.gained), passes: metric((c) => c.passes), lost: metric((c) => c.lost),
    attempts: metric((c) => c.attempts), contacts: metric((c) => c.contacts), lockups: metric((c) => c.lockups),
    wides: metric((c) => c.wides), spins: metric((c) => c.spins), mistakes: metric((c) => c.mistakes), wearPerLap: metric((c) => c.wearPerLap), stops: metric((c) => c.stops), wear: metric((c) => c.wear),
    dnf: { a: A.filter((c) => c.dnf).length, b: B.filter((c) => c.dnf).length },
  };
}
export const balancedPair = () => ({ car1: defaultProfile('car1'), car2: defaultProfile('car2') });

// the seeds a trial uses: fixed per circuit (so a test can be repeated exactly), filtered by the
// weather the seeded forecast gives: 'any', 'dry' or 'wet'. Returns fewer when it rarely rains.
export function pickSeeds(venue, n, weather = 'any', scan = 400) {
  const out = [];
  for (let k = 1; out.length < n && k <= scan; k++) {
    const seed = hashString(`proving-${venue.id}-${k}`) >>> 0;
    if (weather !== 'any') {
      const W = setupRace({ venue, seed, team: DEFAULT_TEAM }).weather, wet = W.wet0 > 0.17 || W.showers.length > 0;
      if ((weather === 'wet') !== wet) continue;
    }
    out.push(seed);
  }
  return out;
}

// plain-words verdict; races are noisy, so small margins are called too close
export function verdict(sum) {
  const m = sum.better - sum.worse, need = Math.max(2, Math.ceil(sum.n * 0.25));
  if (sum.n < 4) return { id: 'few', text: 'Too few races to tell' };
  if (m >= need) return { id: 'better', text: 'Your changes look better' };
  if (-m >= need) return { id: 'worse', text: 'Your changes look worse' };
  return { id: 'close', text: 'Too close to call' };
}
