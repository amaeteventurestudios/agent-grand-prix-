// The AI Team Strategist's coaching contract. A strategist reads a summary of the race and the two
// Driver DNA profiles and returns proposals. A proposal is only a suggestion: it changes nothing
// until you approve it, and then it is applied as a new profile revision with the reason logged.
// The built-in strategist is rule-based (free, instant, works offline). An LLM strategist (for
// example through OpenRouter, from a server that holds the key) can implement the same propose()
// and is held to the same contract: every proposal names its car, shows its evidence and its exact
// changes, and goes through approve().
//
// Proposal: { id, slot: 'car1' | 'car2', title, observation, evidence: [{ label, value }],
//             diff: { key: [from, to] }, benefit, risk, status: 'proposed', source: 'rules' | 'llm' }
import { KEYS, diff as pdiff, makeProfile } from './dna.js';
import { setProfile, dnaState } from './dnastore.js';

export const STRATEGISTS = {};   // filled by js/coach.js (rules) and, later, an LLM adapter

// checks a proposal is well formed and within bounds before it can be shown, let alone applied
export function checkProposal(p, profiles) {
  if (!p || !['car1', 'car2'].includes(p.slot)) return 'no car named';
  if (!p.diff || !Object.keys(p.diff).length) return 'no changes';
  const cur = profiles[p.slot].params;
  for (const [k, [from, to]] of Object.entries(p.diff)) {
    if (!KEYS.includes(k)) return `unknown setting ${k}`;
    if (cur[k] !== from) return `${k} has changed since this was proposed`;
    if (!Number.isInteger(to) || to < 0 || to > 100) return `${k} out of range`;
  }
  if (!p.evidence || !p.evidence.length) return 'no evidence';
  return null;
}

// approved: true only from an explicit tap by you; anything else rejects
export function decide(S, p, approved, locked = false) {
  const d = dnaState(S), profiles = { car1: d.slots.car1.active, car2: d.slots.car2.active };
  const err = checkProposal(p, profiles);
  if (err) { p.status = 'expired'; p.error = err; return p; }
  if (approved !== true) { p.status = 'rejected'; d.log.unshift({ at: Date.now(), slot: p.slot, source: 'strategist', why: 'rejected: ' + p.title, diff: {} }); return p; }
  if (locked) { p.status = 'proposed'; p.error = 'profiles are locked during a race; it will apply after the race'; return p; }
  const cur = profiles[p.slot], next = { ...cur.params };
  for (const [k, [, to]] of Object.entries(p.diff)) next[k] = to;
  setProfile(S, makeProfile(p.slot, next, 'strategist', cur.name), 'strategist', p.title);
  p.status = 'applied';
  return p;
}
export { pdiff };
