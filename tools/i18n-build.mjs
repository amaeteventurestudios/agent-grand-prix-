// Builds js/i18n/<lang>.js from art/i18n/<lang>.tsv (id, English, translation).
// The .tsv files are the ones to review and edit; an empty translation falls back to English.
// Usage: node tools/i18n-build.mjs            (all languages)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const en = (await import('../js/i18n/en.js')).default;
const holes = (s) => (s.match(/\{\d\}/g) || []).sort().join();
for (const f of readdirSync('art/i18n').filter((f) => f.endsWith('.tsv'))) {
  const l = f.slice(0, -4), out = en.map(() => '');
  let n = 0, bad = 0;
  for (const line of readFileSync(`art/i18n/${f}`, 'utf8').split('\n').slice(1)) {
    const [id, , tr] = line.split('\t');
    const i = +id, v = (tr || '').trim();
    if (!v || !(i in en)) continue;
    if (holes(v) !== holes(en[i])) { console.warn(`${l} ${i}: placeholders differ`); bad++; continue; }
    out[i] = v; n++;
  }
  writeFileSync(`js/i18n/${l}.js`, `// ${l} strings, by position in en.js. Made by tools/i18n-build.mjs from art/i18n/${f}: edit that file.\nexport default ${JSON.stringify(out)};\n`);
  console.log(`${l}: ${n} of ${en.length}${bad ? `, ${bad} skipped` : ''}`);
}
