// The server interpreter's mapping from Jev's answers to the game's calls (no key, no network).
import assert from 'node:assert/strict';
import { toCalls, interpret, questions } from '../../server/radio.mjs';

const cars = [{ id: 'you-0', name: 'Nova', code: 'NOV' }, { id: 'you-1', name: 'Echo', code: 'ECH' }];
const A = (choice, confidence = 0.95, probabilities) => ({ choice, confidence, probabilities });
let n = 0; const ok = (a, b) => { assert.deepEqual(a, b); n++; };

ok(toCalls({ action: A('push'), driver: A('you-1'), tyre: A('none') }, cars, 'you-0'), { calls: [{ id: 'you-1', k: 'push' }], who: 'one' });
ok(toCalls({ action: A('box'), driver: A('you-0'), tyre: A('H') }, cars, 'you-1'), { calls: [{ id: 'you-0', k: 'box', tyre: 'H' }], who: 'one' });
ok(toCalls({ action: A('box'), driver: A('you-0'), tyre: A('H', 0.4) }, cars, 'you-1'), { calls: [{ id: 'you-0', k: 'box' }], who: 'one' });
ok(toCalls({ action: A('harvest'), driver: A('both') }, cars, 'you-0'), { calls: [{ id: 'you-0', k: 'harvest' }, { id: 'you-1', k: 'harvest' }], who: 'both' });
ok(toCalls({ action: A('defend'), driver: A('none') }, cars, 'you-1'), { calls: [{ id: 'you-1', k: 'defend' }], who: 'one' });
ok(toCalls({ action: A('swap'), driver: A('you-1') }, cars, 'you-0'), { calls: [{ id: 'you-0', k: 'swap' }], who: 'both' });
ok(toCalls({ action: A('none'), driver: A('none') }, cars, 'you-0'), {});
// not sure of the call or the car: ask back, never guess
ok(toCalls({ action: A('push', 0.5, { push: 0.5, save: 0.45, none: 0.05 }) }, cars, 'you-0'), { clarify: 'Push or save?' });
ok(toCalls({ action: A('attack'), driver: A('you-1', 0.5) }, cars, 'you-0'), { clarify: 'Attack: Nova or Echo?' });
assert.equal(Object.keys(questions(cars).driver.criteria).length, 4); n++;
// the request it sends, with a stand-in for the network
let sent;
const r = await interpret('Echo get a move on', cars, 'you-0', { key: 'k', fetchImpl: async (url, o) => { sent = { url, o }; return { ok: true, json: async () => ({ model: 'jev-x', answers: { action: A('push'), driver: A('you-1'), tyre: A('none') } }) }; } });
assert.equal(sent.url, 'https://api.typesafe.ai/v1/systemone'); assert.equal(sent.o.headers.authorization, 'Bearer k');
assert.equal(JSON.parse(sent.o.body).model, 'jev-latest'); assert.deepEqual(r.calls, [{ id: 'you-1', k: 'push' }]); n++;
console.log(`interp: ${n} checks passed`);
