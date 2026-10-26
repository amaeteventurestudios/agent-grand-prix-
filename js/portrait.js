// Driver portraits. A driver's face is a Personas avatar (Personas by Draftbit, CC BY 4.0, drawn by
// DiceBear, MIT; vendored in vendor/dicebear) under our own racing layers: a race suit in the team's
// colours and a radio headset. The helmet is all ours: an SVG in the team's colours with a pattern
// and visor tint. Both are seeded from the driver's callsign, so they stay the same everywhere, and
// your own drivers can choose theirs. No images: everything is drawn as SVG.
import { createAvatar, personas } from '../vendor/dicebear/personas.min.js';

export const HELMET_PATTERNS = [
  { id: 'stripe', name: 'Stripe' }, { id: 'halo', name: 'Halo' }, { id: 'chevron', name: 'Chevron' },
  { id: 'split', name: 'Split' }, { id: 'stars', name: 'Stars' }, { id: 'bolt', name: 'Bolt' },
  { id: 'wave', name: 'Wave' }, { id: 'dots', name: 'Dots' },
];
export const VISORS = [
  { id: 'smoke', name: 'Smoke', a: '#1b1f27', b: '#3a4150' }, { id: 'gold', name: 'Gold', a: '#7a4b08', b: '#f5c542' },
  { id: 'blue', name: 'Blue', a: '#0b2a6b', b: '#4fb3ff' }, { id: 'red', name: 'Fire', a: '#5c0a10', b: '#ff6a3d' },
  { id: 'rainbow', name: 'Oil', a: '#2b0f5c', b: '#3fe0a8' }, { id: 'silver', name: 'Silver', a: '#3d434d', b: '#d9dee6' },
];

const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// the helmet a driver wears: its own choice when it has one, otherwise one seeded from its callsign
export function helmetOf(d) {
  const h = hash((d.code || '') + '|' + (d.name || ''));
  const pat = (d.helmet && HELMET_PATTERNS.find((p) => p.id === d.helmet.pat)) ? d.helmet.pat : HELMET_PATTERNS[h % HELMET_PATTERNS.length].id;
  const visor = (d.helmet && VISORS.find((v) => v.id === d.helmet.visor)) ? d.helmet.visor : VISORS[(h >>> 8) % VISORS.length].id;
  return { pat, visor };
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const col = (c, f) => (HEX.test(c || '') ? c : f);
function luma(c) {
  let h = c.slice(1); if (h.length === 3) h = h.replace(/./g, '$&$&');
  const n = parseInt(h, 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
function shade(c, k) {
  let h = c.slice(1); if (h.length === 3) h = h.replace(/./g, '$&$&');
  const n = parseInt(h, 16), f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
}

const HELMET = 'M19,58 C17,31 37,13 58,15 C79,17 89,34 87,53 L87,66 C87,74 81,79 73,79 L34,79 C25,79 20,70 19,58 Z';
const VISOR = 'M47,38 C61,33 79,36 88,43 L88,56 C77,59 61,59 50,57 C45,53 44,43 47,38 Z';

function pattern(p, c, g) {
  switch (p) {
    case 'stripe': return `<path d="M30,22 C44,12 64,12 78,20 L74,28 C62,22 46,22 36,30 Z" fill="${c}"/><path d="M33,26 C46,17 62,17 75,24" stroke="${g}" stroke-width="1.6" fill="none"/>`;
    case 'halo': return `<path d="M14,50 C20,30 44,20 70,26 C80,28 88,34 92,40 L92,46 C84,38 70,32 52,32 C34,32 20,42 14,58 Z" fill="${c}"/>`;
    case 'chevron': return `<path d="M10,40 L40,52 L10,64 L10,56 L28,52 L10,48 Z M24,36 L54,50 L24,66 L24,58 L40,50 L24,44 Z" fill="${c}"/>`;
    case 'split': return `<path d="M0,100 L0,58 C30,62 60,52 100,20 L100,100 Z" fill="${c}"/><path d="M0,58 C30,62 60,52 100,20" stroke="${g}" stroke-width="1.8" fill="none"/>`;
    case 'stars': return [[34, 34, 6], [26, 52, 4.5], [44, 24, 3.5], [40, 64, 4]].map(([x, y, r]) => `<path d="${star(x, y, r)}" fill="${c}"/>`).join('');
    case 'bolt': return `<path d="M18,40 L46,36 L38,48 L66,44 L30,70 L40,54 L16,58 Z" fill="${c}"/>`;
    case 'wave': return `<path d="M0,52 C14,40 26,64 42,50 C56,38 64,58 100,40 L100,48 C66,66 56,46 42,60 C26,74 14,50 0,62 Z" fill="${c}"/><path d="M0,72 C16,62 30,80 46,70" stroke="${g}" stroke-width="2.2" fill="none"/>`;
    default: return [[30, 30], [40, 24], [26, 44], [36, 40], [46, 34], [28, 58], [38, 54], [32, 68]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 2.6 : 3.6}" fill="${c}"/>`).join('');
  }
}
function star(x, y, r) {
  let d = '';
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; d += (i ? 'L' : 'M') + (x + Math.cos(a) * q).toFixed(1) + ',' + (y + Math.sin(a) * q).toFixed(1); }
  return d + 'Z';
}

let uid = 0;
// d: { name, code, num, helmet? }, team: { c1, c2, glow? }; size in CSS px (the SVG scales)
// id: a fixed id for a portrait redrawn often in one place, so its markup stays the same
export function helmetSVG(d, team, { size = 48, num = true, bg = true, id: fixed } = {}) {
  const id = fixed || 'pt' + (++uid), h = helmetOf(d), v = VISORS.find((x) => x.id === h.visor);
  const c1 = col(team.c1, '#888888'), c2 = col(team.c2, '#ffffff');
  // the pattern colour has to show on the shell: fall back to dark or light when the two are alike
  const pc = Math.abs(luma(c1) - luma(c2)) < 0.12 ? (luma(c1) > 0.5 ? '#16181d' : '#ffffff') : c2;
  const g = col(team.glow, shade(pc, luma(pc) > 0.5 ? -0.25 : 0.35));
  const suit = shade(c1, -0.18), ink = luma(c1) > 0.6 ? '#16181d' : '#ffffff';
  const n = num && d.num != null ? String(d.num).slice(0, 2) : '';
  return `<svg class="portrait" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${(d.name || '').replace(/[<>&"]/g, '')} helmet">
    <defs><clipPath id="${id}c"><path d="${HELMET}"/></clipPath>
      <linearGradient id="${id}v" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${v.b}"/><stop offset="1" stop-color="${v.a}"/></linearGradient>
      <radialGradient id="${id}s" cx="0.38" cy="0.3" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity="0.45"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.28"/></radialGradient>
      ${bg ? `<linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(c1, 0.82)}"/><stop offset="1" stop-color="${shade(c1, 0.55)}"/></linearGradient>` : ''}</defs>
    ${bg ? `<rect width="100" height="100" fill="url(#${id}b)"/>` : ''}
    <path d="M2,100 C4,86 18,79 32,79 L74,79 C88,79 98,87 99,100 Z" fill="${suit}"/>
    <path d="M30,100 L36,80 L44,80 L40,100 Z M66,100 L64,80 L72,80 L78,100 Z" fill="${pc}"/>
    <path d="M22,80 C30,74 76,74 84,80 L80,86 C70,82 36,82 26,86 Z" fill="#20232a"/>
    <path d="${HELMET}" fill="${c1}"/>
    <g clip-path="url(#${id}c)">${pattern(h.pat, pc, g)}<path d="M19,70 L87,70 L87,80 L19,80 Z" fill="${shade(c1, -0.3)}"/>
      <path d="${HELMET}" fill="url(#${id}s)"/></g>
    <path d="${VISOR}" fill="url(#${id}v)" stroke="#0d0f13" stroke-width="2"/>
    <path d="M52,41 C62,37 74,38 82,42" stroke="#fff" stroke-opacity="0.55" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M44,13 C52,10 62,11 68,15 L64,19 C58,16 52,16 47,18 Z" fill="#20232a"/>
    <path d="${HELMET}" fill="none" stroke="#0d0f13" stroke-opacity="0.55" stroke-width="1.6"/>
    ${n ? `<text x="${n.length > 1 ? 30 : 33}" y="76" font-family="system-ui,sans-serif" font-weight="800" font-style="italic" font-size="11" fill="${ink}" stroke="${ink === '#ffffff' ? '#0d0f13' : '#ffffff'}" stroke-width="2.2" paint-order="stroke">${n}</text>` : ''}
  </svg>`;
}

// ---------- faces ----------
export const SKINS = ['f2c7b0', 'eeb4a4', 'e5a07e', 'd78774', 'b16a5b', '92594b', '623d36', '4a2c25'];
export const HAIRS = ['shortCombover', 'curlyHighTop', 'bobCut', 'curly', 'curlyBun', 'buzzcut', 'bobBangs', 'bald', 'balding',
  'bunUndercut', 'fade', 'straightBun', 'extraLong', 'shortComboverChops', 'sideShave', 'long', 'mohawk', 'pigtails'];
export const HAIR_COLOURS = ['1c1410', '362c47', '4a3122', '6c4545', 'a55728', 'd6b370', 'dee1f5', 'e15c66'];
export const BEARDS = ['none', 'shadow', 'goatee', 'beardMustache', 'pyramid', 'walrus', 'soulPatch'];
export const EYES = ['open', 'happy', 'glasses', 'sunglasses'];
const MOUTHS = ['smile', 'bigSmile', 'smirk', 'lips'];
const pick = (list, h, k) => list[(h >>> k) % list.length];

// the face a driver has: its own choices where it made them, otherwise seeded from its callsign
export function faceOf(d) {
  const h = hash('face|' + (d.code || '') + '|' + (d.name || '')), f = d.face || {};
  const ok = (list, v) => (list.includes(v) ? v : null);
  return {
    skin: ok(SKINS, f.skin) || pick(SKINS, h, 0), hair: ok(HAIRS, f.hair) || pick(HAIRS, h, 3),
    hairColor: ok(HAIR_COLOURS, f.hairColor) || pick(HAIR_COLOURS.slice(0, 6), h, 7), beard: ok(BEARDS, f.beard) || (h % 3 ? 'none' : pick(BEARDS.slice(1), h, 11)),
    eyes: ok(EYES, f.eyes) || pick(['open', 'open', 'happy', 'happy', 'open', 'glasses', 'sunglasses'], h, 14), mouth: pick(MOUTHS, h, 17),
  };
}

// d: { name, code, num, face? }, team: { c1, c2 }; the suit and headset are drawn over the avatar
export function portraitSVG(d, team, { size = 48, bg = true } = {}) {
  const f = faceOf(d), c1 = col(team.c1, '#888888'), c2 = col(team.c2, '#ffffff');
  const pc = Math.abs(luma(c1) - luma(c2)) < 0.12 ? (luma(c1) > 0.5 ? '#16181d' : '#ffffff') : c2;
  let svg = createAvatar(personas, {
    seed: d.code || d.name || 'driver', randomizeIds: true, skinColor: [f.skin], hair: [f.hair], hairColor: [f.hairColor],
    facialHair: f.beard === 'none' ? [] : [f.beard], facialHairProbability: f.beard === 'none' ? 0 : 100,
    eyes: [f.eyes], mouth: [f.mouth], nose: ['mediumRound', 'smallRound'], body: ['rounded'], clothingColor: [c1.slice(1)],
    backgroundColor: bg ? [shade(c1, 0.8).slice(1)] : [],
  }).toString().replace(/<metadata[\s\S]*?<\/metadata>/, '');
  const ink = '#1d1f26', n = d.num != null ? String(d.num).slice(0, 2) : '';
  // race suit over the shoulders, collar, and the team's stripe; a headset over the head and ears
  const layers = `<path d="M8,64 C9,55 19,50.5 27,50 L37,50 C45,50.5 55,55 56,64 Z" fill="${c1}"/>
    <path d="M24,50.6 C26,54 38,54 40,50.6 L38,49.6 C36,51.6 28,51.6 26,49.6 Z" fill="${shade(c1, -0.35)}"/>
    <path d="M20,64 L23.5,52 L26,51.5 L23.5,64 Z M44,64 L40.5,52 L38,51.5 L40.5,64 Z" fill="${pc}"/>
    ${n ? `<text x="47" y="61.5" font-family="system-ui,sans-serif" font-weight="800" font-style="italic" font-size="5" fill="${pc}" text-anchor="middle">${n}</text>` : ''}
    <path d="M16.6,32 C15.5,10.5 48.5,10.5 47.4,32" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <rect x="13.6" y="27.5" width="6" height="10" rx="2.4" fill="${ink}"/><rect x="44.4" y="27.5" width="6" height="10" rx="2.4" fill="${ink}"/>
    <rect x="14.9" y="29.3" width="3.4" height="6.4" rx="1.4" fill="${c1}"/><rect x="45.7" y="29.3" width="3.4" height="6.4" rx="1.4" fill="${c1}"/>
    <path d="M17,37 C18,44 22,45.5 26.5,44.6" stroke="${ink}" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    <rect x="26" y="43.4" width="3" height="2.4" rx="1.1" fill="${ink}"/>`;
  return svg.replace(/^<svg /, `<svg class="portrait face" width="${size}" height="${size}" role="img" aria-label="${(d.name || '').replace(/[<>&"]/g, '')}" `).replace(/<\/svg>$/, layers + '</svg>');
}
