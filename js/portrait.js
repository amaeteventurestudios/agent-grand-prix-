// Driver portraits: every driver is an AI agent, so its portrait is its helmet and race suit,
// drawn here as a small SVG in the team's colours. The design (pattern and visor tint) is seeded
// from the driver's callsign, so it stays the same everywhere; your own drivers can pick theirs.
// No images and no faces: all procedural, all ours.

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
export function portraitSVG(d, team, { size = 48, num = true, bg = true, id: fixed } = {}) {
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
