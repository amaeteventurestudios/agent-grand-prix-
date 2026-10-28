// The pit wall on WhatsApp: when your agents have the race (Autonomous with check-ins), a pit call
// becomes a card for you. Every number on a card comes from the running race: the gaps, the tyres,
// the battery, the forecast, the stop's cost measured on this circuit. Each option says what it
// leads to, the pick carries a confidence and the reasons for it, and the card runs out: at its
// deadline the agent's pick (or the safe one) runs, and if the race moves on first the card expires.
// Your answers teach the agent your habits: three of the same answer to the same kind of call and it
// becomes its pick. In Team Principal mode none of this is sent: the engineer stays quiet.
import { COMPOUNDS } from '../js/data.js';
import { LIFE } from '../js/sim.js';

export const NUM = ['1️⃣', '2️⃣', '3️⃣'];
const DOT = { S: '🔴', M: '🟡', H: '⚪', I: '🟢', W: '🔵' };
export const tyreName = (c) => `${COMPOUNDS[c].name} ${DOT[c]}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const lapOf = (R, c) => Math.max(1, Math.min(R.laps, Math.floor(c.dist / R.track.L) + 1));
const lapSeconds = (R) => { const lead = R.order[0], laps = lead ? lead.dist / R.track.L : 0; return laps > 0.5 ? R.t / laps : null; };
const KIND_NAME = { window: 'pit window', worn: 'worn tyres', rule: 'second compound', sc: 'safety car', rain: 'rain', dry: 'drying track' };

// what kind of call this is, from the strategist's reason
export function kindOf(why) {
  if (/safety car/i.test(why)) return 'sc';
  if (/second compound/i.test(why)) return 'rule';
  if (/finished/i.test(why)) return 'worn';
  if (/dry line|overheating/i.test(why)) return 'dry';
  if (/wet|inters|standing water/i.test(why)) return 'rain';
  return 'window';
}

// the weather now and next, from the race's own forecast
export function forecast(L) {
  const R = L.R, W = L.setup.weather, ls = lapSeconds(R);
  const raining = R.rain > 0.05;
  const coming = W.showers.filter((x) => x.start > R.t).sort((a, b) => a.start - b.start)[0];
  const current = W.showers.find((x) => x.start <= R.t && x.end > R.t);
  const lapsTo = (t) => (ls ? Math.max(1, Math.round((t - R.t) / ls)) : null);
  return {
    raining, wetTrack: R.wet > 0.17,
    now: raining ? (R.rain > 0.5 ? 'heavy rain' : 'raining') : R.wet > 0.17 ? 'wet track' : 'dry',
    rainIn: !raining && coming ? lapsTo(coming.start) : null,
    dryIn: raining && current ? lapsTo(current.end) : null,
  };
}
export function weatherLine(L, temp) {
  const f = forecast(L);
  const next = f.rainIn && f.rainIn <= 8 ? ` · rain likely in about ${plural(f.rainIn, 'lap')}` : f.dryIn && f.dryIn <= 8 ? ` · rain stops in about ${plural(f.dryIn, 'lap')}` : '';
  return `🌦️ ${temp}, ${f.now}${next}`;
}

// what a stop costs here: measured from every car's stops in this race (a fair guess until then)
export function watchStops(L) {
  const R = L.R; L.pitWatch ||= {}; L.losses ||= [];
  for (const c of R.cars) {
    if (c.pit && !L.pitWatch[c.id]) L.pitWatch[c.id] = { gap: c.gap, sc: !!R.sc };
    else if (!c.pit && L.pitWatch[c.id]) {
      const w = L.pitWatch[c.id]; delete L.pitWatch[c.id];
      if (!w.sc && !R.sc && c.gap - w.gap > 2) L.losses.push(c.gap - w.gap);
      // validation: was the card's "out about P_" right (within a place)? kept per player
      const pr = L.proj && L.proj[c.id];
      if (pr) { delete L.proj[c.id]; if (L.calib) { L.calib.total++; if (Math.abs(c.pos - pr) <= 1) L.calib.right++; } }
    }
  }
}
export function stopCost(L) {
  const a = [...(L.losses || [])].sort((x, y) => x - y);
  const base = a.length >= 3 ? a[Math.floor(a.length / 2)] : 6.5;
  return L.R.sc ? base * (L.R.sc.kind === 'VSC' ? 0.6 : 0.45) : base;
}
// where a car comes out if it stops now: everyone within the stop's cost behind it gets by
export function rejoin(L, car) {
  const R = L.R, loss = stopCost(L);
  const passed = R.order.filter((o) => o !== car && !o.dnf && !o.pit && o.gap > car.gap && o.gap - car.gap < loss).length;
  return { pos: car.pos + passed, passed, loss };
}
// laps a compound lasts here (wear to about 90%), and laps of grip left on the car's tyres
const lifeLaps = (R, c) => Math.max(1, Math.round(LIFE[c] * (R.life || 1) / (R.venue?.wear || 1)));
function gripLeft(car) {
  const per = car.tyre.laps > 0 ? car.tyre.wear / car.tyre.laps : 0;
  return per > 0 ? Math.max(0, Math.floor((0.9 - car.tyre.wear) / per)) : null;
}

export function carCard(L, c, temp) {
  const R = L.R, i = R.order.indexOf(c), ahead = R.order[i - 1], behind = R.order[i + 1];
  const life = Math.round((1 - Math.min(1, c.tyre.wear)) * 100), grip = gripLeft(c);
  const gaps = [ahead ? `+${(c.gap - ahead.gap).toFixed(1)}s to P${c.pos - 1} (${ahead.code})` : 'leading', behind && !behind.dnf ? `P${c.pos + 1} ${(behind.gap - c.gap).toFixed(1)}s behind` : null].filter(Boolean).join(' · ');
  return [
    `🏁 *${c.code} · Lap ${lapOf(R, c)}/${R.laps} · P${c.pos}*`,
    `⏱️ ${gaps}`,
    `🛞 ${tyreName(c.tyre.c)} · ${life}% left${grip !== null && COMPOUNDS[c.tyre.c].dry ? (grip < 1 ? ' · grip is going' : ` · about ${plural(grip, 'lap')} of grip`) : ''}`,
    `⚡ Battery ${Math.round(c.ers * 100)}%`,
    weatherLine(L, temp),
  ];
}

// the three options, what each leads to, Teague's pick and how sure it is
export function plan(L, car, call, why, habits) {
  const R = L.R, kind = kindOf(why), f = forecast(L), left = R.lapsLeft(car), grip = gripLeft(car);
  const wear = car.tyre.wear, dry = COMPOUNDS[call].dry;
  const alt = dry ? (call === 'H' ? 'M' : call === 'M' ? 'H' : 'M') : call === 'I' ? 'W' : 'I';
  const rj = rejoin(L, car);
  const boxWhy = (c) => {
    const parts = [rj.passed ? `out about P${rj.pos} (${plural(rj.passed, 'car')} get${rj.passed === 1 ? 's' : ''} by)` : `out still P${car.pos}`];
    if (kind === 'sc') parts.push(`a stop costs about ${Math.round(rj.loss)}s under the ${R.sc && R.sc.kind === 'VSC' ? 'VSC' : 'safety car'}, about half the usual`);
    if (COMPOUNDS[c].dry && dry) { const life = lifeLaps(R, c); parts.push(life >= left ? `${COMPOUNDS[c].name.toLowerCase()}s last about ${plural(life, 'lap')}, enough for the ${plural(left, 'lap')} left` : `${COMPOUNDS[c].name.toLowerCase()}s last about ${plural(life, 'lap')}, ${left} to go`); }
    return parts.join('; ');
  };
  let stayWhy;
  const onSlicks = COMPOUNDS[car.tyre.c].dry;
  if (kind === 'rain') stayWhy = onSlicks ? (f.dryIn ? `rain stops in about ${plural(f.dryIn, 'lap')}; slicks are slow until then` : 'slicks on a wet track lose seconds a lap and risk a spin') : `inters struggle in standing water${f.dryIn ? `; rain stops in about ${plural(f.dryIn, 'lap')}` : ''}`;
  else if (kind === 'dry') stayWhy = f.rainIn && f.rainIn <= 4 ? `rain is back in about ${plural(f.rainIn, 'lap')}` : 'wet tyres on a drying track overheat and lose time';
  else if (grip !== null && grip < left) stayWhy = `${grip < 1 ? 'no grip left' : `about ${plural(grip, 'lap')} of grip`}, ${left} to go; puncture risk climbs past 90% wear`;
  else if (kind === 'rule') stayWhy = '20 s penalty at the flag without a second compound';
  else stayWhy = `keep P${car.pos}; tyres hold about ${plural(grip ?? left, 'more lap')}`;
  const opts = [
    { key: 'box', label: `Box for ${COMPOUNDS[call].name.toLowerCase()}s`, box: call, why: boxWhy(call) },
    { key: 'stay', label: 'Stay out for now', box: null, why: stayWhy },
    { key: 'alt', label: `Box for ${COMPOUNDS[alt].name.toLowerCase()}s instead`, box: alt, why: dry && COMPOUNDS[alt].dry ? boxWhy(alt) : alt === 'W' ? 'full wets: for standing water' : 'inters: for a damp or drying track' },
  ];

  // the agent's pick, with the forecast in mind, and how sure: each reason is a checked race fact
  let pick = 0; const reasons = []; let score = 0;
  if (kind === 'rain' && f.dryIn && f.dryIn <= 2 && left > 3) { pick = 1; score = 1; reasons.push(`rain stops in about ${plural(f.dryIn, 'lap')}`); }
  else if (kind === 'rain' && call === 'I' && R.rain > 0.65 && (!f.dryIn || f.dryIn > 3)) { pick = 2; score = 2; reasons.push('heavy rain that isn\'t stopping soon: the track will be soaked, so wets save a second stop'); }
  else if (kind === 'dry' && f.rainIn && f.rainIn <= 3) { pick = 1; score = 1; reasons.push(`rain is back in about ${plural(f.rainIn, 'lap')}`); }
  else {
    if (kind === 'rule') { score += 3; reasons.push('a second compound is required'); }
    if (kind === 'worn' || wear > 0.8) { score += 2; reasons.push(`tyres at ${Math.round(wear * 100)}% wear`); }
    if (grip !== null && grip < left && onSlicks) { score += grip <= 2 ? 2 : 1; reasons.push(grip < 1 ? 'no grip left' : `grip for about ${plural(grip, 'lap')}, ${left} to go`); }
    if (kind === 'sc') { score += 2; reasons.push('the stop is cheap under the safety car'); }
    if (kind === 'rain') { score += R.rain > 0.4 ? 2 : 1; reasons.push(`${f.now === 'heavy rain' ? 'heavy rain' : 'a wet track'}${onSlicks ? ' on slicks' : ' on inters'}`); if (f.dryIn && f.dryIn <= 4) score -= 1; }
    if (kind === 'dry') { score += 2; reasons.push('the track is drying'); }
    if (rj.passed === 0) { score += 1; reasons.push(`no places lost (out P${car.pos})`); }
    else if (rj.passed >= 3) { score -= 1; reasons.push(`${plural(rj.passed, 'car')} would get by`); }
  }
  // learned: the same answer three times in a row for this kind of call becomes the pick
  const h = (habits && habits[kind]) || [];
  const last3 = h.slice(-3);
  let learned = false;
  if (last3.length === 3 && last3.every((x) => x === last3[0]) && last3[0] !== pick) { pick = last3[0]; learned = true; }
  const conf = learned ? 'learned' : score >= 3 ? 'high' : score >= 1 ? 'medium' : 'low';
  // the safe fallback when nobody answers: never stay out on tyres that won't make it
  let fallback = pick;
  if (opts[pick].box === null && ((grip !== null && grip < 1) || kind === 'rule' && left <= 2)) fallback = 0;
  return { kind, opts, pick, conf, reasons, learned, fallback, call };
}

const CONF = { high: '🟢 High', medium: '🟡 Medium', low: '🔴 Low', learned: '🧠 Your usual call' };
export function cardText({ head, why, cars, q, lap, calib, name = 'Teague' }) {
  const who = cars.length > 1 ? 'both cars' : cars[0].code;
  return [
    ...head, '',
    `📻 _${why}_`,
    `*Box ${who} now?*`,
    ...q.opts.map((o, k) => `${NUM[k]} ${k === q.pick ? '⭐ ' : ''}*${o.label}*\n      ${o.why}`),
    '',
    `*${name}'s pick: ${q.pick + 1}* · Confidence ${CONF[q.conf]}`,
    calib && calib.total >= 3 ? `_Track record: my "out about P_" calls were right ${calib.right} of ${calib.total} times._` : '',
    q.learned ? `_You chose this the last 3 times on a ${KIND_NAME[q.kind]} call._` : q.reasons.length ? `_Because: ${q.reasons.join(', ')}._` : '',
    '',
    `_Reply 1, 2 or 3, or just say it ("yes", "stay out", "mediums"). No reply by ${q.due === lap + 1 ? 'the end of this lap' : `lap ${q.due}`} and I'll do ${q.fallback + 1}${q.fallback !== q.pick ? ' (the safe call)' : ''}._`,
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
}

// words as answers: "yes" takes the pick, "stay out" or "no" stays out, a tyre name picks that stop
export function wordsToOption(t, q) {
  const s = t.toLowerCase().replace(/[!.?,]+/g, ' ').trim();
  const tyreIn = (/\bsoft/.test(s) && 'S') || (/\bmedium/.test(s) && 'M') || (/\bhard/.test(s) && 'H') || (/\binter/.test(s) && 'I') || (/\bwet/.test(s) && 'W') || null;
  if (tyreIn) { const k = q.opts.findIndex((o) => o.box === tyreIn); return k >= 0 ? k : { box: tyreIn }; }
  if (/^(no|nah|nope|not yet|wait|hold|stay|stay out|don'?t( box)?|keep going|no box)\b/.test(s)) return 1;
  if (/^(yes|yeah|yep|yup|ok|okay|sure|do it|go|go for it|agreed?|box( box)?|pit( now)?|send it|your call|you decide|do your pick|take your pick)\b/.test(s)) return q.pick;
  return null;
}

// a card that no longer fits the race: the safety car went in, the rain stopped, the car stopped
export function stale(L, q, car) {
  const R = L.R;
  if (car.pit || car.pitReq) return 'the car is already in the pits';
  if (q.kind === 'sc' && !R.sc) return 'the safety car has gone in';
  if (q.kind === 'rain' && R.wet < 0.12 && R.rain <= 0.05) return 'the rain has stopped and the track is dry';
  if (q.kind === 'dry' && R.rain > 0.3) return 'it is raining again';
  return null;
}

// the race's story for the result card: each car's tyres stint by stint
export function stints(L) {
  const R = L.R; L.stints ||= {};
  for (const id of L.mine) {
    const c = R.byId.get(id), s = (L.stints[id] ||= [{ c: c.tyre.c, lap: 1 }]);
    if (s[s.length - 1].c !== c.tyre.c || (c.stops > s.length - 1)) s.push({ c: c.tyre.c, lap: lapOf(R, c) });
  }
}
export function stintLine(s) { return s.map((x, k) => (k ? `${DOT[x.c]} L${x.lap}` : DOT[x.c])).join(' → '); }
