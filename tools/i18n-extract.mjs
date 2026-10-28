// Lists every English string the game can show, for translation: string literals and template
// literals in js/*.js (a template's ${...} becomes {0}, {1}, …) and the text in index.html. Writes
// js/i18n/en.js, keeping the order of strings already there, so the translation files (the same list
// in another language, index for index) stay lined up; new strings are added at the end.
// Usage: npm i --no-save acorn acorn-walk && node tools/i18n-extract.mjs
// Then: node tools/i18n-check.mjs  (which strings each language is missing)
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import fs from 'fs';
import path from 'path';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
// not shown to players: workers that only compute, the owner tools, the test hooks
const SKIP = new Set(['i18n.js', 'proving.worker.js', 'agent.worker.js', 'briefing.worker.js', 'rng.js', 'store.js', 'kit.js', 'cars.js', 'nature.js', 'env.js', 'teamradio.js', 'radio-words.js']);
// brain.js also holds the phrases it listens for ("how are the tyres"): lowercase, never shown
let file = '';
const found = new Set();
const code = /[;{}]|=>|\bpx\b|rgba?\(|^[.#[]|^\w+\(|\.(js|json|png|mp3|glb|webp|svg|html)\b|^[a-z-]+:\s|^[a-z][\w-]*$|^https?:|^[\w-]+=|^#[0-9a-f]{3,8}$|^(?=.*[a-z0-9][-_][a-z0-9])[a-z0-9 _-]+$/;
function add(s) {
  if (file === 'brain.js' && /^[a-z’' ]+$/.test(s.trim())) return;
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ').trim();
  if (!/[A-Za-z]{2,}/.test(s.replace(/\{\d\}/g, ''))) return;
  if (/^\{\d\}$/.test(s)) return;
  const word = /^[A-Z][a-z’']+$/.test(s) || /^[A-Z]{2,}$/.test(s);   // "Soft", "BOX"
  const bare = s.replace(/#?\{\d\}/g, ' ').replace(/\s+/g, ' ').trim();   // the words around a template's holes
  if (!word && (code.test(bare) || /^[a-z_]+$/.test(bare))) return;
  if (/^(?:[a-z]+[A-Z]\w*)$/.test(s)) return;                         // camelCase
  if (/^[/?&(]|^[\w-]+:[\w-]+$|^[\w./-]+\/[\w./-]*$|^(GET|PUT|POST|DELETE|PATCH)$/.test(s)) return;   // paths, keys, media queries
  found.add(s);
}
function html(raw) {
  raw.replace(/(?:title|placeholder|aria-label|alt)="([^"]*)"/g, (_, a) => add(a));
  raw.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '\u0000').split('\u0000').forEach(add);
}
for (const f of fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js') && !SKIP.has(f)).sort()) {
  file = f;
  const ast = acorn.parse(fs.readFileSync(path.join(root, 'js', f), 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
  walk.full(ast, (n) => {
    if (n.type === 'Literal' && typeof n.value === 'string') html(n.value);
    if (n.type === 'TemplateLiteral') {
      let s = '';
      n.quasis.forEach((q, i) => { s += q.value.cooked ?? q.value.raw; if (i < n.expressions.length) s += `{${i}}`; });
      html(s);
    }
  });
}
file = '';
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html(page.slice(page.indexOf('<body')).replace(/<script type="module"[\s\S]*$/, ''));
(page.match(/var steps = \[([^\]]*)\]/)?.[1].match(/'[^']*'/g) || []).forEach((s) => add(s.slice(1, -1)));
add('Lights out!');
// voice clip lines (art/voice/*.json) appear as radio text too
for (const j of ['lines', 'brain', 'academy']) Object.values(JSON.parse(fs.readFileSync(path.join(root, 'art/voice', j + '.json'), 'utf8'))).forEach(add);

const out = path.join(root, 'js/i18n/en.js');
const old = fs.existsSync(out) ? (await import(out)).default : [];
const list = [...old, ...[...found].filter((s) => !old.includes(s))];
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, '// The game\'s English strings, in a fixed order. Made by tools/i18n-extract.mjs: do not edit.\nexport default ' + JSON.stringify(list, null, 0).replace(/","/g, '",\n"') + ';\n');
console.log(list.length, 'strings,', list.length - old.length, 'new');
