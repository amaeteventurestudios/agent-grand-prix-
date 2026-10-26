// Live Grand Prix: ten teams on one grid, every browser running the race itself. The race must be the
// same race in every browser — whichever seat is "you" there, and in a browser that is only watching —
// as long as each applies the room's calls at the steps the room gave them. The room service seats
// people, puts each call a little ahead of its clock, and refuses calls for cars that aren't yours.
// Run: node tools/test/live.test.mjs
import assert from 'node:assert/strict';

process.env.NOVENIQUE_CLIENT_SECRET = 'test-secret';
const { setupRace, dailyVenue, raceLaps, trackFor, DEFAULT_TEAM } = await import('../../js/game.js');
const { carIdFor, applyDue } = await import('../../js/live.js');
const { serve, slotOf } = await import('../../server/live.mjs');
const { seal } = await import('../../server/accounts.mjs');
const { PRESETS, makeProfile } = await import('../../js/dna.js');

let ok = 0;
const t = (name, fn) => { fn(); ok++; console.log('  ok', name); };
const ta = async (name, fn) => { await fn(); ok++; console.log('  ok', name); };

const venue = dailyVenue(4), seed = 12345, laps = raceLaps(trackFor(venue), 'short');
const team = (name, c1, a, b) => ({ name, short: name.slice(0, 3).toUpperCase(), c1, c2: '#ffffff', drivers: [{ name: a, code: a.slice(0, 3).toUpperCase() }, { name: b, code: b.slice(0, 3).toUpperCase() }] });
const bold = makeProfile('car1', PRESETS.find((p) => p.id !== 'balanced').params);
const seats = new Array(10).fill(null);
seats[0] = { team: team('Harmattan Five', '#c2410c', 'Ada', 'Bayo'), car: 'falcon', auto: false, dna: { car1: bold } };
seats[4] = { team: team('Lagoon Street', '#0e7490', 'Chi', 'Dayo'), car: 'falcon', auto: true };
seats[9] = { team: team('Night Shift', '#4c1d95', 'Efe', 'Femi'), car: 'falcon', auto: false };
// the room's calls: [step, seat, car, cmd]
const calls = [[100, 0, 0, { pace: 'push' }], [140, 9, 1, { battle: 'attack' }], [300, 0, 1, { ers: 'deploy' }], [420, 9, 0, { box: 'H' }], [600, 0, 0, { pace: 'save' }]];

// one browser: its own seat (or -1 to watch), every call at its step, then the classification by seat
function run(me) {
  const R = setupRace({ venue, seed, laps, seats, me }).make();
  R.start();
  const from = { i: 0 }; let n = 0, guard = 0;
  while (!R.done && guard++ < 400000) { applyDue(R, calls, n, me, from); R.step(); n++; }
  const canon = (x) => { const c = x.car || R.byId.get(x.id); return `${c.team.id === 'seat' + me || c.team.you ? 'seat' + me : c.team.id}/${c.code}`; };
  return R.result.map((x) => `${x.pos}:${canon(x)}:${x.dnf ? 'dnf' : x.laps}`);
}

const watch = run(-1);
t('every browser runs the same race, whichever seat is "you" there', () => {
  assert.deepEqual(run(0), watch);
  assert.deepEqual(run(4), watch);
  assert.deepEqual(run(9), watch);
});

t('people take their seats on the grid; empty seats keep their series team', () => {
  const s = setupRace({ venue, seed, laps, seats, me: 4 });
  const ids = s.grid.map((e) => e.id);
  assert.ok(ids.includes('you-0') && ids.includes('you-1'), 'your seat is you-0 and you-1');
  assert.ok(ids.includes('seat0-0') && ids.includes('seat9-1'));
  assert.equal(s.grid.length, 20);
  assert.equal(s.grid.filter((e) => e.player).length, 6, 'three teams of people, two cars each');
  const mine = s.grid.filter((e) => e.team.you);
  assert.equal(mine.length, 2); assert.equal(mine[0].team.name, 'Lagoon Street');
  assert.ok(s.grid.some((e) => e.team.id === 'lagoon') && !s.grid.some((e) => e.team.id === 'harmattan'), 'an empty series seat keeps its team; a taken one is the person\'s');
});

t('a call reaches the car it names, in every browser', () => {
  assert.equal(carIdFor(0, 1, 0), 'you-1');
  assert.equal(carIdFor(0, 1, 4), 'seat0-1');
  const R = setupRace({ venue, seed, laps, seats, me: 0 }).make(); R.start();
  applyDue(R, [[0, 0, 0, { pace: 'push' }], [0, 9, 1, { battle: 'attack' }]], 0, 0);
  assert.equal(R.byId.get('you-0').pace, 'push');
  assert.equal(R.byId.get('seat9-1').battle, 'attack');
});

t('an empty tenth seat is the Paddock Club, raced by the engine', () => {
  const s = setupRace({ venue, seed, laps, seats: new Array(10).fill(null), me: -1 });
  const pad = s.grid.filter((e) => e.team.id === 'seat9');
  assert.equal(pad.length, 2); assert.equal(pad[0].team.name, 'Paddock Club'); assert.ok(!pad[0].player);
});

t('a normal race is untouched', () => {
  const a = setupRace({ venue, seed, laps, team: DEFAULT_TEAM, car: 'falcon' }).grid.map((e) => e.id);
  assert.ok(a.includes('you-0') && !a.some((id) => id.startsWith('seat')));
});

// ---------- the room service ----------
const srv = serve(0); await new Promise((r) => srv.once('listening', r));
const port = srv.address().port;
const cookie = (id) => 'agp.sid=' + encodeURIComponent(seal({ uid: id, user: { id } }));
const call = (route, id, body) => fetch(`http://127.0.0.1:${port}/api/live${route}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(id ? { cookie: cookie(id) } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json() }));

await ta('people are seated in the room that is filling, once each', async () => {
  const h = (await call('/health')).body;
  assert.equal(h.live, true); assert.equal(h.seats, 10); assert.ok(h.next > Date.now());
  const a = await call('/join', 'u1', { team: team('A Team', '#111111', 'Ann', 'Ben'), car: 'falcon' });
  const b = await call('/join', 'u2', { team: team('B Team', '#222222', 'Cal', 'Dan'), car: 'falcon' });
  assert.equal(a.body.you, 0); assert.equal(b.body.you, 1);
  assert.equal(a.body.id, b.body.id, 'the same race');
  assert.equal((await call('/join', 'u1', { team: team('A Team', '#111111', 'Ann', 'Ben') })).body.you, 0, 'joining again keeps your seat');
  assert.equal(b.body.taken, 2);
  assert.equal(b.body.startAt, slotOf());
  assert.ok(!JSON.stringify(b.body).includes('u1'), 'a room never shows who is behind a seat');
});

await ta('a call lands a little ahead of the room\'s clock, and only for your own cars', async () => {
  const room = (await call('/room', 'u1')).body;
  const r = await call('/call', 'u1', { id: room.id, car: 0, cmd: { pace: 'push' } });
  assert.equal(r.status, 200);
  assert.ok(r.body.at >= 20, 'one second ahead');
  assert.equal((await call('/call', 'u3', { id: room.id, car: 0, cmd: { pace: 'push' } })).status, 403);
  assert.equal((await call('/call', null, { id: room.id, car: 0, cmd: { pace: 'push' } })).status, 401);
  assert.equal((await call('/call', 'u1', { id: room.id, car: 5, cmd: { pace: 'push' } })).status, 400);
  const again = (await call(`/room?id=${room.id}`, 'u2')).body;
  assert.deepEqual(again.cmds[0].slice(1), [0, 0, { pace: 'push' }], 'the room keeps every call, so a refresh can rebuild the race');
});

await ta('everyone listening hears seats and calls as they happen', async () => {
  const room = (await call('/room', 'u1')).body;
  const ctl = new AbortController(), got = [];
  const res = await fetch(`http://127.0.0.1:${port}/api/live/stream?id=${room.id}`, { signal: ctl.signal });
  const reader = res.body.getReader(), dec = new TextDecoder();
  const read = (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) break; got.push(dec.decode(value)); } } catch { /* closed */ } })();
  await new Promise((r) => setTimeout(r, 100));
  await call('/call', 'u2', { id: room.id, car: 1, cmd: { battle: 'defend' } });
  await call('/join', 'u3', { team: team('C Team', '#333333', 'Eli', 'Fay') });
  await new Promise((r) => setTimeout(r, 200));
  ctl.abort(); await read;
  const text = got.join('');
  assert.match(text, /event: room/); assert.match(text, /event: call/); assert.match(text, /event: seats/);
  assert.match(text, /"defend"/);
});

srv.close();
console.log(`live: ${ok} checks passed`);
