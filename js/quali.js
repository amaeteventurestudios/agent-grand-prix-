// Qualifying, the way it works on a Grand Prix weekend: every car goes out for one flying lap and the
// fastest lap starts at the front. Each lap is decided by the driver (pace, a little luck and how the
// Driver DNA leans on a single lap), the car at this circuit, and the team's three calls: which tyre,
// when to go out (the track gets quicker as rubber goes down, but leave it too late and the flag
// falls before you start your lap) and how hard to push (a push lap finds time, and sometimes a
// lock-up throws the lap away).
//
// Like the race, it is deterministic: the same seed and the same calls give the same laps, so a
// leaderboard rebuilds the grid from the calls on the record. No Three.js: Node runs it too.
import { rng, clamp } from './rng.js';
import { driverPlan } from './track.js';
import { carMods } from './carspec.js';
import { qualiScores } from './sim.js';

export const Q_LEN = 360;                                   // session clock, seconds
export const Q_PUSH = ['push', 'normal', 'steady'];
export const SKIP_FROM = 12;                                // skip qualifying: start P12 or lower
const TYRE = { S: 0, M: -0.12, H: -0.26, I: -0.05, W: -0.12 };   // one lap, in driver pace points
const PUSH = { push: { gain: 0.09, risk: 0.22 }, normal: { gain: 0, risk: 0.03 }, steady: { gain: -0.05, risk: 0 } };
const OUT = 1.35, IN = 1.25;                               // out and in laps, as multiples of a lap

const wetTyre = (W) => (W.wet0 > 0.7 ? 'W' : W.wet0 > 0.17 ? 'I' : null);

// the team's calls for a car, made sane: anything missing is the agent's own call
function calls(ai, ch, wetT) {
  const c = { ...ai };
  if (ch && Number.isFinite(+ch.go)) c.go = clamp(Math.round(+ch.go), 0, Q_LEN);
  if (ch && ['S', 'M', 'H', 'I', 'W'].includes(ch.tyre)) c.tyre = ch.tyre;
  if (ch && Q_PUSH.includes(ch.push)) c.push = ch.push;
  if (!wetT && (c.tyre === 'I' || c.tyre === 'W') && !(ch && ch.tyre)) c.tyre = 'S';
  return c;
}

// every car's run: when it leaves, when its flying lap starts and ends, the lap time and sectors.
// choices: { 'you-0': { go, tyre, push } } for the cars the player calls; the rest are agents.
export function qualiPlan({ entries, venue, seed, track, weather, choices = {} }) {
  const T = track, wetT = wetTyre(weather);
  const base = qualiScores(entries, venue, seed, T);
  const runs = entries.map((e, i) => {
    // each car draws from its own stream, so one team's calls never change another car's lap
    const r = rng((seed ^ 0x9a11 ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);
    const aiGo = Math.round(r.range(0.06, 0.62) * Q_LEN), dice = r(), split = [r.range(-0.006, 0.006), r.range(-0.006, 0.006)];
    const c = calls({ go: aiGo, tyre: wetT || 'S', push: 'normal' }, choices[e.id], wetT);
    const plan = driverPlan(T, e.dna, e.car ? carMods(e.car, e.setup, T) : null);
    // out and in laps at the circuit's own pace for everyone, so only the flying lap tells cars apart
    const outLap = T.lapTime * OUT, flyStart = c.go + outLap;
    let q = base[i] + TYRE[c.tyre] + PUSH[c.push].gain + 0.05 * clamp(flyStart / Q_LEN, 0, 1);
    // the wrong tyre for the track costs far more than any call can win back
    if (wetT && (c.tyre === 'S' || c.tyre === 'M' || c.tyre === 'H')) q -= wetT === 'W' ? 0.9 : 0.55;
    if (!wetT && (c.tyre === 'I' || c.tyre === 'W')) q -= 0.4;
    const spoiled = dice < PUSH[c.push].risk;
    if (spoiled) q -= 0.2;
    const noTime = flyStart > Q_LEN;   // the chequered flag fell before the lap began
    const time = noTime ? Infinity : T.lapTime * 0.975 / (1 + 0.045 * (q - 0.8));
    const s1 = time / 3 * (1 + split[0]), s2 = time / 3 * (1 + split[1]);
    return { id: e.id, i, go: c.go, tyre: c.tyre, push: c.push, outLap, flyStart, time, flyEnd: flyStart + time, inEnd: flyStart + (noTime ? 0 : time) + T.lapTime * IN,
      sectors: noTime ? [] : [s1, s2, time - s1 - s2], spoiled: spoiled && !noTime, noTime, plan };
  });
  // a team that skips qualifying sets no lap and starts from P12 to P20, never in the top ten, so the
  // session is worth running (yourself, or by your agents). Where in that range comes from the seed.
  const skip = (e) => e.id.startsWith('you-') && choices[e.id] && choices[e.id].skip === true;
  for (const x of runs) if (skip(entries[x.i])) Object.assign(x, { time: Infinity, noTime: true, skipped: true, sectors: [] });
  const sorted = runs.slice().sort((a, b) => a.time - b.time || a.i - b.i);
  const order = sorted.filter((x) => !x.skipped), back = sorted.filter((x) => x.skipped);
  const lo = SKIP_FROM - 1, hi = Math.max(lo + 1, entries.length);
  back.map((x) => ({ x, at: lo + Math.floor(rng((seed ^ 0x5c1b ^ Math.imul(x.i + 1, 0x85ebca6b)) >>> 0)() * (hi - lo)) }))
    .sort((a, b) => a.at - b.at || a.x.i - b.x.i)
    .forEach(({ x, at }) => order.splice(Math.min(at, order.length), 0, x));
  return { runs: new Map(runs.map((x) => [x.id, x])), order: order.map((x) => entries[x.i]), wet: wetT };
}

// The session to watch: the same plan, played out on the circuit. It looks like a race to the 3D
// world (cars with a distance, a line and a speed), so the world and the cameras need nothing new.
export class QualiSession {
  constructor({ entries, venue, seed, track, weather, choices = {}, mine = [] }) {
    Object.assign(this, { entries, venue, seed, track, weather, mine, choices: { ...choices } });
    this.t = 0; this.done = false; this.started = true; this.sc = null; this.events = [];
    this.rain = 0; this.wet = weather.wet0;
    const T = track;
    this.cars = entries.map((e, i) => ({
      i, id: e.id, num: e.num, name: e.name, code: e.code, helmet: e.helmet, face: e.face, team: e.team, player: !!e.player,
      dist: 0, prevDist: 0, lat: 0, prevLat: 0, v: 0, pit: null, stopT: 0, pitReq: null, dnf: true, cleared: true,
      pos: i + 1, tyre: { c: 'S' }, status: 'garage', best: Infinity, sectors: [], said: {},
    }));
    this.byId = new Map(this.cars.map((c) => [c.id, c]));
    this.cum = new Map();
    this.replan();
    this.order = this.cars.slice();
    this.T = T;
  }
  // a call from the pit wall; only the cars you run, and only while it can still matter
  call(id, ch) {
    const run = this.plan.runs.get(id), car = this.byId.get(id); if (!run || !this.mine.includes(id)) return false;
    const cur = { go: run.go, tyre: run.tyre, push: run.push, ...(this.choices[id] || {}) };
    if ('go' in ch) { if (car.status !== 'garage') return false; cur.go = Math.max(Math.ceil(this.t), 0); }
    if ('tyre' in ch) { if (car.status !== 'garage') return false; cur.tyre = ch.tyre; }
    if ('push' in ch) { if (car.status !== 'garage' && car.status !== 'out') return false; cur.push = ch.push; }
    this.choices[id] = cur;
    this.replan();
    return true;
  }
  replan() {
    const { entries, venue, seed, track, weather, choices } = this;
    this.plan = qualiPlan({ entries, venue, seed, track, weather, choices });
    for (const c of this.cars) c.tyre = { c: this.plan.runs.get(c.id).tyre };
  }
  // time along this car's own speed profile to reach metre s of a lap (cumulative, built once per car)
  cumFor(run) {
    let a = this.cum.get(run.id);
    if (!a) { const v = run.plan.v, N = v.length; a = new Float64Array(N + 1); for (let k = 0; k < N; k++) a[k + 1] = a[k] + 1 / v[k]; this.cum.set(run.id, a); }
    return a;
  }
  // where on the lap a car is, a fraction f of the way through it in time
  at(run, f) {
    const a = this.cumFor(run), N = a.length - 1, want = clamp(f, 0, 1) * a[N];
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m] < want) lo = m; else hi = m; }
    return { s: lo + (want - a[lo]) / Math.max(a[lo + 1] - a[lo], 1e-9), v: run.plan.v[lo % (run.plan.v.length)] };
  }
  say(car, key, text) { if (car.said[key]) return; car.said[key] = true; this.events.push({ t: this.t, car: car.id, text, mine: this.mine.includes(car.id) }); }
  step(dt) {
    if (this.done) return;
    this.t = Math.min(this.t + dt, this.endT());
    const T = this.track, L = T.L;
    for (const c of this.cars) {
      const run = this.plan.runs.get(c.id);
      c.prevDist = c.dist; c.prevLat = c.lat;
      let phase, f, lapT, lapN;
      if (this.t < run.go) phase = 'garage';
      else if (this.t < run.flyStart) { phase = 'out'; f = (this.t - run.go) / run.outLap; lapT = run.outLap; lapN = 0; }
      else if (!run.noTime && this.t < run.flyEnd) { phase = 'flying'; f = (this.t - run.flyStart) / run.time; lapT = run.time; lapN = 1; }
      else if (!run.noTime && this.t < run.inEnd) { phase = 'in'; f = (this.t - run.flyEnd) / (run.inEnd - run.flyEnd); lapT = run.inEnd - run.flyEnd; lapN = 2; }
      else phase = 'done';
      const was = c.status; c.status = phase;
      c.dnf = c.cleared = phase === 'garage' || phase === 'done';
      if (phase === 'out' || phase === 'flying' || phase === 'in') {
        const p = this.at(run, f), s = lapN * L + p.s;
        if (was === 'garage' || was === undefined) { c.prevDist = s; }
        c.dist = s; c.v = p.v * run.plan.lapTime / lapT;
        const idx = Math.floor(((s % L) + L) % L);
        c.lat = T.ideal[idx] * (phase === 'flying' ? 1 : 0.4);
        if (was === 'garage') c.prevLat = c.lat;
      }
      // the timing screen: sectors as they fall, the lap when it is done
      if (phase === 'out' && was === 'garage') this.say(c, 'out', `${c.code} leaves the garage on ${({ S: 'Softs', M: 'Mediums', H: 'Hards', I: 'Inters', W: 'Wets' })[run.tyre]}.`);
      if (phase === 'flying') {
        const el = this.t - run.flyStart;
        c.sectors = run.sectors.filter((_, k) => run.sectors.slice(0, k + 1).reduce((a, b) => a + b, 0) <= el);
        this.say(c, 'fly', run.push === 'push' ? `${c.code} starts a push lap.` : `${c.code} is on a flying lap.`);
        if (run.spoiled && el > run.time * 0.45) this.say(c, 'spoil', `${c.code} locks up! That lap is gone.`);
      }
      if ((phase === 'in' || phase === 'done') && !run.noTime && run.time < Infinity) { c.best = run.time; c.sectors = run.sectors; }
      if (phase === 'done' && run.noTime && was !== 'done') this.say(c, 'late', `${c.code} didn't start a lap before the flag.`);
    }
    // the order on the timing screen: laps set, fastest first; the rest in the order they will run
    this.order = this.cars.slice().sort((a, b) => (a.best - b.best) || a.i - b.i);
    this.order.forEach((c, k) => { c.pos = k + 1; });
    if (this.t >= this.endT()) this.done = true;
  }
  endT() { let e = Q_LEN; for (const r of this.plan.runs.values()) if (!r.noTime) e = Math.max(e, r.flyEnd); return e + 2; }
  // the final word: the grid in qualifying order and the calls that made it (for the record)
  result() { return { order: this.plan.order.map((e) => e.id), choices: this.choices, runs: this.plan.runs }; }
}

export function fmtQ(t) {
  if (!Number.isFinite(t)) return 'No time';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
