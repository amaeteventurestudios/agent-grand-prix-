// The pre-race briefing: Plan A and Plan B for each of your drivers, and what the real engine says
// they're worth. A plan is { start, stops: [{ lap, tyre }] }. project() races the same grid and the
// same forecast again and again with different race dice (incidents, rivals' calls), with your two
// cars driven by their plans (and by the obvious calls: inters when it rains on slicks, slicks when it
// dries, a stop when a tyre is finished), and reports where each plan finished.
// Pure and DOM-free: runs in a Web Worker (briefing.worker.js), in Node tests, or on a server.
import { Race, LIFE, tyreLife } from './sim.js';
import { COMPOUNDS } from './data.js';
import { setupRace } from './game.js';
import { hashString } from './rng.js';

const isDry = (c) => 'SMH'.includes(c);
const clampI = (x, a, b) => Math.max(a, Math.min(b, Math.round(x)));

// two plans per car, A first: A is the engineer's choice for that car, B the honest alternative
export function plans({ laps, wear = 1, wet0 = 0, showers = 0 }) {
  const life = (c) => LIFE[c] * tyreLife(laps) / wear;
  if (wet0 > 0.17) {
    const c = wet0 > 0.7 ? 'W' : 'I';
    const one = { start: c, stops: [], note: `Start on ${COMPOUNDS[c].name}s, box for slicks once the track dries` };
    const other = { start: c === 'W' ? 'I' : 'W', stops: [], note: c === 'W' ? 'Gamble on Inters for the drying track' : 'Full Wets for safety in the spray' };
    return { 'you-0': [one, other], 'you-1': [{ ...one }, { ...other }] };
  }
  const next = (from, at) => { const rem = laps - at; let n = rem <= life('S') * 0.85 ? 'S' : rem <= life('M') * 0.85 ? 'M' : 'H'; if (n === from) n = from === 'S' ? 'M' : from === 'M' ? 'H' : 'M'; return n; };
  const one = (start, frac) => { const lap = clampI(Math.min(life(start) * 0.8, laps * frac), 2, laps - 2); return { start, stops: [{ lap, tyre: next(start, lap) }] }; };
  const two = (start) => { const a = clampI(Math.min(life(start) * 0.75, laps / 3), 2, laps - 4), b = clampI(a + (laps - a) / 2, a + 2, laps - 2); return { start, stops: [{ lap: a, tyre: 'M' === start ? 'S' : 'M' }, { lap: b, tyre: 'S' }] }; };
  const needTwo = life('M') + life('H') < laps * 1.05;
  const A0 = one('M', 0.55), A1 = needTwo ? two('S') : one('S', 0.42);
  const B0 = one('H', 0.6), B1 = one('M', 0.5);
  for (const p of [A0, A1, B0, B1]) p.note = describe(p) + (showers && isDry(p.start) ? '. Inters if the rain comes' : '');
  return { 'you-0': [A0, B0], 'you-1': [A1, B1] };
}
export function describe(p) {
  if (!p.stops.length) return `${COMPOUNDS[p.start].name}s, then slicks when it dries`;
  return [COMPOUNDS[p.start].name + 's', ...p.stops.map((s) => `${COMPOUNDS[s.tyre].name}s (lap ${s.lap + 1})`)].join(' → ');
}

// one race with your two cars following plans a (car 1) and b (car 2); returns their finishing places
export function raceWith(setup, seed, a, b) {
  const grid = setup.grid.map((e) => (e.id === 'you-0' ? { ...e, startCompound: a.start, auto: false } : e.id === 'you-1' ? { ...e, startCompound: b.start, auto: false } : e));
  const R = new Race({ track: setup.track, venue: setup.venue, seed, laps: setup.laps, grid, weather: setup.weather });
  R.start();
  const follow = { 'you-0': { p: a, k: 0 }, 'you-1': { p: b, k: 0 } };
  let guard = 0;
  while (!R.done && guard++ < 400000) {
    if (R.tick % 20 === 0) for (const id of ['you-0', 'you-1']) {
      const c = R.byId.get(id), f = follow[id];
      if (c.dnf || c.finished || c.pit || c.pitReq) continue;
      const lap = Math.max(0, Math.floor(c.dist / R.track.L)), left = R.lapsLeft(c);
      // the obvious calls any principal makes, then the plan
      if (R.wet > 0.35 && isDry(c.tyre.c) && left > 1) R.command(id, { box: R.wet > 0.7 ? 'W' : 'I' });
      else if (R.wet < 0.12 && !isDry(c.tyre.c) && left > 1) { const s = f.p.stops[f.k]; R.command(id, { box: s ? s.tyre : left > 6 ? 'M' : 'S' }); if (s) f.k++; }
      else if (f.p.stops[f.k] && lap >= f.p.stops[f.k].lap && isDry(c.tyre.c)) { R.command(id, { box: f.p.stops[f.k].tyre }); f.k++; }
      else if (c.tyre.wear > 0.9 && left > 1) R.command(id, { box: c.tyre.c === 'S' ? 'M' : 'H' });
    }
    R.step();
  }
  const place = (id) => { const r = R.result.find((x) => x.car.id === id); return r.car.dnf ? null : r.pos; };
  return { 'you-0': place('you-0'), 'you-1': place('you-1') };
}

// the seeds for the projection: same grid and forecast, different dice
export const seedsFor = (seed, n) => Array.from({ length: n }, (_, k) => hashString(`brief-${seed}-${k}`) >>> 0);

// races A/A and B/B on each seed; yields running totals so the briefing can show them as they land
export function* project(args, P, n = 4) {
  const setup = setupRace(args);
  setup.venue = args.venue;
  const out = { 'you-0': [[], []], 'you-1': [[], []] };
  let i = 0;
  for (const seed of seedsFor(args.seed, n)) {
    for (const k of [0, 1]) {
      const r = raceWith(setup, seed, P['you-0'][k], P['you-1'][k]);
      out['you-0'][k].push(r['you-0']); out['you-1'][k].push(r['you-1']);
      yield { i: ++i, n: n * 2, out: summary(out) };
    }
  }
}
// per car and plan: the middle finish, the range, and the chance this plan beats the other one
export function summary(out) {
  const s = {};
  for (const id of ['you-0', 'you-1']) {
    const [A, B] = out[id], stat = (xs) => { const f = xs.map((x) => x ?? 21).sort((p, q) => p - q); return { mid: f.length ? f[Math.floor((f.length - 1) / 2)] : null, best: f[0] ?? null, worst: f[f.length - 1] ?? null, dnf: xs.filter((x) => x == null).length, n: xs.length }; };
    let win = 0, m = Math.min(A.length, B.length);
    for (let k = 0; k < m; k++) win += (A[k] ?? 21) < (B[k] ?? 21) ? 1 : (A[k] ?? 21) === (B[k] ?? 21) ? 0.5 : 0;
    s[id] = [{ ...stat(A), beats: m ? win / m : null }, { ...stat(B), beats: m ? 1 - win / m : null }];
  }
  return s;
}
