// The 3D world for one venue: sky, land and water, the circuit, the pit lane, grandstands,
// scenery and a landmark, plus the 20 cars. Everything is procedural and kept to a few
// dozen draw calls so it runs on phones. Built on Three.js r160 (vendored).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, clamp, hashString } from './rng.js';
import { sampleTrack } from './track.js';
import { COMPOUNDS } from './data.js';
import { Paddock } from './paddock.js';
import { Fleet, loadCar, loadGLB } from './cars.js';
import { Stands, sweep } from './env.js';
import { towerShapes, facadeMaterial, streetLamps, cityKit } from './kit.js';
import { treeGeo, mountainGeo, Boats, Clouds, rocks } from './nature.js';
import { lagos, dakar, nairobi, capeTown, tokyo, iceland, singapore, shanghai, miami, lasVegas } from './landmarks.js';

export const CAR_SCALE = 1.35;
const tmp = {}, tmp2 = {};
const TAG_W = 320;
// tyre left on one of your cars, as a traffic light (the same steps as the driver cards):
// green while it's fine, yellow to plan the stop, red when grip falls away
const tyreColour = (life) => (life > 0.5 ? '#3ddc5a' : life > 0.28 ? '#ffd21f' : '#ff3b3b');   // tag canvas width; a tag uses as much of it as its text needs
// the name on a car's tag: the driver's first name, in capitals, cut to fit
const tagName = (n) => { const w = String(n || '').trim().split(/\s+/)[0].toUpperCase(); return w.length > 11 ? w.slice(0, 10) + '.' : w; };
const col = (h) => new THREE.Color(h);

// value noise for terrain and colour patches
function makeNoise(seed) {
  const r = rng(seed), P = new Float32Array(512);
  for (let i = 0; i < 512; i++) P[i] = r();
  const h = (x, z) => P[((x * 73856093) ^ (z * 19349663)) & 511];
  const sm = (t) => t * t * (3 - 2 * t);
  const n2 = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), xf = sm(x - xi), zf = sm(z - zi);
    const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
    return a + (b - a) * xf + (c - a) * zf + (a - b - c + d) * xf * zf;
  };
  return (x, z) => n2(x, z) * 0.6 + n2(x * 2.1 + 17, z * 2.1 - 9) * 0.3 + n2(x * 4.3 - 5, z * 4.3 + 3) * 0.1;
}

export const PALETTES = {
  day:      { top: '#5c9ee6', hor: '#e2eff8', fog: '#dceaf3', sun: '#fff6e6', sunI: 2.9, hemi: 1.35, sky: '#e4f1ff', gnd: '#7a8a5a', elev: 50, lamps: false },
  dusk:     { top: '#33467f', hor: '#f3a56c', fog: '#e7ab84', sun: '#ffb27a', sunI: 1.6, hemi: 0.8, sky: '#b9b6d9', gnd: '#6a5040', elev: 16, lamps: true },
  night:    { top: '#060a18', hor: '#24345a', fog: '#1b2640', sun: '#e6ecff', sunI: 1.9, hemi: 1.0, sky: '#6f81b8', gnd: '#2c2a2a', elev: 62, lamps: true },
  midnight: { top: '#7194cc', hor: '#f7cda6', fog: '#ecd2bb', sun: '#ffc791', sunI: 2.4, hemi: 1.15, sky: '#d7dcf0', gnd: '#6a6158', elev: 14, lamps: false },
};

export function vcolor(geo, c) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}
const part = (geo, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(x, y, z);
  return vcolor(geo, col(c));
};

export function carGeometry(c1, c2) {
  const dark = '#17181c', carbon = '#26282d';
  const g = [
    part(new THREE.BoxGeometry(4.5, 0.08, 1.45), carbon, -0.1, 0.12, 0),
    part(new THREE.BoxGeometry(1.7, 0.26, 0.34), c1, 1.75, 0.34, 0),          // nose
    part(new THREE.BoxGeometry(1.7, 0.05, 0.12), c2, 1.75, 0.48, 0),          // nose stripe
    part(new THREE.BoxGeometry(2.0, 0.5, 0.82), c1, 0.0, 0.42, 0),            // tub
    part(new THREE.BoxGeometry(0.75, 0.12, 0.5), dark, 0.25, 0.7, 0),         // cockpit
    part(new THREE.BoxGeometry(1.2, 0.58, 0.55), c1, -1.45, 0.5, 0),          // engine cover
    part(new THREE.BoxGeometry(0.5, 0.3, 0.12), c2, -1.2, 0.92, 0),           // airbox fin
    part(new THREE.BoxGeometry(1.5, 0.36, 0.42), c1, -0.25, 0.36, 0.62),      // sidepods
    part(new THREE.BoxGeometry(1.5, 0.36, 0.42), c1, -0.25, 0.36, -0.62),
    part(new THREE.BoxGeometry(1.5, 0.05, 0.42), c2, -0.25, 0.55, 0.62),
    part(new THREE.BoxGeometry(1.5, 0.05, 0.42), c2, -0.25, 0.55, -0.62),
    part(new THREE.BoxGeometry(0.42, 0.05, 1.9), c2, 2.55, 0.16, 0),          // front wing
    part(new THREE.BoxGeometry(0.5, 0.22, 0.04), c1, 2.5, 0.22, 0.95),
    part(new THREE.BoxGeometry(0.5, 0.22, 0.04), c1, 2.5, 0.22, -0.95),
    part(new THREE.BoxGeometry(0.42, 0.06, 1.1), c2, -2.25, 0.98, 0),         // rear wing
    part(new THREE.BoxGeometry(0.3, 0.08, 1.1), c1, -2.3, 0.84, 0),
    part(new THREE.BoxGeometry(0.55, 0.62, 0.04), c1, -2.25, 0.72, 0.56),
    part(new THREE.BoxGeometry(0.55, 0.62, 0.04), c1, -2.25, 0.72, -0.56),
    part(new THREE.TorusGeometry(0.3, 0.035, 4, 10, Math.PI), dark, 0.3, 0.74, 0, 0, Math.PI / 2, 0), // halo
    part(new THREE.BoxGeometry(0.05, 0.22, 0.05), dark, 0.62, 0.68, 0),
    part(new THREE.SphereGeometry(0.17, 8, 6), c2, 0.1, 0.78, 0),              // helmet
  ];
  for (const [x, z, w] of [[1.55, 0.83, 0.32], [1.55, -0.83, 0.32], [-1.55, 0.83, 0.42], [-1.55, -0.83, 0.42]]) {
    g.push(part(new THREE.CylinderGeometry(0.34, 0.34, w, 12), dark, x, 0.34, z, Math.PI / 2, 0, 0));
    g.push(part(new THREE.CylinderGeometry(0.2, 0.2, w + 0.01, 8), '#5b5e66', x, 0.34, z, Math.PI / 2, 0, 0));
  }
  const m = mergeGeometries(g);
  g.forEach((x) => x.dispose());
  m.scale(CAR_SCALE, CAR_SCALE, CAR_SCALE);
  return m;
}

// diamond wire mesh for the catch fences: white wires on a clear background
function wireTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'); x.strokeStyle = '#ffffff'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(0, 0); x.lineTo(32, 32); x.moveTo(32, 0); x.lineTo(0, 32); x.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// a ribbon along the track between two lateral offsets, from s0 to s1 (metres), every `step` m
export function ribbon(T, s0, s1, latA, latB, y, colorFn, step = 2) {
  const pos = [], cols = [], idx = [];
  let n = 0;
  for (let s = s0; s <= s1 + 1e-6; s += step) {
    const a = typeof latA === 'function' ? latA(s) : latA, b = typeof latB === 'function' ? latB(s) : latB;
    sampleTrack(T, s, a, tmp); sampleTrack(T, s, b, tmp2);
    pos.push(tmp.x, y, tmp.z, tmp2.x, y, tmp2.z);
    const c = colorFn(s, n);
    cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
    if (n > 0) { const k = n * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
    n++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  // ribbons can wind either way: turn every triangle to face up (DoubleSide flips the normal of back faces)
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vz = pos[c + 2] - pos[a + 2];
    if (uz * vx - ux * vz < 0) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; }
  }
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nr = geo.attributes.normal.array;
  for (let i = 1; i < nr.length; i += 3) if (nr[i] < 0) { nr[i - 1] *= -1; nr[i] *= -1; nr[i + 1] *= -1; }
  return geo;
}

function wall(T, s0, s1, lat, h, colorFn, step = 3) {
  const pos = [], cols = [], idx = []; let n = 0;
  for (let s = s0; s <= s1 + 1e-6; s += step) {
    sampleTrack(T, s, lat, tmp);
    pos.push(tmp.x, 0, tmp.z, tmp.x, h, tmp.z);
    const c = colorFn(s);
    cols.push(c.r * 0.8, c.g * 0.8, c.b * 0.8, c.r, c.g, c.b);
    if (n > 0) { const k = n * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
    n++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}

function treeGeometry(type) {
  const trunk = '#6b4a2f';
  let g;
  if (type === 'palm') {
    g = [part(new THREE.CylinderGeometry(0.25, 0.4, 9, 5), trunk, 0, 4.5, 0, 0, 0, 0.12)];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.push(part(new THREE.BoxGeometry(4.2, 0.12, 0.9), '#3f8a3a', Math.cos(a) * 2, 8.7, Math.sin(a) * 2, 0, -a, -0.35));
    }
  } else if (type === 'pine') {
    g = [part(new THREE.CylinderGeometry(0.3, 0.4, 3, 5), trunk, 0, 1.5, 0),
         part(new THREE.ConeGeometry(3.2, 7, 7), '#2f5d3a', 0, 5.5, 0),
         part(new THREE.ConeGeometry(2.4, 5.5, 7), '#356a42', 0, 8.6, 0)];
  } else if (type === 'acacia') {
    g = [part(new THREE.CylinderGeometry(0.3, 0.45, 5, 5), trunk, 0, 2.5, 0),
         part(new THREE.CylinderGeometry(5, 3.4, 1.6, 9), '#6f8a3a', 0, 5.6, 0)];
  } else {
    g = [part(new THREE.CylinderGeometry(0.3, 0.45, 3.2, 5), trunk, 0, 1.6, 0),
         part(new THREE.IcosahedronGeometry(3.6, 1), '#5fb84a', 0, 5.8, 0)];
  }
  const flat = g.map((x) => (x.index ? x.toNonIndexed() : x));
  const m = mergeGeometries(flat); g.forEach((x) => x.dispose()); return m;
}

export class World {
  constructor(renderer, venue, track, opts = {}) {
    this.renderer = renderer; this.venue = venue; this.T = track; this.lite = !!opts.lite; this.carModel = opts.car || null;
    const scene = this.scene = new THREE.Scene();
    const P = this.pal = PALETTES[venue.time] || PALETTES.day;
    const r = rng(hashString(venue.id + '-world'));
    this.noise = makeNoise(hashString(venue.id + '-n'));
    const T = track, L = T.L;
    this.disposables = [];

    // sky dome
    const skyGeo = new THREE.SphereGeometry(4000, 24, 12);
    const sc = new Float32Array(skyGeo.attributes.position.count * 3);
    this.skyGeo = skyGeo; this.skyCols = sc;
    skyGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    this.sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -1;
    scene.add(this.sky);
    // Iceland sits in sea mist
    const misty = venue.id === 'iceland';
    this.fogBase = misty ? ['#cdd6dc', 420, 3200] : [P.fog, 1400, 5200];
    scene.fog = new THREE.Fog(...this.fogBase);

    // lights
    this.hemi = new THREE.HemisphereLight(P.sky, P.gnd, P.hemi);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(P.sun, P.sunI);
    const az = r.range(0, Math.PI * 2), el = THREE.MathUtils.degToRad(P.elev);
    this.sun.position.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).multiplyScalar(1000);
    this.sunDir = this.sun.position.clone().normalize();
    this.sun.castShadow = true;
    const sh = this.sun.shadow, ext = this.lite ? 110 : 170;
    sh.mapSize.set(this.lite ? 1024 : 2048, this.lite ? 1024 : 2048);
    Object.assign(sh.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 10, far: 1600 });
    sh.bias = -0.0004; sh.normalBias = 0.35;
    scene.add(this.sun, this.sun.target);

    // geometry helpers
    const [cx, cz] = T.centroid;
    this.center = new THREE.Vector3((T.bounds.minX + T.bounds.maxX) / 2, 0, (T.bounds.minZ + T.bounds.maxZ) / 2);
    const B = T.bounds;
    this.radius = Math.hypot(B.maxX - B.minX, B.maxZ - B.minZ) / 2;
    this.buildDistance();
    this.buildWater(r);
    this.buildGround(r);
    this.buildTrack(r);
    this.buildPits(r);
    this.crowdLight = new THREE.Color().setScalar({ day: 1, dusk: 0.78, night: 0.82, midnight: 0.95 }[venue.time] ?? 1);
    this.buildStands(r);
    this.buildScenery(r);
    this.buildCars();
    this.buildFx();
    this.setWeather(0, 0);
  }

  // distance from a point to the nearest bit of track (approximate, fast)
  buildDistance() {
    const T = this.T, cell = 40, grid = new Map(), pts = [];
    for (let i = 0; i < T.N; i += 4) pts.push([T.x[i], T.z[i]]);
    for (const p of pts) {
      const k = Math.floor(p[0] / cell) + ',' + Math.floor(p[1] / cell);
      (grid.get(k) || grid.set(k, []).get(k)).push(p);
    }
    const coarse = []; for (let i = 0; i < T.N; i += 25) coarse.push([T.x[i], T.z[i]]);
    // keep-out spots for the paddock and grandstands
    this.keep = [];
    const side = T.pit.side;
    for (let s = T.pit.inS - 60; s <= T.pit.outS + 60; s += 12) {
      sampleTrack(T, s, side * (T.half + 30), tmp); this.keep.push([tmp.x, tmp.z, 30]);
      sampleTrack(T, s, side * (T.half + 62), tmp); this.keep.push([tmp.x, tmp.z, 36]);
      sampleTrack(T, s, -side * (T.half + 24), tmp); this.keep.push([tmp.x, tmp.z, 22]);
    }
    this.dist = (x, z) => {
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
      let best = 1e9;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const l = grid.get((cx + dx) + ',' + (cz + dz)); if (!l) continue;
        for (const p of l) { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < best) best = d; }
      }
      if (best < cell * cell) return Math.sqrt(best);
      for (const p of coarse) { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < best) best = d; }
      return Math.sqrt(best);
    };
    this.kept = (x, z) => this.keep.some((k) => (k[0] - x) ** 2 + (k[1] - z) ** 2 < k[2] * k[2]);
  }

  buildWater(r) {
    const V = this.venue, T = this.T;
    this.waterKind = V.water;
    if (V.water === 'none') { this.land = () => 1000; return; }
    const a = r.range(0, Math.PI * 2);
    const dir = this.waterDir = [Math.cos(a), Math.sin(a)];
    const [cx, cz] = T.centroid;
    let maxP = -1e9;
    for (let i = 0; i < T.N; i += 5) maxP = Math.max(maxP, (T.x[i] - cx) * dir[0] + (T.z[i] - cz) * dir[1]);
    for (const k of this.keep) maxP = Math.max(maxP, (k[0] - cx) * dir[0] + (k[1] - cz) * dir[1] - 10);
    const n = this.noise;
    const proj = (x, z) => (x - cx) * dir[0] + (z - cz) * dir[1];
    const perp = (x, z) => -(x - cx) * dir[1] + (z - cz) * dir[0];
    if (V.water === 'coast' || V.water === 'harbour') {
      const line = maxP + (V.water === 'harbour' ? 40 : 60);
      this.coast = line;
      // > 0 is land, < 0 water, value ~ metres from the shore
      this.land = (x, z) => line + (n(perp(x, z) / 160, 3.3) - 0.5) * 70 * (V.water === 'harbour' ? 0.5 : 1) - proj(x, z);
    } else if (V.water === 'river') {
      const a0 = maxP + 50, w = 200;
      this.farBank = a0 + w;
      this.land = (x, z) => {
        const p = proj(x, z), wob = (n(perp(x, z) / 200, 7.1) - 0.5) * 60;
        return Math.max(a0 + wob - p, p - (a0 + w + wob));
      };
    } else { // lagoon: a wide blob of water on one side
      const c2 = [cx + dir[0] * (maxP + 330), cz + dir[1] * (maxP + 330)];
      this.farBank = maxP + 600;
      this.land = (x, z) => {
        const dx = x - c2[0], dz = z - c2[1];
        const along = dx * dir[0] + dz * dir[1], across = -dx * dir[1] + dz * dir[0];
        const e = Math.sqrt((along / 280) ** 2 + (across / 900) ** 2);
        return (e - 1) * 260 + (n(x / 220, z / 220) - 0.5) * 70;
      };
    }
    const wc = { coast: '#2f86b8', harbour: '#2a7fae', river: '#4a7f98', lagoon: '#2f8f9a' }[V.water];
    const tint = V.biome === 'tropic' || V.biome === 'volcanic' ? '#1f9fb8' : V.id === 'zandvoort' || V.id === 'anchorage' ? '#4f7f98' : wc;
    const m = new THREE.MeshPhongMaterial({ color: tint, shininess: 90, specular: '#cfe6ff', transparent: true, opacity: 0.93 });
    this.waterMat = m;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), m);
    water.rotation.x = -Math.PI / 2; water.position.y = -0.6;
    this.scene.add(water);
  }

  sample(s, lat, out) { return sampleTrack(this.T, s, lat, out); }

  height(x, z) {
    const V = this.venue, d = this.dist(x, z);
    const amp = { none: 2, low: 10, hills: 34, peaks: 50, snow: 60, alps: 80 }[V.hills] ?? 10;
    const far = clamp((d - 90) / 380, 0, 1);
    let h = (this.noise(x / 420, z / 420) - 0.35) * amp * far * far;
    if (V.landmark === 'thousandhills') h += Math.max(0, Math.sin(x / 90) * Math.cos(z / 110) * 22) * far;
    const l = this.land(x, z);
    if (l < 0) h = Math.max(-6, l * 0.12) - 0.8;
    else if (l < 30) h = Math.min(h, l * 0.05);
    return h;
  }

  buildGround() {
    const V = this.venue, C = V.biomeColors;
    const size = 5200, seg = this.lite ? 110 : 150;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    geo.translate(this.center.x, 0, this.center.z);
    const p = geo.attributes.position, n = p.count, cols = new Float32Array(n * 3);
    const g1 = col(C.ground), g2 = col(C.verge), sand = col(V.biome === 'tundra' ? '#9a9486' : '#e3d3a4'), soil = col(C.soil);
    const snow = col('#f4f6f8'), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), z = p.getZ(i), h = this.height(x, z);
      p.setY(i, h);
      const k = this.noise(x / 60, z / 60), l = this.land(x, z);
      c.copy(g1).lerp(g2, k);
      if (k > 0.72) c.lerp(soil, (k - 0.72) * 1.4);
      if (l < 26) c.lerp(sand, clamp(1 - l / 26, 0, 1));
      if ((V.hills === 'snow' || V.hills === 'alps') && h > 30) c.lerp(snow, clamp((h - 30) / 30, 0, 1));
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    // mown stripes, lined up with the main straight
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64;
    const cx2 = cv.getContext('2d');
    cx2.fillStyle = '#ffffff'; cx2.fillRect(0, 0, 4, 32); cx2.fillStyle = '#e2e6dc'; cx2.fillRect(0, 32, 4, 32);
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
    tex.repeat.set(1, size / 26); tex.center.set(0.5, 0.5); tex.rotation = Math.atan2(this.T.tz[0], this.T.tx[0]);
    tex.anisotropy = 4;
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: tex }));
    ground.receiveShadow = true;
    ground.position.y = -0.05;
    this.scene.add(ground);
  }

  buildTrack(r) {
    const T = this.T, L = T.L, V = this.venue, h = T.half;
    const asphalt = col(V.time === 'night' ? '#747a84' : '#676c75');
    const runoffW = V.street ? 1.2 : 10;
    this.runoff = runoffW;
    // verge / run-off: tarmac in the corners, grass on the straights
    const verge = col(V.biomeColors.verge), run = col('#b9b4a8'), cc = new THREE.Color();
    const cornerW = (s) => { const i = ((Math.floor(s) % L) + L) % L; return clamp(Math.abs(T.k[i]) * 140 - 0.2, 0, 1); };
    const runG = ribbon(T, 0, L, -(h + runoffW), h + runoffW, 0.0, (s) => cc.copy(verge).lerp(run, V.street ? 1 : cornerW(s)), 3);
    const trackG = ribbon(T, 0, L, -h, h, 0.03, (s, n) => cc.copy(asphalt).multiplyScalar(0.96 + ((n * 7919) % 11) / 260), 2);
    this.trackMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8, specular: '#202020', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const runM = new THREE.Mesh(runG, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    runM.position.y = 0.0; runM.receiveShadow = true;
    const trackM = new THREE.Mesh(trackG, this.trackMat); trackM.receiveShadow = true;
    // white edge lines, kerbs, start line, grid boxes
    const white = col('#f2f2f2'), red = col('#d8262c');
    const lines = [ribbon(T, 0, L, h - 0.55, h - 0.25, 0.05, () => white, 4), ribbon(T, 0, L, -h + 0.25, -h + 0.55, 0.05, () => white, 4)];
    const kerbs = [];
    let s = 0;
    while (s < L) {
      const i = Math.floor(s);
      if (Math.abs(T.k[i]) > 1 / 160) {
        let e = s; while (e < L && Math.abs(T.k[Math.floor(e)]) > 1 / 200) e += 2;
        const a = Math.max(0, s - 14), b = Math.min(L - 1, e + 10);
        const side = Math.sign(T.k[i]); // inside of the corner
        const kc = (q, n) => (Math.floor(q / 2.5) % 2 ? red : white);
        kerbs.push(ribbon(T, a, b, side * (h - 0.1), side * (h + 1.4), 0.06, kc, 1.25));
        kerbs.push(ribbon(T, a + 6, b + 4, -side * (h - 0.1), -side * (h + 1.2), 0.06, kc, 1.25));
        s = e + 12;
      } else s += 2;
    }
    // chequered start line
    const chk = [];
    const squares = Math.round(T.width / 1);
    for (let row = 0; row < 2; row++) for (let q = 0; q < squares; q++) {
      const g = ribbon(T, row * 1, row * 1 + 1, -h + q * (T.width / squares), -h + (q + 1) * (T.width / squares), 0.07, () => ((row + q) % 2 ? white : col('#121212')), 1);
      chk.push(g);
    }
    for (let k = 0; k < 20; k++) {
      const gs = -10 - k * 9, lat = k % 2 ? -2.6 : 2.6;
      chk.push(ribbon(T, gs + 1.8, gs + 2.2, lat - 1.1, lat + 1.1, 0.07, () => white, 0.4));
    }
    const deco = mergeGeometries([...lines, ...kerbs, ...chk]);
    [...lines, ...kerbs, ...chk].forEach((g) => g.dispose());
    const decoM = this.decoM = new THREE.Mesh(deco, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    decoM.receiveShadow = true;
    this.scene.add(runM, trackM, decoM);

    // barriers, but not across the pit entry and exit on the pit side
    const P = T.pit, wallH = V.street ? 1.4 : 1.1;
    const lat = h + runoffW + 0.6;
    const c1 = col(V.street ? '#e9ecef' : '#2a5bd7'), c2 = col(V.street ? '#c9cdd3' : '#f2f2f2');
    const wc = (q) => (Math.floor(q / 6) % 2 ? c1 : c2);
    const walls = [];
    // the pit side has its gap from pit entry to exit, where the pit wall takes over
    const pitA = ((P.inS - 30) + L) % L, pitB = P.outS + 30;
    // concrete blocks with a chamfered top, 6 m long, in alternating colours; a steel rail on the fence
    const block = (a, b, la) => {
      const sg = Math.sign(la), ss = [];
      for (let q = Math.ceil(a / 6) * 6; q < b; q += 6) this.lite ? ss.push(q, q + 5.97) : ss.push(q, q + 3, q + 5.97);
      const prof = [[la - sg * 0.32, 0], [la - sg * 0.32, wallH * 0.72], [la - sg * 0.12, wallH], [la + sg * 0.12, wallH], [la + sg * 0.32, wallH * 0.72], [la + sg * 0.32, 0]];
      const top = c2.clone().lerp(col('#ffffff'), 0.4);
      walls.push(sweep(T, ss, prof, (j, q) => j === 2 ? top : wc(q + 0.01)));
      const rail = [[la - 0.05, wallH + 3.15], [la - 0.05, wallH + 3.3], [la + 0.05, wallH + 3.3], [la + 0.05, wallH + 3.15]];
      walls.push(sweep(T, ss, rail, () => col('#8d949e')));
    };
    block(pitB, L + P.inS - 30, P.side * lat);
    block(0, L, -P.side * lat);
    const wallM = new THREE.Mesh(mergeGeometries(walls), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    wallM.castShadow = !this.lite; wallM.receiveShadow = true;
    this.scene.add(wallM);
    walls.forEach((g) => g.dispose());
    // catch fences on top of the barriers: wire mesh drawn on a small canvas, with posts
    const fence = [], posts = [];
    const fenceRun = (a, b, la) => {
      const pos = [], uv = [], idx = []; let n = 0;
      for (let q = a; q <= b + 1e-6; q += 4) {
        sampleTrack(T, q, la, tmp);
        pos.push(tmp.x, wallH, tmp.z, tmp.x, wallH + 3.2, tmp.z); uv.push(q / 1.6, 0, q / 1.6, 2);
        if (n > 0) { const k = n * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
        n++;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals(); fence.push(g);
      for (let q = a; q < b; q += 8) { sampleTrack(T, q, la, tmp); posts.push([tmp.x, tmp.z]); }
    };
    fenceRun(pitB, L + P.inS - 30, P.side * lat);
    fenceRun(0, L, -P.side * lat);
    const fm = new THREE.Mesh(mergeGeometries(fence), new THREE.MeshLambertMaterial({ color: '#b9c0c8', map: wireTexture(), alphaTest: 0.35, side: THREE.DoubleSide }));
    this.scene.add(fm);
    {
      const pg = new THREE.CylinderGeometry(0.07, 0.07, 3.4, 4); pg.translate(0, wallH + 1.7, 0);
      const pm = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ color: '#7d848f' }), posts.length);
      const m4 = new THREE.Matrix4();
      posts.forEach(([x, z], k) => { m4.makeTranslation(x, 0, z); pm.setMatrixAt(k, m4); });
      this.scene.add(pm);
    }

    // start gantry with five lights
    sampleTrack(T, 0, 0, tmp);
    const gantry = new THREE.Group();
    const hd = Math.atan2(tmp.tz, tmp.tx);
    gantry.position.set(tmp.x, 0, tmp.z); gantry.rotation.y = -hd;
    const gm = new THREE.MeshLambertMaterial({ color: '#2b2e35' });
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8, 0.6), gm); postL.position.set(0, 4, h + 2);
    const postR = postL.clone(); postR.position.z = -h - 2;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, T.width + 4.6), gm); beam.position.set(0, 7.6, 0);
    gantry.add(postL, postR, beam);
    this.lightsMat = [];
    for (let k = 0; k < 5; k++) {
      const m = new THREE.MeshBasicMaterial({ color: '#2a0c0c' });
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12), m);
      l.position.set(-0.42, 7.6, (k - 2) * 1.2); l.rotation.y = -Math.PI / 2;
      gantry.add(l); this.lightsMat.push(m);
    }
    this.scene.add(gantry);

    // floodlights for dusk and night races
    if (this.pal.lamps) {
      const n = Math.floor(L / 55), pole = new THREE.CylinderGeometry(0.18, 0.25, 14, 5); pole.translate(0, 7, 0);
      const poles = new THREE.InstancedMesh(pole, new THREE.MeshLambertMaterial({ color: '#555a62' }), n * 2);
      const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.5, 1.6), new THREE.MeshBasicMaterial({ color: '#fff6dd' }), n * 2);
      const m4 = new THREE.Matrix4();
      let k = 0;
      for (let q = 0; q < n; q++) for (const sd of [-1, 1]) {
        const ss = q * 55 + (sd > 0 ? 0 : 27);
        sampleTrack(T, ss, sd * (lat + 2.5), tmp);
        m4.makeTranslation(tmp.x, 0, tmp.z); poles.setMatrixAt(k, m4);
        m4.makeTranslation(tmp.x, 14, tmp.z); heads.setMatrixAt(k, m4); k++;
      }
      poles.count = heads.count = k;
      this.scene.add(poles, heads);
    }
  }

  buildPits() {
    const T = this.T, P = T.pit, h = T.half, sd = P.side, L = T.L;
    const lane = (s) => {
      const a = clamp((s - P.inS) / 45, 0, 1), b = clamp((P.outS - s) / 45, 0, 1);
      const f = Math.min(a, b), e = f * f * (3 - 2 * f);
      return P.lat * e;
    };
    const asph = col('#7a7f87'), cc = new THREE.Color();
    // both lanes: the fast lane by the pit wall and the working lane in front of the boxes
    const laneG = ribbon(T, P.inS, P.outS, (s) => lane(s) * P.fast / P.lat - 3 * sd, (s) => lane(s) + 4.5 * sd, 0.025, () => asph, 2);
    const laneM = new THREE.Mesh(laneG, this.trackMat); laneM.receiveShadow = true;
    // box markings in team colours
    this.boxColors = [];
    const marks = [];
    const yellow = col('#f2c230');
    marks.push(ribbon(T, P.inS + 40, P.outS - 40, P.lat - 4.3 * sd, P.lat - 4.0 * sd, 0.05, () => yellow, 4));
    this.scene.add(laneM);
    this.pitMarks = marks;
    // pit wall between the track and the lane
    const wallG = [];
    const wc = col('#e6e8ec');
    wallG.push(wall(T, P.inS + 25, P.outS - 25, sd * (h + 5.2), 1.3, () => wc, 3));
    wallG.push(wall(T, P.inS + 25, P.outS - 25, sd * (h + 5.6), 1.3, () => wc, 3));
    this.scene.add(new THREE.Mesh(mergeGeometries(wallG), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  }

  setTeams(teams) {
    if (this.paddock) this.paddock.dispose();
    if (this.pitMarks?.length) { const m = new THREE.Mesh(mergeGeometries(this.pitMarks), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); this.scene.add(m); this.pitMarks = []; }
    this.paddock = new Paddock(this, teams, (t) => this.carGeo(t));
  }

  carGeo(t) {
    const key = t.c1 + t.c2;
    if (!this.geoCache.has(key)) this.geoCache.set(key, carGeometry(t.c1, t.c2));
    return this.geoCache.get(key);
  }

  buildStands(r) {
    const T = this.T, P = T.pit, sd = P.side, h = T.half, runoff = this.runoff;
    const specs = [{ s0: P.inS + 10, s1: P.outS - 10, lat0: -sd * (h + runoff + 3), dir: -sd, rows: this.lite ? 12 : 14 }];
    // more at the slowest corners
    const corners = [];
    for (let i = 0; i < T.N; i += 10) corners.push([i, Math.abs(T.k[i])]);
    corners.sort((a, b) => b[1] - a[1]);
    const used = [];
    for (const [i] of corners) {
      if (used.length >= (this.lite ? 2 : 3)) break;
      if (used.some((u) => Math.min(Math.abs(u - i), T.N - Math.abs(u - i)) < 300)) continue;
      if (i < P.outS + 100 || i > T.N + P.inS - 100) continue;
      used.push(i);
      const out = -Math.sign(T.k[i]);
      specs.push({ s0: i - 40, s1: i + 40, lat0: out * (h + runoff + 3), dir: out, rows: 10 });
    }
    this.stands = new Stands(this, r, specs);
  }

  // a ring road round the circuit, clear of the paddock: the town lines it
  buildRoad() {
    const T = this.T, [cx, cz] = T.centroid, NB = 160, R = new Float32Array(NB);
    for (let i = 0; i < T.N; i += 3) {
      const a = Math.atan2(T.z[i] - cz, T.x[i] - cx), d = Math.hypot(T.x[i] - cx, T.z[i] - cz);
      const b = Math.round((a + Math.PI) / (Math.PI * 2) * NB) % NB;
      for (let k = -3; k <= 3; k++) { const j = (b + k + NB) % NB; R[j] = Math.max(R[j], d); }
    }
    for (const k of this.keep) { // paddock and stands
      const a = Math.atan2(k[1] - cz, k[0] - cx), d = Math.hypot(k[0] - cx, k[1] - cz) + k[2];
      const b = Math.round((a + Math.PI) / (Math.PI * 2) * NB) % NB;
      for (let j = -2; j <= 2; j++) { const q = (b + j + NB) % NB; R[q] = Math.max(R[q], d - 20); }
    }
    for (let i = 0; i < NB; i++) R[i] += 70;
    for (let pass = 0; pass < 6; pass++) { const c = R.slice(); for (let i = 0; i < NB; i++) R[i] = Math.max(c[i], (c[(i + NB - 1) % NB] + c[i] * 2 + c[(i + 1) % NB]) / 4); }
    this.roadR = (a) => { const f = ((a + Math.PI) / (Math.PI * 2)) * NB, i = Math.floor(f), t = f - i; return R[((i % NB) + NB) % NB] * (1 - t) + R[(((i + 1) % NB) + NB) % NB] * t; };
    this.onRoad = (x, z, m = 9) => Math.abs(Math.hypot(x - cx, z - cz) - this.roadR(Math.atan2(z - cz, x - cx))) < m;
    const pos = [], cols = [], idx = [], asph = col('#7d828a'), line = col('#f1f1ec'), M = 640;
    let n = 0;
    for (let i = 0; i <= M; i++) {
      const a = -Math.PI + (i / M) * Math.PI * 2, rr = this.roadR(a), ca = Math.cos(a), sa = Math.sin(a);
      for (const [o, c] of [[-4.5, asph], [-0.2, asph], [-0.2, i % 6 < 3 ? line : asph], [0.2, i % 6 < 3 ? line : asph], [0.2, asph], [4.5, asph]]) {
        const x = cx + ca * (rr + o), z = cz + sa * (rr + o);
        pos.push(x, this.height(x, z) + 0.12, z); cols.push(c.r, c.g, c.b);
      }
      if (i > 0) {
        const wet = this.land(cx + ca * rr, cz + sa * rr) < 12;
        if (!wet) for (const s of [0, 2, 4]) { const b = n * 6 + s, p0 = b - 6; idx.push(p0, b, p0 + 1, p0 + 1, b, b + 1); }
      }
      n++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.setIndex(idx);
    g.computeVertexNormals();
    const nr = g.attributes.normal.array; for (let i = 1; i < nr.length; i += 3) if (nr[i] < 0) { nr[i - 1] *= -1; nr[i] *= -1; nr[i + 1] *= -1; }
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.receiveShadow = true; this.scene.add(m);
    // street lamps along the road, every 42 m, alternating sides, the arm reaching over the road
    const spots = [], ring = 2 * Math.PI * (R.reduce((a, b) => a + b, 0) / NB);
    const nL = Math.floor(ring / 42 / (this.lite ? 1.6 : 1));
    for (let i = 0; i < nL; i++) {
      const a = -Math.PI + (i / nL) * Math.PI * 2, rr = this.roadR(a), o = i % 2 ? 6.2 : -6.2;
      const x = cx + Math.cos(a) * (rr + o), z = cz + Math.sin(a) * (rr + o);
      if (this.land(x, z) < 12 || this.dist(x, z) < T.half + 12) continue;
      const h = o > 0 ? a + Math.PI : a;   // point the arm toward the road centre line
      spots.push([x, this.height(x, z), z, h, false]);
    }
    this.scene.add(streetLamps(spots, this.pal.lamps));
  }

  buildScenery(r) {
    const V = this.venue, T = this.T, [cx, cz] = T.centroid, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), cc = new THREE.Color();
    this.buildRoad();
    const free = (x, z, d) => this.dist(x, z) > d && !this.kept(x, z) && this.land(x, z) > 8 && !this.onRoad(x, z);
    // trees
    if (V.trees !== 'none' && V.treeDensity > 0) {
      const types = { mixed: ['pine', 'round'], tropical: ['palm', 'round'], sahel: ['baobab', 'acacia'], cherry: ['cherry', 'round'] }[V.trees] || [V.trees];
      // near the track (where the cameras are) the detailed tree, further out the light one
      const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      const nearD = T.half + this.runoff + (this.lite ? 90 : 150);
      for (const ty of types) {
        const n = Math.round((this.lite ? 520 : 1300) * V.treeDensity / types.length);
        const spots = [];
        let guard = 0;
        while (spots.length < n && guard++ < n * 30) {
          // cluster trees in groves
          const a = r() * Math.PI * 2, rad = Math.pow(r(), 0.75) * (this.radius + 560);
          const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
          if (this.noise(x / 140, z / 140) < 0.45 - V.treeDensity * 0.15) continue;
          if (!free(x, z, T.half + this.runoff + 9)) continue;
          spots.push([x, z, r.range(0.75, 1.35), r.range(0.85, 1.2), r() * Math.PI * 2, r.range(0.8, 1.1)]);
        }
        for (const near of [true, false]) {
          const L = spots.filter(([x, z]) => (this.dist(x, z) < nearD) === near); if (!L.length) continue;
          const mesh = new THREE.InstancedMesh(treeGeo(ty, near, hashString(V.id + ty)), treeMat, L.length);
          L.forEach(([x, z, s, sy, rot, shade], k) => {
            q.setFromAxisAngle(sv.set(0, 1, 0), rot);
            m4.compose(pv.set(x, this.height(x, z), z), q, sv.set(s, s * sy, s));
            mesh.setMatrixAt(k, m4); mesh.setColorAt(k, cc.setHSL(0, 0, shade));
          });
          mesh.castShadow = near || !this.lite;
          this.scene.add(mesh);
        }
      }
    }
    // city blocks: a low town wrapped round the circuit, a skyline of towers beyond it. Six tower
    // shapes from the buildings kit, one draw call each; windows, floors, reflections and night
    // lights come from the facade shader, so every size keeps real-sized windows.
    const nB = V.kit ? 0 : Math.round((this.lite ? 220 : 520) * (V.city01 || 0));
    if (V.kit && V.city01) this.buildKitCity(free);
    if (nB > 0) {
      const shapes = towerShapes(this.lite), kinds = Object.keys(shapes);
      const lists = Object.fromEntries(kinds.map((k) => [k, []]));
      const neonCity = this.pal.lamps && ['lasvegas', 'singapore', 'shanghai', 'miami', 'suzuka', 'baku', 'jeddah', 'abudhabi', 'kualalumpur'].includes(V.id);
      const desert = V.biome === 'desert' || V.biome === 'dunes' || V.biome === 'sahel';
      let k = 0, guard = 0;
      const a0 = this.waterDir ? Math.atan2(this.waterDir[1], this.waterDir[0]) : r() * Math.PI * 2;
      const across = this.farBank !== undefined;
      this.cityAngle = across ? a0 : (V.water !== 'none' ? a0 + Math.PI : a0);
      const towerWalls = ['#f2f3f5', '#d9dde3', '#e8e2d6', '#c9ced6', '#eef0f2', '#bfc6cf'];
      const townWalls = V.id === 'capetown' ? ['#f2a7c3', '#9fd36a', '#7ec8e3', '#f7d55a', '#5fd0b8', '#c79be8', '#ff9f6b', '#ffffff'] : desert ? ['#e9dcc3', '#dccaa6', '#f1e7d4', '#cdb894', '#e3d2b5'] : ['#ffffff', '#f3ece0', '#f6e3b8', '#e9c9b4', '#cfe3e8', '#e6efd9', '#f4d6d0', '#fff6e8', '#d8e1ef'];
      let town = false;
      const roofs = [], roofTones = ['#b4533a', '#c8693f', '#3f6fa6', '#2f8a58', '#8a3b34', '#d9d2c4'], tops = [];
      while (k < nB && guard++ < nB * 40) {
        let x, z, dTrack;
        if (across) { // the skyline on the far bank
          const sp = r.range(-1, 1), dd = this.farBank + r.range(40, 520);
          const a = a0 + sp * 0.9;
          x = cx + Math.cos(a) * dd; z = cz + Math.sin(a) * dd;
          dTrack = 60;
        } else {
          // the first half is a low town wrapped round the circuit, the rest a skyline beyond it
          town = k < nB * 0.5;
          const a = (V.water !== 'none' ? a0 + Math.PI : a0) + (town ? r.range(-2.4, 2.4) : r.range(-0.8, 0.8));
          const dd = town ? this.roadR(a) + (r() < 0.3 ? -1 : 1) * r.range(16, 30) + (r() < 0.4 ? r.range(0, 140) : 0) : this.radius + r.range(160, 640);
          x = cx + Math.cos(a) * dd; z = cz + Math.sin(a) * dd;
          dTrack = town ? 40 : 70;
        }
        if (!free(x, z, dTrack)) continue;
        const near = this.dist(x, z);
        const w = town ? r.range(10, 22) : r.range(14, 34), d = town ? r.range(10, 22) : r.range(14, 34);
        let hgt = town ? r.range(7, 20) : r.range(18, 46) + Math.pow(r(), 2.2) * 170 * V.city01 * clamp(near / 400, 0.4, 1.3);
        if (across) hgt *= 1.25;
        q.setFromAxisAngle(sv.set(0, 1, 0), town ? -Math.atan2(z - cz, x - cx) : r() < 0.5 ? 0 : r() * Math.PI);
        const y = this.height(x, z) - 1;
        // pick a shape and a facade: towers are glass, mid-rises have balconies, the town has windows in painted walls
        let kind, fac, wallC;
        if (town) {
          kind = 'slab'; fac = [r.range(2.8, 3.6), 3.2, 2, y]; wallC = townWalls[Math.floor(r() * townWalls.length)];
          if (r() < 0.6) roofs.push([x, y + hgt, z, q.clone(), w + 1.2, d + 1.2, roofTones[Math.floor(r() * roofTones.length)]]);
          else tops.push([x, y + hgt, z, q.clone(), w, d]);
        } else if (hgt < 44 && r() < 0.45) {
          kind = 'slab'; fac = [r.range(3.2, 4.2), 3.1, 3 + r() * 0.9, y]; wallC = townWalls[Math.floor(r() * townWalls.length)];
          tops.push([x, y + hgt, z, q.clone(), w, d]);
        } else {
          const pick = hgt > 110 ? ['crown', 'setback', 'taper', 'round', 'slant'] : ['slab', 'slab', 'slant', 'round', 'setback', 'taper'];
          kind = pick[Math.floor(r() * pick.length)];
          const style = neonCity && r() < 0.35 ? 4 : 1;
          fac = [(kind === 'round' || kind === 'taper' ? -1 : 1) * r.range(2.6, 3.6), r.range(3.4, 4.0), style + r() * 0.9, y];
          wallC = towerWalls[Math.floor(r() * towerWalls.length)];
          if (kind === 'slab' || kind === 'slant') tops.push([x, y + hgt * (kind === 'slant' ? 0.82 : 1), z, q.clone(), w, d]);
        }
        lists[kind].push([x, y, z, q.clone(), w, hgt, d, wallC, fac]);
        k++;
      }
      const mat = facadeMaterial(this.pal, {
        glass: desert ? '#7a6248' : '#2f6fa8', glass2: desert ? '#4f7b86' : '#3f8f8a',
        lit: 0.5, key: 'city', instanced: true, neon: ['#ff3fa8', '#33e0ff'], sun: [this.sunDir, this.pal.sun],
      });
      for (const kind of kinds) {
        const L = lists[kind]; if (!L.length) continue;
        const g = shapes[kind];
        const ifac = new Float32Array(L.length * 4);
        const bm = new THREE.InstancedMesh(g, mat, L.length);
        L.forEach(([x, y, z, qq, w, hgt, d, c, fac], i) => {
          m4.compose(pv.set(x, y, z), qq, sv.set(w, hgt, d)); bm.setMatrixAt(i, m4); bm.setColorAt(i, cc.set(c));
          ifac.set(fac, i * 4);
        });
        g.setAttribute('ifac', new THREE.InstancedBufferAttribute(ifac, 4));
        bm.castShadow = !this.lite;
        this.scene.add(bm);
      }
      // coloured roofs on the low town: tin, tile and painted
      if (roofs.length) {
        const rg = new THREE.CylinderGeometry(0.5 / Math.SQRT2 * 0.2, 0.5 * Math.SQRT2, 1, 4, 1); rg.rotateY(Math.PI / 4); rg.translate(0, 0.5, 0);
        const rm = new THREE.InstancedMesh(rg, new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), roofs.length);
        roofs.forEach(([x, y, z, qq, w, d, c], i) => { m4.compose(pv.set(x, y, z), qq, sv.set(w, Math.min(w, d) * 0.32, d)); rm.setMatrixAt(i, m4); rm.setColorAt(i, cc.set(c)); });
        rm.castShadow = true; this.scene.add(rm);
      }
      // flat roofs: a parapet and the plant on top (water tanks, air handlers, lift rooms)
      if (tops.length) {
        const parts = [];
        const b = (w, h, d, x, y, z, c) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); parts.push(vcolor(g, col(c))); };
        b(1, 0.9, 0.04, 0, 0, 0.48, '#d5d9de'); b(1, 0.9, 0.04, 0, 0, -0.48, '#d5d9de'); b(0.04, 0.9, 1, 0.48, 0, 0, '#d5d9de'); b(0.04, 0.9, 1, -0.48, 0, 0, '#d5d9de');
        const unit = mergeGeometries(parts);
        const um = new THREE.InstancedMesh(unit, new THREE.MeshLambertMaterial({ vertexColors: true }), tops.length);
        const plant = new THREE.BoxGeometry(1, 1, 1); plant.translate(0, 0.5, 0);
        const pm = new THREE.InstancedMesh(plant, new THREE.MeshLambertMaterial({ color: '#ffffff' }), tops.length * 2);
        let n = 0;
        tops.forEach(([x, y, z, qq, w, d], i) => {
          // the parapet is drawn in unit space: stretch it to the roof, keeping it about 1 m tall
          m4.compose(pv.set(x, y, z), qq, sv.set(w, 1, d)); um.setMatrixAt(i, m4);
          for (let j = 0; j < 2; j++) {
            const ox = r.range(-0.3, 0.3) * w, oz = r.range(-0.3, 0.3) * d, v = new THREE.Vector3(ox, 0, oz).applyQuaternion(qq);
            m4.compose(pv.set(x + v.x, y, z + v.z), qq, sv.set(r.range(2.5, 6), r.range(1.4, 3.2), r.range(2.5, 5)));
            pm.setMatrixAt(n, m4); pm.setColorAt(n++, cc.set(j ? '#9ba2ab' : '#c9ced4'));
          }
        });
        pm.count = n; um.castShadow = pm.castShadow = !this.lite;
        this.scene.add(um, pm);
      }
    }
    this.buildMountains(r);
    this.buildLandmark(r);
    this.buildNature(r);
  }

  // The city from the modelled kit (venues with kit: true, js/kit.js cityKit): a waterfront of
  // houses, shophouses and flats, offices and towers behind it, every building at its real size and
  // never overlapping another. The kit loads with the race, so the city is placed and drawn when it
  // arrives, from its own random numbers (the rest of the scenery doesn't change with it). Buildings
  // near the track get the detailed level (balconies, fins, tanks, masts), the rest the plain one.
  buildKitCity(free) {
    const V = this.venue, [cx, cz] = this.T.centroid, across = this.farBank !== undefined;
    const r = rng(hashString(V.id + '-city'));
    const a0 = this.waterDir ? Math.atan2(this.waterDir[1], this.waterDir[0]) : r() * Math.PI * 2;
    this.cityAngle = across ? a0 : (V.water !== 'none' ? a0 + Math.PI : a0);
    const towerWalls = ['#f2f3f5', '#d9dde3', '#e8e2d6', '#c9ced6', '#eef0f2', '#bfc6cf'];
    const townWalls = ['#ffffff', '#f3ece0', '#f6e3b8', '#e9c9b4', '#cfe3e8', '#e6efd9', '#f4d6d0', '#fff6e8', '#d8e1ef', '#efd9a8'];
    const n = Math.round((this.lite ? 150 : 300) * V.city01);
    const place = (kit) => {
      const D = kit.designs, spots = [];
      let guard = 0;
      while (spots.length < n && guard++ < n * 80) {
        let x, z, hgt, clear = 60;
        if (across) { // the far bank: a low waterfront, the towers behind it
          const back = r.range(0, 540), a = a0 + r.range(-1, 1) * 0.9, dd = this.farBank + 30 + back;
          x = cx + Math.cos(a) * dd; z = cz + Math.sin(a) * dd;
          hgt = back < 110 ? r.range(6, 44) : (r.range(18, 46) + Math.pow(r(), 2.2) * 170 * V.city01 * clamp(back / 300, 0.4, 1.3)) * 1.25;
        } else { // a low town round the circuit, a skyline beyond it
          const town = spots.length < n * 0.5;
          const a = this.cityAngle + (town ? r.range(-2.4, 2.4) : r.range(-0.8, 0.8));
          const dd = town ? this.roadR(a) + (r() < 0.3 ? -1 : 1) * r.range(16, 30) + (r() < 0.4 ? r.range(0, 140) : 0) : this.radius + r.range(160, 640);
          x = cx + Math.cos(a) * dd; z = cz + Math.sin(a) * dd;
          hgt = town ? r.range(6, 20) : r.range(18, 46) + Math.pow(r(), 2.2) * 170 * V.city01 * clamp(this.dist(x, z) / 400, 0.4, 1.3);
          clear = town ? 40 : 70;
        }
        if (!free(x, z, clear)) continue;
        // the designs this height suits (each may be stretched a little up or down), else the nearest
        let fit = D.filter((d) => hgt >= d.h * d.s[0] && hgt <= d.h * d.s[1]);
        if (!fit.length) fit = [D.reduce((b, d) => Math.abs(Math.log(hgt / d.h)) < Math.abs(Math.log(hgt / b.h)) ? d : b)];
        const d = fit[Math.floor(r() * fit.length)];
        const sxz = r.range(0.9, 1.1), sy = clamp(hgt / d.h, d.s[0], d.s[1]), rad = Math.hypot(d.w, d.d) * 0.5 * sxz * 0.85;
        if (spots.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < (o.rad + rad + 5) ** 2)) continue;
        // low buildings face the track, towers turn any quarter
        const face = Math.atan2(cx - x, cz - z);
        const rot = d.size === 'tall' ? Math.round(r() * 4) * Math.PI / 2 + r.range(-0.3, 0.3) : face + r.range(-0.25, 0.25);
        const paint = (d.size === 'tall' ? towerWalls : townWalls)[Math.floor(r() * (d.size === 'tall' ? towerWalls.length : townWalls.length))];
        spots.push({ x, z, d, sxz, sy, rad, rot, paint, tint: r() * 0.9, near: this.dist(x, z) });
      }
      // the nearest share gets the detailed level (fewer on phones)
      const ds = spots.map((o) => o.near).sort((a, b) => a - b), cut = ds[Math.floor(ds.length * (this.lite ? 0.25 : 0.45))];
      for (const o of spots) o.lod = o.near <= cut ? 0 : 1;
      return spots;
    };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3(), sv = new THREE.Vector3(), cc = new THREE.Color();
    const draw = (kit) => {
      const spots = place(kit);
      const mat = facadeMaterial(this.pal, { glass: '#2f6fa8', glass2: '#3f8f8a', lit: 0.22, key: 'kit', instanced: true, kit, sun: [this.sunDir, this.pal.sun] });
      const out = [];
      for (const d of kit.designs) for (const lod of [0, 1]) {
        const L = spots.filter((o) => o.d === d && o.lod === lod); if (!L.length) continue;
        const g = d.lod[lod].clone(), ifac = new Float32Array(L.length * 4);
        const im = new THREE.InstancedMesh(g, mat, L.length);
        L.forEach((o, i) => {
          const y = this.height(o.x, o.z) - 0.4;
          q.setFromAxisAngle(up, o.rot); m4.compose(pv.set(o.x, y, o.z), q, sv.set(o.sxz, o.sy, o.sxz));
          im.setMatrixAt(i, m4); im.setColorAt(i, cc.set(o.paint));
          ifac.set([d.ww, d.fh * o.sy, 1 + o.tint, y + d.y0 * o.sy], i * 4);
        });
        g.setAttribute('ifac', new THREE.InstancedBufferAttribute(ifac, 4));
        im.castShadow = lod === 0 && !this.lite;
        this.scene.add(im); out.push(im);
      }
      this.kitCity = { list: spots, spots: spots.length, meshes: out.length, tris: out.reduce((t, m) => t + m.count * (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0) };
    };
    // if the kit can't load, the same spread of plain towers from the old kit
    const plain = () => {
      const D = [{ h: 150, w: 30, d: 30, s: [0.6, 1.6], size: 'tall', ww: 3, fh: 3.8, y0: 0 }, { h: 40, w: 30, d: 16, s: [0.4, 1.4], size: 'mid', ww: 3.2, fh: 3.2, y0: 0 }];
      const spots = place({ designs: D }), g = towerShapes(this.lite).slab.clone(), ifac = new Float32Array(spots.length * 4);
      const im = new THREE.InstancedMesh(g, facadeMaterial(this.pal, { glass: '#2f6fa8', glass2: '#3f8f8a', lit: 0.5, key: 'city', instanced: true }), spots.length);
      spots.forEach((o, i) => {
        const y = this.height(o.x, o.z) - 1;
        q.setFromAxisAngle(up, o.rot); m4.compose(pv.set(o.x, y, o.z), q, sv.set(o.d.w * o.sxz, o.d.h * o.sy, o.d.d * o.sxz));
        im.setMatrixAt(i, m4); im.setColorAt(i, cc.set(o.paint)); ifac.set([o.d.ww, o.d.fh, (o.d.size === 'tall' ? 1 : 2) + o.tint, y], i * 4);
      });
      g.setAttribute('ifac', new THREE.InstancedBufferAttribute(ifac, 4));
      this.scene.add(im);
    };
    this.cityReady = cityKit().then(draw, (e) => { console.warn('city kit', e); plain(); });
  }

  // boats on the water, rocks and surf along the shore, clouds in the sky
  buildNature(r) {
    const V = this.venue, T = this.T, [cx, cz] = T.centroid;
    if (V.water !== 'none') {
      const yachty = V.landmark === 'yachts';
      const nS = Math.round((this.lite ? 8 : 16) * (yachty ? 0.5 : 1)), nY = (this.lite ? 5 : 10) * (yachty ? 4 : 1);
      const spots = [];
      // open water: well off the shore, clear of the circuit, the ring road and the pit area
      const ok = (x, z, l = this.land(x, z)) => l < -20 && l > -650 && this.dist(x, z) > T.half + 45 && !this.kept(x, z) && !(this.onRoad && this.onRoad(x, z, 20));
      let guard = 0;
      while (spots.length < nS + nY && guard++ < 6000) {
        const a = r() * Math.PI * 2, d = r.range(this.radius * 0.3, this.radius + 900);
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, l = this.land(x, z);
        const yacht = spots.length >= nS;
        if (l > (yacht && yachty ? -14 : -30) || l < -600 || !ok(x, z, Math.min(l, -21))) continue;
        if (spots.some(([px, pz]) => Math.hypot(px - x, pz - z) < 30)) continue;
        spots.push([x, z, r() * Math.PI * 2, yacht ? 1 : 0]);
      }
      this.boats = new Boats(spots, this.lite, ok);
      this.scene.add(this.boats.group);
    }
    if (V.water === 'coast' || V.water === 'harbour') {
      const spots = [], n = this.lite ? 40 : 90;
      let guard = 0;
      while (spots.length < n && guard++ < 20000) {
        const a = r() * Math.PI * 2, d = r.range(this.radius * 0.5, this.radius + 1200);
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, l = this.land(x, z);
        if (l > -2 || l < -16 || this.dist(x, z) < T.half + 30) continue;
        spots.push([x, z, r.range(1.8, 5.5) * (r() < 0.15 ? 2 : 1)]);
      }
      if (spots.length) this.scene.add(rocks(spots, this.lite));
    }
    if (this.venue.time !== 'night') {
      this.clouds = new Clouds(cx, cz, this.lite ? 7 : 14, hashString(V.id + 'clouds'), this.venue.time === 'dusk' ? '#ffd9bd' : '#ffffff', this.lite);
      this.scene.add(this.clouds.group);
    }
  }

  buildMountains(r) {
    const V = this.venue; if (V.hills === 'none' && V.landmark !== 'bluemountains') return;
    const [cx, cz] = this.T.centroid;
    const cfg = { low: [10, 40, 90, '#b49a74'], hills: [18, 90, 220, '#5f8a4c'], peaks: [16, 220, 480, '#5a7a58'], snow: [18, 380, 820, '#5b6a62'], alps: [20, 450, 900, '#56705a'] }[V.hills] || [14, 220, 450, '#4f6f62'];
    let [n, h0, h1, base] = cfg;
    if (V.landmark === 'bluemountains') base = '#4f6f88';
    if (V.biome === 'desert' || V.biome === 'dunes') base = '#b39572';
    const snowy = V.hills === 'snow' || V.hills === 'alps';
    const geos = [];
    const avoid = this.waterDir ? Math.atan2(this.waterDir[1], this.waterDir[0]) : null;
    for (let i = 0; i < n * (this.lite ? 0.7 : 1); i++) {
      let a = r() * Math.PI * 2;
      if (avoid !== null) a = avoid + Math.PI + r.range(-1.6, 1.6);
      const d = r.range(1500, 2500), hgt = r.range(h0, h1), rad = hgt * r.range(1.6, 2.8);
      const rockC = V.biome === 'desert' || V.biome === 'dunes' ? '#a5815c' : snowy ? '#6f6a66' : '#8a8070';
      const g = mountainGeo({ h: hgt, r: rad, snow: snowy, base, rock: rockC, seed: Math.floor(r() * 1e6), rings: this.lite ? 5 : 7, segs: this.lite ? 12 : 16 });
      g.translate(cx + Math.cos(a) * d, -4, cz + Math.sin(a) * d);
      geos.push(g);
    }
    if (!geos.length) return;
    const m = mergeGeometries(geos);
    this.scene.add(new THREE.Mesh(m, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  }

  // pick a spot on land at about `dist` metres from the centre, clear of the track
  spot(r, d0, clear, prefer) {
    const [cx, cz] = this.T.centroid;
    for (let t = 0; t < 200; t++) {
      const a = prefer !== undefined ? prefer + r.range(-0.8, 0.8) : r() * Math.PI * 2, d = d0 + t * 6;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (this.dist(x, z) > clear && this.land(x, z) > clear * 0.5 && !this.kept(x, z)) return [x, z];
    }
    return [cx + d0, cz];
  }

  buildLandmark(r) {
    const V = this.venue, S = this.scene, lm = V.landmark;
    const away = this.waterDir ? Math.atan2(this.waterDir[1], this.waterDir[0]) + Math.PI : undefined;
    const toward = this.waterDir ? Math.atan2(this.waterDir[1], this.waterDir[0]) : undefined;
    const vc = (g, f) => { const p = g.attributes.position, c = new Float32Array(p.count * 3), cc = new THREE.Color(); for (let i = 0; i < p.count; i++) { f(cc, p.getX(i), p.getY(i), p.getZ(i)); c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g; };
    if (V.id === 'abuja') this.millennium(r);
    const LM = { lagos, dakar, nairobi, tablemountain: capeTown, tokyo, iceland }, BY = { singapore, shanghai, miami, lasvegas: lasVegas };
    const fn = LM[lm] || BY[V.id];
    if (fn) this.landmarks = fn(this, r);
    if (V.id === 'kigali') this.dome(r);
    if (lm === 'asorock') {
      // a huge granite dome, streaked darker where rain runs down it
      const [x, z] = this.spot(r, this.radius + 300, 230, away);
      const g = new THREE.IcosahedronGeometry(1, 4), p = g.attributes.position, n = this.noise;
      for (let i = 0; i < p.count; i++) {
        const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
        const k = 1 + (n(vx * 2 + 5, vz * 2 + vy) - 0.5) * 0.35;
        p.setXYZ(i, vx * 300 * k, Math.max(-0.2, vy) * 260 * k, vz * 220 * k);
      }
      vc(g, (c, X, Y, Z) => c.set('#8f8172').multiplyScalar(0.75 + 0.35 * n(X / 25, Y / 60) + (Y / 260) * 0.15));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      m.position.set(x, -20, z); m.rotation.y = r() * 6; S.add(m);
    } else if (lm === 'volcano') {
      const mexico = V.id === 'mexico';
      const [x, z] = this.spot(r, mexico ? 1700 : this.radius + 700, 300, away);
      const H = mexico ? 900 : 260, R0 = mexico ? 1800 : 900;
      const g = new THREE.CylinderGeometry(mexico ? 120 : 330, R0, H, 28, 6, true);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < H / 2 - 1) { const k = 1 + (this.noise(p.getX(i) / 150, p.getZ(i) / 150) - 0.5) * 0.25; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } }
      vc(g, (c, X, Y) => { const t = (Y + H / 2) / H; c.set(mexico ? '#6c6a6e' : '#6f8f4f').lerp(col(mexico ? '#f4f6f8' : '#8a7a5a'), clamp((t - (mexico ? 0.7 : 0.55)) * 3, 0, 1)); });
      g.computeVertexNormals(); g.translate(0, H / 2 - 10, 0);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      m.position.set(x, 0, z); S.add(m);
      if (mexico) { // a lazy plume
        const pl = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshLambertMaterial({ color: '#d9d4cf', transparent: true, opacity: 0.55 }));
        pl.scale.set(160, 90, 160); pl.position.set(x + 60, H + 60, z); S.add(pl);
      }
    } else if (lm === 'wheel') {
      const [x, z] = this.spot(r, this.radius * 0.9, 70);
      const g = new THREE.Group(); const R = 38;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.8, 6, 48), new THREE.MeshLambertMaterial({ color: '#e8e8ee' }));
      g.add(rim);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.35, R, 0.35), rim.material); sp.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0); sp.rotation.z = a - Math.PI / 2; g.add(sp);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshLambertMaterial({ color: ['#e8303a', '#f2c230', '#2fb75a', '#2f7bf2'][k % 4] }));
        cab.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); g.add(cab);
      }
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, R + 6, 1.2), new THREE.MeshLambertMaterial({ color: '#b9bcc5' }));
      leg.position.y = -(R + 6) / 2; leg.rotation.z = 0.35; g.add(leg); const leg2 = leg.clone(); leg2.rotation.z = -0.35; g.add(leg2);
      g.position.set(x, R + 6, z); g.rotation.y = r() * 6; S.add(g); this.wheel = g;
    } else if (lm === 'flames') {
      const [x, z] = this.spot(r, this.radius + 260, 120, away);
      const prof = []; for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push(new THREE.Vector2(22 * Math.sin(Math.PI * Math.pow(t, 0.7)) * (1 - t * 0.6) + 2, t * 170)); }
      for (let k = 0; k < 3; k++) {
        const g = new THREE.LatheGeometry(prof, 12);
        vc(g, (c, X, Y) => c.set('#4f6f9a').lerp(col('#ff8a2a'), clamp((Y / 170) * 1.2 - 0.1, 0, 1) * 0.85));
        const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#ff6a10', emissiveIntensity: this.pal.lamps ? 0.35 : 0.05 }));
        const a = k * 2.1; m.position.set(x + Math.cos(a) * 40, this.height(x, z), z + Math.sin(a) * 40); m.scale.setScalar(1 - k * 0.12); S.add(m);
      }
    } else if (lm === 'plateau') {
      // Abidjan: a stepped pyramid among the towers across the lagoon
      const d = (this.farBank || this.radius + 400) + 120;
      const [cx, cz] = this.T.centroid; const a = toward ?? 0;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const steps = [];
      for (let k = 0; k < 7; k++) { const s = 70 - k * 9; const b = new THREE.BoxGeometry(s, 9, s); b.translate(0, 4.5 + k * 9, 0); steps.push(vcolor(b, col(k % 2 ? '#d9cbb3' : '#c4b294'))); }
      const m = new THREE.Mesh(mergeGeometries(steps), new THREE.MeshLambertMaterial({ vertexColors: true }));
      m.position.set(x, 0, z); m.rotation.y = 0.6; S.add(m);
    } else if (lm === 'dunes') {
      const n = this.lite ? 14 : 26, geos = [];
      for (let k = 0; k < n; k++) {
        const [x, z] = this.spot(r, this.radius + r.range(80, 700), 60);
        const g = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        g.scale(r.range(60, 140), r.range(10, 26), r.range(40, 90)); g.rotateY(r() * 3); g.translate(x, -2, z);
        geos.push(vcolor(g, col('#dcc394').multiplyScalar(r.range(0.92, 1.05))));
      }
      const m = mergeGeometries(geos); m.computeVertexNormals();
      S.add(new THREE.Mesh(m, new THREE.MeshLambertMaterial({ vertexColors: true })));
    }
  }

  // Abuja: a slender white spire with a glass pod, standing in the city
  millennium(r) {
    const [x, z] = this.spot(r, this.radius + 170, 110, this.cityAngle);
    const g = [part(new THREE.CylinderGeometry(0.8, 9, 170, 10), '#f4f5f7', 0, 85, 0),
      part(new THREE.SphereGeometry(13, 16, 10), '#5f8fc4', 0, 128, 0),
      part(new THREE.CylinderGeometry(15, 15, 1.4, 24), '#ffffff', 0, 128, 0),
      part(new THREE.CylinderGeometry(22, 26, 14, 20), '#e9eef3', 0, 7, 0),
      part(new THREE.CylinderGeometry(22.4, 22.4, 1.6, 20), '#0f8a4a', 0, 13, 0)];
    const m = new THREE.Mesh(mergeGeometries(g), new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 50 }));
    m.position.set(x, this.height(x, z), z); m.castShadow = true; this.scene.add(m);
  }

  // Kigali: a domed convention centre striped in bright colours
  dome(r) {
    const [x, z] = this.spot(r, this.radius + 150, 90, this.cityAngle);
    const g = new THREE.SphereGeometry(32, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = g.attributes.position, c = new Float32Array(p.count * 3), bands = ['#e8303a', '#f2c230', '#2fb75a', '#1f7bd8', '#ffffff'];
    for (let i = 0; i < p.count; i++) { const q = new THREE.Color(bands[Math.floor((p.getY(i) / 32) * 5) % 5]); c[i * 3] = q.r; c[i * 3 + 1] = q.g; c[i * 3 + 2] = q.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv'); g.scale(1, 1.3, 1);
    const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70 }));
    m.position.set(x, this.height(x, z), z); m.castShadow = true; this.scene.add(m);
  }

  buildCars() {
    this.carObjs = new Map();
    this.geoCache = new Map();
    this.carGroup = new THREE.Group();
    this.scene.add(this.carGroup);
    this.carMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 90, specular: '#6a6f78' });
    this.rainLightMat = new THREE.MeshBasicMaterial({ color: '#ff2a2a' });
    this.rainGeo = new THREE.BoxGeometry(0.1, 0.12, 0.25);
    // the glowing ring under the followed car
    const ring = new THREE.RingGeometry(3.3, 3.75, 48); ring.rotateX(-Math.PI / 2); ring.scale(1.22, 1, 0.78);
    this.ring = new THREE.Mesh(ring.clone(), new THREE.MeshBasicMaterial({ color: '#d4ff3a', transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
    this.ring.renderOrder = 2;
    const halo = new THREE.CircleGeometry(3.3, 40); halo.rotateX(-Math.PI / 2); halo.scale(1.22, 1, 0.78);
    this.halo = new THREE.Mesh(halo, new THREE.MeshBasicMaterial({ color: '#d4ff3a', transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -7 }));
    this.scene.add(this.ring, this.halo);
    // your other car keeps a ring too (same colour, a little softer, gently pulsing), so both are easy to find
    this.mineRings = [0, 1].map(() => {
      const r = new THREE.Mesh(ring.clone(), new THREE.MeshBasicMaterial({ color: '#d4ff3a', transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
      const h = new THREE.Mesh(halo, new THREE.MeshBasicMaterial({ color: '#d4ff3a', transparent: true, opacity: 0.14, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -7 }));
      r.renderOrder = 2; r.visible = h.visible = false; this.scene.add(r, h);
      return { r, h };
    });
    // the safety car: a silver saloon with an orange light bar
    const S = CAR_SCALE, sc = [
      part(new THREE.BoxGeometry(4.6, 0.75, 1.9), '#c9ced6', 0, 0.55, 0),
      part(new THREE.BoxGeometry(2.2, 0.6, 1.7), '#30353d', -0.3, 1.2, 0),
      part(new THREE.BoxGeometry(4.62, 0.12, 1.92), '#e8b100', 0, 0.62, 0),
      ...[[1.5, 0.95], [1.5, -0.95], [-1.5, 0.95], [-1.5, -0.95]].map(([x, z]) => part(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12).rotateX(Math.PI / 2), '#16181c', x, 0.36, z)),
    ];
    this.scCar = new THREE.Group();
    const scBody = new THREE.Mesh(mergeGeometries(sc), this.carMat); scBody.castShadow = true;
    this.scLamps = [new THREE.MeshBasicMaterial({ color: '#ffa31a' }), new THREE.MeshBasicMaterial({ color: '#ffa31a' })];
    const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.7), this.scLamps[0]), l2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.7), this.scLamps[1]);
    l1.position.set(-0.3, 1.58, 0.42); l2.position.set(-0.3, 1.58, -0.42);
    this.scCar.add(scBody, l1, l2); this.scCar.scale.setScalar(S); this.scCar.visible = false;
    this.scene.add(this.scCar);
    // the modelled safety car (art/cars/safety.py, a luxury grand tourer) replaces the box once loaded:
    // it keeps its own colours, and its two roof lamps flash with the same materials
    loadGLB('vehicles/safety/safety').then((root) => {
      if (this.disposed) return;
      root.updateMatrixWorld(true);
      const L = root.getObjectByName(`safety_LOD${this.lite ? 1 : 0}`);
      if (!L) return;
      const inv = L.matrixWorld.clone().invert(), paint = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 110, specular: '#8a9099' });
      const g = new THREE.Group();
      L.traverse((o) => {
        if (!o.isMesh) return;
        const lamp = /lamp_(L|R)/.exec(o.name)?.[1];
        const m = new THREE.Mesh(o.geometry, lamp ? this.scLamps[lamp === 'L' ? 0 : 1] : paint);
        m.applyMatrix4(inv.clone().multiply(o.matrixWorld)); m.castShadow = !lamp;
        g.add(m);
      });
      scBody.visible = l1.visible = l2.visible = false;
      this.scCar.add(g);
    }).catch(() => {});
  }

  setCars(cars) {
    for (const o of this.carObjs.values()) { this.carGroup.remove(o.group); this.scene.remove(o.tag); o.tag.material.map.dispose(); o.tag.material.dispose(); }
    this.carObjs.clear();
    for (const c of cars) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(this.carGeo(c.team), this.carMat);
      body.castShadow = true;
      const rl = new THREE.Mesh(this.rainGeo, this.rainLightMat); rl.position.set(-2.55 * CAR_SCALE, 0.62 * CAR_SCALE, 0);
      // BOOST: two light trails off the back of the car while it deploys the battery
      const trail = new THREE.Group(); trail.visible = false;
      for (const rx of [0, Math.PI / 2]) { const m = new THREE.Mesh(this.trailGeo(), this.trailMat()); m.rotation.x = rx; trail.add(m); }
      g.add(body, rl, trail);
      const tag = this.makeTag(c);
      this.scene.add(tag);
      this.carGroup.add(g);
      this.carObjs.set(c.id, { group: g, body, tag, rl, trail, car: c });
    }
    this.setTeams([...new Map(cars.map((c) => [c.team.id, c.team])).values()]);
    this.teamCar = new Map(cars.filter((c) => c.team.car).map((c) => [c.team.id, c.team.car]));
    this.applyModel();
  }

  // the modelled cars replace the simple ones once their files have loaded (null keeps the simple
  // cars). Each team races its own car (team.car, js/carspec.js); a race without cars uses the
  // picked one for everybody. On phones only a few different models load; the rest borrow yours.
  setModel(id) { this.carModel = id || null; this.applyModel(); }
  modelFor(teamId) {
    const want = this.teamCar?.get(teamId) || this.carModel;
    return this.allowed && !this.allowed.has(want) ? this.carModel : want;
  }
  applyModel() {
    const id = this.carModel, simple = (on) => {
      for (const o of this.carObjs.values()) o.body.visible = on;
      for (const s of this.paddock?.spares || []) s.mesh.visible = on;
    };
    const drop = () => { for (const f of this.fleets.values()) f.dispose(); this.fleets.clear(); };
    this.fleets ||= new Map();
    if (!id) { drop(); simple(true); return; }
    const all = [id, ...new Set([...(this.teamCar?.values() || [])].filter((m) => m && m !== id))];
    this.allowed = this.lite ? new Set(all.slice(0, 5)) : null;
    const ids = this.allowed ? [...this.allowed] : all;
    Promise.all(ids.map((m) => loadCar(m))).then((models) => {
      if (this.disposed || this.carModel !== id) return;
      for (const [k, f] of this.fleets) if (!ids.includes(k)) { f.dispose(); this.fleets.delete(k); }
      models.forEach((m) => { if (!this.fleets.has(m.id)) this.fleets.set(m.id, new Fleet(this, m, CAR_SCALE)); });
      for (const f of this.fleets.values()) f.setGlow({ night: 2.2, dusk: 1.4 }[this.venue.time] || 0.6);
      simple(false);
    }).catch((e) => { console.warn('car model failed to load, keeping the simple cars', e); drop(); simple(true); });
  }

  makeTag(c) {
    const cv = document.createElement('canvas'); cv.width = TAG_W; cv.height = 64;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
    sp.renderOrder = 10; sp.center.set(0.5, 0);
    sp.userData = { cv, tex, key: '', w: 160 };
    return sp;
  }

  // "7 NOVA P8": the car number in a team-coloured chip, the driver's name, then the position. The
  // compact form ("7 P8") is used when tags crowd together or the camera is far away.
  drawTag(o, pos, selected, mine, full) {
    // your cars also show the tyre left, in 5% steps, coloured like the ring under them
    const c0 = o.car, life = mine && !c0.dnf && c0.tyre ? Math.max(0, Math.round((1 - c0.tyre.wear) * 20) * 5) : null;
    const key = pos + '|' + selected + '|' + mine + '|' + full + '|' + life;
    const ud = o.tag.userData; if (ud.key === key) return; ud.key = key;
    const x = ud.cv.getContext('2d'), c = o.car;
    const name = full ? tagName(c.name) : '';
    x.font = '700 25px "Barlow Semi Condensed", system-ui, sans-serif';
    const nameW = name ? Math.ceil(x.measureText(name).width) + 12 : 0;
    x.font = '700 27px "Barlow Semi Condensed", system-ui, sans-serif';
    const posW = Math.ceil(x.measureText('P' + pos).width);
    const tyreTxt = life === null ? '' : life + '%';
    x.font = '700 24px "Barlow Semi Condensed", system-ui, sans-serif';
    const tyreW = tyreTxt ? Math.ceil(x.measureText(tyreTxt).width) + 30 : 0;
    const w = Math.min(TAG_W, 10 + 62 + 10 + nameW + posW + tyreW + 16);
    x.clearRect(0, 0, TAG_W, 64);
    x.fillStyle = selected ? '#d4ff3a' : '#ffffff';
    roundRect(x, 4, 8, w - 8, 46, 12); x.fill();
    if (mine && !selected) { x.strokeStyle = c.team.c1; x.lineWidth = 3; roundRect(x, 5.5, 9.5, w - 11, 43, 11); x.stroke(); }
    x.fillStyle = c.team.c1; roundRect(x, 10, 14, 62, 34, 8); x.fill();
    const lum = (h) => { const q = new THREE.Color(h); return 0.299 * q.r + 0.587 * q.g + 0.114 * q.b; };
    x.fillStyle = lum(c.team.c1) > 0.6 ? '#111827' : '#ffffff';
    x.font = '700 26px "Barlow Semi Condensed", system-ui, sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'center';
    x.fillText(String(c.num ?? ''), 41, 32);
    x.textAlign = 'left';
    if (name) { x.fillStyle = '#111827'; x.font = '700 25px "Barlow Semi Condensed", system-ui, sans-serif'; x.fillText(name, 82, 32); }
    x.fillStyle = name ? '#5b6472' : '#111827'; x.font = '700 27px "Barlow Semi Condensed", system-ui, sans-serif';
    x.fillText('P' + pos, 82 + nameW, 32);
    if (tyreTxt) {
      const tx = 82 + nameW + posW + 12, col = tyreColour(life / 100);
      x.fillStyle = col; x.beginPath(); x.arc(tx + 7, 32, 7, 0, 7); x.fill();
      x.fillStyle = life < 28 ? '#c81e1e' : '#111827'; x.font = '700 24px "Barlow Semi Condensed", system-ui, sans-serif';
      x.fillText(tyreTxt, tx + 18, 32);
    }
    ud.w = w;
    ud.tex.repeat.set(w / TAG_W, 1); ud.tex.needsUpdate = true;
  }

  // the ring under one of your cars drains like a gauge as its tyres wear, and changes colour;
  // anyone else's car (when you follow it) gets the full ring in the usual lime
  gauge(ring, c) {
    const life = c && c.tyre && !c.dnf ? clamp(1 - c.tyre.wear, 0, 1) : 1, geo = ring.geometry;
    const segs = 48, n = Math.max(1, Math.round(segs * life));
    if (geo.userData.n !== n) { geo.userData.n = n; geo.setDrawRange(0, n * 6); }
    ring.material.color.set(c ? tyreColour(life) : '#d4ff3a');
    // under 15% the ring flashes: a puncture is close
    ring.userData.blink = !!c && life < 0.15;
    if (ring.userData.blink) ring.material.opacity = Math.sin(performance.now() / 120) > 0 ? 0.95 : 0.2;
  }

  // keep tags from piling on top of each other: the followed car first, then yours, then by
  // position; a tag that would overlap one already placed shrinks to its compact form, and if it
  // still overlaps (and isn't one of yours) it is hidden for now
  viewH() { return this.renderer.domElement.clientHeight || innerHeight; }

  declutter(list, camera, W, H) {
    list.sort((a, b) => a.rank - b.rank);
    const placed = [], v = new THREE.Vector3();
    const hit = (r) => placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0);
    for (const t of list) {
      v.copy(t.o.tag.position).project(camera);
      if (v.z > 1) { t.o.tag.visible = false; continue; }
      const sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * H, h = t.hPx;
      const rect = (wPx) => ({ x0: sx - wPx / 2, x1: sx + wPx / 2, y0: sy - h, y1: sy });
      let full = t.wantFull, r;
      if (full) { this.drawTag(t.o, t.pos, t.sel, t.mine, true); r = rect(h * t.o.tag.userData.w / 64 * 0.86); if (hit(r)) full = false; }
      if (!full) { this.drawTag(t.o, t.pos, t.sel, t.mine, false); r = rect(h * t.o.tag.userData.w / 64 * 0.86); if (hit(r) && !t.key) { t.o.tag.visible = false; continue; } }
      // your own cars always keep a tag: lift it above the one it would cover
      let lift = 0;
      while (hit(r) && lift < 3) { lift++; r = { ...r, y0: r.y0 - h * 0.8, y1: r.y1 - h * 0.8 }; }
      t.o.tag.center.y = -lift * 0.8;
      t.o.tag.scale.set(t.scaleY * t.o.tag.userData.w / 64, t.scaleY, 1);
      placed.push(r);
    }
  }

  buildFx() {
    // rain streaks around the camera
    const n = this.lite ? 700 : 1800, pos = new Float32Array(n * 6);
    this.rainN = n; this.rainBase = new Float32Array(n * 3);
    const r = rng(7);
    for (let i = 0; i < n; i++) { this.rainBase[i * 3] = r.range(-70, 70); this.rainBase[i * 3 + 1] = r.range(0, 60); this.rainBase[i * 3 + 2] = r.range(-70, 70); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#c9d6e6', transparent: true, opacity: 0.0, depthWrite: false }));
    this.rainLines.frustumCulled = false;
    this.scene.add(this.rainLines);
    // spray behind cars
    const sn = this.lite ? 300 : 800;
    this.spray = { n: sn, p: new Float32Array(sn * 3), v: new Float32Array(sn * 3), life: new Float32Array(sn), k: 0 };
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(this.spray.p, 3));
    this.sprayPts = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#e6edf5', size: 1.6, transparent: true, opacity: 0, depthWrite: false }));
    this.sprayPts.frustumCulled = false;
    this.scene.add(this.sprayPts);
    // sparks: the plank kissing the track at top speed over the bumps of a long straight
    const kn = this.lite ? 120 : 360;
    this.sparks = { n: kn, p: new Float32Array(kn * 3), v: new Float32Array(kn * 3), life: new Float32Array(kn), k: 0 };
    const kg = new THREE.BufferGeometry(); kg.setAttribute('position', new THREE.BufferAttribute(this.sparks.p, 3));
    this.sparkPts = new THREE.Points(kg, new THREE.PointsMaterial({ color: '#ffb347', size: 0.55, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparkPts.frustumCulled = false;
    this.scene.add(this.sparkPts);
  }

  setWeather(rain, wet) {
    const P = this.pal, grey = col('#8e98a4'), k = clamp(rain * 1.1, 0, 0.85);
    const top = col(P.top).lerp(grey.clone().multiplyScalar(0.7), k), hor = col(P.hor).lerp(grey, k);
    const p = this.skyGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = clamp(p.getY(i) / 4000, 0, 1), c = hor.clone().lerp(top, Math.pow(t, 0.55));
      this.skyCols[i * 3] = c.r; this.skyCols[i * 3 + 1] = c.g; this.skyCols[i * 3 + 2] = c.b;
    }
    this.skyGeo.attributes.color.needsUpdate = true;
    const [fc, fn, ff] = this.fogBase;
    this.scene.fog.color.copy(col(fc).lerp(grey, k));
    this.scene.fog.near = fn * (1 - 0.82 * k); this.scene.fog.far = ff * (1 - 0.75 * k);
    this.sun.intensity = P.sunI * (1 - 0.65 * k);
    this.hemi.intensity = P.hemi * (1 - 0.2 * k);
    this.trackMat.shininess = 8 + 80 * wet;
    this.trackMat.specular.setScalar(0.12 + 0.45 * wet);
    this.trackMat.color.setScalar(1 - 0.28 * wet);
    this.weatherKey = [rain, wet];
  }

  // the boost trail: a streak that fades from the car backwards, drawn additive so it glows
  trailGeo() {
    if (!this._trailGeo) { const geo = new THREE.PlaneGeometry(9 * CAR_SCALE, 0.9 * CAR_SCALE); geo.translate(-2.6 * CAR_SCALE - 4.5 * CAR_SCALE, 0.6 * CAR_SCALE, 0); this._trailGeo = geo; }
    return this._trailGeo;
  }
  trailMat() {
    if (!this._trailMat) {
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 16; const x = cv.getContext('2d');
      const gr = x.createLinearGradient(128, 0, 0, 0); gr.addColorStop(0, 'rgba(200,255,90,1)'); gr.addColorStop(0.25, 'rgba(110,247,255,.75)'); gr.addColorStop(1, 'rgba(110,247,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 128, 16);
      const v = x.createLinearGradient(0, 0, 0, 16); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
      x.globalCompositeOperation = 'destination-out'; x.fillStyle = v; x.fillRect(0, 0, 128, 16);
      this._trailMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    }
    return this._trailMat;
  }

  // place cars: alpha blends between the last two simulation steps
  update(race, alpha, dt, camera, selectedId, mineIds, showTags, { speed = 1, focus = null, showRing = true } = {}) {
    const T = this.T;
    this.camera = camera;
    if (!this.lastWeather || Math.abs(this.lastWeather[0] - race.rain) > 0.02 || Math.abs(this.lastWeather[1] - race.wet) > 0.02) {
      this.setWeather(race.rain, race.wet); this.lastWeather = [race.rain, race.wet];
    }
    let mr = 0;
    const blink = race.wet > 0.15 && Math.floor(performance.now() / 250) % 2 === 0;
    this.rainLightMat.color.set(blink ? '#ff2a2a' : '#3a0a0a');
    const tags = [];
    for (const c of race.cars) {
      const o = this.carObjs.get(c.id); if (!o) continue;
      const boosting = c.ersMode === 'deploy' && c.ers > 0.01 && !c.pit && !c.dnf && !race.done && c.v > 30;
      if (o.trail.visible !== boosting) o.trail.visible = boosting;
      if (boosting) o.trail.scale.x = 0.75 + 0.25 * Math.sin(performance.now() / 45 + c.i);
      let d = c.prevDist + (c.dist - c.prevDist) * alpha, lat = c.prevLat + (c.lat - c.prevLat) * alpha, stopYaw = 0;
      // a stopped car: the engine leaves its last step's positions behind (and a crash puts it in the
      // wall in one step), so blending between them would rock it back and forth for good. Slide it
      // once from where it was drawn to where it stopped, then hold it still.
      if (c.dnf) {
        const st = o.stop ||= { lat0: o.lastLat ?? c.lat, k: o.lastLat === undefined ? 1 : 0, side: Math.sign(c.lat - (o.lastLat ?? c.lat)) || 1 };
        st.k = Math.min(1, st.k + dt * Math.max(1, speed) * 1.5);
        const e = 1 - (1 - st.k) ** 3;
        d = c.dist; lat = st.lat0 + (c.lat - st.lat0) * e;
        if (c.out === 'crash') stopYaw = st.side * 0.55 * e;
      } else o.stop = null;
      o.lastLat = lat;
      sampleTrack(T, d, lat, tmp);
      const g = o.group;
      g.visible = !(c.dnf && c.cleared) && !this.hideCars?.has(c.id); // marshals have taken it away
      g.position.set(tmp.x, c.stopT > 0 ? 0.11 : 0.02, tmp.z);   // up on the jacks during a stop
      // after the flag the podium celebration drives the top three itself (js/ceremony.js)
      const pose = this.carPose?.get(c.id);
      if (pose) { g.position.set(pose.x, 0.02, pose.z); g.rotation.y = pose.ry; o.body.rotation.set(0, 0, 0); o.body.position.y = 0; o.tag.visible = false; continue; }
      const dl = (c.lat - c.prevLat) / 0.05;
      let yaw = c.dnf ? stopYaw : Math.atan2(dl, Math.max(c.v, 3)) * 0.8;
      if (c.pit && !c.dnf) {
        // in the pit lane the nose points where the car is going, so turning into the box and out of it
        // reads as driving; standing still, it settles straight
        const dd = c.dist - c.prevDist, dla = c.lat - c.prevLat;
        const want = Math.hypot(dd, dla) > 0.004 ? clamp(Math.atan2(dla, Math.max(dd, 0.0001)), -1.2, 1.2) : 0;
        o.pyaw = (o.pyaw ?? want) + (want - (o.pyaw ?? want)) * Math.min(1, dt * Math.max(1, speed) * 7);
        yaw = o.pyaw;
      } else o.pyaw = undefined;
      g.rotation.y = -Math.atan2(tmp.tz, tmp.tx) - yaw;
      // the body on its springs: it leans out of a corner, dips its nose under braking and squats
      // as it accelerates, and skips a little over the kerbs (looks only: the race engine decides)
      if (dt > 0 && !c.dnf) {
        const N = T.N, ix = Math.floor(((d % N) + N) % N), kk = T.k[ix] || 0;
        const ay = Math.min(36, c.v * c.v * Math.abs(kk));
        const dv = o.v0 === undefined ? 0 : (c.v - o.v0) / dt; o.v0 = c.v;
        o.ax = (o.ax || 0) + (clamp(dv, -60, 30) - (o.ax || 0)) * Math.min(1, dt * 6);
        o.roll = (o.roll || 0) + (-Math.sign(kk) * ay * 0.0011 - (o.roll || 0)) * Math.min(1, dt * 5);
        const kerb = Math.abs(lat) > T.half - 1.2 && Math.abs(kk) > 0.004 && c.v > 20 ? Math.sin(performance.now() * 0.09 + c.i) * 0.035 : 0;
        o.body.rotation.x = o.roll + kerb * 0.6;
        o.body.rotation.z = clamp(o.ax * 0.0007, -0.035, 0.018);
        o.body.position.y = Math.abs(kerb);
      }
      o.tag.visible = showTags && !c.dnf;
      if (o.tag.visible) {
        // tags keep one size on screen, like a broadcast graphic; hide the ones right under the lens
        const dcam = camera.position.distanceTo(g.position);
        const far = dcam > 170, sel = c.id === selectedId, mine = mineIds.includes(c.id), key = sel || mine;
        const phone = camera.aspect < 0.8, H = this.viewH();
        // about the same size in pixels on every screen (30 to 46 px for the sprite)
        const px = clamp(H * 0.05, phone ? 30 : 34, 46) * (key ? 1.1 : 1) * (far ? 0.82 : 1);
        const k = px / H * 2 * Math.tan(camera.fov * Math.PI / 360) / 0.04;
        // from far away only the followed cars, yours and the top three keep a tag
        o.tag.visible = dcam > 14 && (!far || key || c.pos <= 3);
        o.tag.position.set(g.position.x, 2.8, g.position.z);
        // names when the camera is close enough; on a phone only for your cars
        const wantFull = key || (!far && dcam < 110 && !phone);
        if (o.tag.visible) tags.push({ o, pos: c.pos, sel, mine, key, wantFull, scaleY: 0.04 * k, hPx: px, rank: sel ? -2 : mine ? -1 : c.pos });
      }
      if (c.id === selectedId) {
        this.gauge(this.ring, mineIds.includes(c.id) ? c : null);
        this.ring.position.set(g.position.x, 0.14, g.position.z); this.ring.rotation.y = g.rotation.y;
        this.halo.position.copy(this.ring.position); this.halo.rotation.y = g.rotation.y;
      } else if (mineIds.includes(c.id) && g.visible && mr < 2) {
        const { r, h } = this.mineRings[mr++];
        this.gauge(r, c);
        r.position.set(g.position.x, 0.14, g.position.z); r.rotation.y = g.rotation.y;
        h.position.copy(r.position); h.rotation.y = g.rotation.y;
        r.visible = h.visible = true;
      }
    }
    if (tags.length) this.declutter(tags, camera, this.viewH() * camera.aspect, this.viewH());
    // no ring on an empty patch of track once the marshals have taken a stopped car away
    const selCar = selectedId && race.byId.get(selectedId);
    this.ring.visible = this.halo.visible = !!selCar && showRing && !(selCar.dnf && selCar.cleared);
    for (let i = mr; i < 2; i++) this.mineRings[i].r.visible = this.mineRings[i].h.visible = false;
    if (mr) { const k = 0.5 + 0.5 * Math.sin(performance.now() / 260); for (const { r, h } of this.mineRings) { if (!r.userData.blink) r.material.opacity = 0.62 + 0.3 * k; h.material.opacity = 0.1 + 0.08 * k; } }
    // safety car on track, lights flashing
    const sc = race.sc && race.sc.kind === 'SC' ? race.sc : null;
    this.scCar.visible = !!sc;
    if (sc) {
      sampleTrack(T, sc.dist, T.ideal[Math.floor(((sc.dist % T.L) + T.L) % T.L)] * 0.4, tmp);
      this.scCar.position.set(tmp.x, 0.02, tmp.z); this.scCar.rotation.y = -Math.atan2(tmp.tz, tmp.tx);
      const ph = Math.floor(performance.now() / 180) % 2;
      this.scLamps[0].color.set(ph ? '#ffb020' : '#4a2a00'); this.scLamps[1].color.set(ph ? '#4a2a00' : '#ffb020');
    }
    if (this.paddock) this.paddock.update(race, dt, speed);
    this.boats?.update(dt * speed); this.clouds?.update(dt * speed);
    if (this.landmarks) for (const l of this.landmarks) l.update(dt * speed);
    this.stands?.update(dt * speed, this.cheer || 0, this.crowdLight);
    if (this.fleets?.size) {
      const lists = this.fleetLists ||= new Map();
      for (const k of this.fleets.keys()) { if (!lists.has(k)) lists.set(k, []); lists.get(k).length = 0; }
      const add = (team, item) => (lists.get(this.modelFor(team.id)) || lists.get(this.carModel))?.push(item);
      for (const c of race.cars) { const o = this.carObjs.get(c.id); if (o) add(c.team, { id: c.id, group: o.group, c1: c.team.c1, c2: c.team.c2, glow: c.team.glow, finish: c.team.finish, selected: c.id === selectedId, empty: !!this.emptyCars?.has(c.id) }); }
      for (const s of this.paddock?.spares || []) add(s.team, { id: 'spare-' + s.team.id, group: s.mesh, c1: s.team.c1, c2: s.team.c2, glow: s.team.glow, finish: s.team.finish, static: true });
      for (const [k, f] of this.fleets) f.update(lists.get(k), camera, dt * speed);
    }
    // keep the sun's shadow box around what the camera looks at
    if (focus) {
      this.sun.target.position.copy(focus);
      this.sun.position.copy(focus).addScaledVector(this.sunDir, 700);
    }
    if (this.wheel) this.wheel.rotation.z += dt * 0.05;
    // rain streaks
    const ro = clamp(race.rain * 1.4, 0, 0.75);
    this.rainLines.material.opacity = ro * 0.6;
    this.rainLines.visible = ro > 0.02;
    if (this.rainLines.visible) {
      const pos = this.rainLines.geometry.attributes.position.array, cp = camera.position, t = performance.now() / 1000;
      const nShow = Math.floor(this.rainN * clamp(race.rain * 1.3, 0.15, 1));
      for (let i = 0; i < this.rainN; i++) {
        const b = i * 3, o = i * 6;
        if (i >= nShow) { pos[o] = pos[o + 3] = 0; pos[o + 1] = pos[o + 4] = -999; pos[o + 2] = pos[o + 5] = 0; continue; }
        const y = 60 - ((this.rainBase[b + 1] + t * 34) % 60);
        const x = cp.x + this.rainBase[b], z = cp.z + this.rainBase[b + 2], yy = cp.y - 25 + y;
        pos[o] = x; pos[o + 1] = yy; pos[o + 2] = z; pos[o + 3] = x + 0.3; pos[o + 4] = yy + 1.6; pos[o + 5] = z + 0.2;
      }
      this.rainLines.geometry.attributes.position.needsUpdate = true;
    }
    // spray
    const S = this.spray, sprayOn = race.wet > 0.25;
    this.sprayPts.material.opacity = clamp((race.wet - 0.2) * 0.9, 0, 0.55);
    this.sprayPts.visible = sprayOn;
    if (sprayOn) {
      for (const c of race.cars) {
        if (c.v < 25 || c.pit) continue;
        const o = this.carObjs.get(c.id); if (!o) continue;
        const rate = this.lite ? 0.4 : 1;
        if (Math.random() > rate) continue;
        const k = S.k = (S.k + 1) % S.n, gp = o.group.position, ry = o.group.rotation.y;
        const bx = Math.cos(-ry), bz = Math.sin(-ry);
        S.p[k * 3] = gp.x - bx * 3.2 + (Math.random() - 0.5) * 2; S.p[k * 3 + 1] = 0.5; S.p[k * 3 + 2] = gp.z - bz * 3.2 + (Math.random() - 0.5) * 2;
        S.v[k * 3] = bx * c.v * 0.3 + (Math.random() - 0.5) * 3; S.v[k * 3 + 1] = 1.5 + Math.random() * 2.5; S.v[k * 3 + 2] = bz * c.v * 0.3 + (Math.random() - 0.5) * 3;
        S.life[k] = 0.9;
      }
      for (let k = 0; k < S.n; k++) {
        if (S.life[k] <= 0) { S.p[k * 3 + 1] = -999; continue; }
        S.life[k] -= dt;
        S.p[k * 3] += S.v[k * 3] * dt; S.p[k * 3 + 1] += S.v[k * 3 + 1] * dt; S.p[k * 3 + 2] += S.v[k * 3 + 2] * dt;
        S.v[k * 3] *= 0.96; S.v[k * 3 + 2] *= 0.96;
      }
      this.sprayPts.geometry.attributes.position.needsUpdate = true;
    }
    // sparks, on a dry track only
    const K = this.sparks, dry = race.wet < 0.15 && dt > 0;
    if (dry) {
      for (const c of race.cars) {
        if (c.v < 66 || c.pit || c.dnf || Math.random() > (this.lite ? 0.12 : 0.3)) continue;
        const N = T.N, ix = Math.floor(((c.dist % N) + N) % N); if (!T.straight[ix]) continue;
        const o = this.carObjs.get(c.id); if (!o) continue;
        const gp = o.group.position, ry = o.group.rotation.y, bx = Math.cos(-ry), bz = Math.sin(-ry);
        for (let j = 0; j < 3; j++) {
          const k = K.k = (K.k + 1) % K.n;
          K.p[k * 3] = gp.x - bx * 1.2; K.p[k * 3 + 1] = 0.12; K.p[k * 3 + 2] = gp.z - bz * 1.2;
          K.v[k * 3] = -bx * (6 + Math.random() * 10) + (Math.random() - 0.5) * 4; K.v[k * 3 + 1] = 1 + Math.random() * 3; K.v[k * 3 + 2] = -bz * (6 + Math.random() * 10) + (Math.random() - 0.5) * 4;
          K.life[k] = 0.25 + Math.random() * 0.2;
        }
      }
    }
    let live = 0;
    for (let k = 0; k < K.n; k++) {
      if (K.life[k] <= 0) { K.p[k * 3 + 1] = -999; continue; }
      live++; K.life[k] -= dt;
      K.v[k * 3 + 1] -= 9.8 * dt;
      K.p[k * 3] += K.v[k * 3] * dt; K.p[k * 3 + 1] = Math.max(0.05, K.p[k * 3 + 1] + K.v[k * 3 + 1] * dt); K.p[k * 3 + 2] += K.v[k * 3 + 2] * dt;
    }
    this.sparkPts.visible = live > 0;
    if (live) this.sparkPts.geometry.attributes.position.needsUpdate = true;
  }

  setLights(n, green) {
    this.lightsMat.forEach((m, k) => m.color.set(green ? '#103010' : k < n ? '#ff1f1f' : '#2a0c0c'));
  }

  // the pit box of a team, for the pit camera
  boxPoint(teamBox, lat = 0) {
    const s = this.T.pit.box[teamBox];
    return sampleTrack(this.T, s, this.T.pit.lat + lat, {});
  }

  // what can stand between the Live camera and the cars: buildings, the paddock, stands, trees,
  // landmarks. Rebuilt when the paddock is (each race). Flat things (ground, track, water) are left out.
  occluders() {
    if (this.occ && this.occFor === this.paddock) return this.occ;
    const out = [], bb = new THREE.Box3(), skip = new Set([this.carGroup, this.ring, this.halo, this.rainLines, this.sprayPts, this.sky, this.clouds?.group, this.scCar]);
    const crew = new Set(this.paddock ? [this.paddock.bodies, this.paddock.helmets, ...Object.values(this.paddock.figs || {}), ...Object.values(this.paddock.kitM || {}), this.paddock.hoses] : []);
    this.scene.traverse((o) => {
      if (skip.has(o) || crew.has(o) || !(o.isMesh) || o.isSprite) return;
      for (let p = o.parent; p; p = p.parent) if (skip.has(p)) return;
      const g = o.geometry; if (!g) return;
      if (!g.boundingBox) g.computeBoundingBox();
      if (g.boundingBox.max.y - g.boundingBox.min.y < (o.isInstancedMesh ? 1.5 : 3)) return;
      out.push(o);
    });
    this.occ = out; this.occFor = this.paddock;
    return out;
  }

  dispose() {
    this.disposed = true; for (const f of this.fleets?.values() || []) f.dispose(); this.carShared?.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    });
  }
}

function roundRect(x, a, b, w, h, r) {
  x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
}
