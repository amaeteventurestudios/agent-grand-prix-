// Driver DNA schema, presets, blends, Quick dials, validation, storage and the engine contract.
// Run: node tools/test/dna.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as D from '../../js/dna.js';
import { dnaState, setProfile, activeProfiles, restore, raceDNA } from '../../js/dnastore.js';
import { decide } from '../../js/strategist.js';
import { CASES, fingerprint } from '../baseline.mjs';

let n = 0; const t = (name, fn) => { fn(); n++; };

t('17 settings, all real, each in a group and at most one Quick dial', () => {
  assert.equal(D.PARAMS.length, 17);
  assert.equal(new Set(D.KEYS).size, 17);
  for (const p of D.PARAMS) assert.ok(D.GROUPS.some((g) => g.id === p.group), p.key);
  const used = D.QUICK.flatMap((q) => q.maps.map((m) => m.replace('-', '')));
  assert.equal(new Set(used).size, used.length, 'a setting is on two Quick dials');
  for (const k of used) assert.ok(D.KEYS.includes(k), k);
  assert.equal(D.QUICK.length, 8);
});
t('nine presets with all 17 settings in range', () => {
  assert.equal(D.PRESETS.length, 9);
  for (const pr of D.PRESETS) for (const k of D.KEYS) assert.ok(Number.isInteger(pr.params[k]) && pr.params[k] >= 0 && pr.params[k] <= 100, pr.id + ' ' + k);
});
t('Balanced maps to the engine exactly as before', () => {
  const s = D.simInputs(D.defaultProfile('car1'));
  for (const k of ['brake', 'entry', 'exit', 'lateral', 'wear', 'pace', 'wetPace', 'changeDelay', 'mistakes', 'variance', 'passP', 'cornerPass', 'defendCost', 'contact', 'deploy', 'obey']) assert.equal(s[k], 1, k);
  for (const k of ['lockup', 'wide', 'wetRisk', 'defend', 'yieldSide', 'coop']) assert.equal(s[k], 0, k);
  assert.equal(s.passGap, 13);
});
t('engine modifiers stay bounded at the extremes', () => {
  for (const v of [0, 100]) {
    const s = D.simInputs(D.makeProfile('car1', Object.fromEntries(D.KEYS.map((k) => [k, v]))));
    assert.ok(s.brake <= 1.15 && s.brake >= 0.85 && s.lateral <= 1.03 && s.entry <= 1.015 && s.pace <= 1.006, JSON.stringify(s));
    for (const [k, x] of Object.entries(s)) if (typeof x === 'number') assert.ok(Number.isFinite(x), k);
  }
});
t('blends: weights must total 100 and the result is deterministic', () => {
  const a = D.blend('car1', [{ id: 'attacker', w: 60 }, { id: 'technician', w: 40 }]);
  const b = D.blend('car1', [{ id: 'attacker', w: 60 }, { id: 'technician', w: 40 }]);
  assert.deepEqual(a, b);
  assert.equal(a.params.late_braking, Math.round(78 * 0.6 + 55 * 0.4));
  assert.throws(() => D.blend('car1', [{ id: 'attacker', w: 60 }, { id: 'technician', w: 30 }]));
});
t('Quick dials move their settings and keep custom offsets', () => {
  let p = { ...D.PRESETS[0].params, late_braking: 60, entry_speed: 40 };
  assert.equal(D.quickOf(p, D.QUICK[0]), 50);
  p = D.setQuick(p, 'braking', 70);
  assert.equal(p.late_braking, 80); assert.equal(p.entry_speed, 60);
  assert.equal(D.quickOf(p, D.QUICK[0]), 70);
  const o = D.setQuick(D.PRESETS[0].params, 'overtaking', 80);
  assert.equal(o.pass_eagerness, 80); assert.equal(o.slipstream_patience, 20);
  assert.equal(D.setQuick(D.PRESETS[0].params, 'braking', 140).late_braking, 100);
});
t('validation rejects bad profiles', () => {
  const good = D.fromPreset('car1', 'attacker');
  assert.ok(D.validate(JSON.parse(D.exportProfile(good)), 'car2').ok);
  const bad = (m) => { const o = JSON.parse(D.exportProfile(good)); m(o); return D.validate(o).ok; };
  assert.equal(bad((o) => (o.v = 2)), false);
  assert.equal(bad((o) => (o.params.late_braking = 101)), false);
  assert.equal(bad((o) => (o.params.late_braking = 50.5)), false);
  assert.equal(bad((o) => (o.params.late_braking = 'x')), false);
  assert.equal(bad((o) => (o.params.extra_grip = 100)), false);
  assert.equal(bad((o) => delete o.params.consistency), false);
  assert.equal(D.validate(null).ok, false);
  assert.deepEqual(Object.keys(JSON.parse(D.exportProfile(good))).sort(), ['hash', 'name', 'params', 'v']);
});
t('two drivers are independent; history, restore and the log work', () => {
  const S = {};
  dnaState(S);
  setProfile(S, D.fromPreset('car1', 'attacker'), 'preset');
  assert.equal(activeProfiles(S).car1.params.late_braking, 78);
  assert.equal(activeProfiles(S).car2.params.late_braking, 50);
  const h = activeProfiles(S).car1.hash;
  setProfile(S, D.makeProfile('car1', D.setQuick(activeProfiles(S).car1.params, 'braking', 20)), 'you');
  assert.equal(activeProfiles(S).car1.rev, 3);
  restore(S, 'car1', h);
  assert.equal(activeProfiles(S).car1.hash, h);
  assert.equal(activeProfiles(S).car2.rev, 1);
  assert.ok(S.dna.log.length >= 3);
});
t('a race gets a frozen copy; later edits do not reach it', () => {
  const S = {}; dnaState(S);
  const locked = raceDNA(S);
  setProfile(S, D.fromPreset('car1', 'attacker'), 'preset');
  assert.equal(locked.car1.params.late_braking, 50);
  assert.throws(() => { 'use strict'; locked.car1.params.late_braking = 99; });
  assert.equal(raceDNA(S, false), null);
});
t('strategist proposals need approval, a car, evidence and current values', () => {
  const S = {}; dnaState(S);
  const mk = () => ({ id: 'p1', slot: 'car2', title: 'Brake later', evidence: [{ label: 'test', value: 1 }], diff: { late_braking: [50, 60] }, status: 'proposed' });
  assert.equal(decide(S, mk(), false).status, 'rejected');
  assert.equal(activeProfiles(S).car2.params.late_braking, 50);
  assert.equal(decide(S, mk(), 'yes').status, 'rejected');
  assert.equal(decide(S, mk(), true, true).status, 'proposed');
  assert.equal(decide(S, mk(), true).status, 'applied');
  assert.equal(activeProfiles(S).car2.params.late_braking, 60);
  assert.equal(decide(S, mk(), true).status, 'expired');           // value moved on since
  assert.equal(decide(S, { ...mk(), evidence: [] }, true).status, 'expired');
  assert.equal(decide(S, { ...mk(), diff: { extra_grip: [0, 100] } }, true).status, 'expired');
});
t('races with Balanced DNA match the baseline exactly', () => {
  const saved = JSON.parse(readFileSync(new URL('../baseline.json', import.meta.url)));
  const dna = raceDNA((() => { const S = {}; dnaState(S); return S; })());
  CASES.slice(0, 4).forEach((c, i) => { const { ms, ...f } = fingerprint(c, { dna }); assert.deepEqual(f, saved[i], f.case); });
});
console.log(`dna: ${n} checks passed`);
