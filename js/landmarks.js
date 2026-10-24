// City landmarks built from the kits: bridges, causeways, signature towers and flags. Each city
// that needs them calls in from World.buildLandmark. Shapes only: no names or logos.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { facade, facadeMaterial } from './kit.js';
import { treeGeo, mountainGeo, rocks } from './nature.js';

const col = (h) => new THREE.Color(h);
function tint(g, hex) {
  if (g.index) g = g.toNonIndexed();
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = col(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// a box from a to b (two points on the ground plane), w wide, from y0 to y1
function span(a, b, w, y0, y1, hex) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  const g = new THREE.BoxGeometry(len, y1 - y0, w);
  g.rotateY(-Math.atan2(dz, dx)); g.translate((a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2);
  return tint(g, hex);
}
const post = (x, z, w, y0, y1, hex) => tint(new THREE.BoxGeometry(w, y1 - y0, w).translate(x, (y0 + y1) / 2, z), hex);

// where a straight line across the water meets the shore on both sides: march along dir from the
// near side and return the stretch of water (in metres along dir), or null
export function waterCrossing(world, ox, oz, dx, dz, from, to) {
  let a = null, b = null;
  for (let t = from; t < to; t += 4) {
    const wet = world.land(ox + dx * t, oz + dz * t) < 0;
    if (wet && a === null) a = t;
    if (!wet && a !== null) { b = t; break; }
  }
  return a !== null && b !== null && b - a > 60 ? [a, b] : null;
}

// a road bridge on piers between two points, with a deck, parapets, lamps and traffic.
// opts: { y deck height, w width, pier spacing, cable: { at (0..1), h } for a cable-stayed pylon }
export class Bridge {
  constructor(world, A, B, { y = 12, w = 16, every = 36, cable = null, lamps = true, cars = 24 } = {}) {
    this.group = new THREE.Group();
    const g = [], dx = B[0] - A[0], dz = B[1] - A[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, px = -uz, pz = ux;
    const at = (t, off = 0) => [A[0] + ux * t + px * off, A[1] + uz * t + pz * off];
    // ramps down to the shore at both ends, so the road meets the ground
    const ramp = Math.min(70, len * 0.15);
    const deckY = (t) => (t < ramp ? y * t / ramp : t > len - ramp ? y * (len - t) / ramp : y);
    const step = 12;
    for (let t = 0; t < len; t += step) {
      const t2 = Math.min(len, t + step), a = at(t), b = at(t2), ya = deckY(t), yb = deckY(t2);
      // the deck, as a sloped slab (its two ends at their own heights)
      const d = span(a, b, w, -0.9, 0, '#c9ccd1');
      const p = d.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const along = (p.getX(i) - a[0]) * ux + (p.getZ(i) - a[1]) * uz;
        p.setY(i, p.getY(i) + (along > (t2 - t) / 2 ? yb : ya));
      }
      g.push(d);
      g.push(span(at(t, w / 2), at(t2, w / 2), 0.4, ya, ya + 1.1, '#e9ebee'));
      g.push(span(at(t, -w / 2), at(t2, -w / 2), 0.4, ya, ya + 1.1, '#e9ebee'));
      g.push(span(at(t, 0), at(t2, 0), 0.6, ya, ya + 0.7, '#e1e4e8'));      // the median
    }
    // asphalt on top, with lane lines
    for (let t = 0; t < len; t += step) {
      const t2 = Math.min(len, t + step);
      for (const [o, ww, c] of [[w / 4, w / 2 - 1.2, '#5b6068'], [-w / 4, w / 2 - 1.2, '#5b6068']]) {
        const d = span(at(t, o), at(t2, o), ww, 0, 0.06, c), p = d.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const along = (p.getX(i) - A[0]) * ux + (p.getZ(i) - A[1]) * uz;
          p.setY(i, p.getY(i) + deckY(Math.min(len, Math.max(0, along))));
        }
        g.push(d);
      }
    }
    // piers where the deck is up
    for (let t = ramp; t < len - ramp; t += every) {
      for (const o of [-w * 0.3, w * 0.3]) { const [x, z] = at(t, o); g.push(post(x, z, 1.6, -3, deckY(t) - 0.8, '#b9bcc2')); }
      const [x, z] = at(t, 0); g.push(span(at(t, -w * 0.42), at(t, w * 0.42), 1.4, deckY(t) - 1.8, deckY(t) - 0.8, '#b0b4ba'));
    }
    // a cable-stayed pylon: one tall white mast with fans of cables to both halves of the deck
    const cables = [];
    if (cable) {
      const tp = len * cable.at, [x, z] = at(tp, 0), H = cable.h;
      // the mast leans a little back, tapering, on a wide footing
      g.push(post(x, z, 7, -3, y, '#d9dce1'));
      const mast = new THREE.CylinderGeometry(1.8, 3.6, H, 8); mast.translate(x, y + H / 2, z); g.push(tint(mast, '#f4f5f7'));
      const cap = new THREE.ConeGeometry(1.8, 8, 8); cap.translate(x, y + H + 4, z); g.push(tint(cap, '#f4f5f7'));
      for (let k = 1; k <= 9; k++) for (const sgn of [-1, 1]) {
        const tt = tp + sgn * k * (len * 0.42 / 9);
        if (tt < ramp || tt > len - ramp) continue;
        for (const o of [-w / 2 + 0.3, w / 2 - 0.3]) {
          const [cx, cz] = at(tt, o);
          cables.push(x, y + H * (0.55 + 0.045 * k), z, cx, deckY(tt) + 1, cz);
        }
      }
    }
    const solid = new THREE.Mesh(mergeGeometries(g), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#ffffff', emissiveIntensity: 0.2 }));
    solid.castShadow = !world.lite; solid.receiveShadow = true;
    this.group.add(solid);
    if (cables.length) {
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(cables, 3));
      this.group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#f2f4f7' })));
    }
    // lamps along the deck that glow at dusk and night
    if (lamps) {
      const n = Math.floor(len / 30), lg = new THREE.BoxGeometry(0.8, 0.2, 0.8);
      const im = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: world.pal.lamps ? '#ffe2a2' : '#d9dde2' }), n * 2);
      const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 4).translate(0, 3.5, 0), new THREE.MeshLambertMaterial({ color: '#8d949e' }), n * 2);
      const m4 = new THREE.Matrix4(); let k = 0;
      for (let i = 0; i < n; i++) for (const o of [-w / 2 + 0.4, w / 2 - 0.4]) {
        const t = (i + 0.5) * len / n, [x, z] = at(t, o);
        m4.makeTranslation(x, deckY(t), z); pole.setMatrixAt(k, m4);
        m4.makeTranslation(x, deckY(t) + 7, z); im.setMatrixAt(k++, m4);
      }
      this.group.add(im, pole);
    }
    // traffic: little cars and buses running both ways
    if (cars) {
      const body = mergeGeometries([tint(new THREE.BoxGeometry(4.4, 1.2, 1.9).translate(0, 0.9, 0), '#ffffff'), tint(new THREE.BoxGeometry(2.4, 0.7, 1.7).translate(-0.3, 1.8, 0), '#2a323d')]);
      const pal = ['#e9ecef', '#d23c3c', '#2f5fb3', '#f2c230', '#3a3f48', '#c9ced6', '#2f8a58', '#f08a24'];
      this.cars = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial({ vertexColors: true }), cars);
      this.traffic = [];
      for (let i = 0; i < cars; i++) {
        const dir = i % 2 ? 1 : -1;
        this.traffic.push({ t: (i / cars) * len, v: (14 + (i * 7) % 6) * dir, lane: dir * (w / 4 + ((i >> 1) % 2 ? 1.6 : -1.6)) });
        this.cars.setColorAt(i, col(pal[i % pal.length]));
      }
      this.cars.castShadow = !world.lite;
      this.group.add(this.cars);
      Object.assign(this, { at, deckY, len, ux, uz });
      this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1);
      this.update(0);
    }
    world.scene.add(this.group);
  }

  update(dt) {
    if (!this.cars) return;
    const up = new THREE.Vector3(0, 1, 0);
    this.traffic.forEach((c, i) => {
      c.t = (c.t + c.v * dt + this.len) % this.len;
      const [x, z] = this.at(c.t, c.lane), y = this.deckY(c.t);
      this.q.setFromAxisAngle(up, -Math.atan2(this.uz * Math.sign(c.v), this.ux * Math.sign(c.v)));
      this.m4.compose(this.p.set(x, y, z), this.q, this.s); this.cars.setMatrixAt(i, this.m4);
    });
    this.cars.instanceMatrix.needsUpdate = true;
  }
}

// a signature glass tower with setbacks, a crown and a spire, drawn with the facade shader
export function spireTower(world, x, z, { h = 220, w = 34, glass = '#2f6fa8', glass2 = '#3f8f8a' } = {}) {
  const parts = [];
  const tier = (s, y0, y1) => { const b = new THREE.BoxGeometry(s, y1 - y0, s * 0.8); b.translate(0, (y0 + y1) / 2, 0); parts.push(facade(tint(b, '#e6e9ee'), 3, 3.8, 1.4, 0)); };
  tier(w, 0, h * 0.55); tier(w * 0.8, h * 0.55, h * 0.78); tier(w * 0.6, h * 0.78, h * 0.9);
  const crown = new THREE.CylinderGeometry(w * 0.12, w * 0.32, h * 0.06, 4); crown.rotateY(Math.PI / 4); crown.translate(0, h * 0.93, 0);
  parts.push(facade(tint(crown, '#eef0f3'), 3, 3.8, 0, 0));
  const spire = new THREE.CylinderGeometry(0.2, 1.2, h * 0.22, 6); spire.translate(0, h * 1.07, 0);
  parts.push(facade(tint(spire, '#f4f5f7'), 3, 3.8, 0, 0));
  const m = new THREE.Mesh(mergeGeometries(parts), facadeMaterial(world.pal, { glass, glass2, lit: 0.6, key: 'spire' }));
  m.position.set(x, world.height(x, z) - 1, z); m.rotation.y = Math.atan2(x - world.T.centroid[0], z - world.T.centroid[1]);
  m.castShadow = true;
  world.scene.add(m);
  return m;
}

// flags on tall poles along the track, waving. bands: colours from the hoist outwards (vertical
// stripes) or, with horizontal: true, from the top down
export class Flags {
  constructor(world, spots, bands, { horizontal = false } = {}) {
    const W = 3.6, H = 2.2, nx = 8, ny = 3;
    const g = new THREE.PlaneGeometry(W, H, nx, ny); g.translate(W / 2, 0, 0);
    const p = g.attributes.position, c = new Float32Array(p.count * 3), cc = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const f = horizontal ? 1 - (p.getY(i) + H / 2) / H : p.getX(i) / W;
      cc.set(bands[Math.min(bands.length - 1, Math.floor(f * bands.length * 0.9999))]);
      c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b;
    }
    // colour per face, so the stripes stay crisp
    const ng = g.toNonIndexed(), np = ng.attributes.position, nc = new Float32Array(np.count * 3);
    for (let i = 0; i < np.count; i += 3) {
      const fx = (np.getX(i) + np.getX(i + 1) + np.getX(i + 2)) / 3, fy = (np.getY(i) + np.getY(i + 1) + np.getY(i + 2)) / 3;
      const f = horizontal ? 1 - (fy + H / 2) / H : fx / W;
      cc.set(bands[Math.min(bands.length - 1, Math.floor(f * bands.length))]);
      for (let k = 0; k < 3; k++) { nc[(i + k) * 3] = cc.r; nc[(i + k) * 3 + 1] = cc.g; nc[(i + k) * 3 + 2] = cc.b; }
    }
    ng.setAttribute('color', new THREE.BufferAttribute(nc, 3)); ng.deleteAttribute('uv');
    ng.translate(0, 9.8, 0);
    this.u = { uTime: { value: 0 } };
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.u.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float fx = transformed.x / ${W.toFixed(2)};
        float ph = uTime * 5.0 - transformed.x * 1.6 + float(gl_InstanceID) * 1.3;
        transformed.z += sin(ph) * 0.32 * fx;
        transformed.y -= fx * fx * 0.25 + sin(ph * 0.5) * 0.05 * fx;`);
    };
    mat.customProgramCacheKey = () => 'agp-flag';
    this.flags = new THREE.InstancedMesh(ng, mat, spots.length);
    const pole = new THREE.CylinderGeometry(0.06, 0.09, 11, 5); pole.translate(0, 5.5, 0);
    this.poles = new THREE.InstancedMesh(pole, new THREE.MeshLambertMaterial({ color: '#d5d9de' }), spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    spots.forEach(([x, y, z, h], i) => {
      q.setFromAxisAngle(up, h); m4.compose(v.set(x, y, z), q, s);
      this.flags.setMatrixAt(i, m4); this.poles.setMatrixAt(i, m4);
    });
    this.flags.frustumCulled = false;
    world.scene.add(this.flags, this.poles);
  }
  update(dt) { this.u.uTime.value += dt; }
}

// Lagos: a cable-stayed bridge with one tall white pylon and a long low causeway across the lagoon,
// a spired tower among the towers on the far side, and green-white-green flags along the track
export function lagos(world, r) {
  const T = world.T, [cx, cz] = T.centroid, dir = world.waterDir, ups = [];
  if (dir) {
    const px = -dir[1], pz = dir[0];
    const cross = (off, y, opts) => {
      const ox = cx + px * off, oz = cz + pz * off;
      const w = waterCrossing(world, ox, oz, dir[0], dir[1], 0, 2400);
      if (!w) return;
      const A = [ox + dir[0] * (w[0] - 40), oz + dir[1] * (w[0] - 40)], B = [ox + dir[0] * (w[1] + 40), oz + dir[1] * (w[1] + 40)];
      ups.push(new Bridge(world, A, B, { y, ...opts }));
    };
    cross(360, 16, { w: 18, cable: { at: 0.5, h: 82 }, cars: world.lite ? 14 : 28 });
    cross(-520, 8, { w: 22, every: 28, cars: world.lite ? 20 : 40 });
    const d = (world.farBank || world.radius + 500) + 150;
    spireTower(world, cx + dir[0] * d + px * 60, cz + dir[1] * d + pz * 60, { h: 235, w: 36 });
    world.focus = [cx + dir[0] * d + px * 60, cz + dir[1] * d + pz * 60, 100];
  }
  // flags on the outside of the track, every 80 m
  const spots = [], tmp = {};
  const lat = T.half + (world.runoff || 6) + 4.5, side = -T.pit.side;
  for (let s = 40; s < T.L; s += world.lite ? 140 : 80) {
    world.sample(s, side * lat, tmp);
    spots.push([tmp.x, 0, tmp.z, -Math.atan2(tmp.tz, tmp.tx)]);
  }
  ups.push(new Flags(world, spots, ['#008751', '#ffffff', '#008751']));
  return ups;
}

// ---- shared helpers for the city landmarks ----

// spots where the shore is: land() between lo and hi metres, at least `clear` from the track
function shoreSpots(world, r, n, lo, hi, clear, tries = 20000) {
  const [cx, cz] = world.T.centroid, out = [];
  for (let k = 0; k < tries && out.length < n; k++) {
    const a = r() * Math.PI * 2, d = r.range(world.radius * 0.4, world.radius + 1400);
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, l = world.land(x, z);
    if (l < lo || l > hi || world.dist(x, z) < clear) continue;
    out.push([x, z]);
  }
  return out;
}
function addMesh(world, geo, opts = {}) {
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...opts }));
  m.castShadow = !world.lite; m.receiveShadow = true;
  world.scene.add(m);
  return m;
}
// a point beside the track at distance s along the lap and lat across it
function beside(world, s, lat) { const t = {}; world.sample(s, lat, t); return t; }

// an overhead gantry across the track with a sign on it
function gantrySign(world, s, text, { bg = '#1d2a3a', fg = '#ffffff' } = {}) {
  const T = world.T, half = T.half + 3, a = beside(world, s, half), b = beside(world, s, -half);
  const g = [post(a.x, a.z, 0.9, 0, 10, '#cfd3d9'), post(b.x, b.z, 0.9, 0, 10, '#cfd3d9'), span([a.x, a.z], [b.x, b.z], 1.2, 8.6, 10.2, '#cfd3d9')];
  addMesh(world, mergeGeometries(g));
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128;
  const x = cv.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, 1024, 128);
  x.fillStyle = fg; x.font = 'bold 92px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 512, 68);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const w = Math.hypot(a.x - b.x, a.z - b.z) * 0.8, panel = new THREE.PlaneGeometry(w, w / 8);
  for (const side of [1, -1]) {
    const m = new THREE.Mesh(panel, new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set((a.x + b.x) / 2 + a.tx * 0.7 * side, 9.4 - 0.0, (a.z + b.z) / 2 + a.tz * 0.7 * side);
    m.rotation.y = Math.atan2(a.tx * side, a.tz * side) ;
    world.scene.add(m);
  }
}

// ---- Dakar: baobabs over the track, red laterite headlands, a lighthouse ----
export function dakar(world, r) {
  const T = world.T, ups = [];
  // two giant baobabs right beside the track
  const bg = treeGeo('baobab', true, 77), mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  for (const f of [0.18, 0.62]) {
    const p = beside(world, T.L * f, -T.pit.side * (T.half + (world.runoff || 6) + 16));
    const m = new THREE.Mesh(bg, mat); m.position.set(p.x, world.height(p.x, p.z), p.z); m.scale.setScalar(2.4); m.rotation.y = f * 9;
    m.castShadow = true; world.scene.add(m);
  }
  // headlands of red laterite rising out of the sea, the lighthouse on the first
  const heads = shoreSpots(world, r, 4, -4, 6, T.half + 160);
  heads.forEach(([x, z], i) => {
    const g = mountainGeo({ h: r.range(24, 42), r: r.range(110, 180), flat: true, base: '#a39a5c', rock: '#b4582f', seed: 40 + i, rings: 6, segs: 14 });
    g.translate(x, -3, z); addMesh(world, g);
    if (i === 0) {
      world.focus = [x, z, 30];
      const H = 24, y0 = 30, parts = [
        tint(new THREE.CylinderGeometry(2.2, 3.0, H, 12).translate(x, y0 + H / 2, z), '#f6f6f2'),
        tint(new THREE.CylinderGeometry(3.4, 3.4, 0.6, 12).translate(x, y0 + H + 0.3, z), '#3b3f46'),
        tint(new THREE.CylinderGeometry(1.7, 1.7, 3, 10).translate(x, y0 + H + 2.1, z), '#cfe6f2'),
        tint(new THREE.ConeGeometry(2.1, 2.4, 10).translate(x, y0 + H + 4.8, z), '#c23b2b'),
        tint(new THREE.BoxGeometry(9, 4, 6).translate(x + 5, y0 + 2, z), '#f2eee4'),
      ];
      addMesh(world, mergeGeometries(parts), { flatShading: false, emissive: world.pal.lamps ? '#332200' : '#000000' });
    }
  });
  ups.push(new Flags(world, flagSpots(world, 110), ['#00853f', '#fdef42', '#e31b23']));
  return ups;
}
function flagSpots(world, every) {
  const T = world.T, spots = [], lat = T.half + (world.runoff || 6) + 4.5, side = -T.pit.side;
  for (let s = 40; s < T.L; s += world.lite ? every * 1.7 : every) {
    const p = beside(world, s, side * lat);
    spots.push([p.x, 0, p.z, -Math.atan2(p.tz, p.tx)]);
  }
  return spots;
}

// ---- Nairobi: a gantry with the city's name, a tall tower with a mast, a snow peak far off ----
export function nairobi(world, r) {
  const T = world.T, [cx, cz] = T.centroid, ups = [];
  // the gantry goes over the longest straight, a little after the line
  gantrySign(world, Math.min(T.L * 0.12, 260), 'NAIROBI', { bg: '#121a24' });
  const a = world.cityAngle ?? r() * 6, d = world.radius + 260;
  spireTower(world, cx + Math.cos(a) * d, cz + Math.sin(a) * d, { h: 200, w: 30, glass: '#3f6f8f', glass2: '#6f8f9f' });
  world.focus = [cx + Math.cos(a) * d, cz + Math.sin(a) * d, 90];
  const pa = a + Math.PI * 0.8, pd = 3600, g = mountainGeo({ h: 760, r: 2100, snow: true, base: '#5d7354', rock: '#6f6a66', seed: 9, rings: 8, segs: 20 });
  g.translate(cx + Math.cos(pa) * pd, -10, cz + Math.sin(pa) * pd); addMesh(world, g);
  ups.push(new Flags(world, flagSpots(world, 110), ['#111111', '#ffffff', '#bb1d2a', '#ffffff', '#1d7a34'], { horizontal: true }));
  return ups;
}

// ---- Cape Town: Table Mountain and its neighbours, a breakwater, the tablecloth cloud ----
export function capeTown(world, r) {
  const T = world.T, [cx, cz] = T.centroid, ups = [];
  const away = world.waterDir ? Math.atan2(world.waterDir[1], world.waterDir[0]) + Math.PI : r() * 6;
  const put = (ang, dist, opts) => { const g = mountainGeo(opts); g.translate(cx + Math.cos(ang) * dist, -6, cz + Math.sin(ang) * dist); addMesh(world, g); return [cx + Math.cos(ang) * dist, cz + Math.sin(ang) * dist]; };
  const [tx, tz] = world.focus = put(away, 1900, { h: 330, r: 1150, flat: true, base: '#6f7f58', rock: '#8c8577', seed: 3, rings: 9, segs: 26 });
  put(away + 0.42, 1750, { h: 300, r: 620, base: '#6f7f58', rock: '#8c8577', seed: 4 });       // the peak on the left
  put(away - 0.5, 1500, { h: 230, r: 430, base: '#6f7f58', rock: '#9a8f80', seed: 5 });        // the rounded head on the right
  // the tablecloth: a flat cloud lying on the top
  const cloth = new THREE.Mesh(new THREE.CylinderGeometry(420, 470, 26, 24, 1), new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35, transparent: true, opacity: 0.85 }));
  cloth.position.set(tx, 330 + 10, tz); cloth.scale.set(1, 1, 0.55); cloth.rotation.y = -away; world.scene.add(cloth);
  // a breakwater of rocks out into the bay with a concrete wall along it
  if (world.waterDir) {
    const [sx, sz] = shoreSpots(world, r, 1, -2, 2, T.half + 120)[0] || [cx, cz];
    const dx = world.waterDir[0], dz = world.waterDir[1], px = -dz, pz = dx, pts = [], wall = [];
    for (let t = 0; t < 300; t += 7) {
      const bx = sx + dx * t + px * t * 0.35, bz = sz + dz * t + pz * t * 0.35;
      pts.push([bx + (r() - 0.5) * 4, bz + (r() - 0.5) * 4, r.range(2.5, 4.5)]);
      if (t > 0) wall.push(span([bx - dx * 7 - px * 2.45, bz - dz * 7 - pz * 2.45], [bx, bz], 2.4, -1, 3.2, '#d8d6cf'));
    }
    world.scene.add(rocksAt(world, pts));
    addMesh(world, mergeGeometries(wall));
  }
  ups.push(new Flags(world, flagSpots(world, 120), ['#e03c31', '#ffffff', '#007749', '#ffffff', '#001489'], { horizontal: true }));
  return ups;
}
function rocksAt(world, pts) { return rocks(pts, world.lite); }

// ---- Tokyo: the red lattice tower, stacked expressways, neon signs ----
export function tokyo(world, r) {
  const T = world.T, [cx, cz] = T.centroid, ups = [];
  // the tower: four legs tapering to a mast, red and white bands, two observation decks, lattice
  const a = (world.cityAngle ?? 0) + 0.5, d = world.radius + 420;
  world.focus = [cx + Math.cos(a) * d, cz + Math.sin(a) * d, 120];
  latticeTower(world, cx + Math.cos(a) * d, cz + Math.sin(a) * d, { H: 250, base: 42, top: 7, mast: 80, c1: '#e5482d', c2: '#f4f4f2', line: world.pal.lamps ? '#ff9a6a' : '#d94a2c', glow: world.pal.lamps ? '#5a1a08' : '#000000' });
  // stacked expressways: two decks on one line clear of the circuit
  for (let tries = 0; tries < 40; tries++) {
    const ang = r() * Math.PI * 2, rr = world.radius + 80, ox = cx + Math.cos(ang) * rr, oz = cz + Math.sin(ang) * rr;
    const ux = -Math.sin(ang), uz = Math.cos(ang), L = 700;
    const A = [ox - ux * L / 2, oz - uz * L / 2], B = [ox + ux * L / 2, oz + uz * L / 2];
    let ok = true;
    for (let t = 0; t <= 1; t += 0.05) { const x = A[0] + (B[0] - A[0]) * t, z = A[1] + (B[1] - A[1]) * t; if (world.dist(x, z) < T.half + 40 || world.land(x, z) < 5) ok = false; }
    if (!ok) continue;
    ups.push(new Bridge(world, A, B, { y: 12, w: 15, every: 30, cars: world.lite ? 12 : 24 }));
    const off = 0.5;
    ups.push(new Bridge(world, [A[0] + ux * 60 + uz * off, A[1] + uz * 60 - ux * off], [B[0] - ux * 60, B[1] - uz * 60], { y: 22, w: 13, every: 30, cars: world.lite ? 10 : 20 }));
    break;
  }
  // neon signs: tall boards on frames round the outside of the circuit
  ups.push(neonSigns(world, r));
  return ups;
}

// a four-legged lattice tower: legs in banded colours, cross bracing as lines, observation decks
function latticeTower(world, X, Z, { H, base, top, mast, c1, c2, line, glow = '#000000', decks = [[0.45, 8, 1.15], [0.8, 5, 1.0]], curve = 0.7 }) {
  const parts = [], lines = [], bands = 9;
  const legAt = (t, sx, sz) => { const w = base + (top - base) * Math.pow(t, curve); return [X + sx * w / 2, t * H, Z + sz * w / 2]; };
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) for (let k = 0; k < bands; k++) {
    const p0 = legAt(k / bands, sx, sz), p1 = legAt((k + 1) / bands, sx, sz);
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const g = new THREE.BoxGeometry(1.6, len, 1.6); g.translate(0, len / 2, 0);
    const dir = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).normalize();
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)); g.translate(...p0);
    parts.push(tint(g, k % 2 ? c2 : c1));
  }
  for (let k = 0; k < bands * 3; k++) {
    const t0 = k / (bands * 3), t1 = (k + 1) / (bands * 3);
    for (const [s0, s1] of [[[1, 1], [1, -1]], [[1, -1], [-1, -1]], [[-1, -1], [-1, 1]], [[-1, 1], [1, 1]]]) {
      lines.push(...legAt(t0, ...s0), ...legAt(t1, ...s1), ...legAt(t0, ...s1), ...legAt(t1, ...s0));
    }
  }
  for (const [t, h, w] of decks) {
    const ww = (base + (top - base) * Math.pow(t, curve)) * w;
    parts.push(tint(new THREE.CylinderGeometry(ww * 0.6, ww * 0.62, h, 8).translate(X, t * H, Z), '#e9ecef'));
    parts.push(tint(new THREE.CylinderGeometry(ww * 0.61, ww * 0.61, h * 0.5, 8).translate(X, t * H + 0.5, Z), '#26303c'));
  }
  if (mast) parts.push(tint(new THREE.CylinderGeometry(0.4, 2.2, mast, 6).translate(X, H + mast / 2, Z), c1));
  addMesh(world, mergeGeometries(parts), { flatShading: false, emissive: glow });
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  world.scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: line })));
}

// tall vertical neon boards with Japanese place names (city and districts only, no brands)
function neonSigns(world, r) {
  const words = ['東京', '渋谷', '新宿', '銀座', '秋葉原', '品川', '池袋', '浅草'];
  const cols = [['#ff2f7a', '#ffe9f2'], ['#24d7ff', '#eafcff'], ['#ffd23a', '#2a1f00'], ['#9b5cff', '#f4eaff'], ['#3cff9b', '#062012']];
  const W = 128, Hc = 512, cv = document.createElement('canvas'); cv.width = W * words.length; cv.height = Hc;
  const x = cv.getContext('2d');
  words.forEach((wd, i) => {
    const [bg, fg] = cols[i % cols.length];
    x.fillStyle = '#0b0d12'; x.fillRect(i * W, 0, W, Hc);
    x.fillStyle = bg; x.fillRect(i * W + 6, 6, W - 12, Hc - 12);
    x.fillStyle = fg; x.font = 'bold 92px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    [...wd].forEach((ch, k) => x.fillText(ch, i * W + W / 2, Hc / 2 + (k - (wd.length - 1) / 2) * 110));
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const T = world.T, n = world.lite ? 14 : 28, g = new THREE.PlaneGeometry(3, 12);
  const uv = g.attributes.uv;
  const im = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }), n);
  const offs = new Float32Array(n);
  const frames = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1);
  for (let i = 0, guard = 0; i < n && guard < 400; i++, guard++) {
    const s = r() * T.L, lat = (r() < 0.5 ? -1 : 1) * (T.half + (world.runoff || 6) + r.range(14, 40)), b = beside(world, s, lat);
    if (world.kept && world.kept(b.x, b.z)) { i--; continue; }
    const y = r.range(9, 20), h = -Math.atan2(b.tz, b.tx) + Math.PI / 2 * (r() < 0.5 ? 1 : 0);
    q.setFromAxisAngle(up, h); m4.compose(p.set(b.x, y, b.z), q, s1); im.setMatrixAt(i, m4);
    offs[i] = Math.floor(r() * words.length);
    frames.push(post(b.x, b.z, 0.35, 0, y - 6, '#2b2f36'));
  }
  // each sign shows one word of the atlas
  g.setAttribute('ioff', new THREE.InstancedBufferAttribute(offs, 1));
  im.material.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float ioff;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vec2((uv.x + ioff) / ${words.length.toFixed(1)}, uv.y);\n#endif`);
  };
  im.material.customProgramCacheKey = () => 'agp-neon';
  world.scene.add(im);
  addMesh(world, mergeGeometries(frames));
  return { update() {} };
}

// ---- Iceland: basalt column cliffs, a glacier in the mist, sea stacks ----
export function iceland(world, r) {
  const T = world.T, [cx, cz] = T.centroid, ups = [];
  // basalt columns along the shore: hexagonal prisms in stepped clusters
  const spots = shoreSpots(world, r, world.lite ? 7 : 14, -6, 10, T.half + 40);
  const hex = new THREE.CylinderGeometry(1.07, 1.07, 1, 6, 1); hex.translate(0, 0.5, 0);
  { // lichen-grey tops, darker rock sides
    const nn = hex.attributes.normal, ca = new Float32Array(nn.count * 3);
    for (let i = 0; i < nn.count; i++) { const t = nn.getY(i) > 0.5; ca.set(t ? [1.55, 1.6, 1.45] : [1, 1, 1], i * 3); }
    hex.setAttribute('color', new THREE.BufferAttribute(ca, 3));
  }
  const cols = [];
  for (const [x, z] of spots) {
    // packed on a hexagonal grid, highest in the middle, stepping down to the edges
    const top = r.range(8, 22), R = world.lite ? 7 : 10, sp = 1.85;
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
      const ox = (i + (j % 2) * 0.5) * sp, oz = j * sp * 0.866, d = Math.hypot(ox, oz);
      if (d > R * sp * (0.8 + 0.2 * r())) continue;
      const f = 1 - d / (R * sp);
      cols.push([x + ox, z + oz, top * (0.25 + 0.75 * f) + r.range(-1.2, 1.2) + (r() < 0.15 ? -3 : 0), 1.05]);
    }
  }
  const im = new THREE.InstancedMesh(hex, new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, flatShading: true }), cols.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sv = new THREE.Vector3(), cc = new THREE.Color();
  cols.forEach(([x, z, h, w], i) => {
    q.identity(); m4.compose(p.set(x, -2, z), q, sv.set(w, Math.max(2, h) + 2, w)); im.setMatrixAt(i, m4);
    im.setColorAt(i, cc.set('#55585c').multiplyScalar(r.range(0.82, 1.15)));
  });
  im.castShadow = !world.lite; im.receiveShadow = true; world.scene.add(im);
  // the glacier: a broad white tongue between snowy peaks, far inland
  const away = world.waterDir ? Math.atan2(world.waterDir[1], world.waterDir[0]) + Math.PI : 0;
  const gx = cx + Math.cos(away) * 2300, gz = cz + Math.sin(away) * 2300;
  world.focus = spots[0] ? [spots[0][0], spots[0][1], 8] : [gx, gz, 80];
  const gl = mountainGeo({ h: 170, r: 1100, flat: true, base: '#eef4f8', rock: '#bcd4e4', snow: true, seed: 12, rings: 8, segs: 22 });
  gl.translate(gx, -8, gz); addMesh(world, gl);
  // sea stacks standing off the shore
  for (const [x, z] of shoreSpots(world, r, 6, -120, -35, T.half + 80)) {
    const g = mountainGeo({ h: r.range(35, 70), r: r.range(14, 24), base: '#3d3b39', rock: '#2f2e2d', seed: Math.floor(r() * 999), rings: 4, segs: 9 });
    g.translate(x, -2, z); addMesh(world, g);
  }
  return ups;
}

// a spot on land near the water (or anywhere when there is none), clear of the track and paddock
function landSpot(world, r, lo, hi, clear, prefer) {
  const [cx, cz] = world.T.centroid;
  for (let k = 0; k < 4000; k++) {
    const a = prefer !== undefined && k < 2500 ? prefer + r.range(-0.9, 0.9) : r() * Math.PI * 2;
    const d = r.range(world.radius * 0.5, world.radius + 900), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, l = world.land(x, z);
    if (l < lo || l > hi || world.dist(x, z) < clear || world.kept(x, z)) continue;
    return [x, z];
  }
  return null;
}
// a facade-shaded merged mesh (towers made of several parts)
function glassMesh(world, parts, opts, key) {
  const m = new THREE.Mesh(mergeGeometries(parts), facadeMaterial(world.pal, { lit: 0.6, key, ...opts }));
  m.castShadow = true; world.scene.add(m); return m;
}
const fbox = (w, h, d, x, y, z, hex, ww, fh, style) => facade(tint(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), hex), ww, fh, style, y);

// ---- Singapore: light-sculpture trees with a skywalk, three towers under one sky deck, a lotus museum ----
export function singapore(world, r) {
  const T = world.T, ups = [], night = world.pal.lamps;
  const toward = world.waterDir ? Math.atan2(world.waterDir[1], world.waterDir[0]) : undefined;
  // the garden of light trees
  const g0 = landSpot(world, r, 25, 160, T.half + 70, toward);
  if (g0) {
    world.focus = [g0[0], g0[1], 25];
    const trunks = [], crowns = [], rings = [], tops = [];
    for (let k = 0; k < 10; k++) {
      const a = k * 2.4, d = 10 + k * 5.5, x = g0[0] + Math.cos(a) * d, z = g0[1] + Math.sin(a) * d, H = k < 3 ? 48 : r.range(26, 38);
      const t = new THREE.CylinderGeometry(1.4, 2.2, H * 0.7, 10, 1, true); t.translate(x, H * 0.35, z); trunks.push(tint(t, '#5a4a6a'));
      const c = new THREE.CylinderGeometry(H * 0.24, 1.4, H * 0.3, 14, 1, true); c.translate(x, H * 0.85, z); crowns.push(tint(c, night ? '#a14fd0' : '#6f5a7a'));
      for (let q = 0; q < 14; q++) {
        const a0 = (q / 14) * Math.PI * 2, a1 = ((q + 1) / 14) * Math.PI * 2, R = H * 0.24;
        rings.push(x + Math.cos(a0) * R, H, z + Math.sin(a0) * R, x + Math.cos(a1) * R, H, z + Math.sin(a1) * R);
        rings.push(x + Math.cos(a0) * 1.4, H * 0.7, z + Math.sin(a0) * 1.4, x + Math.cos(a0) * R, H, z + Math.sin(a0) * R);
      }
      if (k < 2) tops.push([x, z, H]);
    }
    addMesh(world, mergeGeometries(trunks), { side: THREE.DoubleSide, flatShading: false });
    addMesh(world, mergeGeometries(crowns), { side: THREE.DoubleSide, flatShading: false, emissive: night ? '#6a2a9a' : '#000000' });
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(rings, 3));
    world.scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: night ? '#ff7ad9' : '#c9a3dc' })));
    if (tops.length === 2) addMesh(world, span([tops[0][0], tops[0][1]], [tops[1][0], tops[1][1]], 2, 22, 23.2, '#dfe3e8'));
  }
  // three towers under one long sky deck
  const h0 = landSpot(world, r, 30, 200, T.half + 90, toward);
  if (h0) {
    const [x, z] = h0, parts = [], ang = toward ?? 0, ux = Math.cos(ang + Math.PI / 2), uz = Math.sin(ang + Math.PI / 2), H = 190;
    for (let k = -1; k <= 1; k++) parts.push(fbox(14, H, 34, x + ux * k * 46, 0, z + uz * k * 46, '#e3e7ec', 3, 3.6, 1.3));
    const deck = new THREE.BoxGeometry(5, 4, 200); deck.translate(0, H + 2, 30);
    const deckG = facade(tint(deck, '#eef1f4'), 3, 4, 0, 0);
    deckG.rotateY(-Math.atan2(uz, ux) + Math.PI / 2); deckG.translate(x, 0, z); parts.push(deckG);
    glassMesh(world, parts, { glass: '#3a6f9a', glass2: '#4a8aa8' }, 'sg-hotel');
  }
  // the lotus museum: white petals opening upwards
  const m0 = landSpot(world, r, 10, 80, T.half + 60, toward);
  if (m0) {
    const parts = [tint(new THREE.CylinderGeometry(6, 7, 6, 10).translate(m0[0], 3, m0[1]), '#d9dde2')];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 1.6 - 0.8, petal = new THREE.ConeGeometry(5, 34, 8);
      petal.translate(0, 17, 0); petal.rotateX(0.55 + (k % 2) * 0.12); petal.rotateY(a);
      petal.translate(m0[0], 6, m0[1]); parts.push(tint(petal, '#f7f7f5'));
    }
    addMesh(world, mergeGeometries(parts), { flatShading: false });
  }
  return ups;
}

// ---- Shanghai: the TV tower with pink spheres, the twisting tower, the tower with an opening, a bridge ----
export function shanghai(world, r) {
  const T = world.T, [cx, cz] = T.centroid, ups = [], night = world.pal.lamps;
  const dir = world.waterDir || [1, 0], fb = (world.farBank || world.radius + 300) + 120, px = -dir[1], pz = dir[0];
  const at = (side, back = 0) => [cx + dir[0] * (fb + back) + px * side, cz + dir[1] * (fb + back) + pz * side];
  // the TV tower: three legs, a central shaft, two big spheres and a small one, a spire
  {
    const [x, z] = at(-120), parts = [], pink = '#e0569a';
    world.focus = [x, z, 120];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2, bx = x + Math.cos(a) * 22, bz = z + Math.sin(a) * 22;
      const leg = new THREE.CylinderGeometry(2.4, 2.4, 80, 8); leg.translate(0, 40, 0);
      leg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x - bx, 70, z - bz).normalize()));
      leg.translate(bx, 0, bz); parts.push(tint(leg, '#d7dbe0'));
    }
    parts.push(tint(new THREE.CylinderGeometry(4.5, 5.5, 260, 10).translate(x, 130, z), '#d7dbe0'));
    parts.push(tint(new THREE.SphereGeometry(24, 18, 12).translate(x, 78, z), pink));
    parts.push(tint(new THREE.SphereGeometry(15, 16, 10).translate(x, 200, z), pink));
    parts.push(tint(new THREE.SphereGeometry(6, 12, 8).translate(x, 258, z), pink));
    parts.push(tint(new THREE.CylinderGeometry(0.4, 2.2, 60, 6).translate(x, 290, z), '#e9ecef'));
    addMesh(world, mergeGeometries(parts), { flatShading: false, emissive: night ? '#6a1840' : '#000000' });
  }
  // the twisting tower: rounded triangles, each floor band turned a little and smaller
  {
    const [x, z] = at(40, 80), parts = [], n = 26, H = 330;
    for (let k = 0; k < n; k++) {
      const s = 1 - 0.42 * (k / n), seg = new THREE.CylinderGeometry(30 * s, 30 * s, H / n, 9, 1);
      // squash the nine-sided ring toward a rounded triangle
      const p = seg.attributes.position;
      for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), k2 = 0.86 + 0.14 * Math.cos(3 * a); p.setX(i, p.getX(i) * k2); p.setZ(i, p.getZ(i) * k2); }
      seg.computeVertexNormals(); seg.rotateY(k * 0.06); seg.translate(x, (k + 0.5) * H / n, z);
      parts.push(facade(tint(seg, '#e3ebef'), -3, 4.2, 1.6, 0));
    }
    glassMesh(world, parts, { glass: '#3d7f8f', glass2: '#5f9fb0' }, 'sh-twist');
  }
  // the tower with a trapezoid opening at the top
  {
    const [x, z] = at(130, 40), H = 300, parts = [];
    parts.push(fbox(46, H * 0.78, 40, x, 0, z, '#dfe5ea', 3, 4, 1.2));
    parts.push(fbox(14, H * 0.22, 36, x - 16, H * 0.78, z, '#dfe5ea', 3, 4, 1.2));
    parts.push(fbox(14, H * 0.22, 36, x + 16, H * 0.78, z, '#dfe5ea', 3, 4, 1.2));
    parts.push(fbox(46, 8, 36, x, H - 8, z, '#dfe5ea', 3, 4, 1.2));
    glassMesh(world, parts, { glass: '#4a6f8a', glass2: '#6a8aa0' }, 'sh-open');
  }
  // a cable-stayed bridge over the river
  const ox = cx + px * 520, oz = cz + pz * 520, w = waterCrossing(world, ox, oz, dir[0], dir[1], 0, 2000);
  if (w) ups.push(new Bridge(world, [ox + dir[0] * (w[0] - 40), oz + dir[1] * (w[0] - 40)], [ox + dir[0] * (w[1] + 40), oz + dir[1] * (w[1] + 40)], { y: 18, w: 20, cable: { at: 0.5, h: 95 }, cars: world.lite ? 14 : 30 }));
  return ups;
}

// ---- Miami: pastel Art Deco hotels with neon edges, a marina footbridge ----
export function miami(world, r) {
  const T = world.T, ups = [];
  const toward = world.waterDir ? Math.atan2(world.waterDir[1], world.waterDir[0]) : undefined;
  const pastel = ['#f7c6d9', '#bfe8e0', '#fde3a7', '#c9d7f7', '#e8d1f2', '#ffd6c2', '#d6f0c9'];
  const parts = [];
  for (let k = 0, made = 0; k < 400 && made < (world.lite ? 10 : 18); k++) {
    const p = landSpot(world, r, 30, 140, T.half + 45, toward); if (!p) break;
    const [x, z] = p, h = r.range(16, 34), w = r.range(16, 26), d = r.range(14, 20), c = pastel[made % pastel.length], ang = r() * 6;
    const bits = [fbox(w, h, d, 0, 0, 0, c, 3, 3.2, 5 + (made % 2) * 0.6),
      facade(tint(new THREE.CylinderGeometry(d / 2, d / 2, h, 12).translate(w / 2, h / 2, 0), c), -3, 3.2, 5 + (made % 2) * 0.6, 0),
      facade(tint(new THREE.BoxGeometry(4, 9, 1.2).translate(-w * 0.15, h + 4.5, 0), '#ffffff'), 3, 3, 0, 0)];
    const g = mergeGeometries(bits); g.rotateY(ang); g.translate(x, world.height(x, z) - 0.5, z);
    parts.push(g); made++;
  }
  if (parts.length) { const p = parts[0].boundingBox || (parts[0].computeBoundingBox(), parts[0].boundingBox); world.focus = [(p.min.x + p.max.x) / 2, (p.min.z + p.max.z) / 2, 15]; }
  if (parts.length) glassMesh(world, parts, { glass: '#3a6f8a', glass2: '#4f9fae', neon: ['#ff4fb8', '#3ff0ff'] }, 'mia-deco');
  // a footbridge across the marina
  if (world.waterDir) {
    const [cx, cz] = T.centroid, dir = world.waterDir, px = -dir[1], pz = dir[0];
    for (const off of [300, -300, 600]) {
      const ox = cx + px * off, oz = cz + pz * off, w = waterCrossing(world, ox, oz, px, pz, -200, 200);
      const v = waterCrossing(world, ox + dir[0] * (world.coast || 0), oz + dir[1] * (world.coast || 0), px, pz, -400, 400);
      if (v && v[1] - v[0] < 500) { ups.push(new Bridge(world, [ox + px * (v[0] - 20), oz + pz * (v[0] - 20)], [ox + px * (v[1] + 20), oz + pz * (v[1] + 20)], { y: 7, w: 6, every: 24, cars: 0 })); break; }
    }
  }
  return ups;
}

// ---- Las Vegas: an observation wheel, a lattice tower, a glowing sphere, fountains ----
export function lasVegas(world, r) {
  const T = world.T, ups = [], [cx, cz] = T.centroid, night = world.pal.lamps;
  const ca = world.cityAngle ?? r() * 6;
  const put = (da, dd) => [cx + Math.cos(ca + da) * (world.radius + dd), cz + Math.sin(ca + da) * (world.radius + dd)];
  // the lattice tower: four legs flaring out at the base
  { const [x, z] = put(-0.35, 150); latticeTower(world, x, z, { H: 150, base: 56, top: 4, mast: 18, c1: '#8f6e4c', c2: '#a7845e', line: night ? '#ffcf7a' : '#9a7a55', glow: night ? '#4a3010' : '#000000', decks: [[0.38, 4, 0.9]], curve: 0.45 }); }
  // the sphere: a huge ball of light that changes pattern
  {
    const [x, z] = put(0.25, 180), u = { uTime: { value: 0 } };
    world.focus = [x, z, 50];
    const mat = new THREE.MeshLambertMaterial({ color: '#2a2d36', emissive: '#ffffff' });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = u.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = normalize(position);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying vec3 vOP;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            float lat = asin(vOP.y), lon = atan(vOP.z, vOP.x), ph = mod(floor(uTime / 6.0), 3.0);
            vec3 a = vec3(0.1, 0.55, 1.0), b = vec3(1.0, 0.25, 0.6), c = vec3(1.0, 0.85, 0.2);
            vec3 e = ph < 0.5 ? mix(a, b, 0.5 + 0.5 * sin(lon * 6.0 + uTime))
                   : ph < 1.5 ? mix(c, b, step(0.0, sin(lat * 18.0 - uTime * 2.0)))
                   : mix(a, c, 0.5 + 0.5 * sin(lat * 8.0 + lon * 4.0 + uTime * 1.5));
            totalEmissiveRadiance = e * ${night ? '1.1' : '0.45'};
          }`);
    };
    mat.customProgramCacheKey = () => 'agp-sphere';
    const m = new THREE.Mesh(new THREE.SphereGeometry(55, 40, 24), mat); m.position.set(x, 38, z); m.castShadow = true; world.scene.add(m);
    ups.push({ update(dt) { u.uTime.value += dt; } });
  }
  // the observation wheel
  {
    const [x, z] = put(0.75, 120), R = 70, g = [], cab = [];
    const rim = new THREE.TorusGeometry(R, 1.1, 6, 64); g.push(tint(rim, '#e9ebef'));
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      const sp = new THREE.BoxGeometry(0.35, R, 0.35); sp.translate(0, R / 2, 0); sp.rotateZ(a); g.push(tint(sp, '#d5d8de'));
      cab.push(tint(new THREE.SphereGeometry(3.2, 8, 6).scale(1, 0.75, 1.4).translate(Math.cos(a) * R, Math.sin(a) * R - 3, 0), '#f2f4f7'));
    }
    const wheel = new THREE.Group();
    const rimM = new THREE.Mesh(mergeGeometries(g), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: night ? '#ff3f9a' : '#000000', emissiveIntensity: 0.6 }));
    const cabM = new THREE.Mesh(mergeGeometries(cab), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: night ? '#7ad7ff' : '#000000', emissiveIntensity: 0.5 }));
    wheel.add(rimM, cabM); wheel.position.set(x, R + 12, z); wheel.rotation.y = r() * 6; world.scene.add(wheel);
    const legs = [span([x - 30, z], [x, z], 2, 0, 2, '#c9ccd2')];
    for (const s of [-1, 1]) { const l = new THREE.BoxGeometry(2.2, R + 16, 2.2); l.translate(0, (R + 16) / 2, 0); l.rotateZ(s * 0.32); l.translate(x, 0, z); legs.push(tint(l, '#c9ccd2')); }
    addMesh(world, mergeGeometries(legs));
    ups.push({ update(dt) { rimM.rotation.z += dt * 0.02; cabM.rotation.z += dt * 0.02; } });
  }
  // fountains: a lake with jets that rise and fall
  {
    const [x, z] = put(0, 90), pool = new THREE.Mesh(new THREE.CircleGeometry(60, 32).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: '#2a6f9a', shininess: 90 }));
    pool.position.set(x, 0.3, z); world.scene.add(pool);
    const jet = new THREE.CylinderGeometry(0.15, 0.9, 1, 6, 1, true); jet.translate(0, 0.5, 0);
    const n = 24, im = new THREE.InstancedMesh(jet, new THREE.MeshBasicMaterial({ color: '#eaf6ff', transparent: true, opacity: 0.7, depthWrite: false }), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    let t = 0;
    const upd = (dt) => {
      t += dt;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2, h = 6 + 22 * Math.max(0, Math.sin(t * 1.2 - k * 0.5));
        m4.compose(p.set(x + Math.cos(a) * 40, 0.3, z + Math.sin(a) * 40), q, s.set(1, h, 1)); im.setMatrixAt(k, m4);
      }
      im.instanceMatrix.needsUpdate = true;
    };
    upd(0); world.scene.add(im); ups.push({ update: upd });
  }
  return ups;
}
