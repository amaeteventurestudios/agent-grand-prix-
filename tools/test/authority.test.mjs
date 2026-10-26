// Team Principal authority: in Team Principal mode only you command your cars; the engineer and the
// strategist can't, whatever asks. In Autonomous mode the strategist runs the car. A handover never
// duplicates or replaces a box call already made.
// Run: node tools/test/authority.test.mjs
import assert from 'node:assert/strict';
import { VENUES } from '../../js/data.js';
import { setupRace, DEFAULT_TEAM, raceLaps, trackFor } from '../../js/game.js';

const v = VENUES.find((x) => x.id === 'lagos') || VENUES[0];
const make = (auto = false, seed = 77) => {
  const R = setupRace({ venue: v, seed, team: JSON.parse(JSON.stringify(DEFAULT_TEAM)), startCompounds: { 'you-0': 'S', 'you-1': 'H' }, auto, car: 'peregrine', laps: raceLaps(trackFor(v), 'medium') }).make();
  R.start(); return R;
};
let ok = 0;
const t = (name, fn) => { fn(); ok++; console.log('  ok', name); };

t('Team Principal: engineer and strategist commands are refused', () => {
  const R = make(false), c = R.byId.get('you-0');
  for (let i = 0; i < 200; i++) R.step();
  for (const from of ['engineer', 'strategist', 'driver']) {
    for (const cmd of [{ box: 'M' }, { pace: 'push' }, { ers: 'deploy' }, { battle: 'attack' }, { order: 'swap' }, { auto: true }]) {
      assert.equal(R.command('you-0', cmd, from), false, `${from} ${JSON.stringify(cmd)} refused`);
    }
  }
  assert.equal(c.pitReq, null); assert.equal(c.pace, 'normal'); assert.equal(c.auto, false);
  assert.equal(R.command('you-0', { pace: 'push' }), true); assert.equal(c.pace, 'push');
});

t('beginner assist lets the engineer make pit calls only', () => {
  const R = make(false), c = R.byId.get('you-0');
  R.command('you-0', { assist: true });
  assert.equal(R.command('you-0', { pace: 'push' }, 'engineer'), false);
  assert.equal(R.command('you-0', { box: 'M' }, 'engineer'), true); assert.equal(c.pitBy, 'engineer');
});

t('Autonomous: the strategist commands, the engineer does not; mode switch is yours alone', () => {
  const R = make(true);
  assert.equal(R.command('you-0', { pace: 'push' }, 'strategist'), true);
  assert.equal(R.command('you-0', { pace: 'save' }, 'engineer'), false);
  assert.equal(R.command('you-0', { auto: false }, 'strategist'), false);
  assert.equal(R.command('you-0', { auto: false }), true);
  assert.equal(R.byId.get('you-0').auto, false);
});

t('a full Team Principal race: the engine never pits, swaps or reorders your cars on its own', () => {
  const R = make(false, 91);
  const mine = ['you-0', 'you-1'].map((id) => R.byId.get(id));
  let n = 0;
  while (!R.done && n < 40000) { R.step(); n++; for (const c of mine) assert.ok(!c.pitReq || c.pitBy === 'puncture', `${c.code} has no box call nobody made (step ${n})`); }
  assert.ok(!R.events.some((e) => (e.type === 'order' && mine.some((c) => c.id === e.car)) || (e.type === 'radio' && mine.some((c) => c.id === e.car) && /Boxing this lap/.test(e.text))), 'no unasked boxing or orders');
  assert.ok(R.events.some((e) => e.type === 'advice'), 'the engineer still showed race info');
  assert.ok(R.events.filter((e) => e.type === 'advice').every((e) => e.fact && !/box/i.test(e.fact)), 'race info is a fact, not an order');
});

t('handover: a box call you made is not replaced by the strategist', () => {
  const R = make(false, 91), c = R.byId.get('you-0');
  while (R.lapOf(c) < 2) R.step();
  R.command('you-0', { box: 'H' });
  R.command('you-0', { auto: true });
  const ctl = R.events.filter((e) => e.type === 'control');
  assert.equal(ctl.length, 1); assert.equal(ctl[0].pending, 'H');
  for (let i = 0; i < 40 && !c.pit; i++) { R.step(); if (!c.pit) { assert.equal(c.pitReq, 'H'); assert.equal(c.pitBy, 'principal'); } }
  // switching to the same mode again changes nothing and says nothing
  R.command('you-0', { auto: true });
  assert.equal(R.events.filter((e) => e.type === 'control').length, 1);
});

t('handover back: the strategist stops at once', () => {
  const R = make(true, 91), c = R.byId.get('you-0');
  for (let i = 0; i < 400; i++) R.step();
  R.command('you-0', { auto: false });
  const mode = [c.pace, c.ersMode, c.battle].join();
  let n = 0;
  while (!R.done && n < 3000) { R.step(); n++; }
  // pace and battle are set only by you now (the ERS mode stays too: no strategist harvest/deploy)
  assert.equal([c.pace, c.ersMode, c.battle].join(), mode);
});

t('replay with the caller recorded gives the same race', () => {
  const run = () => {
    const R = make(true, 55);
    const calls = [[300, 'you-0', { pace: 'push' }, 'strategist'], [600, 'you-0', { auto: false }], [700, 'you-0', { box: 'M' }, 'engineer'], [900, 'you-1', { box: 'H' }]];
    let n = 0, k = 0;
    while (n < 3000 && !R.done) { while (k < calls.length && calls[k][0] <= n) { R.command(calls[k][1], calls[k][2], calls[k][3]); k++; } R.step(); n++; }
    return R.cars.map((c) => [c.id, c.dist.toFixed(4), c.tyre.c, c.pos].join(':')).join('|');
  };
  assert.equal(run(), run());
});
console.log(`authority: ${ok} checks passed`);
