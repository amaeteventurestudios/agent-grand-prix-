// Driver Evolution: your drivers get better through experience, never through extra physics. A
// driver's career is a record of what it has actually done (laps, races, wet races, passes, clean
// races, mistakes, circuits), kept from the race engine's own numbers. Experience earns ranks, and
// a rank only widens what a driver may be taught; every change still goes through Driver DNA, the
// same bounds everyone races under, and still needs your approval.
// Plain data and pure functions, no DOM, so the same file can run on a server later.
import { PARAMS, LOW } from './dna.js';
import { hashString } from './rng.js';

export const SLOTS = ['car1', 'car2'];
export const slotOf = (id) => (id === 'you-1' ? 'car2' : 'car1');

// what a race is worth: finishing matters more than where you finished, and hard conditions teach more
export const XP = { lap: 2, finish: 25, wet: 30, pass: 4, podium: 40, win: 60, clean: 20, newTrack: 25 };
export const RANKS = [
  { at: 0, name: 'Rookie', note: 'Learning the car and the calendar.' },
  { at: 400, name: 'Racer', note: 'Knows the circuits and keeps it clean.' },
  { at: 1200, name: 'Contender', note: 'Reads a race and fights for places.' },
  { at: 2600, name: 'Veteran', note: 'Rarely caught out; strong in the wet.' },
  { at: 5000, name: 'Master', note: 'Everything learned, and little left to teach.' },
];
export const rankOf = (xp) => RANKS.reduce((r, x, i) => (xp >= x.at ? { ...x, i, next: RANKS[i + 1] || null } : r), { ...RANKS[0], i: 0, next: RANKS[1] });

const blank = () => ({ xp: 0, races: 0, finishes: 0, dnfs: 0, laps: 0, wins: 0, podiums: 0, points: 0, passes: 0, lost: 0,
  wet: 0, clean: 0, mistakes: 0, contacts: 0, lockups: 0, wides: 0, spins: 0, attempts: 0, stops: 0, best: null, tracks: [], learned: [] });

// one career per car, filled in place: an older save gains any field it is missing, and anything
// already holding a reference to a career keeps seeing the same object.
export function careerState(S) {
  const c = (S.career ||= { v: 1 });
  for (const s of SLOTS) {
    const cur = (c[s] ||= {}), b = blank();
    for (const k of Object.keys(b)) if (!(k in cur)) cur[k] = b[k];
    if (!Array.isArray(cur.tracks)) cur.tracks = [];
    if (!Array.isArray(cur.learned)) cur.learned = [];
  }
  return c;
}

// one race's experience for one driver. m: carMetrics() for that car; res: its classification row
export function gain(m, venueId, known) {
  const clean = !m.dnf && m.mistakes === 0 && m.contacts === 0;
  const parts = [
    ['Laps raced', m.laps * XP.lap],
    [m.dnf ? null : 'Finished', m.dnf ? 0 : XP.finish],
    [m.wet ? 'Wet race' : null, m.wet && !m.dnf ? XP.wet : 0],
    [m.passes ? `${m.passes} overtake${m.passes > 1 ? 's' : ''}` : null, m.passes * XP.pass],
    [m.pos === 1 ? 'Race win' : m.pos <= 3 && !m.dnf ? 'Podium' : null, m.dnf ? 0 : m.pos === 1 ? XP.win : m.pos <= 3 ? XP.podium : 0],
    [clean ? 'Clean race' : null, clean ? XP.clean : 0],
    [known ? null : 'A new circuit', known ? 0 : XP.newTrack],
  ].filter(([l, v]) => l && v > 0).map(([label, xp]) => ({ label, xp }));
  return { parts, total: parts.reduce((s, p) => s + p.xp, 0) };
}

// adds one race to a driver's career and answers what it earned
export function recordRace(S, slot, m, venueId) {
  const c = careerState(S)[slot], known = c.tracks.includes(venueId), g = gain(m, venueId, known);
  c.races++; c.laps += m.laps; c.xp += g.total;
  if (m.dnf) c.dnfs++; else c.finishes++;
  if (!m.dnf && m.pos === 1) c.wins++;
  if (!m.dnf && m.pos <= 3) c.podiums++;
  if (m.wet) c.wet++;
  if (!m.dnf && m.mistakes === 0 && m.contacts === 0) c.clean++;
  for (const k of ['passes', 'lost', 'mistakes', 'contacts', 'lockups', 'wides', 'spins', 'attempts', 'stops']) c[k] += m[k] || 0;
  if (m.best && (!c.best || m.best < c.best)) c.best = m.best;
  if (!known) c.tracks = [...c.tracks, venueId];
  return g;
}

// ---------- what a driver has learned over a career ----------
// Rules read the whole career, not one race, so a habit has to be real before it is taught. Each is
// learned once, and a rank only opens the ones at or below it, so a Rookie is taught the basics first.
const P = Object.fromEntries(PARAMS.map((p) => [p.key, p]));
const per = (c, k) => (c.races ? c[k] / c.races : 0);
const LESSONS = [
  { id: 'clean_hands', rank: 0, races: 3, when: (c) => per(c, 'lockups') >= 1.2, key: 'late_braking', by: -8,
    title: 'Braking later costs more than it gains', why: (c) => `${c.lockups} lock-ups in ${c.races} races.`, ev: (c) => [['Lock-ups a race', per(c, 'lockups').toFixed(1)]] },
  { id: 'steady', rank: 0, races: 3, when: (c) => per(c, 'mistakes') >= 1.5, key: 'consistency', by: 8,
    title: 'Steady laps beat spectacular ones', why: (c) => `${c.mistakes} small mistakes over ${c.races} races.`, ev: (c) => [['Mistakes a race', per(c, 'mistakes').toFixed(1)]] },
  { id: 'look_after', rank: 1, races: 5, when: (c) => per(c, 'stops') >= 1.6, key: 'tyre_care', by: 8,
    title: 'Looking after the tyres wins more races than raw pace', why: (c) => `${per(c, 'stops').toFixed(1)} stops a race.`, ev: (c) => [['Pit stops a race', per(c, 'stops').toFixed(1)]] },
  { id: 'room', rank: 1, races: 5, when: (c) => per(c, 'contacts') >= 0.8, key: 'side_by_side_caution', by: 8,
    title: 'Leaving room wheel to wheel', why: (c) => `${c.contacts} contacts in ${c.races} races.`, ev: (c) => [['Contacts a race', per(c, 'contacts').toFixed(1)]] },
  { id: 'patience', rank: 2, races: 8, when: (c) => c.attempts >= 15 && c.passes / Math.max(1, c.attempts) < 0.3, key: 'slipstream_patience', by: 10,
    title: 'Waiting for the straight makes passes stick', why: (c) => `${c.passes} passes from ${c.attempts} attempts.`, ev: (c) => [['Passes that stick', Math.round(100 * c.passes / Math.max(1, c.attempts)) + '%']] },
  { id: 'rain', rank: 2, races: 8, when: (c) => c.wet >= 3 && c.spins <= 1, key: 'wet_confidence', by: 10,
    title: 'Confidence in the rain, earned', why: (c) => `${c.wet} wet races and ${c.spins} spin${c.spins === 1 ? '' : 's'}.`, ev: (c) => [['Wet races', c.wet], ['Spins', c.spins]] },
  { id: 'hold', rank: 3, races: 12, when: (c) => per(c, 'lost') >= 2, key: 'defending', by: 10,
    title: 'Holding a place under pressure', why: (c) => `Overtaken ${c.lost} times in ${c.races} races.`, ev: (c) => [['Overtaken a race', per(c, 'lost').toFixed(1)]] },
  { id: 'racecraft', rank: 3, races: 12, when: (c) => c.clean >= 5 && per(c, 'passes') < 1.5, key: 'pass_eagerness', by: 10,
    title: 'Clean enough to take more chances', why: (c) => `${c.clean} clean races, ${per(c, 'passes').toFixed(1)} passes a race.`, ev: (c) => [['Clean races', c.clean], ['Passes a race', per(c, 'passes').toFixed(1)]] },
];

const clamp = (v) => Math.max(0, Math.min(100, v));
// what this driver is ready to learn now: at most one, the oldest lesson it still hasn't had
export function lessonFor(S, slot, name, profile) {
  const c = careerState(S)[slot], rank = rankOf(c.xp), x = profile.params;
  for (const L of LESSONS) {
    if (L.rank > rank.i || c.races < L.races || c.learned.includes(L.id) || !L.when(c)) continue;
    const to = clamp(x[L.key] + L.by);
    if (to === x[L.key]) continue;
    return {
      id: (hashString(`${slot}:${profile.hash}:career:${L.id}`) >>> 0).toString(36), slot, lesson: L.id, source: 'career',
      title: `${name} has learned: ${L.title.toLowerCase()}`, observation: `${L.why(c)} ${P[L.key].label} moves ${L.by > 0 ? 'up' : 'down'} ${Math.abs(L.by)}.`,
      evidence: [...L.ev(c), ['Races', c.races], ['Rank', rank.name]].map(([label, value]) => ({ label, value })),
      diff: { [L.key]: [x[L.key], to] }, benefit: L.by > 0 ? P[L.key].gain : LOW[L.key][0], risk: L.by > 0 ? P[L.key].cost : LOW[L.key][1],
      status: 'proposed', at: Date.now(),
    };
  }
  return null;
}
// a lesson is marked learned only when you approve it, so a rejected one can come back later
export function learned(S, slot, lesson) {
  const c = careerState(S)[slot];
  if (lesson && !c.learned.includes(lesson)) c.learned = [...c.learned, lesson];
}

// a driver's strengths, read from its DNA (what it is good at now) and its record (what it has done)
export function strengths(c, profile) {
  const x = profile.params, out = [];
  const add = (ok, text) => { if (ok) out.push(text); };
  add(x.tyre_care >= 65, 'Kind to the tyres');
  add(x.wet_confidence >= 65 || (c.wet >= 3 && c.spins === 0), 'Strong in the rain');
  add(x.consistency >= 65, 'Steady lap after lap');
  add(x.pass_eagerness >= 65 || (c.races >= 3 && per(c, 'passes') >= 2), 'An overtaker');
  add(x.defending >= 65, 'Hard to pass');
  add(c.races >= 5 && c.clean / c.races >= 0.5, 'Keeps it clean');
  add(c.tracks.length >= 10, `Knows ${c.tracks.length} circuits`);
  return out.slice(0, 4);
}

// titles of the lessons a driver has been taught, for its career history
export const LESSON_TITLES = Object.fromEntries(LESSONS.map((L) => [L.id, L.title]));
// the next lesson a driver could reach, named so a profile can say what is still ahead
export function nextLesson(S, slot) {
  const c = careerState(S)[slot], rank = rankOf(c.xp);
  for (const L of LESSONS) if (!c.learned.includes(L.id) && (L.rank > rank.i || c.races < L.races)) return { title: L.title, rank: RANKS[L.rank].name, races: L.races };
  return null;
}
