// The pre-race briefing: Plan A and Plan B are real, raceable plans; the projection runs the real
// engine and reports finishes; the plan you accept is the one the race's pit wall follows.
// Run: node tools/test/briefing.test.mjs
import assert from 'node:assert/strict';
import { VENUES, COMPOUNDS } from '../../js/data.js';
import { setupRace, DEFAULT_TEAM, raceLaps, trackFor } from '../../js/game.js';
import { plans, project, describe } from '../../js/briefing.js';

let ok = 0;
const t = (name, fn) => { fn(); ok++; console.log('  ok', name); };
const team = () => JSON.parse(JSON.stringify(DEFAULT_TEAM));

t('every plan is valid for the race it was made for', () => {
  for (const v of VENUES) for (const len of ['short', 'medium', 'long']) {
    const laps = raceLaps(trackFor(v), len);
    for (const [wet0, showers] of [[0, 0], [0, 1], [0.4, 1], [0.9, 1]]) {
      const P = plans({ laps, wear: v.wear || 1, wet0, showers });
      for (const id of ['you-0', 'you-1']) {
        assert.equal(P[id].length, 2);
        for (const p of P[id]) {
          assert.ok(COMPOUNDS[p.start], `${v.id} start ${p.start}`);
          assert.ok(p.note && !/undefined|NaN/.test(p.note), p.note);
          let last = 0;
          for (const s of p.stops) {
            assert.ok(COMPOUNDS[s.tyre], 'stop tyre');
            assert.ok(s.lap >= 2 && s.lap <= laps - 2 && s.lap > last, `${v.id} ${len} lap ${s.lap} of ${laps}`);
            last = s.lap;
          }
          // a dry plan uses two compounds, as the rules ask
          if (!wet0 && p.stops.length) assert.ok(new Set([p.start, ...p.stops.map((s) => s.tyre)]).size >= 2, describe(p));
        }
        assert.notDeepEqual(P[id][0], P[id][1], 'A and B differ');
      }
    }
  }
});

const v = VENUES.find((x) => x.id === 'lagos') || VENUES[0];
const laps = raceLaps(trackFor(v), 'short');

t('the race follows the accepted plan, stop by stop', () => {
  const stops = { 'you-0': [{ lap: 3, tyre: 'H' }], 'you-1': [{ lap: 2, tyre: 'M' }, { lap: 5, tyre: 'S' }] };
  const R = setupRace({ venue: v, seed: 5, team: team(), laps: 9, startCompounds: { 'you-0': 'M', 'you-1': 'S' }, stops }).make();
  const a = R.byId.get('you-0'), b = R.byId.get('you-1');
  assert.deepEqual(a.plan, { lap: 3, next: 'H' });
  assert.deepEqual(b.plan, { lap: 2, next: 'M' });
  assert.deepEqual(b.stopsLeft, [{ lap: 5, tyre: 'S' }]);
  // a race without a briefing plan is untouched
  const R0 = setupRace({ venue: v, seed: 5, team: team(), laps: 9, startCompounds: { 'you-0': 'M', 'you-1': 'S' } }).make();
  assert.equal(R0.byId.get('you-1').stopsLeft, undefined);
  // after the first stop, the second planned stop becomes the plan
  R.start();
  let g = 0, seen = null;
  while (!R.done && g++ < 200000) {
    if (!b.pit && !b.pitReq && !b.finished && !b.dnf && b.tyre.c === 'S' && Math.floor(b.dist / R.track.L) >= 2 && !seen) R.command('you-1', { box: 'M' });
    R.step();
    if (b.tyre.c === 'M' && !b.pit && !seen) seen = { ...b.plan };
    if (seen) break;
  }
  assert.deepEqual(seen, { lap: 5, next: 'S' });
});

t('the projection races the real engine and reports every plan', () => {
  const P = plans({ laps, wear: v.wear || 1 });
  const steps = [...project({ venue: v, seed: 42, team: team(), laps }, P, 2)];
  assert.equal(steps.length, 4);
  assert.deepEqual(steps.map((s) => s.i), [1, 2, 3, 4]);
  const last = steps[3].out;
  for (const id of ['you-0', 'you-1']) for (const r of last[id]) {
    assert.equal(r.n, 2);
    assert.ok(r.mid >= 1 && r.mid <= 21 && r.best <= r.mid && r.mid <= r.worst, JSON.stringify(r));
    assert.ok(r.beats >= 0 && r.beats <= 1);
  }
  for (const id of ['you-0', 'you-1']) assert.ok(Math.abs(last[id][0].beats + last[id][1].beats - 1) < 1e-9);
  // the same inputs give the same projection
  const again = [...project({ venue: v, seed: 42, team: team(), laps }, P, 2)];
  assert.deepEqual(again[3].out, last);
});

console.log(`briefing: ${ok} passed`);
