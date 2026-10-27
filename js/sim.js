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
import { driverPlan } from './track.js';
import { carMods } from './carspec.js';

export const DT = 0.05;
const LOOP = 25; // timing loop spacing, m

// Laps of life before a tyre is fully worn, at wear multiplier 1.
export const LIFE = { S: 4.6, M: 7.6, H: 11.5, I: 8, W: 10 };
// A full-distance Grand Prix runs on real-race tyres: a soft lasts about a third of the race, so one
// or two stops win it, as on a real Sunday. Shorter races keep the quick tyres they were tuned with.
export const tyreLife = (laps) => (laps > 36 ? (laps * 0.33) / LIFE.S : 1);

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

export function qualify(entries, venue, seed, track) {
  const q = qualiScores(entries, venue, seed, track);
  return entries.map((e, i) => ({ e, q: q[i] })).sort((a, b) => b.q - a.q).map((x) => x.e);
}
// each car's one-lap quality before the session's own choices (tyre, timing, push): the driver's
// pace, a little luck, the Driver DNA's appetite for risk and how the car suits this circuit
export function qualiScores(entries, venue, seed, track) {
  const r = rng(seed ^ 0x51ed);
  return entries.map((e, i) => e.traits.pace + r.range(-0.07, 0.07) + (e.dna ? oneLap(e.dna, seed, i) : 0) + carLap(e, track));
}
// Driver DNA over one qualifying lap: leaning harder on brakes, entry and grip finds time on fresh
// tyres, but the chance of spoiling the lap grows with the square of it, so the expected gain peaks
// around 75 and is gone at 100. Careful drivers give a little away. Balanced adds 0 and draws no
// dice; its own random stream, so the rest of the grid is untouched.
function oneLap(d, seed, i) {
  const x = d.qx || 0;
  if (!x) return 0;
  if (x < 0) return 0.06 * x;
  const r = rng((seed ^ 0x0a1a9 ^ (i * 0x9e37)) >>> 0);
  return 0.12 * x - (r() < x * x ? 0.12 : 0);
}

// a car's strengths over one lap of this circuit, in the same units as driver pace (4.5% of speed
// per point): a straights car gains at a fast circuit and gives it back at a twisty one
function carLap(e, T) {
  const m = e.car && T ? carMods(e.car) : null;
  return m ? (1 - driverPlan(T, null, m).lapTime / T.lapTime) / 0.045 : 0;
}

const CAR_W = 2.9, CAR_L = 7.6;   // a car's footprint on screen, in metres

// what the engineer may show you unasked in Team Principal mode: the reading, never the order
const FACTS = {
  'The track is soaked. Full wets.': 'The track is soaked.',
  'It\'s wet out here. Inters.': 'The track is wet now.',
  'Too much standing water for inters.': 'Standing water on track.',
  'Wets are overheating. Time to change.': 'The track is drying. Wets are overheating.',
  'There\'s a dry line now. Slicks!': 'There\'s a dry line now.',
  'Safety car! Cheap stop, box now.': 'Safety car out. A stop costs less now.',
  'Virtual safety car. Box, box!': 'Virtual safety car. A stop costs less now.',
  'These tyres are finished. Box!': 'Tyres are nearly finished.',
  'We still need a second compound. Box now.': 'A second tyre compound is still needed.',
  'Pit window is open.': 'Pit window is open.',
};

export class Race {
  // opts: track, venue, seed, laps, grid (entries in grid order), weather
  constructor(opts) {
    Object.assign(this, { track: opts.track, venue: opts.venue, seed: opts.seed, laps: opts.laps });
    this.life = tyreLife(opts.laps);
    // stage (Racing Academy only): { calm: no failures, cues: [{ t, sc: 'SC' | 'VSC' }] }
    this.stage = opts.stage ? { ...opts.stage, cues: (opts.stage.cues || []).map((q) => ({ ...q })) } : null;
    this.r = rng(opts.seed);
    // Driver DNA's own risks draw from a separate stream, so they never shift the race's other dice
    this.rd = rng((opts.seed ^ 0x5eed1234) >>> 0);
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
        i, id: e.id, num: e.num, name: e.name, code: e.code, helmet: e.helmet, face: e.face, team: e.team, traits, player: !!e.player,
        auto: e.auto !== false,
        grid: i + 1,
        dist: -10 - i * 9, lat: i % 2 ? -2.6 : 2.6, latT: 0, v: 0, prevDist: 0, prevLat: 0,
        tyre: { c: start, wear: 0, laps: 0, fresh: 0, temp: 0.55 }, used: [start], stops: 0,
        ers: 0.6, pace: 'normal', ersMode: 'balanced', battle: 'neutral', order: 'free', letBy: null, orderLap: -9,
        pitReq: null, pit: null, stopT: 0,
        pass: null, yieldT: 0, mistakeT: 0,
        finished: false, dnf: false, pos: i + 1,
        lapStart: 0, lastLap: 0, best: Infinity, lapsDone: 0, trace: [],
        gap: 0, interval: 0, loop: Math.floor((-10 - i * 9) / LOOP),
        react: 0.15 + (1 - traits.pace) * 0.4 + this.r.range(0, 0.25),
        mismatch: 0, plan: null, think: this.r.range(0, 1), advised: {},
        speedMul: 1 - 0.045 * (1 - traits.pace), wobble: 1, penalty: 0,
        failing: null, puncture: false, cleared: false, onTrackStop: false,
        spec: e.car ? carMods(e.car) : null, dna: e.dna || null, dnaHash: e.dna ? e.dna.hash : null, sv: null, lastTurn: -1, pressT: 0,
        tele: { lockups: 0, wides: 0, spins: 0, att: 0, contacts: 0, mistakes: 0, wearSum: 0, dist: 0 },
      };
      car.sv = driverPlan(T, car.dna, car.spec).v;
      car.latT = car.lat; car.prevDist = car.dist; car.prevLat = car.lat;
      car.plan = this.planStops(car);
      // the plan you accepted in the pre-race briefing replaces the engineer's own (js/briefing.js)
      if (e.stops && e.stops.length && isDry(car.tyre.c)) { car.stopsLeft = e.stops.slice(1); car.plan = { lap: e.stops[0].lap, next: e.stops[0].tyre }; }
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
    const life = LIFE[c] * this.life / wm, k = this.life;
    let lap = Math.round(Math.min(life * (0.72 + 0.12 * b), laps * (c === 'S' ? 0.42 : c === 'M' ? 0.55 : 0.68)));
    lap = clamp(lap + this.r.int(-1, 1) * (b < 0.7 ? 1 : 0), 1, laps - 1);
    const rem = laps - lap;
    let next = rem <= LIFE.S * k / wm * 0.85 ? 'S' : rem <= LIFE.M * k / wm * 0.85 ? 'M' : 'H';
    if (next === c) next = c === 'S' ? 'M' : c === 'M' ? (rem <= LIFE.S * k / wm * 0.95 ? 'S' : 'H') : 'M';
    return { lap, next };
  }

  // Who may command a car. Your cars in Team Principal mode answer to you alone: the engineer only
  // makes pit calls when you switched on beginner assist. In Autonomous mode the strategist runs the
  // car. Switching modes is always yours. Every caller (buttons, the radio, the strategist, a driver's
  // own brain) comes through here, so the rule holds whatever asks.
  may(car, from, cmd) {
    if (!car.player || from === 'principal') return true;
    if ('auto' in cmd || 'assist' in cmd || 'ask' in cmd || cmd.order) return false;
    if (car.auto) return from === 'strategist';
    return from === 'engineer' && car.assist && Object.keys(cmd).every((k) => k === 'box');
  }
  command(id, cmd, from = 'principal') {
    const car = this.byId.get(id); if (!car || car.finished || car.dnf) return false;
    if (!this.may(car, from, cmd)) return false;
    this.commands.push(from === 'principal' ? { tick: this.tick, id, cmd } : { tick: this.tick, id, cmd, from });
    if (cmd.pace) car.pace = cmd.pace;
    if (cmd.ers) car.ersMode = cmd.ers;
    if (cmd.battle) car.battle = cmd.battle;
    if ('box' in cmd) {
      if (cmd.box && !car.pit) { car.pitReq = cmd.box; car.pitBy = from; this.emit('radio', `Copy, box this lap for ${COMPOUNDS[cmd.box].name}s.`, car, { from: 'driver' }); }
      else if (!cmd.box && car.pitReq && !car.pit) { car.pitReq = null; car.pitBy = null; this.emit('radio', 'Understood, staying out.', car, { from: 'driver' }); }
    }
    if ('auto' in cmd && car.auto !== !!cmd.auto) {
      car.auto = !!cmd.auto;
      // the handover, on the record; a box call already made stays as it is, whoever made it
      this.emit('control', car.auto ? `${car.code}: Autonomous. The strategist runs the car.` : `${car.code}: Team Principal. You run the car.`, car, { auto: car.auto, pending: car.pitReq || null });
    }
    // beginner assist: the engineer makes the pit calls, you keep pace, battery and battles
    if ('assist' in cmd) car.assist = !!cmd.assist;
    // check-ins (the WhatsApp agent): the strategist still runs pace, battery and fights, but asks you
    // before a pit stop instead of making it; your agent answers for you if you don't
    if ('ask' in cmd) car.ask = !!cmd.ask;
    if (cmd.order) this.teamOrder(car, cmd.order);
    return true;
  }

  mate(car) { return this.cars.find((o) => o !== car && o.team.id === car.team.id); }
  // team orders: 'hold' (no fighting each other), 'free' (race), 'swap' (the car in front lets the other by)
  teamOrder(car, order) {
    const m = this.mate(car); if (!m) return;
    if (order === 'swap') {
      const [front, back] = car.dist >= m.dist ? [car, m] : [m, car];
      if (front.dnf || back.dnf || front.pit || back.pit || front.dist - back.dist > this.track.L * 0.08) return false;
      const obey = front.dna ? front.dna.obey : 1;
      front.letBy = { id: back.id, t: 30, wait: 4 * Math.max(0, 1 - obey), slow: 0.94 - 0.03 * Math.max(0, obey - 1) };
      this.emit('order', `Team orders: ${front.code} lets ${back.code} through.`, front, { other: back.id });
      return true;
    }
    car.order = m.order = order;
    car.letBy = m.letBy = null;
    this.emit('order', order === 'hold' ? `Team orders: ${car.code} and ${m.code} hold positions.` : `Team orders lifted: ${car.code} and ${m.code} are free to race.`, car, { other: m.id });
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
      // tyre temperature: the window is 0.5 to 0.72. Corners, pushing, a hot track and following in
      // another car's dirty air heat the tyres; saving, a wet track and the safety car cool them.
      // Under the window there is less grip; over it, less grip and faster wear.
      const str0 = T.straight[i], dirty = car.ahead && car.dS < 25 && !str0 ? 1 - car.dS / 25 : 0;
      let tt = 0.6 + (car.pace === 'push' ? 0.13 : car.pace === 'save' ? -0.08 : 0) + (car.battle === 'attack' ? 0.03 : 0)
        + 0.12 * dirty + ((this.venue.temp || 25) - 25) * 0.005 - 0.25 * w + (str0 ? -0.04 : 0.04);
      if (this.sc) tt -= 0.25;
      const tyre = car.tyre; tyre.temp ??= 0.55;
      tyre.temp += (tt - tyre.temp) * Math.min(1, 0.12 * dt);
      car.cold = Math.max(0, 0.5 - tyre.temp); car.hot = Math.max(0, tyre.temp - 0.72);
      if (isDry(car.tyre.c)) grip *= 1 - 0.12 * car.cold - 0.25 * car.hot;
      // dirty air: right behind another car in a corner there is less downforce
      grip *= 1 - 0.035 * dirty;
      const wetSkill = 1 - (1 - car.traits.wet) * 0.03 * w;
      const str = T.straight[i];
      let f = 1 - (1 - Math.sqrt(grip)) * (str ? 0.4 : 1);
      f *= car.speedMul * wetSkill * car.wobble;
      f *= 1 + 0.015 * clamp(car.dist / (this.laps * L), 0, 1); // fuel burn
      if (car.pace === 'push') f *= 1.008; else if (car.pace === 'save') f *= 0.99;
      if (car.battle === 'defend') f *= 0.998;
      const d = car.dna;
      if (d) {
        f *= d.pace;                                                   // tyre care costs a little pace
        if (w > 0) f *= 1 + (d.wetPace - 1) * w;                       // wet confidence
        if (car.pressT > 0) f *= d.defendCost;                         // covering the car behind
      }
      // battery
      let boost = 1;
      if (car.ersMode === 'deploy' && str && car.ers > 0) { boost = 1.03; car.ers -= 0.035 * dt; }
      else if (car.ersMode === 'balanced' && str && car.ers > 0) { const k = d ? d.deploy : 1; boost = 1 + 0.01 * k; car.ers -= 0.011 * k * dt; }
      else if (car.ersMode === 'harvest') { boost = 0.994; car.ers += 0.016 * dt; }
      car.ers = clamp(car.ers + (str ? 0 : 0.008 * dt), 0, 1);
      let vt = car.sv[i] * f * boost;
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
      if (ahead && dS < 20) ahead.pressT = 1;   // someone is right behind: a defender covers
      if (!ahead) { car.drs = false; continue; }
      const str = T.straight[i];
      // slipstream and the overtaking aid inside 30 m on straights
      car.drs = str && dS < 32 && this.lapOf(car) > 1;
      if (str && dS < 45) car._vt *= 1 + 0.012 * (1 - dS / 45) + (car.drs ? 0.022 : 0);
      // cars are about 2.9 m wide and 7.3 m long on screen: anything closer than that side by side is the same line
      const sameLine = Math.abs(car.lat - ahead.lat) < CAR_W;
      if (dS < 22 && sameLine) {
        const lapped = ahead.dist + L * 0.5 < car.dist;
        if (lapped) {
          ahead.yieldT = 3; ahead.yieldSide = car.lat > 0 ? -1 : 1;
        } else if (ahead.letBy && ahead.letBy.id === car.id && !(ahead.letBy.wait > 0) && !car.pass && !ahead.pass && !this.sc && dS < 16) {
          // a team order: the car in front backs off and leaves the other side open
          const room = T.half - 1.6, side = ahead.lat > 0 ? -1 : 1;
          car.pass = { id: ahead.id, side, lane: clamp(ahead.lat + side * CAR_W * 1.18, -room, room), t: 9 };
          ahead.hold = { lat: ahead.lat, t: 10, by: car.id };
        } else if (!car.pass && !ahead.pass && !(car.hold && car.hold.t > 0) && !this.sc && dS < (car.dna ? car.dna.passGap : 13) && car._vt > ahead.v + 0.4 && (str || car.battle === 'attack' || car.ersMode === 'deploy')
          && !(car.order === 'hold' && ahead.team.id === car.team.id)) {
          // most moves are made on the straights; with Attack or a boost a driver will also dive down the inside into a corner
          let p = 0.11 * (0.6 + car.traits.aggro) * clamp((car._vt - ahead.v) / 2, 0.25, 2);
          if (!str) p *= 0.35;
          if (car.battle === 'attack') p *= 1.7;
          if (car.ersMode === 'deploy' && car.ers > 0.05) p *= 1.4;
          if (ahead.battle === 'defend') p *= 0.45;
          // Driver DNA: eagerness, corners or straights, the other's defending, teammates
          if (car.dna) {
            p *= car.dna.passP; if (!str) p *= Math.max(0.2, car.dna.cornerPass);
            if (ahead.team.id === car.team.id) p *= car.dna.coop > 0 ? 1 - 0.8 * car.dna.coop : 1 - 0.5 * car.dna.coop;
          }
          if (ahead.dna && ahead.dna.defend > 0) p *= 1 - ahead.dna.defend;
          if (this.venue.street) p *= 0.5;
          if (r() < p) {
            // pull out to whichever side has room for a whole car
            const room = T.half - 1.6;
            const k = !str ? Math.sign(T.k[i]) || 1 : 0;   // in a corner, the inside
            let side = k || (ahead.lat > 0.5 ? -1 : ahead.lat < -0.5 ? 1 : (r() < 0.5 ? 1 : -1));
            if (Math.abs(ahead.lat + side * CAR_W * 1.18) > room) side = -side;
            const lane = clamp(ahead.lat + side * CAR_W * 1.18, -room, room);
            if (Math.abs(lane - ahead.lat) >= CAR_W) {
              car.tele.att++;
              car.pass = { id: ahead.id, side, lane, t: 9 };
              ahead.hold = { lat: ahead.lat, t: 10, by: car.id };
            }
          }
        }
        // until it has pulled out alongside, a car stays a car length behind
        const clear = car.pass && car.pass.id === ahead.id && Math.abs(car.lat - ahead.lat) >= CAR_W * 0.92;
        // (a car that is passing this one, alongside, is not one to queue behind)
        const beside = ahead.pass && ahead.pass.id === car.id && dS < CAR_L;
        if (!clear && !beside && (!lapped || dS < 9)) car._vt = Math.min(car._vt, Math.max(ahead.v * 0.85, ahead.v + (dS - (car.battle === 'attack' ? 8.5 : 10)) * 0.7));
      }
      // never through a car: the nearest one on this line (not always the nearest ahead) is braked for
      // in time, however fast we're closing, until we've pulled out alongside it
      let line = null, dL = 1e9;
      for (const o of onTrack) {
        if (o === car || Math.abs(o.lat - car.lat) >= CAR_W) continue;
        let d = ((o.dist % L) + L) % L - s; if (d < 0) d += L;
        if (d < dL && d < 120) { dL = d; line = o; }
      }
      if (line && dL > CAR_L * 0.5 && car.v > line.v && !(line.pass && line.pass.id === car.id && dL < CAR_L)) {
        const room = Math.max(0, dL - CAR_L - 1.5);
        car._vt = Math.min(car._vt, line.v + Math.sqrt(2 * 30 * room));
      }
    }

    // team orders: the car letting its teammate by eases off until the other is past (or the window closes)
    for (const car of onTrack) {
      if (!car.letBy) continue;
      const m = this.byId.get(car.letBy.id);
      car.letBy.t -= DT;
      if (!m || m.dnf || m.pit || car.letBy.t <= 0 || m.dist > car.dist + CAR_L * 1.5) { car.letBy = null; continue; }
      if (car.letBy.wait > 0) { car.letBy.wait -= DT; continue; }   // a reluctant driver takes a moment
      if (car.dist - m.dist < 60) car._vt *= car.letBy.slow ?? 0.94;
    }

    // a car making a move: alongside it gets a run on the other (the tow, its battery and its nerve);
    // out of time it backs off and tucks in behind rather than turn in on it
    for (const car of onTrack) {
      if (!car.pass) continue;
      const o = this.byId.get(car.pass.id);
      if (!o) continue;
      if (o.hold && o.hold.by === car.id) o.hold.t = Math.max(o.hold.t, 0.5);   // it keeps its line until the move is done
      if (car.pass.abort) {
        // backing off to tuck in behind: once it's behind, the move is over (a car already ahead never slows for one behind)
        let d = (o.dist - car.dist) % L; if (d > L / 2) d -= L; if (d < -L / 2) d += L;
        if (d < 0) car.pass = null; else car._vt = Math.min(car._vt, o.v * 0.93);
        continue;
      }
      if (Math.abs(car.lat - o.lat) >= CAR_W * 0.92) {
        const str = T.straight[Math.floor(((car.dist % L) + L) % L)];
        car._vt *= 1 + (str ? 0.03 : 0.015) + (car.battle === 'attack' ? 0.01 : 0) + (car.ersMode === 'deploy' && car.ers > 0 ? 0.015 : 0);
      }
    }

    // integrate
    for (const car of active) {
      if (this.t < car.react) continue;
      const s0 = ((car.dist % L) + L) % L, i = Math.floor(s0);
      let vt = car._vt;
      // a car coming in brakes for the pit entry on the way to the line
      if (!car.pit && car.pitReq && !car.finished && car.dist > 0) {
        let rel = s0; if (rel > L / 2) rel -= L;
        const toEntry = T.pit.inS - rel;
        if (toEntry > 0 && toEntry < 250) vt = Math.min(vt, 44 + Math.sqrt(2 * 24 * toEntry));
        // a queue just inside the entry: be ready to stop behind it
        if (toEntry > 0 && toEntry < 120) vt = this.pitFollow(car, vt, rel, true);
      }
      // pit lane
      if (car.pit) vt = this.pitLane(car, vt, s0);
      if (car.stopT > 0) {
        car.stopT -= dt; car.v = 0;
        // the crew holds the car until the fast lane behind it is clear (no unsafe release)
        if (car.stopT <= 0 && (car.pit.wait = (car.pit.wait || 0) + dt) < 6 && !this.pitClear(car)) car.stopT = dt * 0.999;
        else if (car.stopT <= 0) this.finishStop(car);
        continue;
      }
      if (vt > car.v) car.v = Math.min(vt, car.v + (13 * (1 - car.v / 92) + 1.5) * dt * (car.pace === 'push' ? 1.03 : 1) * (car.pass && !car.pass.abort ? 1.3 : 1));
      else car.v = Math.max(vt, car.v - 46 * dt);
      car.v = Math.max(0, car.v);
      car.dist += car.v * dt;
      car.tyre.fresh += car.v * dt;
      // tyre wear
      let wr = car.v * dt / (LIFE[car.tyre.c] * this.life * L) * this.wearMul;
      if (car.pace === 'push') wr *= 1.5; else if (car.pace === 'save') wr *= 0.65;
      if (car.battle === 'attack') wr *= 1.1;
      wr *= 1.25 - 0.45 * car.traits.tyre;
      if (car.dna) wr *= car.dna.wear;
      if (car.hot && isDry(car.tyre.c)) wr *= 1 + 6 * car.hot;          // overheating tyres wear fast
      car.tele.wearSum += wr; car.tele.dist += car.v * dt;
      if (car.tyre.c === 'I') wr *= 1 + Math.max(0, 0.25 - w) * 12;
      if (car.tyre.c === 'W') wr *= 1 + Math.max(0, 0.45 - w) * 11;
      car.tyre.wear = Math.min(1.05, car.tyre.wear + wr);
      // lateral: racing line, overtaking lane, lapped cars moving aside, pit lane
      let latT = T.ideal[i];
      if (car.hold && car.hold.t > 0) { car.hold.t -= dt; latT = car.hold.lat; }   // keeps its line while being passed
      if (car.pass) {
        const o = this.byId.get(car.pass.id);
        car.pass.t -= dt;
        // the lane is a car's width off the other car, wherever it is
        const room = T.half - 1.6;
        car.pass.lane = clamp(o.lat + car.pass.side * CAR_W * 1.18, -room, room);
        latT = car.pass.lane;
        const os = ((o.dist % L) + L) % L; let d = s0 - os; if (d < -L / 2) d += L; if (d > L / 2) d -= L;
        if (!car.pass.contactChecked && Math.abs(d) < 2 && !o.pit && !o.dnf) {
          car.pass.contactChecked = true;
          const pc = 0.012 * (car.battle === 'attack' ? 1.6 : 1) * (o.battle === 'defend' ? 1.5 : 1) * (1 + 3 * w) * (this.venue.street ? 1.6 : 1)
            * (car.dna ? car.dna.contact : 1) * (o.dna ? o.dna.contact : 1);
          if (this.r() < pc) { this.contact(car, o); car.pass = null; }
        }
        // out of time and still alongside: back off and tuck in behind rather than turn in on it
        if (car.pass && car.pass.t <= 0 && !car.pass.abort && d > -CAR_L && d <= CAR_L + 2.5 && !o.pit && !o.dnf) car.pass.abort = true;
        if (car.pass && car.pass.abort && d > -CAR_L - 1 && car.pass.t > -6) { /* keep the lane until clear behind */ }
        else if (car.pass && (d > CAR_L + 2.5 || car.pass.t <= 0 || o.pit || o.dnf)) {
          if (d > 0 && d < L / 2 && !o.pit && !o.dnf && !o.finished) this.overtook(car, o);
          if (o.hold && o.hold.by === car.id) o.hold = null;
          car.pass = null;
        }
      }
      if (car.yieldT > 0) { car.yieldT -= dt; latT = car.yieldSide * 3.8; }
      if (car.offT > 0) { car.offT -= dt; latT = car.offSide * (T.half + 2); }
      if (car.failing) {
        latT = car.failing.side * (T.half + 4);
        car.failing.v = Math.max(0, car.failing.v - 6 * dt);
        if (car.failing.v <= 0.5 && (car.pit || Math.abs(car.lat - latT) < 0.6)) this.retire(car);
      }
      if (car.finished) latT = T.ideal[i] * 0.5;
      if (car.pit) latT = car.pitLat;   // a car that takes the flag in the pit lane stays in it
      // (in the pit lane a car only moves across as fast as it rolls forward: it steers, it never crabs)
      const rate = car.pit ? (car.pit.path ? 0.6 + car.v * 1.2 : Math.min(Math.abs(latT - car.lat) > 7 ? 12 : 9, 1.6 + car.v * 0.45, 0.15 + car.v * 0.55)) : car.offT > 0 || car.failing ? 6 : car.pass ? 3.6 : 2.6;
      const nl = car.lat + clamp(latT - car.lat, -rate * dt, rate * dt);
      // in the pit lane, never slide sideways into a car alongside: wait for it to pass
      // on track too: never slide sideways into a car alongside (a spinning or crashing car aside)
      if (!car.pit) { if (car.offT > 0 || car.failing || !this.sideBlocked(car, nl)) car.lat = nl; }
      else if (this.pitBeside(car, nl)) car.pit.blk = (car.pit.blk || 0) + dt;
      else { car.lat = nl; car.pit.blk = 0; }
      // mistakes
      if (!car.pit && !T.straight[i] && car.mistakeT <= 0 && !car.finished) this.maybeMistake(car, w, i);
      if (car.pressT > 0) car.pressT -= dt;
      // Driver DNA: each corner, the risks a driver's style takes
      if (car.dna) {
        const n = T.turnAt[i];
        if (n < 0) car.lastTurn = -1;
        else if (n !== car.lastTurn) { car.lastTurn = n; if (!car.pit && !car.finished && car.mistakeT <= 0 && car.dist > 0 && !this.sc) this.dnaCorner(car, n, w); }
      }
      if (!car.pit && !car.finished && !car.failing && car.dist > 0 && !(this.stage && this.stage.calm)) this.reliability(car, dt);
      // pit entry
      const s1 = ((car.dist % L) + L) % L;
      const pin = ((T.pit.inS % L) + L) % L;
      const crossed = (a, b, x) => (a <= b ? a < x && b >= x : x > a || x <= b);
      if (!car.pit && car.pitReq && car.dist > 0 && !car.finished && crossed(s0, s1, pin)) this.enterPit(car);
      // laps and timing
      this.timing(car);
    }

    this.separate();
    if (this.stage) this.cues();
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
      // a lap-by-lap record for the race report (read only; nothing in the race depends on it)
      car.trace.push({ lap: ln, at: this.t, pos: car.pos, tyre: car.tyre.c, wear: car.tyre.wear });
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
      car.wobble = 1 + this.r.range(-0.0025, 0.0025) * (car.dna ? car.dna.variance : 1);
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
    car.pit = { phase: 'in', box: car.pitReq, seq: this.pitSeq = (this.pitSeq || 0) + 1 };
    car.pitLat = T.pit.fast;
    car.pass = null;
    if (car.player) this.emit('pit', `${car.code} is in the pit lane.`, car);
  }

  pitLane(car, vt, s) {
    const T = this.track, L = T.L, P = T.pit;
    let rel = s; if (rel > L / 2) rel -= L; // pit zone straddles the line
    // a car held at a standstill in the lane for seconds is in a knot (two cars each waiting for the
    // other): it squeezes on through at a crawl, the one rule that never deadlocks
    car.pit.knot = car.v < 0.1 && car.pit.phase !== 'stop' ? (car.pit.knot || 0) + DT : 0;
    if (car.pit.phase === 'in') {
      // brake smoothly down to the limit through the entry, so a car close behind can follow
      vt = Math.min(vt, rel > P.inS + 35 ? P.speed : Math.sqrt(P.speed * P.speed + 2 * 20 * (P.inS + 35 - rel)));
      // a double stack: with the teammate still ahead in or at the box, pull into the working lane
      // just behind it and wait there; move up once the teammate has pulled away
      const box = P.box[car.team.box], spacing = P.box[1] - P.box[0];
      const mate = this.cars.find((o) => o !== car && o.team.id === car.team.id && o.pit && !o.dnf);
      let mr = mate ? ((mate.dist % L) + L) % L : 0; if (mr > L / 2) mr -= L;
      const stacked = mate && (mr > rel + 0.5 || (Math.abs(mr - rel) <= 0.5 && mate.pit.seq < car.pit.seq)) && mr < box + 9;
      const turn = Math.min(9, spacing - 7.8);
      // the second car waits a car's length short of its box on the line halfway between the
      // lanes, clear of the cars in the boxes and of the fast lane, so nobody else is held up
      const teamBox = stacked ? box - CAR_L - 0.5 : box;
      // stay in the fast lane past every other team's box, and only turn in at your own
      // slowing for the box, move halfway across first (clear of the cars in the boxes and of the
      // fast lane), so the cars behind can carry on past at the limit
      // the turn into the box is a path, not a slide: from where the car starts turning to the box it
      // eases across as it rolls forward, so it drives in at an angle instead of drifting sideways
      // (a car still crossing from the track, at a box right by the entry, starts turning sooner)
      if (!stacked && ((car.pit.p0 && !car.pit.p0.out) || rel > box - Math.max(turn, Math.abs(car.lat - P.lat) * 2.6))) {
        const p0 = car.pit.p0 ||= [Math.min(rel, box - 0.5), car.lat];
        const k = clamp((rel - p0[0]) / (box - p0[0]), 0, 1);
        car.pitLat = p0[1] + (P.lat - p0[1]) * k * k * (3 - 2 * k); car.pit.path = true;
      } else { car.pit.p0 = null; car.pit.path = false; car.pitLat = rel > box - 40 ? (P.lat + P.fast) / 2 : P.fast; }
      // two cars diving in side by side: the one behind holds its line and tucks in behind
      if (rel < P.inS + 60 && rel < box - 45 && !car.pit.path) {
        for (const o of this.cars) {
          if (o === car || !o.pit || o.dnf || o.pit.phase !== 'in') continue;
          let r = ((o.dist % L) + L) % L; if (r > L / 2) r -= L;
          if (r > rel && r - rel < CAR_L + 1 && Math.abs(o.lat - car.lat) < CAR_W + 0.6) { car.pitLat = car.lat; vt = Math.min(vt, o.v - 3); }
        }
      }
      if (stacked) {
        vt = Math.min(vt, Math.sqrt(2 * 26 * Math.max(0, teamBox - rel)), Math.max(0, (teamBox - rel) * 2.2));
        return this.pitFollow(car, vt, rel);
      }
      // brake into the box on a steady curve, and stop there once across in the lane
      vt = Math.min(vt, Math.sqrt(2 * 34 * Math.max(0, teamBox - rel)) + 1.5);
      if (rel >= teamBox - 0.6 && rel < teamBox + 20 && Math.abs(car.lat - P.lat) > 1.5) vt = Math.min(vt, Math.max(0, (teamBox + 0.5 - rel) * 2)); // still crossing: wait at the box
      else if (rel >= teamBox - 0.6 && rel < teamBox + 20) {
        car.pit.phase = 'stop';
        if (Math.abs(teamBox - rel) < 8) car.dist += teamBox - rel;
        car.lat = car.pitLat; car.prevLat = car.lat;
        let stop = 1.9 + this.r.range(0, 0.6);
        if (this.r() < 0.04) { stop += this.r.range(2, 4); this.slowStop = car.id; }
        car.stopT = stop; car.stopLen = stop;
        car.v = 0;
        return 0;
      }
      if (rel > teamBox - 25) vt = Math.min(vt, Math.max(3, (teamBox - rel) * 3.2));
    } else if (car.pit.phase === 'out') {
      vt = Math.min(vt, P.speed);
      // out of the box the same way: across to the fast lane over the first 16 m it rolls
      const p0 = car.pit.p0 = car.pit.p0 && car.pit.p0.out ? car.pit.p0 : Object.assign([rel, car.lat], { out: true });
      const k = clamp((rel - p0[0]) / 16, 0, 1);
      car.pitLat = p0[1] + (P.fast - p0[1]) * k * k * (3 - 2 * k); car.pit.path = k < 1;
      if (!car.pit.looked && rel > P.box[car.team.box] + 4) { car.pit.looked = true; this.exitBattle(car, rel); }
      if (rel > P.outS - 40) car.pitLat = 0;
      if (rel > P.outS) { car.pit = null; car.pitLat = 0; }
    }
    return this.pitFollow(car, vt, rel);
  }

  // a car within a car's length that a sideways move to lat would run into. After a second of
  // waiting only cars alongside or ahead count, so two cars side by side can never block each other
  // (the one further back gives way). A car just released has the fast lane: the crew checked it was clear
  sideBlocked(car, lat) {
    const L = this.track.L;
    for (const o of this.cars) {
      if (o === car || o.pit || o.dnf || o.finished || o.dist <= 0) continue;
      let d = (o.dist - car.dist) % L; if (d > L / 2) d -= L; if (d < -L / 2) d += L;
      if (Math.abs(d) < CAR_L + 0.5 && Math.abs(o.lat - lat) < CAR_W && Math.abs(o.lat - lat) < Math.abs(o.lat - car.lat)) return true;
    }
    return false;
  }
  pitBeside(car, lat) {
    const L = this.track.L;
    if (car.pit.knot > 4) return false;
    for (const o of this.cars) {
      if (o === car || o.dnf || o.finished || o.dist <= 0) continue;
      let d = (o.dist - car.dist) % L; if (d > L / 2) d -= L; if (d < -L / 2) d += L;
      if (d > (car.pit.blk > 1 || car.pit.phase === 'out' ? -2.5 : -CAR_L - 0.4) && d < CAR_L + 0.4 && Math.abs(o.lat - lat) < CAR_W + 0.2 && Math.abs(o.lat - lat) < Math.abs(o.lat - car.lat)) return true;
    }
    return false;
  }

  // no car drives into the one ahead in the pit lane: in the same lane, keep a car's length and more
  pitFollow(car, vt, rel, anyLane) {
    const ahead = this.pitAhead(car, rel, anyLane);
    if (ahead && !(car.pit && car.pit.knot > 4)) {
      const gap = ahead.d - CAR_L - 0.6;   // free road beyond a car's length and a little more
      vt = Math.min(vt, Math.max(0, ahead.o.v + (gap > 0 ? Math.sqrt(2 * 30 * gap) : 4 * gap)));
    }
    return vt;
  }

  // the nearest car ahead in the same pit lane, and how far ahead it is (m)
  pitAhead(car, rel, anyLane) {
    const L = this.track.L, P = this.track.pit, entering = (c) => Math.abs(c.lat) < Math.abs(P.fast) - 1;
    let best = null;
    for (const o of this.cars) {
      // the same lane: less than a car's width apart, or both still crossing over from the track
      if (o === car || !o.pit || o.dnf || (!anyLane && Math.abs(o.lat - car.lat) >= CAR_W && !(entering(o) && entering(car)))) continue;
      if (anyLane && Math.abs(o.lat) > Math.abs(P.fast) + 2) continue;   // already in the working lane
      let r = ((o.dist % L) + L) % L; if (r > L / 2) r -= L;
      const d = r - rel;
      if (d > 0 && d < 70 && (!best || d < best.d)) best = { o, d };
    }
    return best;
  }

  // is the fast lane clear for a car leaving its box? (no car in it from 30 m behind to a car's length ahead)
  pitClear(car) {
    const L = this.track.L, P = this.track.pit;
    let rel = ((car.dist % L) + L) % L; if (rel > L / 2) rel -= L;
    for (const o of this.cars) {
      if (o === car || !o.pit || o.dnf || o.stopT > 0 || o.team.id === car.team.id || Math.abs(o.lat - P.fast) > 3.5 * Math.abs(P.fast)) continue;
      if (Math.abs(o.lat - P.fast) > 3 && Math.abs(o.lat) > Math.abs(P.fast)) continue; // in the working lane
      let r = ((o.dist % L) + L) % L; if (r > L / 2) r -= L;
      // alongside, or coming down the lane fast enough to be there in well under a second
      if (r >= rel - CAR_L - 2 && r < rel + CAR_L + 2) return false;
      if (r < rel && o.v > 3 && (rel - r) / o.v < 0.7) return false;
    }
    return true;
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
    car.tyre = { c, wear: 0, laps: 0, fresh: 0, temp: 0.4 };   // out of the blankets, a little under the window
    car.puncture = false;
    if (!car.used.includes(c)) car.used.push(c);
    car.stops++; (car.stopTimes ||= []).push(car.stopLen);
    car.pitReq = null; car.pit.phase = 'out'; car.stopT = 0;
    car.mismatch = 0;
    car.plan = this.lapsLeft(car) > 2 && isDry(c) && !this.ruleMet(car) ? this.planStops(car) : { lap: null, next: null };
    if (car.stopsLeft && car.stopsLeft.length && isDry(c)) { const s = car.stopsLeft.shift(); if (s.lap > Math.floor(car.dist / this.track.L) && this.lapsLeft(car) > 1) car.plan = { lap: s.lap, next: s.tyre }; }
    car.advised = {};
  }

  // dry races need two different dry compounds, unless a wet tyre was used
  ruleMet(car) {
    if (car.used.some((c) => !isDry(c))) return true;
    return new Set(car.used).size >= 2;
  }

  // A corner's risks for a driver with DNA: braking late can lock a wheel, a committed line can run
  // wide, confidence in the wet can spin. The odds grow with the square, so a moderate style is cheap
  // and an extreme one is not. Each event names the settings behind it.
  dnaCorner(car, n, w) {
    const d = car.dna, r = this.rd, P = car.dnaProfile ? car.dnaProfile.params : null;
    const worn = 1 + car.tyre.wear;
    const why = (keys) => keys.filter((k) => P && P[k] > 55).sort((a, b) => P[b] - P[a]);
    if (d.lockup > 0 && r() < 0.016 * d.lockup * d.lockup * worn) {
      car.mistakeT = 1.4; car.mistakeV = car.v * 0.7; car.tyre.wear = Math.min(1.05, car.tyre.wear + 0.02); car.tele.lockups++;
      this.emit('dna', `${car.code} locks up into Turn ${n + 1}.`, car, { kind: 'lockup', turn: n + 1, keys: why(['late_braking', 'entry_speed']) });
    } else if (d.wide > 0 && r() < 0.012 * d.wide * d.wide * worn) {
      const big = r() < 0.2;   // now and then it's a proper trip across the run-off
      car.mistakeT = big ? 2.2 : 1.5; car.mistakeV = big ? 10 : car.v * 0.66; car.offT = big ? 1.8 : 0.9; car.offSide = Math.sign(this.track.k[this.track.apex[n]]) > 0 ? -1 : 1; car.tele.wides++;
      this.emit('dna', `${car.code} runs wide at Turn ${n + 1}.`, car, { kind: 'wide', turn: n + 1, keys: why(['corner_commitment', 'kerb_usage', 'entry_speed']) });
    } else if (w > 0.2 && d.wetRisk > 0 && r() < 0.02 * d.wetRisk * w) {
      car.mistakeT = 2.0; car.mistakeV = 12; car.offT = 1.4; car.offSide = 1; car.tele.spins++;
      this.emit('dna', `${car.code} spins at Turn ${n + 1} on the wet track.`, car, { kind: 'spin', turn: n + 1, keys: why(['wet_confidence', 'throttle_aggression']) });
    }
  }

  maybeMistake(car, w, i) {
    let p = 0.00006;
    if (car.tyre.wear > 0.8) p *= 4;
    if (isDry(car.tyre.c) && w > 0.25) p *= 1 + 14 * (w - 0.2);
    if (car.tyre.c === 'W' && w < 0.3) p *= 2;
    if (car.pace === 'push') p *= 1.8;
    if (car.battle === 'attack') p *= 1.3;
    p *= 1.4 - 0.6 * (w > 0.3 ? car.traits.wet : car.traits.pace);
    if (car.dna) p *= car.dna.mistakes;
    if (this.r() > p) return;
    car.tele.mistakes++;
    const big = this.r() < 0.22;
    if (big) {
      car.mistakeT = 2.2; car.mistakeV = 9;
      car.offT = 1.8; car.offSide = Math.sign(this.track.k[i]) > 0 ? -1 : 1;
      // (over a full Grand Prix the drivers make many more mistakes, so fewer of them end in the wall)
      const out = isDry(car.tyre.c) && w > 0.5 && this.r() < (this.life > 1 ? 0.25 * 0.35 : 0.25);
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
      car.pitReq = c; car.pitBy = 'puncture'; // not a call: the car has to come in
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
    // a full Grand Prix has many more fights, so fewer touches end in the wall (the same draw either way)
    if (r() < (this.life > 1 ? 0.35 * 0.4 : 0.35)) {
      victim.lat = (victim.lat >= 0 ? 1 : -1) * (this.track.half + 6);
      this.retire(victim, 'crash', `Contact between ${car.code} and ${o.code}! ${victim.code} is in the wall. Out of the race.`);
      other.mistakeT = 1.5; other.mistakeV = other.v * 0.6;
      if (!other.puncture && r() < 0.4) { other.puncture = true; other.pitReq ||= isDry(other.tyre.c) ? this.dryChoice(other) : other.tyre.c; this.emit('incident', `${other.code} has a puncture after the contact.`, other); }
    } else {
      for (const c of [car, o]) { c.mistakeT = 1.6; c.mistakeV = c.v * 0.55; c.offT = 1.2; c.offSide = c.lat >= 0 ? 1 : -1; c.tele.contacts++; }
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

  // Racing Academy scenes: a safety car on cue, so a lesson can teach the call that goes with it
  cues() {
    for (const q of this.stage.cues || []) {
      if (q.done || this.t < q.t) continue;
      if (q.sc && !this.sc && this.leaderLap() < this.laps - 1) { q.done = true; this.emit('flag', 'Debris on the track.', null); this.deploy(q.sc, null); }
    }
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

  // no car drives through another: side by side they keep a car's width apart, nose to tail a car's length
  separate() {
    const L = this.track.L, room = this.track.half - 1.4;
    // cars in the pit lane count too (a stopped car sits in its box, out of the way)
    const cars = this.cars.filter((c) => !c.dnf && !c.finished && c.dist > 0 && !(c.stopT > 0));
    for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
      const A = cars[a], B = cars[b];
      let d = (A.dist - B.dist) % L; if (d > L / 2) d -= L; if (d < -L / 2) d += L;
      if (Math.abs(d) >= CAR_L) continue;
      const dl = A.lat - B.lat;
      if (Math.abs(dl) >= CAR_W) continue;
      const passing = (A.pass && A.pass.id === B.id) || (B.pass && B.pass.id === A.id);
      if (A.pit || B.pit) {
        // in or next to the pit lane nobody is pushed sideways: the one behind waits
        const [back, front] = d < 0 ? [A, B] : [B, A];
        if (Math.abs(d) < CAR_L) { back.dist -= Math.min(0.15, CAR_L - Math.abs(d)); back.v = Math.min(back.v, front.v * 0.6); }
      } else if (Math.abs(d) < CAR_L * 0.6) {
        // alongside: ease apart sideways, the passing car doing most of the moving
        const push = Math.min(0.14, (CAR_W - Math.abs(dl)) * 0.5) * (dl >= 0 ? 1 : -1);
        const wa = A.pass && A.pass.id === B.id ? 0.8 : B.pass && B.pass.id === A.id ? 0.2 : 0.5;
        A.lat = clamp(A.lat + push * wa * 2, -room, room);
        B.lat = clamp(B.lat - push * (1 - wa) * 2, -room, room);
      } else {
        // nose to tail: the one behind lifts
        const [back, front] = d < 0 ? [A, B] : [B, A];
        const gap = Math.abs(d);
        back.dist -= Math.min(0.8, CAR_L - gap); back.v = Math.min(back.v, front.v);
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
    const delay = (3 + (1 - car.traits.brain) * 22) * (car.dna ? car.dna.changeDelay : 1);
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
        // like a real pit wall, avoid a double stack: a planned stop waits a lap while the teammate is boxing
        const m = this.mate(car), stagger = m && (m.pitReq || m.pit) && !mustStop && !cheap && left > 2 && car.tyre.wear < 0.93;
        if ((planned || late || mustStop || cheap) && !stagger && !(this.rain > 0.05 && car.traits.brain > 0.6 && left > 2)) {
          call = car.plan.next || this.dryChoice(car);
          if (car.used.length === 1 && call === c) call = this.dryChoice(car, c);
          if (!cheap || planned || late || mustStop) why = late ? 'These tyres are finished. Box!' : mustStop ? 'We still need a second compound. Box now.' : 'Pit window is open.';
        }
      }
    }
    // a box call you made yourself is never replaced by the strategist's, even after a handover
    if (call && (!car.pitReq || car.pitReq !== call) && !(car.pitReq && car.pitBy === 'principal')) {
      if (car.player && (!car.auto || car.ask) && !car.assist) {
        const key = call + ':' + Math.floor(car.dist / this.track.L);
        if (!car.advised[key]) {
          car.advised[key] = true;
          // in Team Principal mode the engineer never tells you what to do unasked: you get the fact
          // (fact) and can ask for the engineer's view; the text is kept for the race log
          this.emit('advice', `${why} Box for ${COMPOUNDS[call].name}s?`, car, { from: 'engineer', action: { box: call }, fact: FACTS[why] || 'Pit window is open.' });
        }
      } else if (!car.player || this.may(car, car.auto ? 'strategist' : 'engineer', { box: call })) {
        car.pitReq = call; car.pitBy = car.player ? (car.auto ? 'strategist' : 'engineer') : null;
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
    // the strategist's team order: a teammate on much fresher tyres right behind gets waved through
    const m = this.mate(car), lapNow = this.lapOf(car);
    // the strategist only swaps two cars it runs: your car in Team Principal mode is yours alone
    if (m && (!m.player || m.auto) && !car.letBy && m.ahead === car && m.dS < 30 && m.tyre.wear + 0.3 < car.tyre.wear && lapNow - car.orderLap > 3 && this.lapsLeft(car) > 1 && !this.sc) {
      car.orderLap = lapNow; this.teamOrder(car, 'swap');
    }
    car.ersMode = car.ers < 0.2 ? 'harvest' : close && car.ers > 0.3 ? 'deploy' : car.ers > 0.85 ? 'deploy' : 'balanced';
    const left = this.lapsLeft(car);
    car.pace = left <= 2 && close ? 'push' : car.tyre.wear > 0.62 && car.plan.lap && left > 3 ? 'save' : 'normal';
    car.battle = close && car.traits.aggro > 0.55 ? 'attack' : 'neutral';
  }

  adviseLap(car) {
    const left = this.lapsLeft(car);
    if (!this.ruleMet(car) && left === 2 && !car.pitReq) {
      this.emit('advice', 'Reminder: you must use a second dry compound. Box this lap or take a penalty.', car,
        { from: 'engineer', action: { box: this.dryChoice(car, car.tyre.c) }, fact: 'Rule check: a second dry compound is still needed, or a penalty. 2 laps left.' });
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
