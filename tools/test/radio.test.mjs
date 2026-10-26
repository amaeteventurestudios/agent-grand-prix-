// Team radio: spoken calls become the same calls the buttons make.
// Run: node tools/test/radio.test.mjs
import assert from 'node:assert/strict';
import { parseCall, wakeSplit } from '../../js/teamradio.js';

const cars = [{ id: 'you-0', name: 'Nova', code: 'NOV' }, { id: 'you-1', name: 'Echo Ade', code: 'ECH' }];
const p = (s, sel = 'you-0') => parseCall(s, cars, sel);
const k = (s, sel) => { const r = p(s, sel); return r && r.calls.map((c) => c.id + ':' + c.k + (c.tyre ? '/' + c.tyre : '')).join(' '); };
let n = 0; const t = (name, fn) => { fn(); n++; };

t('box with tyres', () => { assert.equal(k('Box box, softs'), 'you-0:boxnow/S'); assert.equal(k('pit for mediums'), 'you-0:box/M'); assert.equal(k('box for inters please'), 'you-0:box/I'); });
t('stay out wins over box', () => { assert.equal(k("Stay out, don't box"), 'you-0:cancel'); assert.equal(k('cancel the box'), 'you-0:cancel'); });
t('pace', () => { assert.equal(k('Push push!'), 'you-0:push'); assert.equal(k('slow down a bit'), 'you-0:save'); assert.equal(k('save the tyres'), 'you-0:save'); assert.equal(k('back to normal'), 'you-0:normal'); });
t('battery', () => { assert.equal(k('Boost!'), 'you-0:boost'); assert.equal(k('overtake mode'), 'you-0:boost'); assert.equal(k('charge the battery'), 'you-0:harvest'); });
t('battle', () => { assert.equal(k('Go on, overtake him'), 'you-0:attack'); assert.equal(k('send it'), 'you-0:attack'); assert.equal(k('defend the inside, cover'), 'you-0:defend'); });
t('names pick the car', () => { assert.equal(k('Echo, push'), 'you-1:push'); assert.equal(k('nova box'), 'you-0:box'); assert.equal(k('ECH defend', 'you-0'), 'you-1:defend'); });
t('both cars', () => { assert.equal(k('Both cars push'), 'you-0:push you-1:push'); assert.equal(k('everyone box for wets'), 'you-0:box/W you-1:box/W'); });
t('the car you follow is the default', () => assert.equal(k('push', 'you-1'), 'you-1:push'));
t('team orders', () => { assert.equal(p('let him through').calls[0].k, 'swap'); assert.equal(p('hold positions').calls[0].k, 'hold'); assert.equal(p('you are free to race').calls[0].k, 'free'); });
t('nothing understood', () => { assert.equal(p('what a lovely day'), null); assert.equal(p(''), null); });
t('teammate is not team', () => assert.equal(k('let your teammate through'), 'you-0:swap'));
t('the brief\'s examples', () => {
  assert.equal(k('Nova, boost!'), 'you-0:boost');
  assert.equal(k('Echo, conserve your tyres.'), 'you-1:save');
  assert.equal(k('Nova, overtake the car ahead.'), 'you-0:attack');
  assert.equal(k('Bring Echo into the pits next lap.'), 'you-1:box');
  assert.equal(p('Tell Nova to let Echo through.').calls[0].k, 'swap');
  assert.equal(k('Cancel that pit stop.'), 'you-0:cancel');
  assert.deepEqual(p("Strategist, what's our best option?"), { ask: 'best', id: 'you-0' });
  assert.deepEqual(p('Nova, why are you losing time?'), { ask: 'why', id: 'you-0' });
  assert.deepEqual(p('Echo, how are the tyres?'), { ask: 'why', id: 'you-1' });
  assert.equal(k('I think we should bring Nova in before the rain gets worse.'), 'you-0:box');
  assert.equal(p('Tell Echo to stop fighting his teammate.').calls[0].k, 'hold');
});
t('conserve for two laps, then push', () => {
  const r = p('Nova, conserve for two laps, then push');
  assert.deepEqual(r.calls.map((c) => [c.id, c.k, c.after?.laps]), [['you-0', 'save', undefined], ['you-0', 'push', 2]]);
});
t('battery until close to the car ahead', () => {
  const r = p("Have Nova conserve the battery until we're closer to the car ahead.");
  assert.equal(r.calls[0].k, 'harvest'); assert.deepEqual(r.calls[0].until, { gap: 1 });
});
t('contradictions ask back, never guess', () => { assert.ok(p('push and save the tyres').clarify); assert.ok(p('attack and defend').clarify); });
t('do it confirms', () => { assert.deepEqual(p('Do it'), { confirm: true }); assert.deepEqual(p('yes, go ahead'), { confirm: true }); });
t('both names with and', () => assert.equal(k('Nova and Echo, box'), 'you-0:box you-1:box'));
t('hands-free: only what follows "Radio" is a call', () => {
  assert.equal(wakeSplit('Radio, box box, softs'), 'box box, softs'); assert.equal(k(wakeSplit('radio box box softs')), 'you-0:boxnow/S');
  assert.equal(wakeSplit('Hey radio. Echo push'), 'Echo push'); assert.equal(wakeSplit('team radio'), ''); assert.equal(wakeSplit('OK radio: attack'), 'attack');
  assert.equal(wakeSplit('box box'), null, 'no wake word, no call'); assert.equal(wakeSplit('the radio is loud'), null);
  assert.equal(wakeSplit('radiohead'), null); assert.equal(wakeSplit(''), null);
});
console.log(`radio: ${n} checks passed`);
