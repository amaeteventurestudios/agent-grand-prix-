// The Race Intelligence Report: built from a finished race, it lists your calls in order with the
// places around them, keeps every number to what the race recorded, and draws all three tabs.
// Run: node tools/test/report.test.mjs
import assert from 'node:assert/strict';
import { VENUES } from '../../js/data.js';
import { setupRace, DEFAULT_TEAM, raceLaps, trackFor } from '../../js/game.js';
import { buildReport, reportHTML, shareText } from '../../js/report.js';

const v = VENUES.find((x) => x.id === 'sakhir') || VENUES[0];
const R = setupRace({ venue: v, seed: 4242, team: JSON.parse(JSON.stringify(DEFAULT_TEAM)), auto: false, car: 'peregrine', laps: raceLaps(trackFor(v), 'short') }).make();
R.start();
let ok = 0;
const t = (name, fn) => { fn(); ok++; console.log('  ok', name); };
for (let i = 0; i < 400; i++) R.step();
R.command('you-0', { pace: 'push' }); R.command('you-0', { pace: 'push' }); R.command('you-1', { battle: 'attack' });
for (let i = 0; i < 600; i++) R.step();
R.command('you-1', { box: 'H' });
for (let i = 0; i < 40000 && !R.done; i++) R.step();
assert.ok(R.done, 'race finishes');
const rep = buildReport(R, { venue: v, label: 'Quick race', mine: ['you-0', 'you-1'] });

t('every car has a lap-by-lap trace and the report keeps yours', () => {
  for (const c of R.cars) if (!c.dnf) assert.ok(c.trace.length >= R.laps - 1, c.code);
  assert.deepEqual(Object.keys(rep.trace).sort(), ['you-0', 'you-1']);
});
t('calls are in order, merged when repeated, and their places come from the trace', () => {
  const calls = rep.calls;
  assert.equal(calls.length, 3, JSON.stringify(calls));
  assert.equal(calls[0].text, 'Push'); assert.equal(calls[1].text, 'Attack'); assert.equal(calls[2].text, 'Box for Hards');
  for (let i = 1; i < calls.length; i++) assert.ok(calls[i].t >= calls[i - 1].t);
  for (const c of calls) {
    const car = R.byId.get(c.id), places = [car.grid, ...car.trace.map((x) => x.pos)];
    assert.ok(places.includes(c.before)); if (c.after != null) assert.ok(places.includes(c.after));
  }
});
t('the review talks only about places, stops and tyres the race recorded', () => {
  for (const id of ['you-0', 'you-1']) {
    const row = rep.rows.find((r) => r.id === id), line = rep.review.find((x) => x.id === id).text;
    if (!row.dnf) assert.match(line, new RegExp(`started P${row.grid} and finished P${row.pos}`));
  }
  assert.ok(rep.review.some((x) => !x.id && /You made 3 calls/.test(x.text)));
});
t('all three tabs draw, and the report survives a save', () => {
  const back = JSON.parse(JSON.stringify(rep));
  for (const tab of ['result', 'calls', 'review']) { const h = reportHTML(back, tab); assert.ok(h.body.length > 200, tab); assert.ok(!/undefined|NaN/.test(h.body), tab); }
  assert.match(shareText(back, 'https://agentgrandprix.com/'), /Agent Grand Prix/);
});
console.log(`report: ${ok} checks passed`);
