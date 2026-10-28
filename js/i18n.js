// Languages. The game is written in English; a translation is a list of the game's English strings
// (js/i18n/en.js, made by tools/i18n-extract.mjs) and the same list in the other language
// (js/i18n/<lang>.js). Rather than wrap every string in the code, the page itself is translated: each
// text node and label is looked up as it appears, so new screens need no changes here.
//   - exact strings first, then patterns: "Lap {0} of {1}" matches "Lap 3 of 13", and the pieces it
//     catches are translated too when they are strings of their own ("Soft", "Medium")
//   - text that is several sentences glued together (driver radio) is tried a sentence at a time
//   - anything inside [translate="no"] (team and driver names typed by players) is left alone
// The starting language follows the player's country (guessed from the time zone, since our DNS does
// not pass the visitor's country) or the browser's language; a saved choice always wins.
export const LANGS = [
  ['en', 'English'], ['fr', 'Français'], ['es', 'Español'], ['pt', 'Português'], ['ar', 'العربية'], ['pcm', 'Naijá (Pidgin)'],
];
const KEY = 'agp.lang';
const RTL = new Set(['ar']);
// speech recognition and number formats per language
export const LOCALE = { en: 'en-GB', fr: 'fr-FR', es: 'es-ES', pt: 'pt-BR', ar: 'ar-SA', pcm: 'en-NG' };

// time zones of countries that mostly speak one of our languages
const Z = {
  fr: 'Europe/Paris Europe/Brussels Europe/Luxembourg Europe/Monaco Africa/Dakar Africa/Abidjan Africa/Bamako Africa/Ouagadougou Africa/Niamey Africa/Conakry Africa/Lome Africa/Porto-Novo Africa/Douala Africa/Libreville Africa/Brazzaville Africa/Kinshasa Africa/Lubumbashi Africa/Bangui Africa/Ndjamena Africa/Bujumbura Africa/Djibouti Indian/Antananarivo Indian/Comoro Indian/Mayotte Indian/Reunion America/Martinique America/Guadeloupe America/Cayenne America/Port-au-Prince America/Miquelon Pacific/Tahiti Pacific/Noumea Pacific/Wallis',
  es: 'Europe/Madrid Atlantic/Canary Africa/Ceuta Africa/Malabo America/Mexico_City America/Cancun America/Merida America/Monterrey America/Matamoros America/Chihuahua America/Ciudad_Juarez America/Ojinaga America/Mazatlan America/Bahia_Banderas America/Hermosillo America/Tijuana America/Guatemala America/El_Salvador America/Tegucigalpa America/Managua America/Costa_Rica America/Panama America/Havana America/Santo_Domingo America/Puerto_Rico America/Bogota America/Caracas America/Lima America/Guayaquil Pacific/Galapagos America/La_Paz America/Santiago America/Punta_Arenas Pacific/Easter America/Asuncion America/Montevideo America/Buenos_Aires',
  pt: 'America/Sao_Paulo America/Noronha America/Belem America/Fortaleza America/Recife America/Araguaina America/Maceio America/Bahia America/Campo_Grande America/Cuiaba America/Santarem America/Porto_Velho America/Boa_Vista America/Manaus America/Eirunepe America/Rio_Branco Europe/Lisbon Atlantic/Madeira Atlantic/Azores Africa/Luanda Africa/Maputo Africa/Bissau Atlantic/Cape_Verde Africa/Sao_Tome Asia/Dili',
  ar: 'Africa/Cairo Africa/Tripoli Africa/Tunis Africa/Algiers Africa/Casablanca Africa/El_Aaiun Africa/Nouakchott Africa/Khartoum Asia/Riyadh Asia/Dubai Asia/Qatar Asia/Bahrain Asia/Kuwait Asia/Muscat Asia/Aden Asia/Baghdad Asia/Amman Asia/Damascus Asia/Beirut Asia/Gaza Asia/Hebron',
};
const ZONES = new Map();
for (const [l, zs] of Object.entries(Z)) zs.split(' ').forEach((z) => ZONES.set(z, l));

function guess() {
  const known = new Set(LANGS.map(([k]) => k));
  const browser = String(navigator.language || '').toLowerCase().split('-')[0];
  if (known.has(browser) && browser !== 'en') return browser;
  let zone = '';
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
  return ZONES.get(zone) || (zone.startsWith('America/Argentina/') ? 'es' : 'en');
}
function saved() { try { return localStorage.getItem(KEY); } catch { return null; } }

const q = new URLSearchParams(location.search).get('lang');
export let lang = LANGS.some(([k]) => k === q) ? q : saved() || guess();
// true on the visit where we picked a language for the player (so the page can offer English)
export const guessed = !saved() && !q && lang !== 'en';

let dict = null, pats = [];
const cache = new Map();
const norm = (s) => s.replace(/\s+/g, ' ').trim();

async function loadDict(l) {
  if (l === 'en') return;
  const [en, xx] = await Promise.all([import('./i18n/en.js'), import(`./i18n/${l}.js`)]).catch(() => [null, null]);
  if (!en || !xx) { lang = 'en'; return; }
  dict = new Map(); pats = [];
  en.default.forEach((k, i) => {
    const v = xx.default[i];
    if (!v) return;
    if (/\{\d\}/.test(k)) {
      const parts = k.split(/(\{\d\})/), order = [];
      let re = parts.map((p) => { const m = p.match(/^\{(\d)\}$/); if (m) { order.push(+m[1]); return '(.*?)'; } return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('');
      // a hole at either end may be empty, with its space ("{0} Welcome to the paddock" also matches "Welcome to the paddock")
      re = re.replace(/^\(\.\*\?\) /, '(?:(.*?) )?').replace(/ \(\.\*\?\)$/, '(?: (.*?))?');
      pats.push({ re: new RegExp('^' + re + '$'), order, to: v, lit: k.replace(/\{\d\}/g, '').length });
    } else dict.set(k, v);
  });
  pats.sort((a, b) => b.lit - a.lit);    // the most specific pattern first
}

// one string, already trimmed: its translation, or null
function look(s, deep = 0) {
  if (cache.has(s)) return cache.get(s);
  let r = dict.get(s) ?? null;
  if (r === null) {
    for (const p of pats) {
      const m = s.match(p.re);
      if (!m) continue;
      const got = {}; p.order.forEach((n, i) => { got[n] = m[i + 1]; });
      r = p.to.replace(/\{(\d)\}/g, (_, n) => { const g = got[n] ?? ''; return (deep < 2 && /[A-Za-z]{2}/.test(g) && look(g.trim(), deep + 1)) || g; });
      r = r.replace(/\s+/g, ' ').trim();
      break;
    }
  }
  // several sentences: translate the ones we know
  if (r === null && deep === 0 && /[.!?:] \S/.test(s)) {
    const bits = s.split(/(?<=[.!?:])\s+/);
    if (bits.length > 1) {
      let any = false;
      const out = bits.map((b) => { const t = look(b, 1); if (t) any = true; return t || b; });
      if (any) r = out.join(' ');
    }
  }
  // an icon or arrow around known words: "▶ Play", "Teams ▾"
  if (r === null && deep < 2) {
    const m = s.match(/^([^\p{L}]*)(\p{L}.*?)([^\p{L}\p{N}.!?)…]*)$/su);
    if (m && (m[1] || m[3])) { const t = look(m[2], deep + 1); if (t) r = m[1] + t + m[3]; }
  }
  if (cache.size > 4000) cache.clear();
  cache.set(s, r);
  return r;
}

// t('Box this lap') for strings the code draws itself (canvas labels and the like)
export function t(s) {
  if (!dict || !s) return s;
  const n = norm(String(s));
  return look(n) ?? s;
}

const done = new WeakMap();   // node → the text we last wrote, so our own writes aren't translated twice
const SKIP = 'script,style,textarea,code,[translate="no"],.notranslate';
const letters = /[A-Za-z]{2}/;
function textNode(n) {
  const v = n.nodeValue;
  if (!v || !letters.test(v) || done.get(n) === v) return;
  const p = n.parentElement;
  if (!p || p.closest(SKIP)) return;
  const s = norm(v), r = s && look(s);
  if (!r) return;
  const out = v.match(/^\s*/)[0] + r + v.match(/\s*$/)[0];
  done.set(n, out); n.nodeValue = out;
}
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
function attrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v || !letters.test(v)) continue;
    const r = look(norm(v));
    // setting an attribute to its own value still fires the observer: write only real changes
    if (r && r !== v) el.setAttribute(a, r);
  }
}
function walk(root) {
  if (root.nodeType === 3) return textNode(root);
  if (root.nodeType !== 1 || root.closest?.(SKIP)) return;
  attrs(root);
  if (root.tagName === 'INPUT' && /^(button|submit)$/.test(root.type) && root.value) { const r = look(norm(root.value)); if (r) root.value = r; }
  const it = document.createTreeWalker(root, 5 /* elements and text */);
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    if (n.nodeType === 3) textNode(n);
    else if (n.matches(SKIP)) { /* the walker still enters it; textNode checks closest() */ } else attrs(n);
  }
}
let obs = null;
function start() {
  walk(document.body);
  const tt = look(norm(document.title)); if (tt) document.title = tt;
  obs = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') textNode(m.target);
      else if (m.type === 'attributes') { if (m.target.nodeType === 1 && !m.target.closest(SKIP)) attrs(m.target); }
      else m.addedNodes.forEach(walk);
    }
  });
  obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

function applyDir() {
  const h = document.documentElement;
  h.lang = lang === 'pcm' ? 'pcm' : lang;
  h.dir = RTL.has(lang) ? 'rtl' : 'ltr';
  h.classList.toggle('rtl', RTL.has(lang));
}

// a new language: saved, then the page reloads so every screen is drawn in it from the start
export function setLang(l) {
  if (!LANGS.some(([k]) => k === l)) return;
  try { localStorage.setItem(KEY, l); } catch {}
  if (l === lang) return;
  const u = new URL(location.href); u.searchParams.delete('lang');
  location.replace(u.toString());
}
// keep the guessed language from now on (or English, when the player switched back)
export function keepLang() { try { localStorage.setItem(KEY, lang); } catch {} }

await loadDict(lang);
applyDir();
if (dict) { if (document.body) start(); else addEventListener('DOMContentLoaded', start, { once: true }); }
