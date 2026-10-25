// The race engine still produces exactly the recorded races (tools/baseline.json), and the same
// seed always gives the same race. Run: node tools/test/baseline.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CASES, fingerprint } from '../baseline.mjs';

const saved = JSON.parse(readFileSync(new URL('../baseline.json', import.meta.url)));
let n = 0;
CASES.forEach((c, i) => {
  const { ms, ...f } = fingerprint(c);
  assert.deepEqual(f, saved[i], `race ${f.case} differs from the baseline`);
  n++;
});
const { ms: _a, ...a } = fingerprint(CASES[0]), { ms: _b, ...b } = fingerprint(CASES[0]);
assert.deepEqual(a, b, 'the same seed gave two different races');
console.log(`baseline: ${n} races match, same seed repeats exactly`);
