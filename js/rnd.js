// R&D: points earned by racing open stronger setups (js/carspec.js SETUPS). Every race counts, the
// ones your agent races for you too. Setups never add raw speed: each one only moves time from one
// part of the lap to another, so the car is still as fast as every other car over a season.
import { SETUPS, SETUP_COST, carMods } from './carspec.js';
import { driverPlan } from './track.js';

export function rndState(S) {
  S.rnd ||= { pts: 0, total: 0, open: { lowdrag: 1, downforce: 1, braking: 1 } };
  return S.rnd;
}

// points for one car's race: turning up, laps run, the result and places won
export function rndFor(m) {
  if (!m) return 0;
  const laps = Math.min(m.laps || 0, 60);
  const place = m.dnf ? 0 : Math.max(0, 21 - m.pos);
  return Math.round(10 + laps * 1.5 + place * 2 + Math.max(0, m.passes || 0) * 2);
}

// add a race's points (both cars); returns what was earned
export function earnRnd(S, metrics) {
  const R = rndState(S);
  const n = metrics.reduce((a, m) => a + rndFor(m), 0);
  R.pts += n; R.total += n;
  return n;
}

export const levelOf = (S, id) => (id === 'balanced' ? 1 : rndState(S).open[id] || 1);
export const nextCost = (S, id) => SETUP_COST[levelOf(S, id)] ?? null;   // null once at the top level

// spend R&D to open the next level of a package
export function buyLevel(S, id) {
  const R = rndState(S), cost = nextCost(S, id);
  if (cost == null || R.pts < cost) return false;
  R.pts -= cost; R.open[id] = levelOf(S, id) + 1;
  return true;
}

// lap time of a car on a track with a setup (seconds), and the engineer's pick: the quickest
// package (and level) you have open on this circuit
export const setupLap = (T, car, setup) => driverPlan(T, null, carMods(car || 'falcon', setup)).lapTime;
export function bestSetup(T, car, levels = {}) {
  let best = { id: 'balanced', level: 1 }, bt = setupLap(T, car, best);
  for (const s of SETUPS) {
    if (s.id === 'balanced') continue;
    for (let l = 1; l <= (levels[s.id] || 1); l++) {
      const set = { id: s.id, level: l }, t = setupLap(T, car, set);
      if (t < bt - 1e-6) { best = set; bt = t; }
    }
  }
  return best;
}
