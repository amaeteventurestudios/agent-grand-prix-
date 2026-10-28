// Quick check before a deploy: a full race runs to the end, and the chat handler answers.
import { VENUES } from '../js/data.js';
import { setupRace } from '../js/game.js';
const s = setupRace({ venue: VENUES[0], seed: 1, auto: true }); const R = s.make(); R.start();
for (let i = 0; i < 300000 && !R.done; i++) R.step();
if (!R.done || !R.result?.length) { console.error('race did not finish'); process.exit(1); }
console.log('race ok:', R.result[0].car.code, 'wins in', VENUES[0].city);

// the chat: a greeting gets the welcome card, a command runs, and free talk goes to the model, whose
// chosen action runs through the same commands (a fake model here; the real one needs the server's key)
process.env.STATE_FILE = (await import('node:os')).tmpdir() + '/agp-selftest-state.json';
(await import('node:fs')).rmSync(process.env.STATE_FILE, { force: true });
const W = await import('./whatsapp.mjs');
const said = () => W.queue.splice(0).map((m) => m.text).join('\n---\n');
const must = (ok, what, out) => { if (!ok) { console.error('chat check failed:', what, '\n' + out); process.exit(1); } };
W.handle('t1', 'Hey there'); let out = said();
must(/AGENT GRAND PRIX/.test(out) && /Reply \*today\*/.test(out), 'welcome card', out);
W.handle('t1', 'help'); out = said(); must(/Start a race/.test(out) && /During a race/.test(out), 'help', out);
W.handle('t1', 'circuits'); out = said(); must(/West Africa/.test(out) && /Lagos/.test(out), 'circuits by region', out);
W.setChatModel(async (sys, user) => {
  if (!/Teague/.test(sys) || !/"today"/.test(user)) throw new Error('model saw no facts');
  return /player says: "let's race in lagos/i.test(user)
    ? JSON.stringify({ say: 'Lagos it is. Strap in!', action: 'race', city: 'Lagos', tyre: null, car: null, team: null })
    : JSON.stringify({ say: 'Doing well, boss. Ready when you are.', action: 'none', city: null, tyre: null, car: null, team: null });
});
await W.handle('t1', 'how are you doing today?'); out = said();
must(/Doing well/.test(out) && !/GRAND PRIX\*/.test(out), 'free talk', out);
await W.handle('t1', "let's race in lagos please"); out = said();
must(/Lagos it is/.test(out) && /LAGOS GRAND PRIX/.test(out), 'free talk starts a race', out);
W.races.clear();
console.log('chat ok');

// long-term memory: Teague recalls what it knows, hands the chat back to be remembered, lists it and forgets on request
const mem = { calls: [], items: { } };
W.setMemory(async (method, route, body) => {
  mem.calls.push([method, route, body]);
  if (route === '/memory/recall') return { items: [{ text: 'Likes to be called Ace' }] };
  if (route.startsWith('/memory/list')) return { items: (mem.items[route.split('uid=')[1]] || []).map((text) => ({ text })) };
  if (method === 'DELETE') { const k = route.split('uid=')[1], n = (mem.items[k] || []).length; delete mem.items[k]; return { forgot: n }; }
  return { ok: true };
});
let seen = '';
W.setChatModel(async (sys, user) => { seen = user; return JSON.stringify({ say: 'Morning, Ace!', action: 'none', city: null, tyre: null, car: null, team: null }); });
await W.handle('t5', 'good morning teague, ready to win?'); out = said();
must(/Morning, Ace/.test(out) && /remember about this player.*Likes to be called Ace/.test(seen), 'memories reach the model', seen);
await new Promise((r) => setTimeout(r, 10));
const talk = mem.calls.find((c) => c[1] === '/memory/talk');
must(talk && /^wa-[A-Za-z0-9_-]{24}$/.test(talk[2].uid) && !talk[2].uid.includes('t5') && talk[2].turns.length === 2, 'the chat is handed back to be remembered, under a hash of the number', JSON.stringify(talk));
mem.items[talk[2].uid] = ['Likes to be called Ace', 'Wants to beat Kestrel Racing'];
await W.handle('t5', 'memories'); out = said();
must(/What I remember/.test(out) && /Kestrel/.test(out), 'memories list', out);
await W.handle('t5', 'forget me'); out = said();
must(/forgotten the 2 things/.test(out) && !mem.items[talk[2].uid], 'forget me', out);
W.setMemory(async () => { throw new Error('down'); });
await W.handle('t5', 'how are you?'); out = said();
must(/Morning, Ace/.test(out), 'chat still works with memory down', out);
W.setChatModel(null);
console.log('memory ok');

// words as answers
const PW = await import('./pitwall.mjs');
const q = { pick: 0, opts: [{ box: 'H' }, { box: null }, { box: 'M' }] };
for (const [w, k] of [['yes', 0], ['do it', 0], ['no', 1], ['stay out', 1], ['mediums', 2], ['hards', 0]]) must(PW.wordsToOption(w, q) === k, 'words: ' + w, String(PW.wordsToOption(w, q)));

// Team Principal mode: the engineer never speaks unasked
W.handle('t3', 'take over'); W.handle('t3', 'race singapore'); said();
const L3 = W.races.get('t3'); L3.R.start();
let tp = '';
for (let i = 0; i < 20000 && W.races.has('t3'); i++) { W.tickRaces(0.25); tp += said(); }
must(!/engineer|Box .* now\?/.test(tp), 'silent engineer in Team Principal mode', tp.slice(0, 2000));
console.log('team principal ok');

// check-ins: with the race handed over, a pit call comes as a card; a number answers it
W.setChatModel(null);
W.handle('t2', 'auto'); W.handle('t2', 'race singapore'); said();
const L2 = W.races.get('t2'); L2.R.start();
let card = null, got = '';
for (let i = 0; i < 40000 && W.races.has('t2') && !card; i++) { W.tickRaces(0.25); got = said(); if (/\*Box .* now\?\*/.test(got)) card = got; }
if (card) {
  must(/Lap \d+\/\d+/.test(card) && /Battery/.test(card) && /🛞/.test(card) && /1️⃣/.test(card), 'decision card', card);
  must(/Teague's pick/.test(card) && /Confidence/.test(card) && /No reply by/.test(card), 'pick, confidence and deadline', card);
  W.handle('t2', 'stay out'); out = said(); must(/stays? out/.test(out), 'answer a card in words', out);
  console.log('check-ins ok');
} else console.log('check-ins: no pit call this race (fine)');
W.races.clear();

// following a race in the game: a fake game server and a fake browser that records its race the way
// js/main.js does; the agent's calls go back to the browser, and both races stay the same race
{
  const v = VENUES.find((x) => x.id === 'abudhabi'), args = { team: undefined, startCompounds: {}, auto: false };
  const B = setupRace({ venue: v, seed: 7, ...args }).make();
  const rec = { id: 'r1', kind: 'quick', venue: v.id, seed: 7, args, cmds: [], n: 0 };
  const step = B.step.bind(B), command = B.command.bind(B);
  B.step = () => { step(); rec.n++; }; B.command = (id, c, from) => { rec.cmds.push(from ? [rec.n, id, c, from] : [rec.n, id, c]); return command(id, c, from); };
  const inbox = []; let codeOk = false;
  W.setAccounts(async (method, route, body) => {
    if (route === '/agent/claim') { if (body.code !== 'ABC234') { const e = new Error('no'); e.status = 404; throw e; } codeOk = true; return { id: 'acct1', team: null }; }
    if (route.startsWith('/agent/race')) return codeOk ? { linked: true, id: 'acct1', rec: JSON.parse(JSON.stringify(rec)), age: 0 } : { linked: false };
    if (route === '/agent/cmd') { inbox.push(body); return {}; }
    return {};
  });
  await W.handle('t4', 'link abc234'); out = said(); must(/Linked/.test(out), 'link with a code', out);
  B.start();
  for (let i = 0; i < 200; i++) B.step();
  await W.followAll(); out = said(); must(/Following your race/.test(out) && /ABU DHABI/.test(out), 'follow a web race', out);
  const M = W.races.get('t4'); must(M && M.mirror && M.R.byId.get('you-0').dist === B.byId.get('you-0').dist, 'same race as the browser', '');
  // hand the team to the agents in the game: the agent asks for check-ins, the browser makes that call
  B.command('you-0', { auto: true }); B.command('you-1', { auto: true });
  let card = null;
  for (let k = 0; k < 4000 && !B.done; k++) {
    for (let i = 0; i < 40 && !B.done; i++) B.step();
    await W.followAll();
    for (const c of inbox.splice(0)) B.command(c.car, c.cmd);
    const o = said(); if (/\*Box .* now\?\*/.test(o)) { card = o; await W.handle('t4', '1'); said(); }
  }
  for (const c of inbox.splice(0)) B.command(c.car, c.cmd);
  await W.followAll(); out = said();
  must(B.byId.get('you-0').ask, 'agent turned on check-ins in the browser race', '');
  must(!W.races.has('t4') && B.done, 'web race finished and the result was sent', out);
  must(M.R.result[0].id === B.result[0].id && M.R.result.map((x) => x.id).join() === B.result.map((x) => x.id).join(), 'same result as the browser', '');
  console.log('follow ok' + (card ? ', with a check-in' : ''));
}

// a race left open in the game (closed mid-race): after 10 minutes it is no longer "your race", and Teague says so
{
  const v = VENUES.find((x) => x.id === 'sakhir') || VENUES[0], args = { team: undefined, startCompounds: {}, auto: false };
  const B = setupRace({ venue: v, seed: 9, ...args }).make();
  const rec = { id: 'r2', kind: 'quick', venue: v.id, seed: 9, args, cmds: [], n: 0 };
  const step = B.step.bind(B); B.step = () => { step(); rec.n++; };
  let age = 0;
  W.setAccounts(async (method, route) => (route.startsWith('/agent/race') ? { linked: true, id: 'acct1', rec: JSON.parse(JSON.stringify(rec)), age } : {}));
  B.start(); for (let i = 0; i < 200; i++) B.step();
  await W.followAll(); said(); must(W.races.has('t4'), 'following the new race', '');
  age = 700000; await W.followAll(); out = said();
  must(!W.races.has('t4') && /stopped on lap/.test(out), 'a closed game stops the race here', out);
  await W.followAll(); must(!W.races.has('t4') && !said(), 'and it is not picked up again while closed', '');
  let seen = null;
  W.setChatModel(async (sys, user) => { seen = user; return JSON.stringify({ say: 'You are not racing right now.', action: 'none', city: null, tyre: null, car: null, team: null }); });
  await W.handle('t4', 'what are we doing right now'); said();
  must(seen && /"racingNow":false/.test(seen) && !/"liveRace"/.test(seen) && /"stoppedRace"/.test(seen), 'Teague is told there is no race running', seen);
  // a model that wrongly reaches for "today" on a question starts nothing
  W.setChatModel(async () => JSON.stringify({ say: "Today's Daily is at Sakhir.", action: 'today', city: null, tyre: null, car: null, team: null }));
  await W.handle('t4', 'hey, what are we doing today?'); said();
  must(!W.races.has('t4'), 'a question never starts a race', '');
  W.setChatModel(null);
  age = 0; await W.followAll(); out = said(); must(W.races.has('t4') && /Following your race/.test(out), 'picked up again when the game is back', out);
  console.log('stale race ok');
}
process.exit(0);
