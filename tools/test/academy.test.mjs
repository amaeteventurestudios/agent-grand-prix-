// Racing Academy: the lesson runner moves on only when the step's action happens, and lesson scenes
// (start positions, weather, no failures, a safety car on cue) shape the race as asked.
// Run: node tools/test/academy.test.mjs
import assert from 'node:assert/strict';
import { LESSONS, Lesson, lessonById, fill, complete, doneCount } from '../../js/academy.js';
import { VENUES } from '../../js/data.js';
import { setupRace, DEFAULT_TEAM } from '../../js/game.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok', name); };
const L1 = lessonById('team');

t('five lessons, numbered in order', () => { assert.equal(LESSONS.length, 5); LESSONS.forEach((l, i) => assert.equal(l.n, i + 1)); });

t('lesson 1 runs start to finish on the right actions', () => {
  const seen = [];
  const L = new Lesson(L1, { mic: true }, (s) => seen.push(s && s.id));
  L.start();
  const feed = [{ type: 'next' }, { type: 'select', id: 'you-1' }, { type: 'next' }, { type: 'cmd', id: 'you-1', c: { pace: 'push' } }, { type: 'next' },
    { type: 'boost', id: 'you-1' }, { type: 'next' }, { type: 'cmd', id: 'you-1', c: { box: 'S' } }, { type: 'pitIn', id: 'you-1' }, { type: 'stopDone', id: 'you-1' },
    { type: 'next' }, { type: 'radio' }];
  for (const e of feed) assert.ok(L.event(e), `step ${L.step.id} should take ${e.type}`);
  assert.ok(L.done);
  assert.deepEqual(seen, L1.steps.map((s) => s.id));
});

t('a wrong action does not move a step on', () => {
  const L = new Lesson(L1, { mic: true }); L.start(); L.event({ type: 'next' });
  assert.equal(L.step.id, 'two');
  assert.equal(L.event({ type: 'select', id: 'you-0' }), false);
  assert.equal(L.event({ type: 'cmd', id: 'you-0', c: { pace: 'save' } }), false);
  assert.equal(L.step.id, 'two');
});

t('timed steps move on by themselves', () => {
  const L = new Lesson(L1, { mic: true }); L.start();
  L.i = L.steps.findIndex((s) => s.id === 'tyres');
  L.tick(3); assert.equal(L.step.id, 'tyres');
  L.tick(5); assert.equal(L.step.id, 'boost');
});

t('no microphone: the radio step is left out', () => {
  const L = new Lesson(L1, { mic: false });
  assert.ok(!L.steps.some((s) => s.id === 'talk'));
  assert.equal(L.steps.length, L1.steps.length - 1);
});

t('names fill in', () => assert.equal(fill('Tap {B}, then {A}', { A: 'Kofi', B: 'Ada' }), 'Tap Ada, then Kofi'));

t('progress keeps the best time and counts runs', () => {
  const S = {};
  complete(S, 'team', 200); complete(S, 'team', 150); complete(S, 'team', 300);
  assert.equal(S.academy.lessons.team.secs, 150); assert.equal(S.academy.lessons.team.runs, 3);
  assert.equal(doneCount(S), 1);
});

t('a lesson scene sets the grid and the weather', () => {
  const v = VENUES.find((x) => x.id === 'sakhir');
  const st = setupRace({ venue: v, seed: 7, team: DEFAULT_TEAM, stage: { grid: { 'you-0': 6, 'you-1': 9 }, showers: [] } });
  assert.equal(st.grid[5].id, 'you-0'); assert.equal(st.grid[8].id, 'you-1'); assert.equal(st.grid.length, 20);
  assert.equal(st.weather.showers.length, 0); assert.equal(st.weather.wet0, 0);
  const wet = setupRace({ venue: v, seed: 7, team: DEFAULT_TEAM, stage: { showers: [{ start: 30, end: 200, peak: 0.9 }] } });
  assert.equal(wet.weather.showers[0].peak, 0.9);
});

t('calm scenes have no failures, and a safety car comes out on cue', () => {
  const v = VENUES.find((x) => x.id === 'sakhir');
  for (const seed of [1, 2, 3, 4]) {
    const R = setupRace({ venue: v, seed, team: DEFAULT_TEAM, auto: true, stage: { calm: true, cues: [{ t: 45, sc: 'SC' }] } }).make(); R.start();
    let sc = null;
    while (!R.done) { R.step(); if (R.sc && sc === null) sc = R.t; }
    assert.ok(sc !== null && sc >= 45 && sc < 46, `safety car at ${sc}`);
    assert.ok(!R.events.some((e) => e.type === 'dnf' && e.kind !== 'crash'), 'no mechanical failures');
  }
});

t('a normal race has no stage and is unchanged', () => {
  const v = VENUES.find((x) => x.id === 'sakhir');
  const a = setupRace({ venue: v, seed: 3, team: DEFAULT_TEAM }), b = setupRace({ venue: v, seed: 3, team: DEFAULT_TEAM, stage: null });
  assert.deepEqual(a.grid.map((e) => e.id), b.grid.map((e) => e.id));
});

// each lesson, fed the actions its steps ask for, runs to the end
const FEEDS = {
  drivers: [{ type: 'next' }, { type: 'cmd', id: 'you-0', c: { battle: 'attack' } }, { type: 'boost', id: 'you-0' }, { type: 'cmd', id: 'you-1', c: { battle: 'defend' } }, { type: 'next' },
    { type: 'order', o: 'hold' }, { type: 'order', o: 'swap' }, { type: 'radio' }],
  dna: [{ type: 'next' }, { type: 'next' }, { type: 'race', ev: { car: 'you-0', type: 'dna', kind: 'lockup' } }, { type: 'next' }, { type: 'next' }, { type: 'next' }, { type: 'next' }],
  strategy: [{ type: 'next' }, { type: 'next' }, { type: 'next' }, { type: 'cmd', id: 'you-0', c: { box: 'M' } }, { type: 'pitIn', id: 'you-0' }, { type: 'stopDone', id: 'you-0' },
    { type: 'wet' }, { type: 'cmd', id: 'you-0', c: { box: 'I' } }, { type: 'stopDone', id: 'you-0' }],
  gp: [{ type: 'next' }, { type: 'pitIn', id: 'you-0' }, { type: 'lastlap' }, { type: 'cmd', id: 'you-0', c: { pace: 'push' } }, { type: 'finish' }],
};
for (const [id, feed] of Object.entries(FEEDS)) t(`lesson ${lessonById(id).n} runs start to finish`, () => {
  const def = lessonById(id), L = new Lesson(def, { mic: true }); L.start();
  for (const e of feed) assert.ok(L.event(e), `${id}: step ${L.step && L.step.id} should take ${JSON.stringify(e)}`);
  assert.ok(L.done, `${id} ends on ${L.step && L.step.id}`);
  for (const s of def.steps) assert.ok(s.text, `${id}.${s.id} has text`);
});

{
  const fs = await import('node:fs');
  const lines = JSON.parse(fs.readFileSync(new URL('../../art/voice/academy.json', import.meta.url)));
  t('every clip a lesson says has a line to record', () => {
    for (const l of LESSONS) for (const s of l.steps) for (const k of s.say || []) assert.ok(lines[k], `${l.id}.${s.id}: ${k}`);
  });
}

t('beginner assist: the engineer makes the pit calls, nothing else', () => {
  const v = VENUES.find((x) => x.id === 'sakhir');
  const R = setupRace({ venue: v, seed: 5, team: DEFAULT_TEAM, laps: 12 }).make(); R.start();
  R.command('you-0', { assist: true });
  while (!R.done) R.step();
  const called = (id) => R.events.some((e) => e.car === id && e.type === 'radio' && /Boxing this lap/.test(e.text));
  assert.ok(called('you-0') && R.byId.get('you-0').stops >= 1, 'the engineer boxed the assisted car');
  assert.ok(!called('you-1'), 'the other car waits for your call');
  assert.equal(R.byId.get('you-0').pace, 'normal', 'pace stays yours');
});

console.log(`academy: ${n} checks passed`);
