// Life at the side of the track: sponsor boards on the barriers, sponsor gantries over the long
// straights, the Agent Grand Prix logo painted on the run-off, and fans on their feet at the
// fences with flags. The sponsors are invented. Everything is drawn on canvases; no images.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sampleTrack } from './track.js';
import { standingCrowd } from './env.js';

// invented sponsors: name, mark, background, ink, accent
export const SPONSORS = [
  ['AGENT GRAND PRIX', 'chev', '#0b1430', '#ffffff', '#d4ff3a'],
  ['VOLTARA ENERGY', 'bolt', '#ffd21f', '#111827', '#111827'],
  ['SAHELO AIR', 'wing', '#ffffff', '#123a8f', '#e8303a'],
  ['NJANGI PAY', 'ring', '#0f8a4a', '#ffffff', '#ffd21f'],
  ['BARAKA WATER', 'drop', '#e9f6ff', '#0b5fae', '#1aa3e8'],
  ['MOSI CHRONO', 'dial', '#111827', '#f2f2f2', '#e8303a'],
  ['KOLA RUSH', 'chev', '#d8262c', '#ffffff', '#ffd21f'],
  ['NOVENIQE', 'ring', '#2b1a5c', '#ffffff', '#9b8cff'],
];
const ROWS = SPONSORS.length;
const FLAG_COLS = ['#e8303a', '#ffd21f', '#0f8a4a', '#1f4fd1', '#ffffff', '#ff5a1f', '#9b8cff', '#d4ff3a', '#111827'];

function mark(x, kind, cx, cy, s, c) {
  x.fillStyle = c; x.strokeStyle = c; x.lineWidth = s * 0.16; x.lineJoin = 'round';
  x.beginPath();
  if (kind === 'chev') { for (const o of [0, s * 0.55]) { x.moveTo(cx - s * 0.6 + o, cy - s * 0.5); x.lineTo(cx - s * 0.15 + o, cy); x.lineTo(cx - s * 0.6 + o, cy + s * 0.5); } x.stroke(); }
  else if (kind === 'bolt') { x.moveTo(cx + s * 0.15, cy - s * 0.6); x.lineTo(cx - s * 0.35, cy + s * 0.08); x.lineTo(cx, cy + s * 0.08); x.lineTo(cx - s * 0.15, cy + s * 0.6); x.lineTo(cx + s * 0.35, cy - s * 0.08); x.lineTo(cx, cy - s * 0.08); x.closePath(); x.fill(); }
  else if (kind === 'wing') { x.moveTo(cx - s * 0.6, cy + s * 0.3); x.quadraticCurveTo(cx, cy - s * 0.7, cx + s * 0.6, cy - s * 0.3); x.quadraticCurveTo(cx, cy - s * 0.1, cx - s * 0.6, cy + s * 0.3); x.fill(); }
  else if (kind === 'ring') { x.arc(cx, cy, s * 0.45, 0, 7); x.stroke(); x.beginPath(); x.arc(cx, cy, s * 0.14, 0, 7); x.fill(); }
  else if (kind === 'drop') { x.moveTo(cx, cy - s * 0.6); x.quadraticCurveTo(cx + s * 0.5, cy + s * 0.05, cx, cy + s * 0.5); x.quadraticCurveTo(cx - s * 0.5, cy + s * 0.05, cx, cy - s * 0.6); x.fill(); }
  else if (kind === 'dial') { x.arc(cx, cy, s * 0.45, 0, 7); x.stroke(); x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx, cy - s * 0.3); x.moveTo(cx, cy); x.lineTo(cx + s * 0.22, cy + s * 0.1); x.stroke(); }
}

// one canvas, a row per sponsor
function atlas() {
  const W = 1024, H = 128, cv = document.createElement('canvas'); cv.width = W; cv.height = H * ROWS;
  const x = cv.getContext('2d');
  SPONSORS.forEach(([name, kind, bg, ink, acc], i) => {
    const y = i * H;
    x.fillStyle = bg; x.fillRect(0, y, W, H);
    x.fillStyle = acc; x.fillRect(0, y + H - 10, W, 10);
    x.font = 'italic 800 76px "Barlow Semi Condensed", system-ui, sans-serif'; x.textBaseline = 'middle';
    const tw = Math.min(W - 200, x.measureText(name).width), x0 = (W - tw - 110) / 2;
    mark(x, kind, x0 + 40, y + H / 2 - 4, 70, acc === bg ? ink : acc);
    x.fillStyle = ink; x.textAlign = 'left'; x.fillText(name, x0 + 110, y + H / 2 - 2, W - 200);
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// the logo painted on the run-off
function logoTexture() {
  const W = 1024, H = 320, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  x.fillStyle = '#0b1430'; x.beginPath(); x.roundRect(8, 8, W - 16, H - 16, 40); x.fill();
  mark(x, 'chev', 150, H / 2, 150, '#d4ff3a');
  x.fillStyle = '#ffffff'; x.font = 'italic 800 118px "Barlow Semi Condensed", system-ui, sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'left';
  x.fillText('AGENT', 280, H / 2 - 62);
  x.fillStyle = '#d4ff3a'; x.fillText('GRAND PRIX', 280, H / 2 + 62, W - 310);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

const tmp = {};
// a quad strip along the track at lateral `lat`, from s0 to s1; `face` makes the text read for
// someone on the track looking out at it. Returns position/uv arrays appended to `out`.
function strip(T, s0, s1, lat, y0, y1, row, out, flat = null) {
  const n = Math.max(2, Math.ceil((s1 - s0) / 3)), sg = Math.sign(lat) || 1;
  sampleTrack(T, (s0 + s1) / 2, lat, tmp);
  // the viewer looks outward (along the lateral normal times sg); their right is (-dz, dx)
  const dx = -tmp.tz * sg, dz = tmp.tx * sg, flip = (-dz * tmp.tx + dx * tmp.tz) < 0;
  const v0 = 1 - (row + 1) / ROWS + 0.004, v1 = 1 - row / ROWS - 0.004;
  const base = out.pos.length / 3;
  for (let k = 0; k <= n; k++) {
    const s = s0 + (s1 - s0) * k / n, u = flip ? 1 - k / n : k / n;
    if (flat) {
      sampleTrack(T, s, flat[0], tmp); out.pos.push(tmp.x, y0, tmp.z);
      sampleTrack(T, s, flat[1], tmp); out.pos.push(tmp.x, y0, tmp.z);
    } else {
      sampleTrack(T, s, lat, tmp);
      out.pos.push(tmp.x, y0, tmp.z, tmp.x, y1, tmp.z);
    }
    out.uv.push(u, row < 0 ? 0 : v0, u, row < 0 ? 1 : v1);
    if (k) { const a = base + (k - 1) * 2; out.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
}
const geoOf = (o) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
  g.setIndex(o.idx); g.computeVertexNormals(); return g;
};

export class Trackside {
  constructor(world, r) {
    this.world = world;
    const T = world.T, V = world.venue, L = T.L, P = T.pit, h = T.half, lite = world.lite, night = !!world.pal.lamps;
    const runoff = world.runoff, lat = h + runoff + 0.6, wallH = V.street ? 1.4 : 1.1;
    const tex = this.tex = atlas();
    const mat = (m) => new THREE.MeshLambertMaterial({ map: m, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: m, emissiveIntensity: night ? 0.55 : 0.12, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const curv = (s) => Math.abs(T.k[((Math.floor(s) % L) + L) % L]);

    // 1. boards on the track side of the barriers, on the straighter parts, two colours of
    //    sponsor in turn so a run of boards reads like a real circuit
    const boards = { pos: [], uv: [], idx: [] }, max = lite ? 140 : 320;
    const pitA = P.inS - 30, pitB = P.outS + 30;
    const onPitGap = (s) => { const q = ((s % L) + L) % L; return pitA < 0 ? (q > pitA + L || q < pitB) : (q > pitA && q < pitB); };
    // runs of three boards of one sponsor, a gap, the next sponsor; spread evenly round the lap
    const cand = [];
    let row = Math.floor(r() * ROWS);
    for (const sd of [P.side, -P.side]) {
      for (let s = 30; s < L - 30; s += 6) {
        if (Math.floor(s / 6) % 4 === 3) { row = (row + 1 + Math.floor(r() * 2)) % ROWS; continue; }
        if (sd === P.side && onPitGap(s + 6)) continue;
        if (curv(s) > 1 / 300 || curv(s + 12) > 1 / 300) continue;
        cand.push([s, sd, row]);
      }
    }
    const runs = [];
    for (const c of cand) { const last = runs[runs.length - 1]; if (last && last[0][1] === c[1] && last[0][2] === c[2] && c[0] - last[last.length - 1][0] === 6) last.push(c); else runs.push([c]); }
    const keepRuns = Math.max(1, Math.round(runs.length * Math.min(1, max / Math.max(1, cand.length))));
    let made = 0;
    for (let k = 0; k < keepRuns; k++) for (const [s, sd, rw] of runs[Math.floor(k * runs.length / keepRuns)]) {
      strip(T, s + 0.1, s + 5.9, sd * (lat - 0.34), 0.12, wallH - 0.14, rw, boards);
      made++;
    }
    this.info = { boards: made };
    if (made) this.scene(this.boards = new THREE.Mesh(geoOf(boards), mat(tex)));

    // 2. sponsor gantries over the two longest straights (not the start line)
    const straights = [];
    let run0 = null;
    for (let s = 0; s <= L; s += 4) {
      const ok = curv(s) < 1 / 500;
      if (ok && run0 === null) run0 = s;
      if ((!ok || s >= L) && run0 !== null) { if (s - run0 > 160) straights.push([run0, s]); run0 = null; }
    }
    straights.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
    const spots = [];
    for (const [a, b] of straights) {
      if (spots.length >= 2) break;
      const s = a + (b - a) * 0.42;
      if (s < 140 || s > L - 140 || (s > P.inS - 60 && s < P.outS + 60)) continue;
      if (V.id === 'nairobi' && Math.abs(s - Math.min(L * 0.12, 260)) < 80) continue;
      spots.push(s);
    }
    this.info.gantries = spots.slice();
    spots.forEach((s, i) => this.gantry(s, (i * 3 + 1 + Math.floor(r() * 3)) % ROWS, mat));

    // 3. the logo on the run-off at the slowest corners (tarmac there), and fans at those fences
    const corners = [];
    for (let i = 0; i < T.N; i += 8) corners.push([i, Math.abs(T.k[i])]);
    corners.sort((a, b) => b[1] - a[1]);
    const used = [];
    for (const [i] of corners) {
      if (used.length >= (lite ? 3 : 5)) break;
      if (used.some((u) => Math.min(Math.abs(u - i), T.N - Math.abs(u - i)) < 220)) continue;
      if (i > P.inS - 80 && i < P.outS + 80) continue;
      if ((world.standCorners || []).some((u) => Math.min(Math.abs(u - i), T.N - Math.abs(u - i)) < 140)) continue;
      used.push(i);
    }
    this.info.corners = used;
    if (!V.street && runoff > 6) {
      const logo = { pos: [], uv: [], idx: [] };
      used.slice(0, lite ? 2 : 3).forEach((i) => {
        const out = -Math.sign(T.k[i]) || 1, s = i + 10;
        strip(T, s - 9, s + 9, out * (h + 2), 0.045, 0.045, -1, logo, [out * (h + 2.2), out * (h + runoff - 1.4)]);
      });
      const lm = new THREE.MeshLambertMaterial({ map: logoTexture(), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      if (logo.pos.length) { const m = new THREE.Mesh(geoOf(logo), lm); m.receiveShadow = true; this.scene(m); }
    }

    // fans on their feet behind the fence at those corners, some waving flags
    const fans = [], flags = [], per = lite ? 0.55 : 0.85;
    used.forEach((i) => {
      const out = -Math.sign(T.k[i]) || 1;
      for (let s = i - 45; s < i + 45; s += 0.9) {
        if (onPitGap(s)) continue;
        for (let row2 = 0; row2 < (lite ? 2 : 3); row2++) {
          if (r() > per - row2 * 0.15) continue;
          sampleTrack(T, s + r() * 0.5, out * (lat + 1.1 + row2 * 1.1 + r() * 0.3), tmp);
          fans.push([tmp.x, 0, tmp.z, tmp.tz * out, -tmp.tx * out]);
          if (r() < 0.14) flags.push([tmp.x, tmp.z, Math.atan2(tmp.tx, tmp.tz), FLAG_COLS[Math.floor(r() * FLAG_COLS.length)]]);
        }
      }
      sampleTrack(T, i, out * (lat + 3), tmp); world.keep.push([tmp.x, tmp.z, 52]);
    });
    if (fans.length) { this.crowd = standingCrowd(fans, r, world); this.scene(this.crowd); }
    if (flags.length) this.flags(flags);
  }

  scene(o) { this.world.scene.add(o); }

  gantry(s, row, mat) {
    const T = this.world.T, half = T.half + 2.6, tint = (g, c) => { g = g.toNonIndexed(); g.deleteAttribute('uv'); const a = new Float32Array(g.attributes.position.count * 3), cc = new THREE.Color(c); for (let i = 0; i < a.length; i += 3) { a[i] = cc.r; a[i + 1] = cc.g; a[i + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    const A = {}, B = {}; sampleTrack(T, s, half, A); sampleTrack(T, s, -half, B);
    const hd = Math.atan2(A.tz, A.tx), parts = [];
    for (const p of [A, B]) parts.push(tint(new THREE.BoxGeometry(0.7, 9, 0.7).translate(p.x, 4.5, p.z), '#cfd3d9'));
    const w = Math.hypot(A.x - B.x, A.z - B.z);
    const span = new THREE.BoxGeometry(1.1, 1.9, w + 0.7); span.rotateY(-hd); span.translate((A.x + B.x) / 2, 8.3, (A.z + B.z) / 2);
    parts.push(tint(span, '#cfd3d9'));
    const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = !this.world.lite; this.scene(m);
    // the banner on both faces, read by cars coming either way
    for (const side of [1, -1]) {
      const g = new THREE.PlaneGeometry(w * 0.92, 1.6);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (row + 1 - uv.getY(i)) / ROWS + (uv.getY(i) > 0.5 ? -0.004 : 0.004));
      const p = new THREE.Mesh(g, mat(this.tex));
      p.position.set((A.x + B.x) / 2 - A.tx * 0.57 * side, 8.3, (A.z + B.z) / 2 - A.tz * 0.57 * side);
      p.rotation.y = Math.atan2(-A.tx * side, -A.tz * side);
      this.scene(p);
    }
  }

  flags(list) {
    const W = 1.0, H = 0.62, g = new THREE.PlaneGeometry(W, H, 4, 1); g.translate(W / 2 + 0.02, 2.55, 0);
    const pole = new THREE.CylinderGeometry(0.018, 0.018, 1.3, 4); pole.translate(0, 2.2, 0);
    this.u = { uTime: { value: 0 } };
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.u.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float fx = clamp((transformed.x - 0.02) / ${W.toFixed(2)}, 0.0, 1.0);
        float ph = uTime * 7.0 - transformed.x * 3.0 + float(gl_InstanceID) * 2.1;
        transformed.z += sin(ph) * 0.16 * fx;
        transformed.x += sin(uTime * 2.3 + float(gl_InstanceID)) * 0.12 * (transformed.y - 1.5);`);
    };
    mat.customProgramCacheKey = () => 'agp-fan-flag';
    const fm = new THREE.InstancedMesh(g, mat, list.length), pm = new THREE.InstancedMesh(pole, new THREE.MeshLambertMaterial({ color: '#3b3f46' }), list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
    list.forEach(([x, z, a, hex], i) => {
      q.setFromAxisAngle(up, a); m4.compose(v.set(x, 0, z), q, one);
      fm.setMatrixAt(i, m4); pm.setMatrixAt(i, m4); fm.setColorAt(i, c.set(hex));
    });
    fm.frustumCulled = false;
    this.scene(fm); this.scene(pm);
  }

  update(dt, cheer, light) {
    if (this.u) this.u.uTime.value += dt;
    if (!this.crowd) return;
    const u = this.crowd.material.uniforms;
    u.uTime.value += dt; u.uCheer.value += (cheer - u.uCheer.value) * Math.min(1, dt * 3);
    if (light) u.uLight.value.copy(light);
  }
}
