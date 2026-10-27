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
process.exit(0);
