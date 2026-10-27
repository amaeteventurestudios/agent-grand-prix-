// The nature kit: trees, mountain ranges, coastal rocks with surf, sailboats and yachts, clouds.
// Low-poly and faceted to match the cities' look, coloured per vertex (darker underneath, lighter
// where the sun lands), so there are no textures. Trees come in a near and a far version: the near
// one is only used close to the track, where the cameras are.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './rng.js';

const col = (h) => new THREE.Color(h);

// a geometry with flat colours: each vertex coloured by fn(color, x, y, z)
function paint(g, fn) {
  if (g.index) g = g.toNonIndexed();
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.normal) g.deleteAttribute('normal');
  const p = g.attributes.position, c = new Float32Array(p.count * 3), cc = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(cc, p.getX(i), p.getY(i), p.getZ(i), i); c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const solid = (g, hex, shade = 0) => { const base = col(hex); return paint(g, (c, x, y) => c.copy(base).multiplyScalar(1 + shade * y)); };

// a tapered tube through points [[x, y, z, r], ...] with `seg` sides
function tube(pts, seg, colorFn) {
  const pos = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0), a = new THREE.Vector3(), b = new THREE.Vector3(), t = new THREE.Vector3();
  pts.forEach((p, i) => {
    const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
    t.set(q[0] - o[0], q[1] - o[1], q[2] - o[2]).normalize();
    a.crossVectors(t, Math.abs(t.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize(); b.crossVectors(t, a).normalize();
    for (let k = 0; k < seg; k++) {
      const ang = (k / seg) * Math.PI * 2, cs = Math.cos(ang) * p[3], sn = Math.sin(ang) * p[3];
      pos.push(p[0] + a.x * cs + b.x * sn, p[1] + a.y * cs + b.y * sn, p[2] + a.z * cs + b.z * sn);
    }
    if (i > 0) for (let k = 0; k < seg; k++) {
      const k2 = (k + 1) % seg, r0 = (i - 1) * seg, r1 = i * seg;
      idx.push(r0 + k, r1 + k, r0 + k2, r0 + k2, r1 + k, r1 + k2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return paint(g, (c, x, y, z, i) => colorFn(c, Math.floor(i / 1), y));
}

// a faceted blob: an icosahedron with its corners pushed in and out
function blob(r, detail, sx, sy, sz, R, base, top, x = 0, y = 0, z = 0) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, 0.85 + R() * 0.3);
    const k = seen.get(key);
    p.setXYZ(i, p.getX(i) * k * sx + x, p.getY(i) * k * sy + y, p.getZ(i) * k * sz + z);
  }
  const b = col(base), t = col(top);
  return paint(g, (c, X, Y) => c.copy(b).lerp(t, Math.min(1, Math.max(0, (Y - (y - r * sy)) / (2 * r * sy)))));
}

// trees, about 9 m tall for a palm and 7 m for a broadleaf; near = more detail
export function treeGeo(type, near, seed = 1) {
  const R = rng(seed + (near ? 7 : 3));
  const bark = '#6b4a2f', g = [];
  if (type === 'palm') {
    // a curving ringed trunk, a crown of arching fronds folded along the rib, and coconuts
    const H = 9, lean = 1.1, n = near ? 7 : 3;
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([lean * t * t, H * t, 0, 0.36 - 0.16 * t]); }
    g.push(tube(pts, near ? 6 : 4, (c, i, y) => c.set(bark).multiplyScalar(0.8 + 0.25 * (Math.floor(y / 0.7) % 2) + 0.03 * y)));
    const top = [lean, H, 0], nf = near ? 9 : 6, segs = near ? 4 : 2;
    for (let f = 0; f < nf; f++) {
      const a = (f / nf) * Math.PI * 2 + R() * 0.3, len = 4 + R() * 1.2, droop = 1.8 + R() * 1.4, dx = Math.cos(a), dz = Math.sin(a);
      const pos = [], cols = [];
      const rows = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs, rr = len * t, y = top[1] + 0.9 * t - droop * t * t;
        const w = 0.95 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - 0.35 * t) + 0.05;
        const cx = top[0] + dx * rr, cz = top[2] + dz * rr, px = -dz * w, pz = dx * w;
        rows.push([[cx + px, y - 0.25 * w, cz + pz], [cx, y + 0.08, cz], [cx - px, y - 0.25 * w, cz - pz]]);
      }
      const dark = col('#2f6f2e'), lite = col('#7fae3c');
      for (let i = 0; i < segs; i++) for (const [l, m] of [[0, 1], [1, 2]]) {
        const A = rows[i][l], B = rows[i][m], C = rows[i + 1][l], D = rows[i + 1][m];
        pos.push(...A, ...C, ...B, ...B, ...C, ...D);
        for (let k = 0; k < 6; k++) { const c = dark.clone().lerp(lite, (i + (k === 1 || k >= 4 ? 1 : 0)) / segs); cols.push(c.r, c.g, c.b); }
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.push(fg);
    }
    if (near) for (let k = 0; k < 3; k++) { const a = k * 2.1; g.push(solid(new THREE.IcosahedronGeometry(0.22, 0).translate(lean + Math.cos(a) * 0.3, H - 0.35, Math.sin(a) * 0.3), '#5a4224')); }
  } else if (type === 'pine') {
    g.push(solid(new THREE.CylinderGeometry(0.22, 0.38, 3, 5).translate(0, 1.5, 0), bark));
    const tiers = near ? 3 : 2;
    for (let k = 0; k < tiers; k++) {
      const r = 3.3 - k * (near ? 0.85 : 1.2), h = 4.6 - k * 0.6, y = 2.2 + k * (near ? 2.4 : 3.2);
      const cone = new THREE.ConeGeometry(r, h, near ? 8 : 6, 1); cone.translate(0, y + h / 2, 0);
      const p = cone.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < y + 0.1) { p.setX(i, p.getX(i) * (0.9 + R() * 0.25)); p.setZ(i, p.getZ(i) * (0.9 + R() * 0.25)); }
      g.push(paint(cone, (c, x, Y) => c.set('#2a5634').lerp(col('#4f8a4a'), Math.min(1, (Y - y) / h) * 0.8)));
    }
  } else if (type === 'acacia') {
    // a short trunk forking into branches, under a flat, wide umbrella of leaves
    g.push(tube([[0, 0, 0, 0.32], [0.1, 2.2, 0, 0.26], [0.2, 3.0, 0, 0.22]], 5, (c, i, y) => c.set('#5d4630').multiplyScalar(0.85 + y * 0.04)));
    const nb = near ? 4 : 3;
    for (let k = 0; k < nb; k++) {
      const a = (k / nb) * Math.PI * 2 + R(), d = 2.2 + R() * 1.4;
      const ex = Math.cos(a) * d, ez = Math.sin(a) * d;
      g.push(tube([[0.2, 3.0, 0, 0.2], [ex * 0.55, 4.1, ez * 0.55, 0.14], [ex, 5.0, ez, 0.08]], 4, (c) => c.set('#5d4630')));
      g.push(blob(2.6, near ? 1 : 0, 1.35, 0.32, 1.35, R, '#55702f', '#9fb04a', ex * 0.8, 5.4, ez * 0.8));
    }
  } else if (type === 'baobab') {
    // a fat bottle trunk with stubby branches and small tufts
    const prof = [[1.5, 0], [1.75, 0.6], [1.8, 2.2], [1.55, 4.6], [1.1, 6.6], [0.7, 7.6], [0.5, 8.0]].map(([r, y]) => new THREE.Vector2(r, y));
    const lg = new THREE.LatheGeometry(prof, near ? 10 : 7);
    const p = lg.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.92 + R() * 0.16; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    g.push(paint(lg, (c, x, y) => c.set('#8f7a68').multiplyScalar(0.82 + y * 0.03)));
    const nb = near ? 6 : 4;
    for (let k = 0; k < nb; k++) {
      const a = (k / nb) * Math.PI * 2 + R() * 0.5, d = 2.2 + R() * 1.6;
      const ex = Math.cos(a) * d, ez = Math.sin(a) * d, ey = 9 + R() * 1.6;
      g.push(tube([[Math.cos(a) * 0.4, 7.6, Math.sin(a) * 0.4, 0.3], [ex * 0.6, ey - 0.6, ez * 0.6, 0.2], [ex, ey, ez, 0.1]], 4, (c) => c.set('#857060')));
      g.push(blob(1.1, 0, 1, 0.7, 1, R, '#4f6f2c', '#86a248', ex, ey + 0.3, ez));
    }
  } else {
    // round broadleaf (or cherry blossom): a forked trunk and a cluster of faceted crowns
    const cherry = type === 'cherry';
    const [lo, hi] = cherry ? ['#d46a95', '#ffc4dc'] : ['#3d7f37', '#7cc455'];
    g.push(tube([[0, 0, 0, 0.3], [0.05, 2.4, 0, 0.24], [0.15, 3.4, 0, 0.16]], 5, (c, i, y) => c.set(cherry ? '#4e3a35' : bark).multiplyScalar(0.85 + y * 0.05)));
    g.push(blob(2.9, near ? 1 : 0, 1, 0.9, 1, R, lo, hi, 0, 5.6, 0));
    if (near) for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + R(), d = 1.9;
      g.push(blob(1.7, 0, 1, 0.85, 1, R, lo, hi, Math.cos(a) * d, 4.8 + R() * 1.4, Math.sin(a) * d));
    }
  }
  const out = mergeGeometries(g.map((x) => (x.index ? x.toNonIndexed() : x)));
  out.computeVertexNormals();
  return out;
}

// a mountain: a polar heightfield with ridges, rock strata in bands and snow on top.
// opts: { h, r, snow, base, flat (a table top), seed }
export function mountainGeo({ h, r, snow = false, base = '#5f7a5a', rock = '#8a8070', flat = false, seed = 1, rings = 7, segs = 16 }) {
  const R = rng(seed), pos = [], idx = [];
  const ridgeA = R() * 6, ridgeB = 2 + Math.floor(R() * 3);
  const height = (t, a) => {
    let p;
    if (flat) p = t < 0.42 ? 1 : t < 0.6 ? 1 - (t - 0.42) / 0.18 * 0.45 : 0.55 * (1 - (t - 0.6) / 0.4) ** 1.4;
    else p = (1 - t) ** 1.35;
    const ridge = 1 + 0.18 * Math.sin(a * ridgeB + ridgeA) * t + (R() - 0.5) * 0.12 * t;
    return Math.max(0, h * p * (flat && t < 0.42 ? 1 : ridge));
  };
  pos.push(0, height(0, 0), 0);
  for (let i = 1; i <= rings; i++) {
    const t = i / rings;
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2 + (i % 2) * Math.PI / segs, rr = r * t * (0.85 + R() * 0.3);
      pos.push(Math.cos(a) * rr, i === rings ? -6 : height(t, a), Math.sin(a) * rr);
    }
  }
  for (let k = 0; k < segs; k++) idx.push(0, 1 + (k + 1) % segs, 1 + k);
  for (let i = 1; i < rings; i++) for (let k = 0; k < segs; k++) {
    const a0 = 1 + (i - 1) * segs, a1 = 1 + i * segs, k2 = (k + 1) % segs;
    idx.push(a0 + k, a0 + k2, a1 + k, a0 + k2, a1 + k2, a1 + k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const ng = g.toNonIndexed(); ng.computeVertexNormals();
  const bc = col(base), rc = col(rock), sc = col('#f4f6f8'), n = ng.attributes.normal, p = ng.attributes.position;
  const c = new Float32Array(p.count * 3), cc = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    // one colour per face: green or scrub on gentle slopes, banded rock on steep ones, snow up high
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, steep = 1 - Math.abs(n.getY(i));
    cc.copy(bc).lerp(rc, Math.min(1, Math.max(0, (steep - 0.35) * 2.2 + (flat ? 0.5 : 0))));
    const band = Math.floor(y / Math.max(8, h * 0.09));
    cc.multiplyScalar(band % 2 ? 0.93 : 1.05);
    if (snow && y > h * 0.55) cc.lerp(sc, Math.min(1, (y / h - 0.55) * 4) * (steep > 0.75 ? 0.5 : 1));
    for (let k = 0; k < 3; k++) { c[(i + k) * 3] = cc.r; c[(i + k) * 3 + 1] = cc.g; c[(i + k) * 3 + 2] = cc.b; }
  }
  ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return ng;
}

// boats on the water: sailboats (hull, mast, main and jib) and motor yachts (decks and dark glass)
function sailboatGeo() {
  const hull = new THREE.BoxGeometry(9, 1.2, 2.8, 2, 1, 1); hull.translate(0, 0.4, 0);
  const p = hull.attributes.position;
  for (let i = 0; i < p.count; i++) { if (p.getX(i) > 4) p.setZ(i, 0); if (p.getY(i) < 0) p.setZ(i, p.getZ(i) * 0.5); }
  const g = [paint(hull, (c, x, y) => c.set(y > 0.75 ? '#ffffff' : y > 0.5 ? '#1f4f8a' : '#f2f2f2')),
    solid(new THREE.CylinderGeometry(0.08, 0.1, 11, 4).translate(0.5, 6.5, 0), '#d0d4da')];
  const tri = (a, b, cc, hex) => { const t = new THREE.BufferGeometry(); t.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...cc], 3)); return solid(t, hex); };
  const sails = mergeGeometries([tri([0.6, 1.4, 0], [0.6, 11.5, 0], [-3.4, 1.6, 0], '#fbfbf8'),    // mainsail
    tri([0.4, 10.5, 0.02], [4.4, 1.2, 0.02], [0.6, 1.3, 0.02], '#f1f0ea')]);                         // jib
  const body = mergeGeometries(g.map((x) => (x.index ? x.toNonIndexed() : x)));
  // two groups: the boat, and the sails (drawn with their own light, as sailcloth glows in the sun)
  const m = mergeGeometries([body, sails], true); m.computeVertexNormals(); return m;
}
function yachtGeo() {
  const hull = new THREE.BoxGeometry(24, 2.6, 6, 2, 1, 1); hull.translate(0, 1, 0);
  const p = hull.attributes.position;
  for (let i = 0; i < p.count; i++) { if (p.getX(i) > 10) p.setZ(i, p.getZ(i) * 0.1); if (p.getY(i) < 0) p.setZ(i, p.getZ(i) * 0.55); }
  const deck = (w, d, y, x) => [solid(new THREE.BoxGeometry(w, 1.6, d).translate(x, y + 0.8, 0), '#f7f8fa'),
    solid(new THREE.BoxGeometry(w - 0.6, 0.8, d + 0.04).translate(x, y + 0.85, 0), '#1c2633')];
  const g = [paint(hull, (c, x, y) => c.set(y > 0.4 ? '#fbfbfb' : '#25303d')), ...deck(13, 5.2, 2.3, -2), ...deck(8, 4.4, 3.9, -3), solid(new THREE.BoxGeometry(3, 0.3, 3.6).translate(-4, 5.65, 0), '#e9ecef')];
  const m = mergeGeometries([mergeGeometries(g.map((x) => (x.index ? x.toNonIndexed() : x)))], true); m.computeVertexNormals(); return m;
}

export class Boats {
  // spots: [[x, z, heading, kind(0 sail, 1 yacht)], ...]; ok(x, z): open water a boat may sail into
  constructor(spots, lite, ok = () => true) {
    this.ok = ok;
    this.group = new THREE.Group();
        const mat = [new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: '#fffaf0', emissiveIntensity: 0.55 })];
    this.kinds = [sailboatGeo(), yachtGeo()].map((g, k) => {
      const L = spots.filter((s) => s[3] === k);
      const im = new THREE.InstancedMesh(g, mat, Math.max(1, L.length)); im.count = L.length; im.castShadow = !lite;
      this.group.add(im);
      return { im, L: L.map(([x, z, h], i) => ({ x, z, h, ph: i * 1.7, v: k ? 0 : 1.2 + (i % 3) * 0.4 })) };
    });
    this.t = 0; this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1);
    this.update(0);
  }
  update(dt) {
    this.t += dt;
    for (const [k, { im, L }] of this.kinds.entries()) {
      L.forEach((b, i) => {
        // sailboats drift slowly along their heading and turn back now and then; everything bobs
        // (a boat about to run ashore or onto the circuit turns round instead)
        if (b.v) {
          const nx = b.x + Math.cos(b.h) * b.v * dt, nz = b.z + Math.sin(b.h) * b.v * dt;
          if (this.ok(nx + Math.cos(b.h) * 12, nz + Math.sin(b.h) * 12)) { b.x = nx; b.z = nz; } else b.h += Math.PI * (0.75 + 0.5 * ((i * 0.618) % 1));
          if (Math.sin(this.t * 0.02 + b.ph) > 0.995) b.h += dt * 0.5;
        }
        const bob = Math.sin(this.t * 0.9 + b.ph) * (k ? 0.12 : 0.18);
        this.e.set(Math.sin(this.t * 0.7 + b.ph) * (k ? 0.01 : 0.06) + (k ? 0 : 0.08), -b.h, Math.sin(this.t * 0.6 + b.ph * 2) * 0.02);
        this.q.setFromEuler(this.e);
        this.m4.compose(this.p.set(b.x, -0.75 + bob, b.z), this.q, this.s);
        im.setMatrixAt(i, this.m4);
      });
      im.instanceMatrix.needsUpdate = true;
    }
  }
}

// clouds: puffs of faceted blobs, flat underneath, drifting round the circuit
export class Clouds {
  constructor(cx, cz, n, seed, tint = '#ffffff', lite = false) {
    const R = rng(seed);
    const parts = [];
    for (let k = 0; k < 7; k++) {
      // a big puff in the middle, smaller ones round it, a couple stacked on top
      const top = k >= 5, x = top ? (R() - 0.5) * 0.8 : (k - 2) * 0.5 + (R() - 0.5) * 0.2;
      const s = top ? 0.45 + R() * 0.2 : 0.5 + 0.35 * (1 - Math.abs(k - 2) / 2.5) + R() * 0.15;
      parts.push(blob(s, lite ? 1 : 2, 1, 0.85, 0.85, R, '#d3dae4', tint, x, top ? 0.55 : s * 0.3, (R() - 0.5) * 0.5));
    }
    const g = mergeGeometries(parts);
    { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, Math.max(0, p.getY(i))); }
    g.computeVertexNormals();
    const im = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#ffffff', emissiveIntensity: 0.4 }), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = 1100 + R() * 1600, sc = 70 + R() * 90;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * Math.PI);
      m4.compose(p.set(Math.cos(a) * d, 380 + R() * 380, Math.sin(a) * d), q, s.set(sc * (1 + R() * 0.5), sc * 0.8, sc * (0.8 + R() * 0.4)));
      im.setMatrixAt(i, m4);
    }
    this.group = new THREE.Group(); this.group.position.set(cx, 0, cz); this.group.add(im);
  }
  update(dt) { this.group.rotation.y += dt * 0.0035; }
}

// coastal rocks with a ring of surf round each
export function rocks(spots, lite) {
  const R = rng(91);
  const g = blob(1, lite ? 0 : 1, 1, 0.7, 1, R, '#5d5a55', '#8d877d');
  g.computeVertexNormals();
  const rm = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), spots.length);
  const ring = new THREE.RingGeometry(0.9, 1.35, 12, 1); ring.rotateX(-Math.PI / 2);
  const fm = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: '#f4fbff', transparent: true, opacity: 0.75, depthWrite: false }), spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  spots.forEach(([x, z, sc], i) => {
    q.setFromAxisAngle(up, R() * 6);
    m4.compose(p.set(x, -1.2, z), q, s.set(sc, sc * (0.6 + R() * 0.7), sc * (0.7 + R() * 0.6))); rm.setMatrixAt(i, m4);
    m4.compose(p.set(x, -0.5, z), q, s.set(sc * 1.1, 1, sc * 1.1)); fm.setMatrixAt(i, m4);
  });
  rm.castShadow = !lite;
  const grp = new THREE.Group(); grp.add(rm, fm);
  return grp;
}
