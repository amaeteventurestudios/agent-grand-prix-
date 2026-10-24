// The built-in Team Strategist: reads what each of your drivers did in a race and suggests at most
// one Driver DNA change per car, with the numbers behind it. Rules only: free, instant, offline and
// the same race always gives the same advice. Nothing changes until you approve it (strategist.js).
import { PARAMS, LOW } from './dna.js';
import { STRATEGISTS } from './strategist.js';
import { hashString } from './rng.js';

const P = Object.fromEntries(PARAMS.map((p) => [p.key, p]));
const step = (v, d) => Math.max(0, Math.min(100, v + d));
const gainOf = (k, d) => (d > 0 ? P[k].gain : LOW[k][0]);
const costOf = (k, d) => (d > 0 ? P[k].cost : LOW[k][1]);

// each rule: the problem it looks for (only habits a driver controls: no stop at all is a pit-wall call, not DNA), the setting it moves and by how much. First match wins.
const RULES = [
  { id: 'contact', when: (m, x) => m.contacts >= 2 && x.side_by_side_caution < 75, keys: (x) => [['side_by_side_caution', 12], ...(x.pass_eagerness > 60 ? [['pass_eagerness', -8]] : [])],
    title: (n) => `${n} is getting into too many collisions`, obs: (m) => `${m.contacts} contacts in one race. Each one risks a puncture or broken wing.`,
    ev: (m) => [['Contacts', m.contacts], ['Passing attempts', m.attempts]] },
  { id: 'wetspin', when: (m, x) => m.wet && m.spins >= 1 && x.wet_confidence > 40, keys: () => [['wet_confidence', -12]],
    title: (n) => `${n} is pushing too hard in the rain`, obs: (m) => `${m.spins} spin${m.spins > 1 ? 's' : ''} on a wet track.`,
    ev: (m) => [['Spins', m.spins], ['Wet race', 'yes']] },
  { id: 'lockup', when: (m, x) => m.lockups >= 2 && x.late_braking > 50, keys: () => [['late_braking', -12]],
    title: (n) => `${n} is locking the brakes`, obs: (m) => `${m.lockups} lock-ups. Each one costs about a second and flat-spots the tyres.`,
    ev: (m) => [['Lock-ups', m.lockups], ['Tyre wear per lap', (m.wearPerLap * 100).toFixed(1) + '%']] },
  { id: 'wide', when: (m, x) => m.wides >= 2 && (x.corner_commitment > 50 || x.kerb_usage > 50), keys: (x) => [[x.corner_commitment >= x.kerb_usage ? 'corner_commitment' : 'kerb_usage', -10]],
    title: (n) => `${n} keeps running wide`, obs: (m) => `${m.wides} trips wide. The time lost there is more than the corners gain.`,
    ev: (m) => [['Running wide', m.wides], ['Other mistakes', m.mistakes]] },
  { id: 'mistakes', when: (m, x) => m.mistakes >= 2 && x.consistency < 75, keys: () => [['consistency', 12]],
    title: (n) => `${n} is making too many mistakes`, obs: (m) => `${m.mistakes} small mistakes, each one a few tenths or a lost place.`,
    ev: (m) => [['Mistakes', m.mistakes]] },
  { id: 'tyres', when: (m, x) => !m.wet && m.stops >= 1 && (m.stops >= 2 || m.wear >= 0.8) && x.tyre_care < 75, keys: () => [['tyre_care', 12]],
    title: (n) => `${n} is wearing the tyres out`, obs: (m) => (m.stops >= 2 ? `${m.stops} pit stops in a dry race; one is usually enough.` : `The last set finished ${Math.min(100, Math.round(m.wear * 100))}% worn.`),
    ev: (m) => [['Pit stops', m.stops], ['Tyre wear per lap', (m.wearPerLap * 100).toFixed(1) + '%']] },
  { id: 'defend', when: (m, x) => m.lost >= 3 && m.lost * 2 >= -m.gained && x.defending < 65, keys: () => [['defending', 12]],
    title: (n) => `${n} is too easy to pass`, obs: (m) => `Overtaken ${m.lost} times.`,
    ev: (m) => [['Times overtaken', m.lost], m.gained < 0 ? ['Places lost from the grid', -m.gained] : ['Places gained from the grid', m.gained]] },
  { id: 'frustrated', when: (m, x) => m.attempts >= 6 && m.passes <= 1 && x.slipstream_patience < 70, keys: () => [['slipstream_patience', 12]],
    title: (n) => `${n}'s passing moves aren't sticking`, obs: (m) => `${m.attempts} attempts and ${m.passes} pass${m.passes === 1 ? '' : 'es'}. Waiting for the straights gives cleaner moves.`,
    ev: (m) => [['Passing attempts', m.attempts], ['Overtakes made', m.passes]] },
  { id: 'timid', when: (m, x) => m.attempts <= 1 && m.passes === 0 && m.gained <= -2 && x.pass_eagerness < 70, keys: () => [['pass_eagerness', 12]],
    title: (n) => `${n} isn't trying to pass`, obs: (m) => `${m.attempts} passing attempt${m.attempts === 1 ? '' : 's'} while dropping ${-m.gained} places.`,
    ev: (m) => [['Passing attempts', m.attempts], ['Places lost from the grid', -m.gained]] },
  { id: 'wetslow', when: (m, x) => m.wet && m.spins === 0 && m.gained <= -2 && x.wet_confidence < 55, keys: () => [['wet_confidence', 10]],
    title: (n) => `${n} is too careful in the rain`, obs: (m) => `No spins, but ${-m.gained} places lost on a wet track.`,
    ev: (m) => [['Spins', 0], ['Places lost', -m.gained]] },
];

// m: carMetrics() for one car; profile: its active DNA; name: the driver's name
export function proposalsFor(slot, name, m, profile) {
  if (!m || m.dnf && m.laps < 1) return [];
  const x = profile.params;
  for (const r of RULES) {
    if (!r.when(m, x)) continue;
    const diff = {};
    for (const [k, d] of r.keys(x)) { const to = step(x[k], d); if (to !== x[k]) diff[k] = [x[k], to]; }
    if (!Object.keys(diff).length) continue;
    const [k0, [a0, b0]] = Object.entries(diff)[0], d0 = b0 - a0;
    return [{
      id: (hashString(`${slot}:${profile.hash}:${r.id}`) >>> 0).toString(36), slot, rule: r.id, title: r.title(name), observation: r.obs(m),
      evidence: r.ev(m).map(([label, value]) => ({ label, value })), diff,
      benefit: gainOf(k0, d0), risk: costOf(k0, d0), status: 'proposed', source: 'rules', at: Date.now(),
    }];
  }
  return [];
}

STRATEGISTS.rules = {
  id: 'rules', label: 'Team Strategist', note: 'Built in. Reads the race numbers; no internet needed.', available: true,
  propose: ({ cars, profiles, names }) => Object.keys(cars).flatMap((slot) => proposalsFor(slot, names[slot], cars[slot], profiles[slot])),
};
// An AI strategist (an LLM through OpenRouter) plugs in here later. It must run on a server that
// holds the key (never in this page), take the same { cars, profiles, names } summary, and return
// proposals in the same shape; checkProposal() and your approval still stand between it and a change.
STRATEGISTS.llm = { id: 'llm', label: 'AI Strategist', note: 'Coming later', available: false, propose: async () => [] };
export const RULE_IDS = RULES.map((r) => r.id);
