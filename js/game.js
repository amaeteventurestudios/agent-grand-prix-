// Builds a race from a venue, a seed and the player's team. Shared by the page and Node tests.
import { VENUES, TEAMS } from './data.js';
import { hashString } from './rng.js';
import { generateTrack } from './track.js';
import { Race, qualify, lapsFor } from './sim.js';
import { simInputs, slotOf } from './dna.js';
import { weatherFor } from './weather.js';

export const EPOCH = Date.UTC(2026, 9, 23); // Daily Grand Prix #1: 23 October 2026, Abuja

export function dayNumber(d = new Date()) {
  const t = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((t - EPOCH) / 86400000) + 1;
}
export function dailyVenue(n) { return VENUES[(((n - 1) % VENUES.length) + VENUES.length) % VENUES.length]; }

const trackCache = new Map();
export function trackFor(venue) {
  if (!trackCache.has(venue.id)) trackCache.set(venue.id, generateTrack(hashString(venue.id + '-layout-1'), venue));
  return trackCache.get(venue.id);
}

export const DEFAULT_TEAM = {
  name: 'Your Team', short: 'YOU', c1: '#0f8a4a', c2: '#ffffff',
  drivers: [{ name: 'Nova', code: 'NOV' }, { name: 'Echo', code: 'ECH' }],
};

const NUMS = [22, 11, 31, 12, 32, 44, 16, 4, 5, 63, 81, 27, 14, 23, 10, 3, 55, 8];
export function roster(team, withPlayer = true) {
  const entries = [];
  TEAMS.forEach((t, ti) => t.drivers.forEach((d, di) => entries.push({
    id: `${t.id}-${di}`, num: NUMS[ti * 2 + di], name: d.name, code: d.code, traits: d,
    team: { id: t.id, name: t.name, short: t.short, c1: t.c1, c2: t.c2, box: ti },
  })));
  const p = team || DEFAULT_TEAM;
  const traits = [{ pace: 0.88, tyre: 0.7, wet: 0.7, aggro: 0.55, brain: 0.75 }, { pace: 0.84, tyre: 0.75, wet: 0.75, aggro: 0.45, brain: 0.75 }];
  p.drivers.forEach((d, di) => entries.push({
    id: `you-${di}`, num: di ? 77 : 7, name: d.name, code: d.code, traits: traits[di], player: withPlayer,
    team: { id: 'you', name: p.name, short: p.short, c1: p.c1, c2: p.c2, box: 9, you: true },
  }));
  // nine AI teams use boxes 0..8, the player's team box 9
  return entries;
}

// dna: the locked Driver DNA profiles for your two cars ({ car1, car2 }, see js/dna.js), or none
// for the engine's own behaviour. weather: a weather source id (js/weather.js).
export function setupRace({ venue, seed, team, withPlayer = true, laps, startCompounds = {}, auto = false, dna = null, weather: source = 'simulated' }) {
  const track = trackFor(venue);
  const L = laps || lapsFor(track);
  const entries = roster(team, withPlayer);
  for (const e of entries) {
    if (e.player) { e.auto = auto; if (startCompounds[e.id]) e.startCompound = startCompounds[e.id]; }
    if (e.team.you && dna) { const p = dna[slotOf(e.id)]; e.dna = simInputs(p); e.dnaProfile = p; }
  }
  const grid = qualify(entries, venue, seed);
  const weather = weatherFor(source, venue, seed, L * track.lapTime * 1.1);
  return { track, laps: L, grid, weather, make: () => new Race({ track, venue, seed, laps: L, grid, weather }) };
}
