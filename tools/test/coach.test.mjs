// The Team Strategist: rule-based suggestions with evidence, deterministic, applied only on approval.
// Run: node tools/test/coach.test.mjs
import assert from 'node:assert/strict';
import { VENUES } from '../../js/data.js';
import { makeProfile, fromPreset, KEYS } from '../../js/dna.js';
import { dnaState, setProfile, activeProfiles } from '../../js/dnastore.js';
import { STRATEGISTS, checkProposal, decide } from '../../js/strategist.js';
import { proposalsFor, RULE_IDS } from '../../js/coach.js';
import { setupRace, DEFAULT_TEAM } from '../../js/game.js';
import { carMetrics } from '../../js/proving.js';
import { lockForRace } from '../../js/dna.js';

let n = 0; const t = (name, fn) => { fn(); n++; };
const base = { pos: 8, grid: 8, laps: 8, gained: 0, passes: 1, lost: 1, attempts: 2, contacts: 0, lockups: 0, wides: 0, spins: 0, mistakes: 0, stops: 1, wearPerLap: 0.05, wear: 0.4, wet: false, dnf: false };
const atk = fromPreset('car1', 'attacker');

t('ten rules, each with a distinct id', () => { assert.equal(RULE_IDS.length, 10); assert.equal(new Set(RULE_IDS).size, 10); });
t('a clean race gets no suggestion', () => assert.deepEqual(proposalsFor('car1', 'Nova', base, atk), []));
t('lock-ups with late braking: brake earlier, with evidence and a bounded change', () => {
  const [p] = proposalsFor('car1', 'Nova', { ...base, lockups: 3 }, atk);
  assert.equal(p.rule, 'lockup'); assert.deepEqual(p.diff, { late_braking: [68, 56] });
  assert.ok(p.evidence.some((e) => e.label === 'Lock-ups' && e.value === 3));
  assert.equal(checkProposal(p, { car1: atk }), null);
});
t('a careful driver who never locks up is not told to brake earlier', () => {
  const tech = makeProfile('car1', { ...atk.params, late_braking: 40 });
  assert.notEqual(proposalsFor('car1', 'Nova', { ...base, lockups: 3 }, tech)[0]?.rule, 'lockup');
});
t('collisions come first and can move two settings', () => {
  const [p] = proposalsFor('car1', 'Nova', { ...base, contacts: 2, lockups: 4 }, atk);
  assert.equal(p.rule, 'contact'); assert.deepEqual(Object.keys(p.diff).sort(), ['pass_eagerness', 'side_by_side_caution']);
});
t('approve applies a new version; Not now changes nothing; a stale one expires', () => {
  const S = { settings: {} }; dnaState(S); setProfile(S, atk, 'preset');
  const p1 = proposalsFor('car1', 'Nova', { ...base, lockups: 3 }, activeProfiles(S).car1)[0];
  const p2 = { ...p1 };
  const rev = activeProfiles(S).car1.rev;
  decide(S, p2, false); assert.equal(p2.status, 'rejected'); assert.equal(activeProfiles(S).car1.rev, rev);
  decide(S, p1, 'yes'); assert.equal(p1.status, 'rejected', 'only true approves');
  const p3 = proposalsFor('car1', 'Nova', { ...base, lockups: 3 }, activeProfiles(S).car1)[0];
  decide(S, p3, true); assert.equal(p3.status, 'applied'); assert.equal(activeProfiles(S).car1.params.late_braking, 56); assert.equal(activeProfiles(S).car1.rev, rev + 1);
  const again = { ...p3, status: 'proposed' }; decide(S, again, true); assert.equal(again.status, 'expired');
  assert.equal(dnaState(S).log[0].source, 'strategist');
});
t('a real race gives the same advice every time', () => {
  const venue = VENUES.find((v) => v.id === 'monaco'), dna = { car1: atk, car2: fromPreset('car2', 'qualifier') };
  const advise = () => {
    const R = setupRace({ venue, seed: 77, team: DEFAULT_TEAM, auto: true, dna: lockForRace(dna) }).make(); R.start();
    while (!R.done) R.step();
    const cars = { car1: carMetrics(R, 'you-0'), car2: carMetrics(R, 'you-1') };
    return STRATEGISTS.rules.propose({ cars, profiles: dna, names: { car1: 'Nova', car2: 'Echo' } }).map(({ at, ...p }) => p);
  };
  const a = advise(); assert.deepEqual(a, advise());
  for (const p of a) assert.equal(checkProposal(p, dna), null);
});
t('the AI strategist slot exists but is off until a server holds the key', () => { assert.equal(STRATEGISTS.llm.available, false); });
console.log(`coach: ${n} checks passed`);
