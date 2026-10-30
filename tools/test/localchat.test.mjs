// The free chat model: racing words come from the wiki, and "start today's race" means the Daily
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Chat from '../../agent/chat.mjs';
import * as Wiki from '../../js/wiki.js';

test('wiki entries a chat touches', () => {
  assert.deepEqual(Wiki.related('should we undercut them or wait for the safety car?').map((e) => e.id).slice(0, 2).sort(), ['safety-car', 'undercut']);
  assert.equal(Wiki.related('what are we doing today?').length, 0);
  assert.ok(Wiki.related('how does the battery work').some((e) => e.id === 'ers'));
});

test('the model is handed those entries', () => {
  const p = Chat.prompt({ racingNow: false }, [], 'what is dirty air?', [], Wiki.related('what is dirty air?'));
  assert.match(p, /Racing wiki/);
  assert.match(p, /Dirty air/i);
  assert.doesNotMatch(Chat.prompt({}, [], 'hi'), /Racing wiki/);
});

test("today's race is the Daily, not a new race there", () => {
  const venues = [{ id: 'suzuka', city: 'Suzuka', country: 'Japan' }];
  assert.equal(Chat.accept({ say: 'Go!', action: 'race', city: 'Suzuka' }, { venues, said: "start today's race please" }).command, 'today');
  assert.equal(Chat.accept({ say: 'Go!', action: 'race', city: 'Suzuka' }, { venues, said: 'start a race in suzuka' }).command, 'race suzuka');
});

test('no free model set: chat stays off', async () => {
  assert.equal(Chat.local(), false);
  assert.equal(await Chat.chat({}, [], 'hello', { useLocal: true }), null);
});
