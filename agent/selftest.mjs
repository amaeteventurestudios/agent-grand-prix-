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

// check-ins: with the race handed over, a pit call comes as a card; a number answers it
W.setChatModel(null);
W.handle('t2', 'auto'); W.handle('t2', 'race singapore'); said();
const L2 = W.races.get('t2'); L2.R.start();
let card = null, got = '';
for (let i = 0; i < 40000 && W.races.has('t2') && !card; i++) { W.tickRaces(0.25); got = said(); if (/\*Box .* now\?\*/.test(got)) card = got; }
if (card) {
  must(/Lap \d+\/\d+/.test(card) && /Battery/.test(card) && /🛞/.test(card) && /1️⃣/.test(card), 'decision card', card);
  W.handle('t2', '2'); out = said(); must(/stays? out/.test(out), 'answer a card', out);
  console.log('check-ins ok');
} else console.log('check-ins: no pit call this race (fine)');
W.races.clear();
process.exit(0);
