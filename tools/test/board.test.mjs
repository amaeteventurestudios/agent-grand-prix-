// The Daily leaderboard is checked, never trusted: the server replays the race the browser says it
// ran, with the game's own engine, and reads the finish from its own run. A record for another day,
// another circuit, another seed or a longer race is refused; a tampered Driver DNA is put back inside
// the bounds everyone races under; agents are ranked apart from people; your first run is the one
// that counts. Run: node tools/test/board.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agp-board-'));
process.env.BOARD_DIR = DIR;
process.env.NOVENIQUE_CLIENT_SECRET = 'test-secret';
process.env.WEEKLY_POT = '10000';                             // Sora, for the weekly league checks          // only to sign the test's session cookie

const { verify, serve, boards, league, weekOf, SHARES } = await import('../../server/leaders.mjs');
const { seal } = await import('../../server/accounts.mjs');
const { setupRace, dailyVenue, raceLaps, trackFor, DEFAULT_TEAM } = await import('../../js/game.js');
const { hashString } = await import('../../js/rng.js');

let ok = 0;
const t = (name, fn) => { fn(); ok++; console.log('  ok', name); };
const ta = async (name, fn) => { await fn(); ok++; console.log('  ok', name); };

// ---------- the record a browser keeps so a race survives a refresh (`live` in js/main.js) ----------
const DAY = 7, venue = dailyVenue(DAY), seed = hashString('daily-' + DAY);
function raceAndRecord(calls = []) {
  const args = { team: structuredClone(DEFAULT_TEAM), startCompounds: {}, auto: true, dna: null, car: 'falcon' };
  const R = setupRace({ venue, seed, ...args, laps: raceLaps(trackFor(venue), 'short') }).make();
  R.start();
  const cmds = []; let n = 0, guard = 0, k = 0;
  while (!R.done && guard++ < 400000) {
    while (k < calls.length && calls[k][0] <= n) { const c = calls[k++]; cmds.push([n, c[1], c[2], 'principal']); R.command(c[1], c[2], 'principal'); }
    R.step(); n++;
  }
  const my = R.result.filter((x) => ['you-0', 'you-1'].includes(x.id));
  return { rec: { kind: 'daily', venue: venue.id, seed, day: DAY, args, cmds, n }, best: Math.min(...my.map((x) => x.pos)) };
}

const plain = raceAndRecord();
t('the server\'s own run gives the finish the browser saw', () => {
  const out = verify(DAY, plain.rec);
  assert.equal(out.best, plain.best);
  assert.equal(out.places.length, 2); assert.equal(out.codes.length, 2);
  assert.ok(out.pts >= 0);
});

t('your calls change the race, and the replay follows them', () => {
  const pushed = raceAndRecord([[200, 'you-0', { pace: 'push' }], [400, 'you-1', { battle: 'attack' }]]);
  assert.equal(verify(DAY, pushed.rec).best, pushed.best);
  assert.ok(pushed.rec.cmds.length === 2);
});

t('a record that is not this Daily is refused', () => {
  const bad = (f) => assert.throws(() => verify(DAY, f(structuredClone(plain.rec))));
  bad((r) => { r.seed = 1; return r; });
  bad((r) => { r.venue = 'nowhere'; return r; });
  bad((r) => { r.kind = 'quick'; return r; });
  bad((r) => { r.args.stage = { grid: [] }; return r; });
  bad((r) => { r.args.laps = 99; return r; });
  bad((r) => { r.cmds = Array.from({ length: 9999 }, () => [0, 'you-0', { pace: 'push' }]); return r; });
  assert.throws(() => verify(DAY + 1, plain.rec), /Daily|seed/);
});

t('a made-up finish cannot be submitted, because no finish is read from the browser', () => {
  const r = structuredClone(plain.rec);
  r.best = 1; r.pos = 1; r.result = [{ id: 'you-0', pos: 1 }];        // whatever a client claims
  assert.equal(verify(DAY, r).best, plain.best);
});

t('Driver DNA outside the bounds is put back inside them', () => {
  const r = structuredClone(plain.rec);
  r.args.dna = { car1: { slot: 'car1', params: { late_braking: 9999, cornering: -500 }, origin: 'custom', name: 'Cheat' },
    car2: { slot: 'car2', params: { late_braking: 9999 }, origin: 'custom', name: 'Cheat' } };
  const out = verify(DAY, r);
  const edge = structuredClone(plain.rec);
  edge.args.dna = { car1: { slot: 'car1', params: { late_braking: 100, cornering: 0 }, origin: 'custom', name: 'Edge' },
    car2: { slot: 'car2', params: { late_braking: 100 }, origin: 'custom', name: 'Edge' } };
  assert.deepEqual(out, verify(DAY, edge), 'a slider past the end races exactly as the end itself');
});

await ta('the race your agent ran while you were away checks out too', async () => {
  const { agentRace } = await import('../../js/agent.js');
  const { DEFAULT_TEAM } = await import('../../js/game.js');
  const out = agentRace({ venue, seed, team: structuredClone(DEFAULT_TEAM), dna: null, car: 'falcon',
    laps: raceLaps(trackFor(venue), 'short'), playbook: { orders: 'hold' }, label: 'Daily' });
  assert.equal(verify(DAY, out.rec).best, out.best, 'the standing order and every call are in the record');
});

// ---------- the service ----------
const srv = serve(0);
await new Promise((r) => srv.once('listening', r));
const port = srv.address().port;
const cookie = (id) => 'agp.sid=' + encodeURIComponent(seal({ uid: id, user: { id } }));
const call = (route, opts = {}) => fetch(`http://127.0.0.1:${port}${route}`, opts).then(async (r) => ({ status: r.status, body: await r.json() }));
const submit = (id, team, agent, rec = plain.rec) => call('/api/board/daily', { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookie(id) }, body: JSON.stringify({ day: DAY, team, agent, rec }) });

await ta('a race is submitted, checked and ranked', async () => {
  assert.equal((await call('/api/board/health')).body.board, true);
  const r = await submit('u1', 'Harmattan°', false);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.human.length, 1);
  assert.equal(r.body.human[0].team, 'Harmattan°');
  assert.equal(r.body.human[0].best, plain.best);
  assert.equal(r.body.you.place, 1);
});

await ta('your first run is the one that counts', async () => {
  const again = await submit('u1', 'Harmattan°', false);
  assert.equal(again.body.ok, false); assert.equal(again.body.already, true);
  assert.equal(again.body.humans, 1);
});

await ta('agents are ranked apart from people', async () => {
  await submit('u2', 'Night Shift°', true);
  const b = (await call(`/api/board/daily?day=${DAY}`, { headers: { cookie: cookie('u2') } })).body;
  assert.equal(b.humans, 1); assert.equal(b.agents, 1);
  assert.equal(b.agent[0].team, 'Night Shift°'); assert.equal(b.agent[0].agent, true);
  assert.equal(b.you.place, 1, 'you stand first on the board you are on');
  assert.ok(b.venue.city);
});

await ta('a race without a session, or a record that does not check out, is not ranked', async () => {
  assert.equal((await call('/api/board/daily', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ day: DAY, rec: plain.rec }) })).status, 401);
  const bad = structuredClone(plain.rec); bad.seed = 42;
  const r = await submit('u3', 'Nobody°', false, bad);
  assert.equal(r.status, 400);
  assert.equal(boards(DAY, null).humans, 1, 'nothing was written');
});

t('the weekly league adds up the week\'s Dailies, people and agents apart', () => {
  const put = (day, entries) => fs.writeFileSync(path.join(DIR, `day-${day}.json`), JSON.stringify({ day, entries }));
  const e = (team, pts, best, agent = false) => ({ team, codes: ['AAA', 'BBB'], best, pts, places: [best, best + 1], agent, at: 1 });
  put(8, { a: e('Alpha', 18, 2), b: e('Bravo', 25, 1), z: e('Zulu Bot', 40, 1, true) });
  put(9, { a: e('Alpha', 25, 1), c: e('Charlie', 10, 4) });
  put(15, { b: e('Bravo', 99, 1) });                                    // next week: not counted
  assert.equal(weekOf(8), 2); assert.equal(weekOf(14), 2); assert.equal(weekOf(15), 3);
  const L = league(2, 'a', 10);
  assert.deepEqual(L.human.map((r) => [r.team, r.pts, r.races]), [['Alpha', 43, 2], ['Bravo', 25, 1], ['Charlie', 10, 1]]);
  assert.deepEqual(L.agent.map((r) => [r.team, r.pts]), [['Zulu Bot', 40]], 'agents have their own table');
  assert.equal(L.human[0].prize, 10000 * SHARES[0] / 100, 'first place takes a quarter of the pot');
  assert.ok(!('prize' in L.agent[0]), 'agents race for the table, not the pot');
  assert.equal(L.you.place, 1); assert.equal(L.done, false);
  assert.equal(league(2, null, 99).done, true);
  assert.equal(SHARES.reduce((x, y) => x + y, 0), 100, 'the shares add up to the whole pot');
});

srv.close();
fs.rmSync(DIR, { recursive: true, force: true });
console.log(`board: ${ok} checks passed`);
