// The drivers' brains: manner from the DNA, answers only from the engine's numbers, calls only as
// offers, memory of what you said, and a voice clip for every word.
// Run: node tools/test/brain.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VENUES } from '../../js/data.js';
import { setupRace, DEFAULT_TEAM, raceLaps, trackFor } from '../../js/game.js';
import { PRESETS } from '../../js/dna.js';
import { Brain, persona, intent, read, LINES } from '../../js/brain.js';

const base = JSON.parse(readFileSync(new URL('../../art/voice/lines.json', import.meta.url)));
const pre = (id) => PRESETS.find((p) => p.id === id).params;
let ok = 0;
const t = (name, fn) => { fn(); ok++; console.log('  ok', name); };
const CALLS = new Set(['box', 'boxnow', 'cancel', 'push', 'save', 'normal', 'attack', 'defend', 'neutral', 'boost', 'harvest', 'balanced', 'swap', 'hold', 'free']);

t('the DNA sets the manner', () => {
  assert.equal(persona(pre('attacker')).tone, 'f');
  assert.equal(persona(pre('whisperer')).tone, 'c');
  assert.equal(persona(pre('technician')).tone, 'c');
  assert.equal(persona(pre('balanced')).tone, 'e');
  assert.equal(persona(undefined).tone, 'e');
});

t('what you say reaches the right part of the brain', () => {
  const cases = { 'How are the tyres?': 'tyres', "what's the gap": 'gaps', 'Nova, can you pass him?': 'pass', 'What do you think?': 'opinion',
    'what are my orders': 'orders', 'good job mate': 'praise', 'come on, you can do it': 'encourage', "how's the car": 'feel', 'is it going to rain': 'weather',
    'where is your teammate': 'mate', 'what position are we': 'position', 'why are you so slow': 'why', 'how much battery': 'battery' };
  for (const [s, k] of Object.entries(cases)) assert.equal(intent(s), k, s);
  assert.equal(intent('box box'), null);
});

const v = VENUES.find((x) => x.id === 'lagos') || VENUES[0];
const race = (seed) => { const R = setupRace({ venue: v, seed, team: JSON.parse(JSON.stringify(DEFAULT_TEAM)), startCompounds: { 'you-0': 'S', 'you-1': 'H' }, auto: false, car: 'peregrine', laps: raceLaps(trackFor(v), 'medium') }).make(); R.start(); return R; };
const KINDS = ['tyres', 'battery', 'gaps', 'position', 'mate', 'weather', 'feel', 'why', 'pass', 'opinion', 'orders', 'praise', 'encourage', 'scold'];
// every number a driver says must be one the engine gave it
const allowed = (f) => {
  const n = new Set([f.pos, f.left, f.mate?.pos, f.ahead?.gap, f.behind?.gap, Math.round(f.ahead?.gap), Math.round(f.behind?.gap)].filter((x) => x != null));
  return n;
};
const WORDNUM = /\b(\d+(?:\.\d)?)\b/g;

t('answers use only the engine\'s numbers, offer calls and never act', () => {
  for (const seed of [11, 91, 202]) {
    const R = race(seed), brains = { 'you-0': new Brain('you-0', pre('attacker')), 'you-1': new Brain('you-1', pre('whisperer')) };
    let n = 0, answers = 0;
    while (!R.done && n < 30000) {
      R.step(); n++;
      if (n % 400) continue;
      for (const id of ['you-0', 'you-1']) {
        const c = R.byId.get(id); if (c.dnf || c.finished) continue;
        const f = read(R, c), before = R.commands.length, mate = read(R, R.mate(c));
        for (const k of KINDS) {
          const a = brains[id].answer(k, f, mate); if (!a) continue; answers++;
          const ok2 = allowed(f);
          for (const [, num] of a.text.matchAll(WORDNUM)) assert.ok([...ok2].some((x) => Math.abs(x - Number(num)) < 1e-9), `"${a.text}" says ${num}, not from the engine (seed ${seed}, step ${n})`);
          for (const call of [].concat(a.call || [])) { assert.ok(CALLS.has(call.k), call.k); assert.equal(call.id, id); }
          for (const clip of a.clips) assert.ok(clip.startsWith('br_') ? LINES[clip] : base[clip], `clip ${clip}`);
        }
        assert.equal(R.commands.length, before, 'a brain never commands the car');
      }
    }
    assert.ok(answers > 200);
  }
});

t('percentages are said in tens and match the car', () => {
  const R = race(5), c = R.byId.get('you-0');
  for (let i = 0; i < 3000; i++) R.step();
  const f = read(R, c), a = new Brain('you-0').answer('tyres', f);
  const said = { nearly: 0, ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, 'a hundred': 100 }[/at (\w+(?: hundred)?) (?:percent|zero)/.exec(a.text)[1]];
  assert.ok(Math.abs(said - (1 - c.tyre.wear) * 100) <= 5.01, `${a.text} vs ${(1 - c.tyre.wear) * 100}`);
});

t('it remembers your orders and its worries', () => {
  const R = race(91), c = R.byId.get('you-0'), b = new Brain('you-0', pre('attacker'));
  for (let i = 0; i < 600; i++) R.step();
  assert.match(b.answer('orders', read(R, c)).text, /haven't changed/);
  R.command('you-0', { pace: 'save' }); b.heard({ pace: 'save' }, R.lapOf(c), R.t);
  R.command('you-0', { battle: 'attack' }); b.heard({ battle: 'attack' }, R.lapOf(c), R.t);
  const o = b.answer('orders', read(R, c));
  assert.match(o.text, /save tyres/); assert.match(o.text, /attack/);
  // a bold driver right behind a rival, told to save: obeys, says why it worries, and remembers it
  const f = { ...read(R, c), ahead: { code: 'XXX', gap: 0.5, mate: false } };
  const w = b.react({ k: 'save' }, f);
  assert.ok(w && /gearbox/.test(w.text));
  assert.equal(b.react({ k: 'save' }, f), null, 'says it once');
  assert.match(b.answer('why', read(R, c)).text, /Like I said: .*gearbox/);
  for (let i = 0; i < 30; i++) b.remember({ t: i, from: 'you' });
  assert.equal(b.mem.length, 12);
});

t('a careful driver and a fiery one read the same moment differently', () => {
  const R = race(91), c = R.byId.get('you-0');
  for (let i = 0; i < 600; i++) R.step();
  const f = { ...read(R, c), ahead: { code: 'XXX', gap: 0.7, mate: false }, behind: null, ers: 60, battle: 'neutral', tyreLeft: 70, wet: 'dry', rainSoon: false, pitReq: null, inPit: false };
  const hot = new Brain('you-0', pre('attacker')).answer('opinion', f), cool = new Brain('you-0', pre('whisperer')).answer('opinion', f);
  assert.notEqual(hot.text, cool.text);
  assert.ok([].concat(hot.call).some((x) => x.k === 'boost'));
});

t('a retired driver says nothing', () => {
  const R = race(91), c = R.byId.get('you-0');
  R.retire(c, 'engine', 'test');
  assert.equal(new Brain('you-0').answer('tyres', read(R, c)), null);
});
console.log(`brain: ${ok} checks passed`);
