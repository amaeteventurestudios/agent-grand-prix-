// City landmarks built from the kits: bridges, causeways, signature towers and flags. Each city
// that needs them calls in from World.buildLandmark. Shapes only: no names or logos.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { facade, facadeMaterial } from './kit.js';

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
