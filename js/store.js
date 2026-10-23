// Saved progress on this device: team, season, daily results, trophies, settings.
const KEY = 'agp.v1';
let mem = null;

export function load() {
  if (mem) return mem;
  try { mem = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { mem = {}; }
  mem.season ||= { no: 1, round: 1, pts: {}, teamPts: {}, results: [] };
  mem.daily ||= { streak: 0, last: 0, days: {} };
  mem.trophies ||= {};
  mem.stats ||= { starts: 0, wins: 0, podiums: 0, points: 0, fastest: 0 };
  mem.settings ||= {};
  return mem;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* private mode: progress lasts this visit */ }
}

export function reset() { mem = null; try { localStorage.removeItem(KEY); } catch {} return load(); }
