// Grandstands and the crowd. A stand is swept along the circuit: stepped concrete tiers, rows of
// seats in blocks of colour, aisles with yellow nosings, a cantilever roof on masts and ties. Fans
// sit one to a seat. Each fan is a flat shaped figure that turns to face the camera (two
// triangles), drawn by the shader: head, hair or cap, shirt, arms, trousers. They stand, bounce
// and throw their arms up when the race gets exciting.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sampleTrack } from './track.js';

const tmp = {};
const col = (h) => new THREE.Color(h);
const K = 1.3;            // the world is drawn a little larger than life (cars too)
const D = 0.85 * K;       // depth of a tier
const H = 0.42 * K;       // rise of a tier
const PITCH = 0.52 * K;   // seat to seat
const FRONT = 2.4;        // height of the front wall
const AISLE = 18;         // metres between aisles

// sweep a 2D profile [[lat, y], ...] along the track: one strip per profile segment, flat across it
export function sweep(T, ss, prof, colorFn) {
  const pos = [], cols = [], idx = [];
  let base = 0;
  for (let j = 0; j < prof.length - 1; j++) {
    const [la, ya] = prof[j], [lb, yb] = prof[j + 1];
    ss.forEach((s, i) => {
      sampleTrack(T, s, la, tmp); pos.push(tmp.x, ya, tmp.z);
      sampleTrack(T, s, lb, tmp); pos.push(tmp.x, yb, tmp.z);
      const c = colorFn(j, s, i);
      cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (i > 0) { const k = base + i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
    });
    base += ss.length * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// a flat polygon across the track direction at s (the end walls of a stand): rects [[la, lb, y0, y1], ...]
function cap(T, s, rects, c) {
  const pos = [], cols = [];
  for (const [la, lb, y0, y1] of rects) {
    sampleTrack(T, s, la, tmp); const ax = tmp.x, az = tmp.z;
    sampleTrack(T, s, lb, tmp); const bx = tmp.x, bz = tmp.z;
    pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
    for (let k = 0; k < 6; k++) cols.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

// a square beam between two points
function beam(a, b, w, c) {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(w, len, w);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q); g.translate(a.x, a.y, a.z);
  const n = g.attributes.position.count, cc = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { cc[i * 3] = c.r; cc[i * 3 + 1] = c.g; cc[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); g.deleteAttribute('uv');
  return g;
}

// one seat: back and pan, shaded, the rest cut away
function seatTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  const back = x.createLinearGradient(0, 0, 0, 44);
  back.addColorStop(0, '#ffffff'); back.addColorStop(1, '#c4c4c4');
  x.fillStyle = back; rr(x, 7, 2, 50, 42, 9); x.fill();
  x.fillStyle = '#8a8a8a'; rr(x, 5, 42, 54, 14, 5); x.fill();   // the pan, seen edge-on below
  x.fillStyle = 'rgba(255,255,255,0.35)'; rr(x, 12, 6, 40, 5, 2.5); x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
function rr(x, a, b, w, h, r) {
  x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
}

const SCHEMES = [
  ['#1f4fd1', '#1f4fd1', '#e9edf2'], ['#d62839', '#d62839', '#f2f2f2'], ['#f2c230', '#1b1d22', '#f2c230'],
  ['#14967a', '#e9edf2', '#14967a'], ['#2a6fdb', '#f08a24', '#2a6fdb'], ['#7a2fd1', '#7a2fd1', '#e9edf2'],
];
const SHIRTS = ['#e8303a', '#1f4fd1', '#f2c230', '#2fb75a', '#ffffff', '#f4f4f4', '#151515', '#ef6fa6', '#f08a24', '#6cc0ea', '#8b3fd1', '#c1d82f', '#0f7a5a', '#b8202f', '#ffd9a0'];
const PANTS = ['#1d2b4a', '#2b3f66', '#191a1d', '#6b5a43', '#3a3f47', '#d8d2c4', '#4a5a7a'];
const HATS = ['#e8303a', '#ffffff', '#151515', '#1f4fd1', '#f2c230', '#2fb75a'];
// skin tones from deep to light; the venue's region weights them
const SKIN = ['#3b2219', '#4e2d1f', '#6b4029', '#8a5636', '#a86f48', '#c48a5f', '#d9a57c', '#ecc3a0', '#f3d6bd'];
const SKIN_W = {
  africa: [5, 6, 5, 3, 1.2, 0.6, 0.4, 0.4, 0.3],
  mixed: [1, 1.4, 1.6, 1.8, 2, 2, 2, 2, 1.6],
  asia: [0.2, 0.3, 0.6, 1, 2, 3, 4, 3.5, 2],
  europe: [0.4, 0.6, 0.8, 1, 1.4, 1.8, 3, 4, 4],
};
function skinWeights(region = '') {
  if (/Africa/.test(region)) return SKIN_W.africa;
  if (/Asia/.test(region)) return SKIN_W.asia;
  if (/Europe/.test(region)) return SKIN_W.europe;
  return SKIN_W.mixed;
}
const pickW = (r, w) => { let t = r() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) { t -= w[i]; if (t <= 0) return i; } return w.length - 1; };

export class Stands {
  // specs: [{ s0, s1, lat0, dir, rows }]
  constructor(world, r, specs) {
    this.world = world;
    const T = world.T, lite = world.lite, night = !!world.pal.lamps;
    const body = [], seats = { pos: [], uv: [], col: [], idx: [] }, glow = [];
    const fans = [];
    const concrete = col('#c9cdd3'), riser = col('#a9aeb7'), under = col('#8e949d'), steel = col('#d9dde3'), dark = col('#5d636c');
    const roofTop = col('#eef0f3'), roofUnder = col('#a7adb6'), fascia = col('#f7f8fa'), band = col('#1b1d22');
    const aisleC = col('#e4e6ea'), nose = col('#f2c230');
    const weights = skinWeights(world.venue.region);
    specs.forEach((sp, si) => {
      const { s0, s1, lat0, dir, rows } = sp;
      const scheme = SCHEMES[(Math.floor(r() * SCHEMES.length) + si) % SCHEMES.length].map(col);
      const ss = []; for (let s = s0; s < s1; s += 2) ss.push(s); ss.push(s1);
      const la = (q) => lat0 + dir * q * D, ya = (q) => FRONT + q * H;
      const backLat = la(rows) + dir * 0.4, top = ya(rows - 1) + H;
      // the tiers: front wall, then tread / riser, then the back wall
      const prof = [[lat0 - dir * 0.3, 0], [lat0 - dir * 0.3, FRONT], [lat0, FRONT]];
      for (let q = 0; q < rows; q++) { prof.push([la(q + 1), ya(q)]); if (q < rows - 1) prof.push([la(q + 1), ya(q + 1)]); }
      prof.push([la(rows), top + 2.4], [backLat, top + 2.4], [backLat, 0]);
      const panel = (s) => Math.floor((s - s0) / 6) % 2 ? col('#1f4fd1') : col('#eef0f3');
      body.push(sweep(T, ss, prof, (j, s) => j === 0 ? panel(s) : j === 1 ? fascia : j === prof.length - 2 ? under : j >= prof.length - 4 ? riser : ((j - 2) % 2 === 0 ? concrete : riser)));
      // ends of the stand
      const rects = [[lat0 - dir * 0.3, lat0, 0, FRONT]];
      for (let q = 0; q < rows; q++) rects.push([la(q), la(q + 1), 0, ya(q)]);
      rects.push([la(rows), backLat, 0, top + 2.4]);
      body.push(cap(T, s0, rects, under), cap(T, s1, rects, under));
      // the roof: a thin cantilever reaching past the front row, rising toward the track
      const rb = top + 5.2, rf = rb + 1.4, front = lat0 - dir * 2.2, back = backLat + dir * 0.5;
      body.push(sweep(T, ss, [[front, rf - 0.55], [front, rf], [back, rb], [back, rb - 0.5], [front, rf - 0.55]],
        (j) => [fascia, roofTop, roofUnder, roofUnder][j]));
      body.push(sweep(T, ss, [[front - dir * 0.02, rf - 0.42], [front - dir * 0.02, rf - 0.28]], () => band));
      if (night) glow.push(sweep(T, ss, [[front + dir * 0.4, rf - 0.6], [front + dir * 1.4, rf - 0.62]], () => col('#fff3d6')));
      // masts at the back, ties out to the roof's front edge, and a beam under each tie
      for (let s = s0 + 4; s < s1 - 2; s += 12) {
        sampleTrack(T, s, back, tmp); const pb = new THREE.Vector3(tmp.x, 0, tmp.z);
        const mast = pb.clone().setY(rf + 4.2);
        sampleTrack(T, s, front + dir * 0.2, tmp); const pf = new THREE.Vector3(tmp.x, rf + 0.02, tmp.z);
        body.push(beam(pb, mast, 0.55, steel), beam(mast, pf, 0.16, steel));
        sampleTrack(T, s, back, tmp); const ub = new THREE.Vector3(tmp.x, rb - 0.5, tmp.z);
        sampleTrack(T, s, front, tmp); const uf = new THREE.Vector3(tmp.x, rf - 0.55, tmp.z);
        body.push(beam(ub, uf, 0.32, steel));
      }
      // aisles: lighter steps with yellow nosings, and the seat blocks between them
      const aisles = [];
      for (let s = s0 + AISLE * 0.5; s < s1 - 4; s += AISLE) aisles.push(s);
      for (const a of aisles) for (let q = 0; q < rows; q++) {
        body.push(sweep(T, [a - 0.7, a + 0.7], [[la(q), ya(q) + 0.012], [la(q + 1), ya(q) + 0.012]], () => aisleC));
        body.push(sweep(T, [a - 0.7, a + 0.7], [[la(q) + dir * 0.02, ya(q) + 0.02], [la(q) + dir * 0.16, ya(q) + 0.02]], () => nose));
      }
      const edges = [s0 + 0.6, ...aisles.flatMap((a) => [a - 0.8, a + 0.8]), s1 - 0.6];
      for (let b = 0; b < edges.length; b += 2) {
        const b0 = edges[b], b1 = edges[b + 1]; if (b1 - b0 < PITCH * 2) continue;
        const n = Math.floor((b1 - b0) / PITCH), w = n * PITCH, c0 = b0 + (b1 - b0 - w) / 2;
        for (let q = 0; q < rows; q++) {
          // blocks alternate colours; a band of the third colour runs through the middle rows
          const c = q === Math.floor(rows / 2) ? scheme[2] : scheme[(b / 2) % 2 ? 1 : 0];
          const sl = la(q) + dir * D * 0.8, y0 = ya(q) + 0.02, y1 = y0 + 0.62 * K;
          const base = seats.pos.length / 3;
          let m = 0;
          for (let s = c0; s <= c0 + w + 1e-6; s += Math.min(2, w)) {
            const ss2 = Math.min(s, c0 + w);
            sampleTrack(T, ss2, sl, tmp);
            seats.pos.push(tmp.x, y0, tmp.z, tmp.x, y1, tmp.z);
            const u = (ss2 - c0) / PITCH;
            seats.uv.push(u, 0, u, 1);
            seats.col.push(c.r, c.g, c.b, c.r, c.g, c.b);
            if (m > 0) { const k = base + m * 2; seats.idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
            m++;
            if (ss2 >= c0 + w) break;
          }
          // the fans in this row
          for (let i = 0; i < n; i++) {
            if (r() > (sp.full ?? 0.86)) continue;
            const s = c0 + (i + 0.5) * PITCH;
            sampleTrack(T, s, la(q) + dir * D * 0.56, tmp);
            fans.push([tmp.x, ya(q), tmp.z, -dir * -tmp.tz, -dir * tmp.tx]);
          }
        }
      }
    });
    // the concrete and steel, one mesh
    const flat = body.map((b) => b.index ? b.toNonIndexed() : b);
    const g = mergeGeometries(flat); body.forEach((b) => b.dispose());
    this.body = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.body.castShadow = !lite; this.body.receiveShadow = true;
    world.scene.add(this.body);
    if (glow.length) { const gg = mergeGeometries(glow.map((b) => b.toNonIndexed())); glow.forEach((b) => b.dispose()); world.scene.add(new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }))); }
    // the seats
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(seats.pos, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(seats.uv, 2));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(seats.col, 3));
    sg.setIndex(seats.idx); sg.computeVertexNormals();
    this.seats = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ vertexColors: true, map: seatTexture(), alphaTest: 0.5, side: THREE.DoubleSide }));
    this.seats.receiveShadow = true;
    world.scene.add(this.seats);
    // the crowd
    const cap2 = lite ? 2600 : 9000;
    const keep = fans.length > cap2 ? fans.filter((_, i) => (i * cap2) % fans.length < cap2) : fans;
    this.crowd = makeCrowd(keep, r, weights, world);
    world.scene.add(this.crowd);
  }

  update(dt, cheer, light) {
    const u = this.crowd.material.uniforms;
    u.uTime.value += dt; u.uCheer.value += (cheer - u.uCheer.value) * Math.min(1, dt * 3);
    if (light) u.uLight.value.copy(light);
  }
}

function makeCrowd(fans, r, weights, world) {
  const n = fans.length;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const P = new Float32Array(n * 3), F = new Float32Array(n * 2), S = new Float32Array(n * 3), Sk = new Float32Array(n * 3), Pa = new Float32Array(n * 3), M = new Float32Array(n * 4);
  const c = new THREE.Color();
  fans.forEach((f, i) => {
    P.set([f[0], f[1], f[2]], i * 3); F.set([f[3], f[4]], i * 2);
    c.set(SHIRTS[Math.floor(r() * SHIRTS.length)]); S.set([c.r, c.g, c.b], i * 3);
    c.set(SKIN[pickW(r, weights)]); Sk.set([c.r, c.g, c.b], i * 3);
    c.set(PANTS[Math.floor(r() * PANTS.length)]); Pa.set([c.r, c.g, c.b], i * 3);
    const hat = r() < 0.22 ? (1 + Math.floor(r() * HATS.length)) : 0;
    M.set([r(), hat, r() * 0.25 + 0.9, r()], i * 4);   // seed, hat colour (0 none), size, hair shade
  });
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(P, 3));
  g.setAttribute('iFace', new THREE.InstancedBufferAttribute(F, 2));
  g.setAttribute('iShirt', new THREE.InstancedBufferAttribute(S, 3));
  g.setAttribute('iSkin', new THREE.InstancedBufferAttribute(Sk, 3));
  g.setAttribute('iPants', new THREE.InstancedBufferAttribute(Pa, 3));
  g.setAttribute('iMisc', new THREE.InstancedBufferAttribute(M, 4));
  g.instanceCount = n;
  const hatCols = HATS.map((h) => new THREE.Color(h));
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uCheer: { value: 0 }, uLight: { value: new THREE.Color(1, 1, 1) },
      uHats: { value: hatCols },
    }]),
    fog: true,
    vertexShader: /* glsl */`
      attribute vec3 iPos; attribute vec2 iFace; attribute vec3 iShirt; attribute vec3 iSkin; attribute vec3 iPants; attribute vec4 iMisc;
      uniform float uTime; uniform float uCheer;
      varying vec2 vP; varying vec3 vShirt; varying vec3 vSkin; varying vec3 vPants; varying vec4 vMisc; varying float vUp; varying float vFront;
      #include <fog_pars_vertex>
      float hash(float x) { return fract(sin(x * 127.1) * 43758.5453); }
      void main() {
        float seed = iMisc.x;
        // who is up: a few at any time, most of them when the race is exciting; waves pass along the stand
        float slot = floor(uTime * 0.45 + seed * 7.0);
        float wave = 0.5 + 0.5 * sin(iPos.x * 0.05 + iPos.z * 0.05 - uTime * 1.6);
        float up = step(hash(seed * 91.7 + slot), 0.04 + 0.8 * uCheer * (0.55 + 0.45 * wave));
        float bounce = up * abs(sin(uTime * (6.0 + seed * 3.0) + seed * 40.0)) * 0.14;
        vUp = up;
        vec3 toCam = cameraPosition - iPos; toCam.y = 0.0;
        vec2 tc = normalize(toCam.xz + 1e-4);
        vFront = step(0.0, dot(tc, iFace));
        vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + 1e-4);
        float sz = iMisc.z;
        vec2 q = vec2((position.x - 0.5) * 1.1, position.y * 2.25) * sz;
        vP = vec2((position.x - 0.5) * 1.1, position.y * 2.25);
        vec3 wp = iPos + right * q.x + vec3(0.0, q.y + bounce, 0.0);
        vShirt = iShirt; vSkin = iSkin; vPants = iPants; vMisc = iMisc;
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLight; uniform vec3 uHats[6];
      varying vec2 vP; varying vec3 vShirt; varying vec3 vSkin; varying vec3 vPants; varying vec4 vMisc; varying float vUp; varying float vFront;
      #include <fog_pars_fragment>
      float box(vec2 p, vec2 c, vec2 h, float r) { vec2 d = abs(p - c) - h + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
      float seg(vec2 p, vec2 a, vec2 b, float r) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
      void main() {
        vec2 p = vP;
        float lift = vUp * 0.36;
        // standing up stretches the legs; everything above the lap rises
        float legTop = 0.64 + lift;
        vec2 u = vec2(p.x, p.y > 0.6 ? p.y - lift : p.y);
        if (p.y > 0.6 && p.y < 0.6 + lift) u.y = 0.6;
        float dLeg = box(p, vec2(0.0, legTop * 0.5), vec2(0.2, legTop * 0.5), 0.07);
        float dLap = box(u, vec2(0.0, 0.66), vec2(0.25, 0.09), 0.08);
        float dTorso = box(u, vec2(0.0, 1.0), vec2(0.26, 0.3), 0.13);
        float dNeck = box(u, vec2(0.0, 1.33), vec2(0.06, 0.05), 0.02);
        vec2 hc = vec2(0.0, 1.5);
        float dHead = length((u - hc) * vec2(1.0, 0.92)) - 0.16;
        float s = sign(p.x); float ax = abs(p.x);
        vec2 au = vec2(ax, u.y);
        vec2 sh = vec2(0.24, 1.2);
        vec2 hand = mix(vec2(0.31, 0.8), vec2(0.42 + 0.04 * sin(vMisc.x * 30.0), 1.8), vUp);
        float dArm = seg(au, sh, hand, 0.07);
        float dHand = length(au - hand) - 0.075;
        float d = min(min(min(dLeg, dLap), min(dTorso, dNeck)), min(min(dHead, dArm), dHand));
        if (d > 0.0) discard;
        vec3 c = vPants * (0.8 + 0.2 * smoothstep(0.0, 0.5, p.y));
        if (dLap < 0.0) c = vPants;
        if (dTorso < 0.0) c = vShirt * (0.82 + 0.18 * (1.0 - ax / 0.3));
        if (dNeck < 0.0) c = vSkin * 0.85;
        // arms hang in front of the body; raised arms are sleeves then skin
        if (dArm < 0.0) c = mix(vShirt * 0.9, vSkin, vUp * smoothstep(1.35, 1.5, u.y));
        if (dHand < 0.0) c = vSkin;
        if (dHead < 0.0) {
          vec3 hair = mix(vec3(0.04, 0.035, 0.03), vec3(0.32, 0.2, 0.1), step(0.85, vMisc.w));
          c = vSkin * (0.92 + 0.1 * (1.0 - length(u - hc) / 0.16));
          float hairLine = hc.y + 0.05 - 0.04 * cos(p.x * 9.0);
          if (vFront < 0.5 || u.y > hairLine) c = hair;
          int h = int(vMisc.y + 0.5);
          if (h > 0) {
            vec3 hat = uHats[h - 1];
            if (u.y > hc.y + 0.04) c = hat;
          }
        }
        // a soft dark edge gives the figures some roundness
        c *= 0.72 + 0.28 * smoothstep(0.0, -0.035, d);
        gl_FragColor = vec4(c * uLight, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}
