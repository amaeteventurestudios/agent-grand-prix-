// Driver DNA changes real race behaviour, each setting in its own direction, and maxing everything
// is not a free win. Seed-matched races against Balanced. Run: node tools/test/dna-effects.test.mjs
import assert from 'node:assert/strict';
import { VENUES } from '../../js/data.js';
import { makeProfile, KEYS } from '../../js/dna.js';
import { runRace, trial, summarize, balancedPair } from '../../js/proving.js';

const venues = ['abuja', 'spielberg'].map((id) => VENUES.find((v) => v.id === id));
const seeds = [201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212];
const prof = (o) => makeProfile('car1', Object.fromEntries(KEYS.map((k) => [k, o[k] ?? 50])));
const pair = (p) => ({ car1: p, car2: makeProfile('car2', p.params) });
function run(o) {
  const pairs = [];
  for (const venue of venues) for (const x of trial({ venue, seeds, a: balancedPair(), b: pair(prof(o)) })) pairs.push(x);
  const a = summarize(pairs, 'car1'), b = summarize(pairs, 'car2');
  const m = (k) => ({ a: (a[k].a + b[k].a) / 2, b: (a[k].b + b[k].b) / 2 });
  return { m, better: a.better + b.better, worse: a.worse + b.worse };
}
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok', name); };

t('same seed and DNA give the same race', () => {
  const p = pair(prof({ late_braking: 90, pass_eagerness: 80 }));
  assert.deepEqual(runRace({ venue: venues[0], seed: 9, dna: p }), runRace({ venue: venues[0], seed: 9, dna: p }));
});
t('late braking locks wheels; Balanced never does', () => { const r = run({ late_braking: 100 }); assert.equal(r.m('lockups').a, 0); assert.ok(r.m('lockups').b > 0.3, r.m('lockups').b); });
t('corner commitment runs wide', () => assert.ok(run({ corner_commitment: 100, kerb_usage: 100 }).m('wides').b > 0.3));
t('tyre care wears tyres more slowly than using them up', () => {
  const hi = run({ tyre_care: 100 }).m('wearPerLap').b, lo = run({ tyre_care: 0 }).m('wearPerLap').b;
  assert.ok(hi < lo * 0.8, `${hi} vs ${lo}`);
});
t('overtaking eagerness tries more passes', () => { const r = run({ pass_eagerness: 100, gap_acceptance: 100 }); assert.ok(r.m('attempts').b > r.m('attempts').a * 1.3); });
t('consistency cuts mistakes', () => { const r = run({ consistency: 100 }), q = run({ consistency: 0 }); assert.ok(r.m('mistakes').b <= q.m('mistakes').b); });
t('maxing every setting is not a free win', () => { const r = run(Object.fromEntries(KEYS.map((k) => [k, 100]))); assert.ok(r.m('pos').b >= r.m('pos').a - 0.5, JSON.stringify(r.m('pos'))); assert.ok(r.m('lockups').b > 1); });
console.log(`dna effects: ${n} checks passed`);
