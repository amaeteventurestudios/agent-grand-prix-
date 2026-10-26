// Driver Evolution: a driver's career is only what it has actually done. Experience comes from the
// race engine's own numbers, a rank only widens what a driver may be taught, every lesson reads the
// whole record rather than one race, is offered once, is gated by rank, and still moves a Driver DNA
// slider you approve. Run: node tools/test/career.test.mjs
import assert from 'node:assert/strict';
import { careerState, recordRace, gain, rankOf, lessonFor, learned, strengths, nextLesson, XP, RANKS, LESSON_TITLES } from '../../js/career.js';
import { runRace } from '../../js/proving.js';
import { PRESETS, makeProfile } from '../../js/dna.js';
import { dailyVenue, raceLaps, trackFor } from '../../js/game.js';
import { hashString } from '../../js/rng.js';

let ok = 0;
const t = (name, fn) => { fn(); ok++; console.log('  ok', name); };
const save = () => ({});
const prof = (over = {}) => makeProfile('car1', { ...PRESETS[0].params, ...over });
const race = (over = {}) => ({ pos: 8, laps: 10, dnf: false, wet: false, passes: 0, lost: 0, attempts: 0,
  contacts: 0, lockups: 0, wides: 0, spins: 0, mistakes: 0, stops: 1, best: 90, ...over });

t('experience is the race, nothing invented', () => {
  const g = gain(race({ laps: 12, pos: 1, passes: 3, wet: true }), 'lagos', false);
  assert.equal(g.total, 12 * XP.lap + XP.finish + XP.wet + 3 * XP.pass + XP.win + XP.clean + XP.newTrack);
  assert.ok(g.parts.some((p) => p.label === 'Race win') && g.parts.some((p) => p.label === 'A new circuit'));
  // a retirement still teaches the laps it ran, but nothing that needs a finish
  const d = gain(race({ dnf: true, pos: 14, laps: 4, wet: true }), 'lagos', true);
  assert.equal(d.total, 4 * XP.lap);
  // a circuit only counts as new once
  const S = {}; recordRace(S, 'car1', race(), 'lagos');
  assert.ok(!gain(race(), 'lagos', careerState(S).car1.tracks.includes('lagos')).parts.some((p) => p.label === 'A new circuit'));
});

t('the record adds up over a career, and ranks follow it', () => {
  const S = {};
  for (let i = 0; i < 4; i++) recordRace(S, 'car1', race({ pos: 2, passes: 2, lockups: 1, best: 90 - i }), 'v' + i);
  recordRace(S, 'car1', race({ dnf: true, laps: 3 }), 'v0');
  const c = careerState(S).car1;
  assert.deepEqual([c.races, c.finishes, c.dnfs, c.podiums, c.wins, c.passes, c.lockups], [5, 4, 1, 4, 0, 8, 4]);
  assert.equal(c.laps, 43); assert.equal(c.best, 87); assert.equal(c.tracks.length, 4);
  assert.equal(careerState(S).car2.races, 0, 'the other car has its own career');
  assert.equal(rankOf(0).name, 'Rookie');
  assert.equal(rankOf(RANKS[1].at).name, 'Racer');
  assert.equal(rankOf(1e6).next, null, 'the top rank has nothing after it');
  assert.ok(rankOf(c.xp).i >= 0);
});

t('a lesson needs a pattern over a career, not one bad afternoon', () => {
  const S = {}, p = prof();
  recordRace(S, 'car1', race({ lockups: 4 }), 'v1');
  assert.equal(lessonFor(S, 'car1', 'Ada', p), null, 'one race is not a habit');
  recordRace(S, 'car1', race({ lockups: 2 }), 'v2'); recordRace(S, 'car1', race({ lockups: 2 }), 'v3');
  const L = lessonFor(S, 'car1', 'Ada', p);
  assert.equal(L.lesson, 'clean_hands'); assert.equal(L.source, 'career');
  assert.match(L.title, /^Ada has learned: /);
  assert.ok(L.diff.late_braking[1] < L.diff.late_braking[0], 'it moves a Driver DNA slider down');
  assert.ok(L.evidence.some((e) => e.label === 'Races') && L.evidence.some((e) => e.label === 'Rank'));
  // offered again until you approve it, then never again
  assert.equal(lessonFor(S, 'car1', 'Ada', p).lesson, 'clean_hands');
  learned(S, 'car1', 'clean_hands');
  const next = lessonFor(S, 'car1', 'Ada', p);
  assert.ok(!next || next.lesson !== 'clean_hands');
  assert.ok(LESSON_TITLES.clean_hands, 'the learned lesson has a title for the career history');
});

t('rank gates what a driver may be taught, and the slider bounds still hold', () => {
  const S = {};
  for (let i = 0; i < 12; i++) recordRace(S, 'car1', race({ lost: 3 }), 'v' + i);   // a Rookie's worth of races
  const c = careerState(S).car1;
  assert.ok(rankOf(c.xp).i < 3, 'still below Veteran');
  const got = lessonFor(S, 'car1', 'Ada', prof());
  assert.ok(!got || got.lesson !== 'hold', 'the Veteran lesson is out of reach');
  const ahead = nextLesson(S, 'car1');
  assert.ok(ahead && ahead.title && ahead.rank, 'the profile can say what is still ahead');
  c.xp = 4000;                                                                       // a Veteran now
  assert.equal(lessonFor(S, 'car1', 'Ada', prof()).lesson, 'hold');
  // a slider already at the top is not "taught" the same thing again: the lesson is skipped
  assert.notEqual((lessonFor(S, 'car1', 'Ada', prof({ defending: 100 })) || {}).lesson, 'hold');
});

t('strengths are read from the DNA and the record', () => {
  const S = {};
  for (let i = 0; i < 6; i++) recordRace(S, 'car1', race({ wet: i < 3, passes: 3 }), 'v' + i);
  const good = strengths(careerState(S).car1, prof({ tyre_care: 80 }));
  assert.ok(good.includes('Kind to the tyres') && good.includes('Strong in the rain'));
  assert.ok(good.includes('Keeps it clean') || good.includes('An overtaker'));
  assert.ok(good.length <= 4, 'at most four, so a profile stays readable');
  assert.deepEqual(strengths(careerState({}).car1, prof({ tyre_care: 20, wet_confidence: 20, consistency: 20, pass_eagerness: 20, defending: 20 })), []);
});

t('a real race feeds the career', () => {
  const v = dailyVenue(3), out = runRace({ venue: v, seed: hashString('career-test'), dna: null, laps: raceLaps(trackFor(v), 'short') });
  const m = out.cars.car1, S = {};
  const g = recordRace(S, 'car1', m, v.id);
  const c = careerState(S).car1;
  assert.equal(c.laps, m.laps); assert.equal(c.xp, g.total);
  assert.ok(g.total > 0, 'a finished race always teaches something');
  assert.equal(c.tracks[0], v.id);
});

console.log(`career: ${ok} checks passed`);
