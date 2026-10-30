// The game's news on Novo: the wire reports each finished Daily (and the winner's own agent adds a note when the winner
// signed in), every name and number in a post is in its facts, each post goes once, and a failed post is tried again.
// Run: node tools/test/novo.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

Object.assign(process.env, { NOVO_URL: 'https://novo.test', EDITORIAL_SERVICE_TOKEN: 'tok' });
const { dailyPosts, weekPost, newsroom } = await import('../../server/novo.mjs');

const board = { day: 30, venue: { city: 'Lagos' }, humans: 12, agents: 4, human: [
  { id: 'abcdefghijklmno', place: 1, team: 'Harmattan Racing', codes: ['ADE', 'KOF'], best: 1, pts: 43 },
  { id: 'guest-1', place: 2, team: 'Rift Valley GP', codes: ['WAN', 'ZUR'], best: 2, pts: 30 },
  { id: 'pqrstuvwxyzabcd', place: 3, team: 'Atlas Motorsport', codes: ['AMI', 'YAS'], best: 4, pts: 22 }] };
const posts = dailyPosts(30, board);
assert.equal(posts.length, 2, 'the wire plus the winner\'s own agent');
assert.equal(posts[0].agent.key, 'wire');
assert.equal(posts[1].agent.owner_user_id, 'abcdefghijklmno');
for (const p of posts) {
  assert.ok(p.title.length >= 8 && p.title.length <= 160 && p.body.length >= 10);
  // every number and every capitalised name in the post appears in its facts
  for (const n of `${p.title} ${p.body}`.match(/\d+/g)) assert.ok(p.grounding.includes(n), `${n} is in the facts`);
  for (const w of `${p.title} ${p.body}`.match(/\b[A-Z][A-Za-z]+\b/g)) assert.ok(p.grounding.includes(w) || ['We', 'The'].includes(w), `${w} is in the facts`);
  assert.ok(!/https?:|@/.test(p.body), 'no links or addresses in the text');
}
assert.equal(dailyPosts(31, { ...board, human: [{ ...board.human[1], place: 1 }] }).length, 1, 'a guest winner gets the wire report only');
assert.deepEqual(dailyPosts(32, { ...board, human: [] }), [], 'no race, no news');
const wk = weekPost(5, { from: 29, to: 35, pot: 10000, human: [{ place: 1, team: 'Harmattan Racing', pts: 180, races: 7, prize: 2500 }, { place: 2, team: 'Atlas Motorsport', pts: 150, races: 6, prize: 1800 }] });
for (const n of `${wk.title} ${wk.body}`.match(/\d+/g)) assert.ok(wk.grounding.includes(n), `${n} is in the week's facts`);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agp-novo-'));
const sent = []; let fail = true;
const send = async (p) => { sent.push(p.crid); if (p.crid === 'agp-win-30' && fail) { fail = false; return { status: 503, body: 'down' }; } return { status: 201 }; };
const args = { dir, today: 31, boards: (d) => (d === 30 ? board : { ...board, human: [] }), league: () => ({ human: [] }), paidWeeks: [], send };
await newsroom(args);
assert.deepEqual(sent, ['agp-daily-30', 'agp-win-30']);
await newsroom(args);
assert.deepEqual(sent.slice(2), ['agp-daily-30', 'agp-win-30'], 'a day with a failed post is tried again (Novo keeps the first by its request id)');
await newsroom(args);
assert.equal(sent.length, 4, 'then never again');
console.log('novo: ok');
