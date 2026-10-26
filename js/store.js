// Saved progress on this device: team, season, daily results, trophies, settings. With an account
// (js/account.js) the same save is kept on the server, so it follows you to another device.
import { push, pushNow } from './account.js';
const KEY = 'agp.v1';
let mem = null;

function defaults() {
  mem.season ||= { no: 1, round: 1, pts: {}, teamPts: {}, results: [] };
  mem.daily ||= { streak: 0, last: 0, days: {} };
  mem.trophies ||= {};
  mem.stats ||= { starts: 0, wins: 0, podiums: 0, points: 0, fastest: 0 };
  mem.settings ||= {};
}
export function load() {
  if (mem) return mem;
  try { mem = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { mem = {}; }
  defaults();
  return mem;
}
const save_ = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* private mode: progress lasts this visit */ } };

export function save() { save_(); push(mem); }

// the server's save, when it is further along than this device's (another phone, or after signing
// in). The same object is kept, because the game holds a reference to it.
export function adopt(save) {
  load();
  for (const k of Object.keys(mem)) delete mem[k];
  Object.assign(mem, save);
  defaults();                                       // fills in anything an older save is missing
  save_();
  return mem;
}
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && mem) pushNow(mem); });

export function reset() { mem = null; try { localStorage.removeItem(KEY); } catch {} return load(); }
