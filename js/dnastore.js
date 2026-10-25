// Where Driver DNA profiles live for now: this device (localStorage, through js/store.js). The
// shape is what a server would hold later: per slot an active profile plus its revision history,
// custom presets, and a log of who changed what (you, a preset, an import or an approved
// Strategist proposal).
import { SLOTS, validate, defaultProfile, revise, diff, makeProfile, lockForRace } from './dna.js';

const HISTORY = 30, LOG = 100;

export function dnaState(S) {
  const d = (S.dna ||= { v: 1, slots: {}, custom: [], log: [] });
  for (const slot of SLOTS) {
    const sl = (d.slots[slot] ||= { active: null, history: [] });
    const ok = sl.active && validate(sl.active, slot).ok;
    if (!ok) sl.active = defaultProfile(slot);
  }
  d.custom ||= []; d.log ||= [];
  return d;
}
export const activeProfiles = (S) => { const d = dnaState(S); return Object.fromEntries(SLOTS.map((s) => [s, d.slots[s].active])); };

// make `next` the active profile for its slot. source: 'you' | 'preset' | 'blend' | 'import' | 'strategist'
export function setProfile(S, next, source = 'you', why = '') {
  const d = dnaState(S), sl = d.slots[next.slot], prev = sl.active;
  if (prev && prev.hash === next.hash && prev.name === next.name) return prev;
  const p = prev ? { ...revise(prev, next.params, next.origin, next.name) } : next;
  sl.history.unshift(prev); sl.history.length = Math.min(sl.history.length, HISTORY);
  sl.active = p;
  d.log.unshift({ at: Date.now(), slot: p.slot, source, why, diff: prev ? diff(prev.params, p.params) : {}, hash: p.hash, rev: p.rev });
  d.log.length = Math.min(d.log.length, LOG);
  return p;
}
export function restore(S, slot, hash) {
  const d = dnaState(S), old = d.slots[slot].history.find((h) => h && h.hash === hash);
  return old ? setProfile(S, makeProfile(slot, old.params, 'restore', old.name), 'you', 'restored an earlier version') : null;
}
export function saveCustomPreset(S, name, params) {
  const d = dnaState(S), id = 'custom-' + Date.now().toString(36);
  d.custom.push({ id, name: String(name).slice(0, 40), blurb: 'Your own preset', params: { ...params }, custom: true });
  return id;
}
// the frozen pair a race uses (null when Driver DNA is switched off with ?dna=off)
export const raceDNA = (S, on = true) => (on ? lockForRace(activeProfiles(S)) : null);
