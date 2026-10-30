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

// the drivers' radio on the free model: plain-sentence facts in, the same honesty checks plus a few more out
import * as Talk from '../../server/talk.mjs';
import { talk } from '../../server/radio.mjs';
const F = { id: 'you-0', code: 'NOV', pos: 6, out: false, done: false, inPit: false, tyre: 'M', tyreLeft: 31, ers: 56, left: 12, ahead: { code: 'AMP', gap: 0.9, mate: false }, behind: null, mate: { code: 'ECH', pos: 9, out: false }, wet: 'dry', rainSoon: false, sc: false, pitReq: null, pace: 'normal', ersMode: 'balanced', battle: 'neutral', order: 'free', auto: false };

test('the free model reads the race as sentences', () => {
  const b = Talk.brief(F);
  assert.match(b, /P6/); assert.match(b, /mediums, 31% left/); assert.match(b, /AMP, 0\.9 s/); assert.match(b, /Nobody behind/); assert.match(b, /no rain coming/);
  assert.match(Talk.userLocal(F, [], 'can you get him?'), /^Race facts: /);
});

test("the free model's slips are caught", () => {
  const ok = (say, call = null) => Talk.accept(JSON.stringify({ say, call }), F, { strict: true });
  assert.ok(ok("He's 0.9 s up. Give me the boost and I'll have a go.", { k: 'boost', tyre: null }));
  assert.equal(ok('Call boxnow'), null);
  assert.equal(ok("I'll defend the lead."), null);
  assert.equal(ok('Switch me to wets.'), null);
  assert.equal(ok("Rain's coming, save the tyres."), null);
  assert.equal(ok('Box me.', { k: 'box', tyre: 'W' }), null);
  assert.ok(ok("Let's go for the lead.") && ok('Box me.', { k: 'box', tyre: 'H' }).call.tyre === 'H');
  assert.equal(ok('Boost.', { k: 'boost', tyre: 'W' }).call.tyre, undefined);   // a tyre only goes with a box call
  assert.ok(Talk.accept(JSON.stringify({ say: "I'll defend the lead.", call: null }), F));   // Claude's replies keep the usual checks
});

test('the radio asks the free model with its own prompt', async () => {
  let seen = null;
  const r = await talk({ driver: { name: 'Nova', tone: 'f' }, facts: F, memory: [], said: 'how are you?' },
    { known: [], useLocal: true, fetchModel: async (sys, msg) => { seen = { sys, msg }; return '{"say":"Feeling good, boss. I can hold P6.","call":null}'; } });
  assert.equal(r.text, 'Feeling good, boss. I can hold P6.');
  assert.match(seen.sys, /Example/); assert.match(seen.msg, /^Race facts: You are P6/);
});
