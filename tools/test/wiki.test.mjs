import test from 'node:test';
import assert from 'node:assert/strict';
import { WIKI, CATS, lookup, answer } from '../../js/wiki.js';

test('every wiki entry is complete and unique', () => {
  const ids = new Set();
  for (const e of WIKI) {
    assert.ok(e.id && e.term && e.short && CATS.some(([c]) => c === e.cat), e.id);
    assert.ok(!ids.has(e.id), 'duplicate ' + e.id); ids.add(e.id);
  }
});

test('questions find their term, other text does not', () => {
  const want = { 'what is an undercut?': 'undercut', 'What does DRS mean': 'overtaking-aid', 'define dirty air': 'dirty-air', undercut: 'undercut',
    'whats a safety car': 'safety-car', 'How does the slipstream work?': 'slipstream', 'what are inters': 'inters', 'what is VSC?': 'vsc', 'meaning of pole': 'pole' };
  for (const [q, id] of Object.entries(want)) assert.equal(lookup(q)?.id, id, q);
  for (const q of ['hello', 'stop', 'what time is it?', 'who are you?', 'Nova, box for mediums', '']) assert.equal(lookup(q), null, q);
});

test('answers are short and carry the command', () => {
  const a = answer(lookup('what is boost'), { fmt: 'wa', site: 'https://agentgrandprix.com/' });
  assert.match(a, /\*Boost\*/); assert.match(a, /Say \*boost\*/); assert.match(a, /agentgrandprix\.com\/wiki#boost/);
  for (const e of WIKI) assert.ok(e.short.length < 220, e.id);
});
