// The race engine. Fixed 20 Hz steps on a seeded random stream, so the same race with the
// same commands at the same steps always ends the same way. No Three.js: Node can run it.
//
// Each car runs on a distance along the lap (dist, metres, starting negative on the grid)
// and a lateral offset (lat, metres, + is left). Speed comes from the track's base speed
// profile, scaled by tyre grip, driver pace and the team's calls (pace, battery, battle).
// The AI agent driving each car makes its own strategy calls; a player car in
// Team Principal mode only gets advice, and the human makes the calls.
import { rng, clamp } from './rng.js';
import { COMPOUNDS, POINTS } from './data.js';

export const DT = 0.05;
const LOOP = 25; // timing loop spacing, m

// Laps of life before a tyre is fully worn, at wear multiplier 1.
export const LIFE = { S: 4.6, M: 7.6, H: 11.5, I: 8, W: 10 };

export function tyreGrip(c, wear, w) {
  let g;
  if (c === 'S') g = 1.0 * (1 - 0.6 * w);
  else if (c === 'M') g = 0.983 * (1 - 0.6 * w);
  else if (c === 'H') g = 0.968 * (1 - 0.6 * w);
  else if (c === 'I') g = w < 0.5 ? 0.905 - 0.03 * w : 0.89 - 0.34 * (w - 0.5);
  else g = 0.85 - 0.04 * w;
  return g * (1 - 0.05 * wear - Math.max(0, wear - 0.72) * 1.3);
}

// What the tyre wants for the track's wetness.
export function idealCompound(w) { return w > 0.7 ? 'W' : w > 0.17 ? 'I' : null; }
const isDry = (c) => COMPOUNDS[c].dry;

export function makeWeather(venue, seed, duration) {
  const r = rng(seed ^ 0x9e3779b9);
  const showers = [];
  if (r() < venue.rain) {
    const n = r() < 0.3 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const start = r.range(0.12, 0.7) * duration;
      const len = r.range(0.18, 0.4) * duration;
      const peak = clamp(r.range(0.35, 1.05) * (venue.storm ?? 0.7), 0.25, 1);
      showers.push({ start, end: start + len, peak });
    }
  }
  // sometimes it rained before the start and the track begins damp
  const wet0 = r() < venue.rain * 0.22 ? r.range(0.3, 0.8) : 0;
  return { showers, wet0, clouds: clamp(venue.rain * 0.8 + (showers.length ? 0.3 : 0), 0, 1) };
}

export function rainAt(W, t) {
  let v = 0;
  for (const s of W.showers) {
    const ramp = 25;
    if (t < s.start || t > s.end) continue;
    const a = clamp((t - s.start) / ramp, 0, 1), b = clamp((s.end - t) / ramp, 0, 1);
    v = Math.max(v, s.peak * Math.min(a, b));
  }
  return v;
}

export function qualify(entries, venue, seed) {
  const r = rng(seed ^ 0x51ed);
  return entries.map((e) => ({ e, q: e.traits.pace * (venue.grip ? 1 : 1) + r.range(-0.07, 0.07) }))
    .sort((a, b) => b.q - a.q).map((x) => x.e);
}

export class Race {
  // opts: track, venue, seed, laps, grid (entries in grid order), weather
  constructor(opts) {
    Object.assign(this, { track: opts.track, venue: opts.venue, seed: opts.seed, laps: opts.laps });
    this.r = rng(opts.seed);
    this.t = 0; this.tick = 0;
    this.weather = opts.weather;
    this.rain = 0; this.wet = this.weather.wet0;
    this.flag = false; this.done = false; this.finishOrder = [];
    this.events = []; this.loops = new Map();
    this.fastest = { time: Infinity, car: null };
    this.commands = [];
    this.started = false;
    this.sc = null; // safety car: { kind: 'SC' | 'VSC', phase: 'out' | 'in', dist, run, t }
    this.scCount = 0;
    const T = this.track, L = T.L;
    this.cars = opts.grid.map((e, i) => {
      const traits = e.traits;
      const start = e.startCompound || (this.wet > 0.7 ? 'W' : this.wet > 0.17 ? 'I' : this.r.pick(['S', 'M', 'M', 'H']));
      const car = {
        i, id: e.id, num: e.num, name: e.name, code: e.code, team: e.team, traits, player: !!e.player,
        auto: e.auto !== false,
        grid: i + 1,
        dist: -10 - i * 9, lat: i % 2 ? -2.6 : 2.6, latT: 0, v: 0, prevDist: 0, prevLat: 0,
        tyre: { c: start, wear: 0, laps: 0, fresh: 0 }, used: [start], stops: 0,
        ers: 0.6, pace: 'normal', ersMode: 'balanced', battle: 'neutral',
        pitReq: null, pit: null, stopT: 0,
        pass: null, yieldT: 0, mistakeT: 0,
        finished: false, dnf: false, pos: i + 1,
        lapStart: 0, lastLap: 0, best: Infinity, lapsDone: 0,
        gap: 0, interval: 0, loop: Math.floor((-10 - i * 9) / LOOP),
        react: 0.15 + (1 - traits.pace) * 0.4 + this.r.range(0, 0.25),
        mismatch: 0, plan: null, think: this.r.range(0, 1), advised: {},
        speedMul: 1 - 0.045 * (1 - traits.pace), wobble: 1, penalty: 0,
        failing: null, puncture: false, cleared: false, onTrackStop: false,
      };
      car.latT = car.lat; car.prevDist = car.dist; car.prevLat = car.lat;
      car.plan = this.planStops(car);
      return car;
    });
    this.byId = new Map(this.cars.map((c) => [c.id, c]));
    this.order = this.cars.slice();
    this.wearMul = this.venue.wear || 1;
  }

  emit(type, text, car, extra) {
    const ev = { t: this.t, lap: this.leaderLap(), type, text, car: car ? car.id : null, ...extra };
    this.events.push(ev);
    return ev;
  }

  leaderLap() { const l = this.order[0]; return l ? clamp(Math.floor(l.dist / this.track.L) + 1, 1, this.laps) : 1; }
  lapOf(car) { return clamp(Math.floor(car.dist / this.track.L) + 1, 1, this.laps); }
  lapsLeft(car) { return this.laps - Math.max(0, Math.floor(car.dist / this.track.L)); }

  // The dry plan: which lap to stop and what to fit.
  planStops(car) {
    const laps = this.laps, c = car.tyre.c, wm = this.venue.wear || 1, b = car.traits.brain;
    if (!isDry(c)) return { lap: null, next: null };
    const life = LIFE[c] / wm;
    let lap = Math.round(Math.min(life * (0.72 + 0.12 * b), laps * (c === 'S' ? 0.42 : c === 'M' ? 0.55 : 0.68)));
    lap = clamp(lap + this.r.int(-1, 1) * (b < 0.7 ? 1 : 0), 1, laps - 1);
    const rem = laps - lap;
    let next = rem <= LIFE.S / wm * 0.85 ? 'S' : rem <= LIFE.M / wm * 0.85 ? 'M' : 'H';
    if (next === c) next = c === 'S' ? 'M' : c === 'M' ? (rem <= LIFE.S / wm * 0.95 ? 'S' : 'H') : 'M';
    return { lap, next };
  }

  command(id, cmd) {
    const car = this.byId.get(id); if (!car || car.finished || car.dnf) return;
    this.commands.push({ tick: this.tick, id, cmd });
    if (cmd.pace) car.pace = cmd.pace;
    if (cmd.ers) car.ersMode = cmd.ers;
    if (cmd.battle) car.battle = cmd.battle;
    if ('box' in cmd) {
      if (cmd.box && !car.pit) { car.pitReq = cmd.box; this.emit('radio', `Copy, box this lap for ${COMPOUNDS[cmd.box].name}s.`, car, { from: 'driver' }); }
      else if (!cmd.box && car.pitReq && !car.pit) { car.pitReq = null; this.emit('radio', 'Understood, staying out.', car, { from: 'driver' }); }
    }
    if ('auto' in cmd) car.auto = !!cmd.auto;
  }

  start() { this.started = true; this.emit('flag', 'Lights out! The race is on.', null); }

  step() {
    if (!this.started || this.done) return;
    const T = this.track, L = T.L, dt = DT, r = this.r;
    this.t += dt; this.tick++;
    // weather
    const rain = rainAt(this.weather, this.t);
    if (rain > 0.05 && this.rain <= 0.05) this.emit('weather', rain > 0.5 ? 'Heavy rain is falling!' : 'Rain is starting to fall.', null);
    if (rain <= 0.05 && this.rain > 0.05) this.emit('weather', 'The rain has stopped. The track will start to dry.', null);
    this.rain = rain;
    if (rain > this.wet) this.wet = Math.min(1, this.wet + (rain - this.wet) * 0.045 * dt * 1.2 + 0.004 * dt * rain);
    else this.wet = Math.max(0, this.wet - (0.0045 + 0.0035 * (this.venue.temp || 25) / 30) * dt);
    const w = this.wet;

    // think: strategy calls about once a second per car
    for (const car of this.cars) {
      if (car.finished || car.dnf) continue;
      car.think -= dt;
      if (car.think <= 0) { car.think = 1; this.strategy(car); }
    }

    // speeds
    const active = this.cars.filter((c) => !c.dnf);
    for (const car of active) {
      car.prevDist = car.dist; car.prevLat = car.lat;
      const s = ((car.dist % L) + L) % L, i = Math.floor(s);
      if (this.t < car.react) { continue; }
      let grip = tyreGrip(car.tyre.c, car.tyre.wear, w) * (this.venue.grip || 1);
      if (car.tyre.fresh < 700) grip *= 0.975 + 0.025 * (car.tyre.fresh / 700);
      const wetSkill = 1 - (1 - car.traits.wet) * 0.03 * w;
      const str = T.straight[i];
      let f = 1 - (1 - Math.sqrt(grip)) * (str ? 0.4 : 1);
      f *= car.speedMul * wetSkill * car.wobble;
      f *= 1 + 0.015 * clamp(car.dist / (this.laps * L), 0, 1); // fuel burn
      if (car.pace === 'push') f *= 1.008; else if (car.pace === 'save') f *= 0.99;
      if (car.battle === 'defend') f *= 0.998;
      // battery
      let boost = 1;
      if (car.ersMode === 'deploy' && str && car.ers > 0) { boost = 1.03; car.ers -= 0.035 * dt; }
      else if (car.ersMode === 'balanced' && str && car.ers > 0) { boost = 1.01; car.ers -= 0.011 * dt; }
      else if (car.ersMode === 'harvest') { boost = 0.994; car.ers += 0.016 * dt; }
      car.ers = clamp(car.ers + (str ? 0 : 0.008 * dt), 0, 1);
      let vt = T.v[i] * f * boost;
      if (car.finished) vt *= 0.55;
      car.vt = vt;
      if (car.mistakeT > 0) { car.mistakeT -= dt; vt = Math.min(vt, car.mistakeV); }
      if (car.puncture) vt = Math.min(vt, 26);
      if (car.failing) vt = Math.min(vt, car.failing.v);
      if (this.sc && !car.finished) vt = Math.min(vt, this.scLimit(car, i));
      car._vt = vt;
    }

    // racing: slipstream, following, overtaking, lapped cars
    const onTrack = active.filter((c) => !c.pit && !c.finished && this.t >= c.react);
    for (const car of onTrack) {
      const s = ((car.dist % L) + L) % L, i = Math.floor(s);
      let ahead = null, dS = 1e9;
      for (const o of onTrack) {
        if (o === car) continue;
        const os = ((o.dist % L) + L) % L;
        let d = os - s; if (d < 0) d += L;
        if (d < dS && d < 60) { dS = d; ahead = o; }
      }
      car.ahead = ahead; car.dS = dS;
      if (!ahead) { car.drs = false; continue; }
      const str = T.straight[i];
      // slipstream and the overtaking aid inside 30 m on straights
      car.drs = str && dS < 32 && this.lapOf(car) > 1;
      if (str && dS < 45) car._vt *= 1 + 0.012 * (1 - dS / 45) + (car.drs ? 0.022 : 0);
      const sameLine = Math.abs(car.lat - ahead.lat) < 2.3;
      if (dS < 20 && sameLine) {
        const lapped = ahead.dist + L * 0.5 < car.dist;
        if (lapped) {
          ahead.yieldT = 3; ahead.yieldSide = car.lat > 0 ? -1 : 1;
        } else if (!car.pass && !this.sc && str && car._vt > ahead.v + 0.4) {
          let p = 0.07 * (0.6 + car.traits.aggro) * clamp((car._vt - ahead.v) / 2, 0.25, 2);
          if (car.battle === 'attack') p *= 1.7;
          if (ahead.battle === 'defend') p *= 0.45;
          if (this.venue.street) p *= 0.5;
          if (r() < p) {
            car.pass = { id: ahead.id, side: ahead.lat > 0.5 ? -1 : ahead.lat < -0.5 ? 1 : (r() < 0.5 ? 1 : -1), t: 6 };
          }
        }
        if (!car.pass || car.pass.id !== ahead.id) {
          if (!lapped || dS < 9) car._vt = Math.min(car._vt, ahead.v + (dS - 10) * 0.7);
        }
      }
    }

    // integrate
    for (const car of active) {
      if (this.t < car.react) continue;
      const s0 = ((car.dist % L) + L) % L, i = Math.floor(s0);
      let vt = car._vt;
      // pit lane
      if (car.pit) vt = this.pitLane(car, vt, s0);
      if (car.stopT > 0) {
        car.stopT -= dt; car.v = 0;
        if (car.stopT <= 0) this.finishStop(car);
        continue;
      }
      if (vt > car.v) car.v = Math.min(vt, car.v + (13 * (1 - car.v / 92) + 1.5) * dt * (car.pace === 'push' ? 1.03 : 1));
      else car.v = Math.max(vt, car.v - 46 * dt);
      car.v = Math.max(0, car.v);
      car.dist += car.v * dt;
      car.tyre.fresh += car.v * dt;
      // tyre wear
      let wr = car.v * dt / (LIFE[car.tyre.c] * L) * this.wearMul;
      if (car.pace === 'push') wr *= 1.5; else if (car.pace === 'save') wr *= 0.65;
      if (car.battle === 'attack') wr *= 1.1;
      wr *= 1.25 - 0.45 * car.traits.tyre;
      if (car.tyre.c === 'I') wr *= 1 + Math.max(0, 0.25 - w) * 12;
      if (car.tyre.c === 'W') wr *= 1 + Math.max(0, 0.45 - w) * 11;
      car.tyre.wear = Math.min(1.05, car.tyre.wear + wr);
      // lateral: racing line, overtaking lane, lapped cars moving aside, pit lane
      let latT = T.ideal[i];
      if (car.pass) {
        const o = this.byId.get(car.pass.id);
        car.pass.t -= dt;
        latT = car.pass.side * 3.6;
        const os = ((o.dist % L) + L) % L; let d = s0 - os; if (d < -L / 2) d += L; if (d > L / 2) d -= L;
        if (!car.pass.contactChecked && Math.abs(d) < 2 && !o.pit && !o.dnf) {
          car.pass.contactChecked = true;
          const pc = 0.012 * (car.battle === 'attack' ? 1.6 : 1) * (o.battle === 'defend' ? 1.5 : 1) * (1 + 3 * w) * (this.venue.street ? 1.6 : 1);
          if (this.r() < pc) { this.contact(car, o); car.pass = null; }
        }
        if (car.pass && (d > 7 || car.pass.t <= 0 || o.pit || o.dnf)) {
          if (d > 0 && d < L / 2 && !o.pit && !o.dnf && !o.finished) this.overtook(car, o);
          car.pass = null;
        }
      }
      if (car.yieldT > 0) { car.yieldT -= dt; latT = car.yieldSide * 3.8; }
      if (car.offT > 0) { car.offT -= dt; latT = car.offSide * (T.half + 2); }
      if (car.failing) {
        latT = car.failing.side * (T.half + 4);
        car.failing.v = Math.max(0, car.failing.v - 6 * dt);
        if (car.failing.v <= 0.5 && Math.abs(car.lat - latT) < 0.6) this.retire(car);
      }
      if (car.pit) latT = car.pitLat;
      if (car.finished) latT = T.ideal[i] * 0.5;
      const rate = car.pit ? 7 : car.offT > 0 || car.failing ? 6 : 2.6;
      car.lat += clamp(latT - car.lat, -rate * dt, rate * dt);
      // mistakes
      if (!car.pit && !T.straight[i] && car.mistakeT <= 0 && !car.finished) this.maybeMistake(car, w, i);
      if (!car.pit && !car.finished && !car.failing && car.dist > 0) this.reliability(car, dt);
      // pit entry
      const s1 = ((car.dist % L) + L) % L;
      const pin = ((T.pit.inS % L) + L) % L;
      const crossed = (a, b, x) => (a <= b ? a < x && b >= x : x > a || x <= b);
      if (!car.pit && car.pitReq && car.dist > 0 && !car.finished && crossed(s0, s1, pin)) this.enterPit(car);
      // laps and timing
      this.timing(car);
    }

    this.safetyCar(dt);

    // order: a finished car keeps the distance at which it took the flag
    for (const c of this.cars) c.key = c.dnf ? -1e9 + c.dist : c.finished ? c.lapsDone * L + 0.5 - c.finishPos * 1e-3 : c.dist;
    this.order = this.cars.slice().sort((a, b) => b.key - a.key);
    const leader = this.order[0];
    this.order.forEach((c, k) => {
      c.pos = k + 1;
      c.lapsDown = c.dnf ? 0 : Math.max(0, Math.floor((leader.key - c.key) / L));
      c.interval = k === 0 ? 0 : c.gap - this.order[k - 1].gap;
    });
    // finish
    if (this.flag) {
      const running = this.cars.filter((c) => !c.finished && !c.dnf);
      if (running.length === 0 || this.t - this.flagT > 50) this.end();
    }
  }

  timing(car) {
    const L = this.track.L;
    const lp = Math.floor(car.prevDist / L), ln = Math.floor(car.dist / L);
    const loop = Math.floor(car.dist / LOOP);
    if (loop > car.loop) {
      car.loop = loop;
      if (!this.loops.has(loop)) this.loops.set(loop, this.t);
      car.gap = this.t - this.loops.get(loop);
    }
    if (ln > lp && ln >= 1) {
      const lapT = this.t - car.lapStart;
      car.lapStart = this.t;
      car.lapsDone = ln;
      car.tyre.laps++;
      if (ln >= 2 || true) {
        car.lastLap = lapT;
        if (ln >= 2 && lapT < car.best) car.best = lapT;
        if (ln >= 2 && lapT < this.fastest.time && !car.finished) {
          const first = this.fastest.car === null;
          this.fastest = { time: lapT, car: car.id };
          if (!first && (car.player || this.lapOf(car) > this.laps / 2)) this.emit('fastest', `Fastest lap: ${car.code}, ${fmtLap(lapT)}`, car);
        }
      }
      car.wobble = 1 + this.r.range(-0.0025, 0.0025);
      if (car.finished) return;
      if (this.flag) { this.finishCar(car); return; }
      if (ln >= this.laps) {
        this.flag = true; this.flagT = this.t;
        this.emit('flag', `Chequered flag! ${car.name} wins in ${this.venue.city}.`, car);
        this.finishCar(car);
        return;
      }
      if (ln === this.laps - 1 && !this.saidFinal) { this.saidFinal = true; this.emit('lap', 'Final lap!', null); }
      if (car.player && !car.auto) this.adviseLap(car);
    }
  }

  finishCar(car) {
    car.finished = true; car.finishT = this.t;
    car.finishPos = this.finishOrder.length + 1;
    this.finishOrder.push(car.id);
    car.pitReq = null;
  }

  enterPit(car) {
    const T = this.track;
    car.pit = { phase: 'in', box: car.pitReq };
    car.pitLat = T.pit.lat;
    car.pass = null;
    if (car.player) this.emit('pit', `${car.code} is in the pit lane.`, car);
  }

  pitLane(car, vt, s) {
    const T = this.track, L = T.L, P = T.pit;
    let rel = s; if (rel > L / 2) rel -= L; // pit zone straddles the line
    if (car.pit.phase === 'in') {
      if (rel > P.inS + 35) vt = Math.min(vt, P.speed);
      if (rel > P.inS + 10) vt = Math.min(vt, Math.max(P.speed, 30 + (P.inS + 35 - rel) * 1.6));
      const mateStopped = this.cars.some((o) => o !== car && o.team.id === car.team.id && o.stopT > 0);
      const teamBox = P.box[car.team.box] - (mateStopped ? 10 : 0);
      if (rel >= teamBox - 0.5 && rel < teamBox + 20) {
        car.pit.phase = 'stop';
        car.dist += teamBox - rel;
        const mate = this.cars.find((o) => o !== car && o.team.id === car.team.id && o.stopT > 0);
        let stop = 2.2 + this.r.range(0, 0.7);
        if (this.r() < 0.04) { stop += this.r.range(2, 4); this.slowStop = car.id; }
        if (mate) stop += mate.stopT + 0.5;
        car.stopT = stop; car.stopLen = stop;
        car.v = 0;
        return 0;
      }
      if (rel > teamBox - 25) vt = Math.min(vt, Math.max(2, (teamBox - rel) * 1.2));
    } else if (car.pit.phase === 'out') {
      vt = Math.min(vt, P.speed);
      if (!car.pit.looked && rel > P.box[car.team.box] + 4) { car.pit.looked = true; this.exitBattle(car, rel); }
      if (rel > P.outS - 40) car.pitLat = 0;
      if (rel > P.outS) { car.pit = null; car.pitLat = 0; }
    }
    return vt;
  }

  // will someone reach the pit exit at the same moment? That is the shot everyone wants.
  exitBattle(car, rel) {
    const T = this.track, L = T.L, P = T.pit, tC = (P.outS - rel) / P.speed;
    const exitS = ((P.outS % L) + L) % L;
    let best = null;
    for (const o of this.cars) {
      if (o === car || o.pit || o.dnf || o.finished) continue;
      const os = ((o.dist % L) + L) % L; let d = exitS - os; if (d < 0) d += L;
      if (d > 900) continue;
      const tO = d / Math.max(o.v, 35), dt = tO - tC;
      if (Math.abs(dt) < 2.6 && (!best || Math.abs(dt) < Math.abs(best.dt))) best = { o, dt };
    }
    if (!best) return;
    const o = best.o, top = Math.min(car.pos, o.pos);
    if (top > 4 && !car.player && !o.player) return;
    const forWhat = top === 1 ? 'the lead' : 'P' + top;
    this.emit('battle', `${car.code} is out of the pits... and here comes ${o.code}! Battle for ${forWhat}!`, car, { other: o.id, forPos: top });
  }

  finishStop(car) {
    const c = car.pit.box || car.pitReq || 'M';
    if (this.slowStop === car.id) { this.emit('pit', `Slow stop for ${car.code}! ${car.stopLen.toFixed(1)} s.`, car); this.slowStop = null; }
    else if (car.player) this.emit('pit', `${car.code}: ${car.stopLen.toFixed(1)} s stop, ${COMPOUNDS[c].name}s on.`, car);
    car.tyre = { c, wear: 0, laps: 0, fresh: 0 };
    car.puncture = false;
    if (!car.used.includes(c)) car.used.push(c);
    car.stops++; (car.stopTimes ||= []).push(car.stopLen);
    car.pitReq = null; car.pit.phase = 'out'; car.stopT = 0;
    car.mismatch = 0;
    car.plan = this.lapsLeft(car) > 2 && isDry(c) && !this.ruleMet(car) ? this.planStops(car) : { lap: null, next: null };
    car.advised = {};
  }

  // dry races need two different dry compounds, unless a wet tyre was used
  ruleMet(car) {
    if (car.used.some((c) => !isDry(c))) return true;
    return new Set(car.used).size >= 2;
  }

  maybeMistake(car, w, i) {
    let p = 0.00006;
    if (car.tyre.wear > 0.8) p *= 4;
    if (isDry(car.tyre.c) && w > 0.25) p *= 1 + 14 * (w - 0.2);
    if (car.tyre.c === 'W' && w < 0.3) p *= 2;
    if (car.pace === 'push') p *= 1.8;
    if (car.battle === 'attack') p *= 1.3;
    p *= 1.4 - 0.6 * (w > 0.3 ? car.traits.wet : car.traits.pace);
    if (this.r() > p) return;
    const big = this.r() < 0.22;
    if (big) {
      car.mistakeT = 2.2; car.mistakeV = 9;
      car.offT = 1.8; car.offSide = Math.sign(this.track.k[i]) > 0 ? -1 : 1;
      const out = isDry(car.tyre.c) && w > 0.5 && this.r() < 0.25;
      if (out) {
        car.lat = car.offSide * (this.track.half + 6);
        this.retire(car, 'crash', `${car.name} (${car.code}) is in the barrier! Out of the race.`);
      } else this.emit('mistake', `${car.code} runs wide and loses time!`, car);
    } else {
      car.mistakeT = 0.9; car.mistakeV = car.v * 0.72;
      if (car.player) this.emit('mistake', `${car.code} locks up into the corner.`, car);
    }
  }

  // things break: worn-out tyres puncture, and now and then an engine, battery or gearbox fails
  reliability(car, dt) {
    const r = this.r;
    if (!car.puncture && car.tyre.wear > 0.98 && r() < 0.05 * dt * (1 + (car.tyre.wear - 0.98) * 40)) {
      car.puncture = true;
      const c = car.pitReq || (isDry(car.tyre.c) ? this.dryChoice(car, car.used.length === 1 ? car.tyre.c : null) : car.tyre.c);
      car.pitReq = c;
      this.emit('incident', `Puncture for ${car.code}! The tyres gave up. Limping back to the pits.`, car);
      // a bad one can spin the car into the gravel
      if (r() < 0.12) { car.lat = (r() < 0.5 ? -1 : 1) * (this.track.half + 6); this.retire(car, 'crash', `${car.code} spins on the shredded tyre and hits the wall! Out.`); }
      return;
    }
    // about one failure in 40 race starts per car, spread over the race
    const per = 0.025 / (this.laps * this.track.lapTime);
    if (r() < per * dt * (car.pace === 'push' ? 1.4 : 1)) {
      // (the stream is near-fixed right after so rare a draw, so the step and car choose the details)
      const kinds = ['engine', 'battery', 'gearbox', 'hydraulics', 'fuel', 'engine', 'battery'], h = (this.tick * 2654435761 + car.i * 40503) >>> 0;
      const kind = kinds[h % kinds.length];
      const what = { engine: 'Engine failure', battery: 'ERS failure, the battery has died', gearbox: 'Gearbox failure', hydraulics: 'Hydraulics failure', fuel: 'Out of fuel' }[kind];
      car.failing = { kind, v: car.v, side: (h >>> 8) % 2 ? -1 : 1 };
      car.pass = null; car.pitReq = null;
      this.emit('incident', `${what} for ${car.code}! ${car.name} is slowing down.`, car, { kind });
    }
  }

  // a touch while overtaking: usually just lost time, sometimes a car is out
  contact(car, o) {
    const r = this.r;
    const victim = r() < 0.5 ? car : o, other = victim === car ? o : car;
    if (r() < 0.35) {
      victim.lat = (victim.lat >= 0 ? 1 : -1) * (this.track.half + 6);
      this.retire(victim, 'crash', `Contact between ${car.code} and ${o.code}! ${victim.code} is in the wall. Out of the race.`);
      other.mistakeT = 1.5; other.mistakeV = other.v * 0.6;
      if (!other.puncture && r() < 0.4) { other.puncture = true; other.pitReq ||= isDry(other.tyre.c) ? this.dryChoice(other) : other.tyre.c; this.emit('incident', `${other.code} has a puncture after the contact.`, other); }
    } else {
      for (const c of [car, o]) { c.mistakeT = 1.6; c.mistakeV = c.v * 0.55; c.offT = 1.2; c.offSide = c.lat >= 0 ? 1 : -1; }
      this.emit('incident', `Contact! ${car.code} and ${o.code} touch wheels and both go wide.`, car, { other: o.id });
    }
  }

  // the car is out: it stays where it stopped until the marshals clear it
  retire(car, kind = car.failing ? car.failing.kind : 'crash', text) {
    if (car.dnf) return;
    car.dnf = true; car.v = 0; car.failing = null; car.pass = null; car.pitReq = null;
    car.onTrackStop = true; car.clearAt = this.t + 28; car.out = kind;
    if (text) this.emit('dnf', text, car, { kind });
    else this.emit('dnf', `${car.name} (${car.code}) has stopped. Out of the race.`, car, { kind });
    // marshals need help: a crash brings out the safety car, a car parked by the wall the virtual one
    const lap = this.leaderLap();
    if (this.sc || this.flag || lap >= this.laps) return;
    const crash = kind === 'crash';
    const want = crash ? (this.r() < 0.8 ? 'SC' : 'VSC') : (this.r() < 0.6 ? 'VSC' : this.r() < 0.4 ? 'SC' : null);
    if (!want) { this.emit('flag', `Yellow flags for the stopped ${car.code}.`, car); return; }
    if (want === 'SC' && lap >= this.laps - 1) { this.deploy('VSC', car); return; }
    this.deploy(want, car);
  }

  deploy(kind, car) {
    const lead = this.order.find((c) => !c.dnf && !c.finished) || this.order[0];
    this.sc = { kind, phase: 'out', t: this.t, run: 0, dist: lead.dist + 160, v: 30, car: car ? car.id : null };
    this.scCount++;
    this.emit('sc', kind === 'SC' ? 'SAFETY CAR! The field must slow down and line up. No overtaking.' : 'VIRTUAL SAFETY CAR. Everyone slows to a set pace. No overtaking.', car, { kind, phase: 'out' });
  }

  // the most a car may do under the safety car
  scLimit(car, i) {
    const T = this.track, S = this.sc;
    if (S.kind === 'VSC') return T.v[i] * 0.6;
    // close up to the car ahead, then hold station behind it
    let lim = T.v[i] * (car.ahead && car.dS < 40 ? 0.62 : 0.85);
    const lead = this.order.find((c) => !c.dnf && !c.finished && !c.pit);
    if (S.phase === 'out' && car === lead) {
      const gap = S.dist - car.dist;
      lim = Math.min(lim, Math.max(0, S.v + (gap - 30) * 0.5));
    }
    return Math.max(lim, 8);
  }

  safetyCar(dt) {
    // marshals clear stopped cars after a while
    for (const c of this.cars) if (c.onTrackStop && !c.cleared && this.t > c.clearAt) c.cleared = true;
    const S = this.sc; if (!S) return;
    const T = this.track, L = T.L, i = Math.floor(((S.dist % L) + L) % L);
    S.v = T.v[i] * 0.6;
    S.dist += S.v * dt; S.run += S.v * dt;
    const stopped = this.cars.some((c) => c.onTrackStop && !c.cleared);
    if (S.kind === 'VSC') {
      if (this.t - S.t > 22 && !stopped) { this.sc = null; this.emit('sc', 'VSC ending. Green flag! Racing again.', null, { phase: 'green' }); }
      return;
    }
    if (S.phase === 'out' && S.run > L * 1.6 && !stopped) {
      S.phase = 'in'; this.emit('sc', 'Safety car in this lap. Get ready for the restart!', null, { phase: 'in' });
    }
    if (S.phase === 'in') {
      // the safety car peels into the pits; the leader controls the restart at the line
      const lead = this.order.find((c) => !c.dnf && !c.finished);
      if (lead && Math.floor(lead.dist / L) > Math.floor(lead.prevDist / L)) {
        this.sc = null; this.emit('sc', 'GREEN FLAG! The race is back on!', lead, { phase: 'green' });
      }
    }
  }

  overtook(car, o) {
    if (car.pos <= 3 || o.pos <= 3 || car.player || o.player) {
      const forPos = Math.min(car.pos, o.pos);
      this.emit('pass', `${car.code} passes ${o.code}${forPos <= 10 ? ' for P' + forPos : ''}.`, car, { other: o.id });
    }
  }

  // The AI strategist. For a player car in Team Principal mode it only gives advice.
  strategy(car) {
    if (car.pit || car.dist < 0) { this.paceCalls(car); return; }
    const w = this.wet, c = car.tyre.c, left = this.lapsLeft(car);
    const want = idealCompound(w);
    let call = null, why = '';
    const delay = 3 + (1 - car.traits.brain) * 22;
    if (want && isDry(c)) {
      car.mismatch += 1;
      if (car.mismatch > delay && left > 0) { call = want; why = w > 0.7 ? 'The track is soaked. Full wets.' : 'It\'s wet out here. Inters.'; }
    } else if (c === 'I' && w > 0.82) {
      car.mismatch += 1; if (car.mismatch > delay) { call = 'W'; why = 'Too much standing water for inters.'; }
    } else if (c === 'W' && w < 0.55) {
      car.mismatch += 1; if (car.mismatch > delay) { call = w < 0.17 ? this.dryChoice(car) : 'I'; why = 'Wets are overheating. Time to change.'; }
    } else if (!isDry(c) && w < 0.12) {
      car.mismatch += 1; if (car.mismatch > delay && left > 0) { call = this.dryChoice(car); why = 'There\'s a dry line now. Slicks!'; }
    } else {
      car.mismatch = Math.max(0, car.mismatch - 2);
      if (isDry(c)) {
        const lap = Math.max(0, Math.floor(car.dist / this.track.L));
        const late = car.tyre.wear > 0.86 - 0.08 * car.traits.brain && left > 1;
        const planned = car.plan.lap !== null && lap >= car.plan.lap && left > 1;
        const mustStop = !this.ruleMet(car) && left <= 2 && left >= 1;
        // a stop costs far less under the safety car: take it if one was due soon
        const cheap = this.sc && this.sc.phase === 'out' && left > 1 && lap >= 1 && (car.tyre.wear > 0.45 || (car.plan.lap !== null && lap >= car.plan.lap - 3));
        if (cheap && !car.pitReq) why = this.sc.kind === 'SC' ? 'Safety car! Cheap stop, box now.' : 'Virtual safety car. Box, box!';
        if ((planned || late || mustStop || cheap) && !(this.rain > 0.05 && car.traits.brain > 0.6 && left > 2)) {
          call = car.plan.next || this.dryChoice(car);
          if (car.used.length === 1 && call === c) call = this.dryChoice(car, c);
          if (!cheap || planned || late || mustStop) why = late ? 'These tyres are finished. Box!' : mustStop ? 'We still need a second compound. Box now.' : 'Pit window is open.';
        }
      }
    }
    if (call && (!car.pitReq || car.pitReq !== call)) {
      if (car.player && !car.auto) {
        const key = call + ':' + Math.floor(car.dist / this.track.L);
        if (!car.advised[key]) {
          car.advised[key] = true;
          this.emit('advice', `${why} Box for ${COMPOUNDS[call].name}s?`, car, { from: 'engineer', action: { box: call } });
        }
      } else {
        car.pitReq = call;
        if (car.player) this.emit('radio', `${why} Boxing this lap for ${COMPOUNDS[call].name}s.`, car, { from: 'driver' });
      }
    }
    this.paceCalls(car);
  }

  dryChoice(car, not) {
    const left = this.lapsLeft(car), wm = this.venue.wear || 1;
    let c = left <= LIFE.S / wm * 0.9 ? 'S' : left <= LIFE.M / wm * 0.9 ? 'M' : 'H';
    if (c === not) c = c === 'S' ? 'M' : 'S';
    return c;
  }

  paceCalls(car) {
    if (car.player && !car.auto) {
      // the engineer still mentions a flat battery or a close fight once in a while
      if (car.ers < 0.08 && car.ersMode === 'deploy' && !car.advised.ers) {
        car.advised.ers = true;
        this.emit('advice', 'Battery is empty. Switch to harvest for a lap?', car, { from: 'engineer', action: { ers: 'harvest' } });
      }
      return;
    }
    const close = car.ahead && car.dS < 40;
    car.ersMode = car.ers < 0.2 ? 'harvest' : close && car.ers > 0.3 ? 'deploy' : car.ers > 0.85 ? 'deploy' : 'balanced';
    const left = this.lapsLeft(car);
    car.pace = left <= 2 && close ? 'push' : car.tyre.wear > 0.62 && car.plan.lap && left > 3 ? 'save' : 'normal';
    car.battle = close && car.traits.aggro > 0.55 ? 'attack' : 'neutral';
  }

  adviseLap(car) {
    const left = this.lapsLeft(car);
    if (!this.ruleMet(car) && left === 2 && !car.pitReq) {
      this.emit('advice', 'Reminder: you must use a second dry compound. Box this lap or take a penalty.', car,
        { from: 'engineer', action: { box: this.dryChoice(car, car.tyre.c) } });
    }
  }

  end() {
    if (this.done) return;
    this.done = true;
    const L = this.track.L;
    // dry races need two dry compounds: 20 s penalty otherwise
    const dryRace = !this.weather.showers.length && !this.weather.wet0;
    for (const c of this.cars) if (!c.dnf && dryRace && !this.ruleMet(c)) c.penalty = 20;
    const maxLaps = Math.max(...this.cars.map((c) => c.lapsDone));
    const cls = this.cars.map((c) => ({
      id: c.id, car: c, dnf: c.dnf, laps: c.lapsDone, time: c.finished ? c.finishT : null,
      best: c.best, stops: c.stops, used: c.used.slice(), penalty: c.penalty,
      sortT: c.dnf ? 1e12 - c.dist : c.finished ? c.finishT + c.penalty + (maxLaps - c.lapsDone) * 1e4 : 1e9 - c.dist,
    }));
    cls.sort((a, b) => a.sortT - b.sortT);
    const win = cls[0];
    cls.forEach((x, k) => {
      x.pos = k + 1;
      x.points = !x.dnf && k < 10 ? POINTS[k] : 0;
      x.fastest = x.id === this.fastest.car;
      if (x.fastest && !x.dnf && k < 10) x.points += 1;
      const down = win.laps - x.laps;
      x.gapText = k === 0 ? fmtTime(x.time) : x.dnf ? 'DNF' : down > 0 ? `+${down} lap${down > 1 ? 's' : ''}`
        : x.time == null ? 'Running' : '+' + (x.time + x.penalty - win.time - win.penalty).toFixed(1) + 's';
    });
    this.result = cls;
    this.emit('end', 'Race over.', null);
  }

  get wetRace() { return this.cars.some((c) => c.used.some((u) => !isDry(u))); }
}

export function fmtLap(t) {
  if (!isFinite(t)) return '–';
  const m = Math.floor(t / 60), s = t - m * 60;
  return (m ? m + ':' + (s < 10 ? '0' : '') : '') + s.toFixed(3);
}
export function fmtTime(t) {
  if (t == null || !isFinite(t)) return '–';
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}

// Pick laps so a race lasts about `seconds` at normal speed.
export function lapsFor(track, seconds = 235) { return clamp(Math.round(seconds / track.lapTime), 6, 11); }
