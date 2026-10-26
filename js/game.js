// Builds a race from a venue, a seed and the player's team. Shared by the page and Node tests.
import { VENUES, TEAMS } from './data.js';
import { hashString } from './rng.js';
import { generateTrack } from './track.js';
import { Race, qualify, lapsFor } from './sim.js';
import { qualiPlan } from './quali.js';
import { simInputs, slotOf, lockForRace } from './dna.js';
import { weatherFor } from './weather.js';
import { teamCars } from './carspec.js';

export const EPOCH = Date.UTC(2026, 9, 23); // Daily Grand Prix #1: 23 October 2026, Abuja

export function dayNumber(d = new Date()) {
  const t = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((t - EPOCH) / 86400000) + 1;
}
export function dailyVenue(n) { return VENUES[(((n - 1) % VENUES.length) + VENUES.length) % VENUES.length]; }

const trackCache = new Map();
export function trackFor(venue) {
  if (!trackCache.has(venue.id)) trackCache.set(venue.id, Object.assign(generateTrack(hashString(venue.id + '-layout-1'), venue), { venueId: venue.id }));
  return trackCache.get(venue.id);
}

export const DEFAULT_TEAM = {
  name: 'Your Team', short: 'YOU', c1: '#0f8a4a', c2: '#ffffff',
  drivers: [{ name: 'Nova', code: 'NOV' }, { name: 'Echo', code: 'ECH' }],
};

export const TAKEN_NUMS = [22, 11, 31, 12, 32, 44, 16, 4, 5, 63, 81, 27, 14, 23, 10, 3, 55, 8];
export function roster(team, withPlayer = true) {
  const entries = [];
  TEAMS.forEach((t, ti) => t.drivers.forEach((d, di) => entries.push({
    id: `${t.id}-${di}`, num: TAKEN_NUMS[ti * 2 + di], name: d.name, code: d.code, traits: d,
    team: { id: t.id, name: t.name, short: t.short, c1: t.c1, c2: t.c2, box: ti },
  })));
  const p = team || DEFAULT_TEAM;
  const traits = [{ pace: 0.88, tyre: 0.7, wet: 0.7, aggro: 0.55, brain: 0.75 }, { pace: 0.84, tyre: 0.75, wet: 0.75, aggro: 0.45, brain: 0.75 }];
  p.drivers.forEach((d, di) => entries.push({
    id: `you-${di}`, num: d.num || (di ? 77 : 7), name: d.name, code: d.code, helmet: d.helmet, face: d.face, traits: traits[di], player: withPlayer,
    team: { id: 'you', name: p.name, short: p.short, c1: p.c1, c2: p.c2, glow: p.glow, finish: p.finish, box: 9, you: true },
  }));
  // nine AI teams use boxes 0..8, the player's team box 9
  return entries;
}

// A live race's grid (js/live.js, server/live.mjs): ten seats, each { team, dna, car, auto } or empty.
// Seat k races in team slot k (the nine series teams, then the tenth box), so every browser builds the
// same twenty cars in the same order and the race is the same race everywhere. An empty series seat
// keeps its own team, driven by the engine; an empty tenth seat is the Paddock Club, driven the same
// way. Every person's cars race with the same driver traits, so the only edge is the calls and the DNA.
const SEAT_TRAITS = [{ pace: 0.88, tyre: 0.7, wet: 0.7, aggro: 0.55, brain: 0.75 }, { pace: 0.84, tyre: 0.75, wet: 0.75, aggro: 0.45, brain: 0.75 }];
const PADDOCK = { name: 'Paddock Club', short: 'PAD', c1: '#6b7280', c2: '#e5e7eb', drivers: [{ name: 'Sol', code: 'SOL' }, { name: 'Kai', code: 'KAY' }] };
export function seatRoster(seats) {
  return roster(PADDOCK, false).map((e) => {
    const di = +e.id.split('-').pop(), k = e.team.you ? 9 : TEAMS.findIndex((t) => t.id === e.team.id), s = seats[k];
    if (!s) return e.team.you ? { ...e, id: `seat9-${di}`, traits: SEAT_TRAITS[di], team: { ...e.team, id: 'seat9', you: false } } : e;
    const t = s.team || {}, d = (t.drivers || [])[di] || {};
    return { ...e, id: `seat${k}-${di}`, name: String(d.name || `Driver ${di + 1}`).slice(0, 16), code: String(d.code || `S${k}${di}`).slice(0, 3).toUpperCase(),
      num: d.num || e.num, helmet: d.helmet, face: d.face, traits: SEAT_TRAITS[di], player: true, seat: s, di,
      team: { id: `seat${k}`, name: String(t.name || `Team ${k + 1}`).slice(0, 24), short: t.short, c1: t.c1 || '#888888', c2: t.c2 || '#ffffff', glow: t.glow, finish: t.finish, box: k } };
  });
}
// the same team object for both cars of a seat, so a team order or a team colour change reaches both
function shareTeams(entries) { const by = {}; for (const e of entries) e.team = (by[e.team.id] ||= e.team); return entries; }

// dna: the locked Driver DNA profiles for your two cars ({ car1, car2 }, see js/dna.js), or none
// for the engine's own behaviour. weather: a weather source id (js/weather.js).
// car: the model your team races (js/carspec.js); the other teams race the rest of the series. Left
// out, every car is the neutral car of the first version.
// race length: 'short' is the original length (about five minutes at 1x); medium and long are
// about twice and four times that. The Daily Grand Prix always runs short, so everyone races the same.
export const LENGTHS = [
  { id: 'short', name: 'Short', note: 'About 5 min' },
  { id: 'medium', name: 'Medium', note: 'About 10 min' },
  { id: 'long', name: 'Long', note: 'About 18 min' },
  { id: 'full', name: 'Full distance', note: 'Real Grand Prix laps · about 35 min' },
];
// Full distance: the lap count a Grand Prix runs at that place (just over 305 km; Monaco is the short
// exception), or, where there is no Grand Prix, the laps a 305 km race of that circuit's size would take.
const GP_LAPS = { sakhir: 57, jeddah: 50, suzuka: 53, shanghai: 56, mexico: 71, montreal: 70, monaco: 78, barcelona: 66,
  spielberg: 71, britain: 52, budapest: 70, ardennes: 44, zandvoort: 72, monza: 53, baku: 51, singapore: 62, saopaulo: 71,
  abudhabi: 58, miami: 57, austin: 56, lasvegas: 50, melbourne: 58, lusail: 57, imola: 63, madrid: 57, sochi: 53, newdelhi: 60 };
export const fullLaps = (track, venueId) => GP_LAPS[venueId] || Math.min(78, Math.max(44, Math.round(305 / (track.lapTime * 0.16))));
export function raceLaps(track, length = 'short') {
  if (length === 'medium') return Math.min(20, Math.max(12, Math.round(470 / track.lapTime)));
  if (length === 'long') return Math.min(36, Math.max(20, Math.round(900 / track.lapTime)));
  if (length === 'full') return fullLaps(track, track.venueId);
  return lapsFor(track);
}

// stage: a Racing Academy scene. { grid: { 'you-0': 6 } (start positions), showers: [{ start, end, peak }]
// (seconds; [] for a dry race), calm: true (no failures), cues: [{ t, sc: 'SC' }] }. Normal races have none.
export function setupRace({ venue, seed, team, withPlayer = true, laps, startCompounds = {}, auto = false, dna = null, weather: source = 'simulated', car, stage = null, stops = null, seats = null, me = -1, quali = null }) {
  const track = trackFor(venue);
  const L = laps || lapsFor(track);
  const entries = seats ? shareTeams(seatRoster(seats)) : roster(team, withPlayer);
  const cars = car === undefined && !seats ? null : teamCars(TEAMS.map((t) => t.id), car || 'falcon');
  for (const e of entries) {
    if (e.seat) {
      // a person's car in a live race: their own car model, their own Driver DNA, their own calls
      e.team.car = e.car = e.seat.car || 'falcon'; e.auto = !!e.seat.auto;
      if (e.seat.dna) { const p = lockForRace(e.seat.dna)[e.di ? 'car2' : 'car1']; e.dna = simInputs(p); e.dnaProfile = p; }
      continue;
    }
    if (cars) e.team.car = e.car = cars[e.team.id] || cars.you;
    if (e.player) { e.auto = auto; if (startCompounds[e.id]) e.startCompound = startCompounds[e.id]; if (stops && stops[e.id]) e.stops = stops[e.id]; }
    if (e.team.you && dna) { const p = dna[slotOf(e.id)]; e.dna = simInputs(p); e.dnaProfile = p; }
  }
  let weather = weatherFor(source, venue, seed, L * track.lapTime * 1.1);
  // qualifying: one flying lap each (js/quali.js); quali holds the calls you made in the session,
  // and without them every car's agent makes its own. A live race keeps the quick one-lap order.
  let grid = seats ? qualify(entries, venue, seed, track) : qualiPlan({ entries, venue, seed, track, weather, choices: quali || {} }).order;
  if (stage && stage.grid) {
    const placed = Object.entries(stage.grid).sort((a, b) => a[1] - b[1]), rest = grid.filter((e) => !(e.id in stage.grid));
    for (const [id, pos] of placed) rest.splice(Math.min(pos - 1, rest.length), 0, grid.find((e) => e.id === id));
    grid = rest;
  }
  if (stage && stage.showers) weather = { ...weather, showers: stage.showers, wet0: stage.wet0 || 0, clouds: stage.showers.length ? 0.8 : 0.2 };
  // your seat becomes you-0 and you-1 in this browser only, after qualifying: an id decides nothing in
  // the race itself, so every browser still runs the same race, and the whole page keeps working as is
  if (seats && me >= 0) for (const e of grid) if (e.team.id === `seat${me}`) { e.id = `you-${e.di}`; e.team.you = true; }
  return { track, laps: L, grid, weather, stage, entries, make: () => new Race({ track, venue, seed, laps: L, grid, weather, stage }) };
}
