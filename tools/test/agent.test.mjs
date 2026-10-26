// Your agent while you're away: it races only the Dailies you missed, after your cover time, never
// before it started and never more than a week back; every call it makes goes through the
// strategist's rights; the playbook changes how it races; the same day gives the same race.
// Run: node tools/test/agent.test.mjs
import assert from 'node:assert/strict';
import { agentRace, dueDailies, coverTime, PLAYBOOK } from '../../js/agent.js';
import { dailyVenue, DEFAULT_TEAM, raceLaps, trackFor } from '../../js/game.js';
import { hashString } from '../../js/rng.js';

let ok = 0;
const t = (name, fn) => { fn(); ok++; console.log('  ok', name); };
const S = (days = {}, agent = {}) => ({ daily: { days }, agent: { since: 1, playbook: {}, ...agent } });

t('races only missed Dailies past the cover time, within a week, from the day the agent started', () => {
  const now = coverTime(10, 21) + 60000;           // just after 21:00 on day 10
  assert.deepEqual(dueDailies(S({ 9: { best: 3 } }), 10, now), [4, 5, 6, 7, 8, 10]);
  assert.deepEqual(dueDailies(S({}, { since: 9 }), 10, now), [9, 10]);
  assert.deepEqual(dueDailies(S({}, { since: 10 }), 10, coverTime(10, 21) - 60000), []);   // before 21:00
  assert.deepEqual(dueDailies(S({}, { since: 10, playbook: { cover: 18 } }), 10, coverTime(10, 18) + 1), [10]);
  assert.deepEqual(dueDailies(S({}, { since: 1, playbook: { on: false } }), 10, now), []);
});

const n = 5, v = dailyVenue(n);
const run = (playbook) => agentRace({ venue: v, seed: hashString('daily-' + n), team: structuredClone(DEFAULT_TEAM), dna: null, car: 'falcon', laps: raceLaps(trackFor(v), 'short'), playbook, label: 'Daily' });
const a = run({}), b = run({});

t('the same Daily and playbook give the same race', () => {
  assert.deepEqual(a.places, b.places); assert.equal(a.pts, b.pts);
});
t('every call is the strategist\'s, and the report shows them', () => {
  assert.ok(a.report.calls.length > 0);
  for (const c of a.report.calls) assert.equal(c.from, 'strategist');
  assert.match(a.report.review.find((x) => !x.id).text, /strategist made all/);
});
t('the playbook changes how the agent races', () => {
  const agg = run({ risk: 'aggressive', orders: 'hold' });
  const texts = agg.report.calls.map((c) => c.text);
  assert.ok(texts.includes('Attack'), texts.join(', '));
  assert.ok(agg.report.events.some((e) => /hold positions/.test(e.text)), 'the standing team order is on the record');
  const careful = run({ risk: 'careful' });
  assert.ok(careful.report.calls.some((c) => c.text === 'Save tyres'));
  assert.equal(PLAYBOOK.cover, 21);
});
console.log(`agent: ${ok} checks passed`);
