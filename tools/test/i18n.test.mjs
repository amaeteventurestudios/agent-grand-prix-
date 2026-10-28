import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCall, setRadioLang, wakeSplit } from '../../js/teamradio.js';

const en = (await import('../../js/i18n/en.js')).default;
const holes = (s) => (s.match(/\{\d\}/g) || []).sort().join();

for (const l of ['fr', 'es', 'pt', 'ar', 'pcm']) {
  test(`${l}: one entry per English string, same placeholders`, async () => {
    const xx = (await import(`../../js/i18n/${l}.js`)).default;
    assert.equal(xx.length, en.length);
    xx.forEach((v, i) => { if (v) assert.equal(holes(v), holes(en[i]), `${l} ${i}`); });
  });
}

const cars = [{ id: 'a', name: 'Nova', code: 'NOV' }, { id: 'b', name: 'Echo', code: 'ECH' }];
const call = (l, s) => { setRadioLang(l); const r = parseCall(s, cars, 'a'); setRadioLang('en'); return r; };
test('radio calls in other languages', () => {
  assert.deepEqual(call('fr', 'Rentre maintenant, tendres').calls, [{ id: 'a', k: 'boxnow', tyre: 'S' }]);
  assert.deepEqual(call('es', '¡Aprieta!').calls, [{ id: 'a', k: 'push' }]);
  assert.deepEqual(call('pt', 'Box agora, macios').calls, [{ id: 'a', k: 'boxnow', tyre: 'S' }]);
  assert.deepEqual(call('ar', 'ادخل الآن، الإطارات الناعمة').calls, [{ id: 'a', k: 'boxnow', tyre: 'S' }]);
  assert.equal(call('ar', 'حافظا على المراكز').calls[0].k, 'hold');
  assert.equal(call('fr', 'Économise les pneus pendant deux tours puis pousse').calls[1].after.laps, 2);
  assert.equal(call('en', 'box box softs').calls[0].k, 'boxnow');
});
test('wake word in other languages', () => {
  setRadioLang('pt'); assert.equal(wakeSplit('Rádio, acelera'), 'push');
  setRadioLang('ar'); assert.equal(wakeSplit('راديو، هاجم'), 'attack');
  setRadioLang('en'); assert.equal(wakeSplit('Radio, box box'), 'box box');
});
