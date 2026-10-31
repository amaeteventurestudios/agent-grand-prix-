// Circuit layouts from pieces, the way real circuits are drawn: straights of every length joined by
// hairpins, chicanes, S-bends, street corners, sweepers and corners that turn back the "wrong" way,
// so a lap can fold in on itself. The headings come from the corners alone, so the straights'
// lengths are solved to close the loop exactly. Seeded: every venue keeps one layout of its own.
// No Three.js here, so Node can generate and test tracks.

const TAU = Math.PI * 2, D = Math.PI / 180;

// a venue's character: street circuits are blocky, fast circuits flow, the rest mix both
export function styleFor(venue = {}, r) {
  if (venue.street) return r.chance(0.75) ? 'street' : 'mixed';
  if ((venue.vmax || 1) >= 1.03) return r.chance(0.6) ? 'power' : 'mixed';
  if (venue.hills === 'hills' || venue.hills === 'peaks') return r.chance(0.6) ? 'flow' : 'mixed';
  return r.pick(['flow', 'mixed', 'mixed', 'power']);
}

// one feature: a list of arcs { R, a } (a > 0 turns the way the lap goes round) and short links { L }
function feature(r, style, minR) {
  const R = (lo, hi) => Math.max(minR, r.range(lo, hi));
  const pick = {
    street: [['square', 5], ['chicane', 1.6], ['hairpin', 1.2], ['back', 2], ['tongue', 0.8], ['medium', 1], ['kink', 0.8]],
    flow: [['esses', 3], ['sweeper', 1.6], ['medium', 2], ['hairpin', 1.2], ['back', 2], ['tongue', 1], ['chicane', 0.6]],
    power: [['hairpin', 2.4], ['chicane', 2], ['medium', 1.6], ['sweeper', 0.8], ['back', 1.4], ['tongue', 1], ['square', 1]],
    mixed: [['medium', 2], ['hairpin', 1.4], ['chicane', 1.2], ['esses', 1.4], ['sweeper', 1], ['back', 2], ['tongue', 1], ['square', 1.4]],
  }[style];
  let t = r() * pick.reduce((s, p) => s + p[1], 0), kind = pick[0][0];
  for (const [k, w] of pick) { if ((t -= w) < 0) { kind = k; break; } }
  const sg = r.chance(0.5) ? 1 : -1;
  switch (kind) {
    case 'square': return { kind, parts: [{ R: R(17, 30), a: r.range(80, 100) * D }] };
    case 'hairpin': return { kind, parts: [{ R: R(17, 26), a: r.range(150, 185) * D }] };
    case 'medium': return { kind, parts: [{ R: R(34, 70), a: r.range(55, 115) * D }] };
    case 'sweeper': return { kind, parts: [{ R: R(110, 230), a: r.range(30, 75) * D }] };
    case 'kink': return { kind, parts: [{ R: R(60, 120), a: r.range(20, 40) * D * sg }] };
    case 'back': return { kind, parts: [{ R: R(30, 60), a: -r.range(60, 120) * D }] };
    // a tongue: the lap reaches out and comes back on itself round a hairpin
    case 'tongue': {
      const a = r.range(70, 100) * D, L = r.range(90, 220);
      return { kind, parts: [{ R: R(30, 55), a: -a }, { L }, { R: R(18, 26), a: Math.PI }, { L: L * r.range(0.6, 1) }, { R: R(30, 55), a: -a * r.range(0.5, 0.9) }] };
    }
    case 'chicane': {
      const a = r.range(35, 60) * D, rr = R(18, 30);
      return { kind, parts: [{ R: rr, a: a * sg }, { L: r.range(8, 24) }, { R: rr, a: -a * sg }] };
    }
    case 'esses': {
      const n = r.int(3, 4), parts = [];
      for (let i = 0; i < n; i++) { if (i) parts.push({ L: r.range(4, 18) }); parts.push({ R: R(45, 90), a: r.range(40, 70) * D * (i % 2 ? -sg : sg) }); }
      return { kind, parts };
    }
  }
}

// the plan: a main straight, then features with straights between them, turning one full lap
function plan(r, style, opt) {
  const feats = [], lens = [];
  const sum = () => feats.reduce((s, f) => s + f.parts.reduce((t, p) => t + (p.a || 0), 0), 0);
  let guard = 0;
  while (sum() < TAU * 0.92 && guard++ < 30) feats.push(feature(r, style, opt.minRadius));
  if (feats.length < 7 || feats.length > 18) return null;
  // the turning in the lap's own direction is scaled so the whole lap turns exactly once
  let pos = 0, neg = 0;
  for (const f of feats) for (const p of f.parts) if (p.a) { if (p.a > 0) pos += p.a; else neg += p.a; }
  const k = (TAU - neg) / pos;
  if (k < 0.8 || k > 1.25) return null;
  // every lap folds in somewhere: some turning against the lap's own direction
  if (neg > -120 * D) return null;
  for (const f of feats) for (const p of f.parts) if (p.a > 0) p.a = Math.min(p.a * k, 195 * D);
  // straights: one main straight, two or three long ones, the rest short
  const short = style === 'street' ? [40, 160] : [50, 220];
  for (let i = 0; i < feats.length; i++) lens.push({ L: r.range(...short), min: 25 });
  lens[0] = { L: r.range(560, 820), min: opt.minStraight + 40, main: true };
  const longs = style === 'power' ? 3 : 2;
  for (let n = 0; n < longs; n++) { const j = r.int(1, feats.length - 1); lens[j] = { L: r.range(260, 520), min: 120 }; }
  return { feats, lens };
}

// lay the plan out and solve the straights so the lap closes
function lay(P) {
  const segs = [];
  for (let i = 0; i < P.feats.length; i++) { segs.push({ S: i }); for (const p of P.feats[i].parts) segs.push(p); }
  let h = 0, x = 0, z = 0;
  const dirs = [];
  for (const s of segs) {
    if (s.S !== undefined) { dirs[s.S] = [Math.cos(h), Math.sin(h)]; continue; }
    if (s.L) { x += Math.cos(h) * s.L; z += Math.sin(h) * s.L; continue; }
    // arc: centre to the side it turns
    const sgn = Math.sign(s.a), cx = x - Math.sin(h) * s.R * sgn, cz = z + Math.cos(h) * s.R * sgn, h1 = h + s.a;
    x = cx + Math.sin(h1) * s.R * sgn; z = cz - Math.cos(h1) * s.R * sgn; h = h1;
  }
  // close: the straights take up the gap, each in proportion to its length
  const L0 = P.lens.map((l) => l.L);
  let ex = -x, ez = -z;
  P.lens.forEach((l, j) => { ex -= l.L * dirs[j][0]; ez -= l.L * dirs[j][1]; });
  let a = 0, b = 0, c = 0;
  P.lens.forEach((l, j) => { const w = l.L, [dx, dz] = dirs[j]; a += w * dx * dx; b += w * dx * dz; c += w * dz * dz; });
  const det = a * c - b * b; if (Math.abs(det) < 1e-6) return null;
  const mx = (c * ex - b * ez) / det, mz = (a * ez - b * ex) / det;
  const len = P.lens.map((l, j) => l.L + l.L * (dirs[j][0] * mx + dirs[j][1] * mz));
  for (let j = 0; j < len.length; j++) if (len[j] < P.lens[j].min || len[j] > L0[j] * 2.2 + 80) return null;
  // sample every metre
  const pts = [];
  h = 0; x = 0; z = 0;
  const line = (L) => { const n = Math.max(1, Math.round(L)); for (let i = 0; i < n; i++) { pts.push([x, z]); x += Math.cos(h) * L / n; z += Math.sin(h) * L / n; } };
  for (const s of segs) {
    if (s.S !== undefined) { line(len[s.S]); continue; }
    if (s.L) { line(s.L); continue; }
    const sgn = Math.sign(s.a), cx = x - Math.sin(h) * s.R * sgn, cz = z + Math.cos(h) * s.R * sgn, n = Math.max(2, Math.round(Math.abs(s.a) * s.R));
    for (let i = 0; i < n; i++) {
      pts.push([x, z]);
      const hh = h + s.a * (i + 1) / n;
      x = cx + Math.sin(hh) * s.R * sgn; z = cz - Math.cos(hh) * s.R * sgn;
    }
    h += s.a;
  }
  return pts;
}

export function pieceLayout(r, opt, style) {
  const P = plan(r, style, opt);
  return P && lay(P);
}

// redrawn layouts: the venue's layout seed gets this number on the end (picked on the sheet, 2026-10-31)
export const REDRAWN = { kigali: 41, abidjan: 50, sakhir: 69, kingston: 53, spielberg: 25, zandvoort: 32, honolulu: 53, abuja: 69, imola: 11, madrid: 11, portimao: 21, kualalumpur: 30, iceland: 22, barcelona: 18, anchorage: 4, shanghai: 47 };
export const layoutSeedKey = (id) => id + '-layout-2' + (REDRAWN[id] ? '-' + REDRAWN[id] : '');
