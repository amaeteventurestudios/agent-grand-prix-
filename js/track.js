// Original circuit generator. A seeded ring of control points becomes a smooth closed
// centripetal Catmull-Rom loop, resampled every metre. Layouts that cross themselves,
// pinch too tight or lack a main straight for the pits are thrown away and retried.
// No Three.js here, so Node can generate and test tracks.
import { rng, clamp } from './rng.js';

const A_LAT = 33;      // cornering grip, m/s² (about 3.4 g)
const BRAKE = 40;      // braking, m/s²
const VMAX = 86;       // top speed, m/s (310 km/h)

function catmull(p0, p1, p2, p3, t, alpha = 0.5) {
  const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-4, alpha);
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const L = (a, b, ta, tb) => [
    ((tb - u) * a[0] + (u - ta) * b[0]) / (tb - ta),
    ((tb - u) * a[1] + (u - ta) * b[1]) / (tb - ta),
  ];
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
  return L(B1, B2, t1, t2);
}

function resample(pts, step) {
  const n = pts.length, cum = [0];
  for (let i = 1; i <= n; i++) {
    const a = pts[i - 1], b = pts[i % n];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[n], N = Math.round(total / step), out = [];
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = (i / N) * total;
    while (cum[j + 1] < s) j++;
    const a = pts[j], b = pts[(j + 1) % n], f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

function attempt(r, opt) {
  const n = r.int(8, 12), R = opt.size;
  const sx = r.range(1, 1.45), sz = r.range(0.75, 1);
  const ctrl = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.32, 0.32) * (Math.PI * 2 / n);
    const rad = R * r.range(0.5, 1);
    ctrl.push([Math.cos(a) * rad * sx, Math.sin(a) * rad * sz]);
  }
  // A long straight: pull one pair of neighbours out to the same radius in a line.
  const k0 = r.int(0, n - 1), k1 = (k0 + 1) % n;
  const rr = R * r.range(0.95, 1.1);
  const a0 = Math.atan2(ctrl[k0][1] / sz, ctrl[k0][0] / sx), a1 = Math.atan2(ctrl[k1][1] / sz, ctrl[k1][0] / sx);
  ctrl[k0] = [Math.cos(a0) * rr * sx, Math.sin(a0) * rr * sz];
  ctrl[k1] = [Math.cos(a1) * rr * sx, Math.sin(a1) * rr * sz];

  const dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
    for (let s = 0; s < 40; s++) dense.push(catmull(p0, p1, p2, p3, s / 40));
  }
  let pts = resample(dense, 1);
  // A few smoothing passes take out kinks the spline leaves behind.
  for (let pass = 0; pass < 6; pass++) {
    const N = pts.length, q = new Array(N);
    for (let i = 0; i < N; i++) {
      const a = pts[(i - 3 + N) % N], b = pts[i], c = pts[(i + 3) % N];
      q[i] = [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4];
    }
    pts = q;
  }
  pts = resample(pts, 1);
  const N = pts.length;
  if (N < opt.minLen || N > opt.maxLen) return null;

  // heading and curvature
  const head = new Float32Array(N), k = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
    head[i] = Math.atan2(b[1] - a[1], b[0] - a[0]);
  }
  const kr = new Float32Array(N);
  for (let i = 0; i < N; i++) kr[i] = wrapA(head[(i + 3) % N] - head[(i - 3 + N) % N]) / 6;
  for (let i = 0; i < N; i++) {
    let s = 0; for (let j = -6; j <= 6; j++) s += kr[(i + j + N) % N];
    k[i] = s / 13;
  }
  let maxK = 0; for (let i = 0; i < N; i++) maxK = Math.max(maxK, Math.abs(k[i]));
  if (maxK > 1 / opt.minRadius) return null;
  // Total turning must be one loop (no figure eights).
  let turn = 0; for (let i = 0; i < N; i++) turn += wrapA(head[(i + 1) % N] - head[i]);
  if (Math.abs(Math.abs(turn) - Math.PI * 2) > 0.2) return null;

  // clearance between parts of the track that are far apart along the lap
  const cell = 50, grid = new Map();
  for (let i = 0; i < N; i += 2) {
    const key = Math.floor(pts[i][0] / cell) + ',' + Math.floor(pts[i][1] / cell);
    (grid.get(key) || grid.set(key, []).get(key)).push(i);
  }
  for (let i = 0; i < N; i += 3) {
    const cx = Math.floor(pts[i][0] / cell), cz = Math.floor(pts[i][1] / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = grid.get((cx + dx) + ',' + (cz + dz)); if (!list) continue;
      for (const j of list) {
        let d = Math.abs(i - j); d = Math.min(d, N - d);
        if (d < 120) continue;
        if (Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) < opt.clear) return null;
      }
    }
  }

  // longest straight
  const flat = (i) => Math.abs(k[(i + N) % N]) < 1 / 450;
  let best = 0, bestStart = 0;
  for (let i = 0; i < N; i++) {
    if (!flat(i) || flat(i - 1)) continue;
    let len = 0; while (len < N && flat(i + len)) len++;
    if (len > best) { best = len; bestStart = i; }
  }
  if (best === N) return null;
  if (best < opt.minStraight) return null;
  return { pts, k, head, straightStart: bestStart, straightLen: best };
}

export function generateTrack(seed, venue = {}) {
  const street = !!venue.street;
  const opt = {
    size: 300, minLen: 1900, maxLen: 3300, minRadius: street ? 16 : 20,
    clear: street ? 42 : 52, minStraight: 330,
  };
  let raw = null, tries = 0, s = seed;
  while (!raw && tries < 400) {
    raw = attempt(rng(s), opt);
    tries++; s = (s * 1664525 + 1013904223) >>> 0;
    if (tries === 200) { opt.minStraight = 280; opt.minRadius -= 3; }
  }
  if (!raw) throw new Error('no track');
  const { pts, straightStart, straightLen } = raw;
  const N = pts.length;
  // Rotate so index 0 is the start line, 62% of the way down the main straight.
  const startIdx = (straightStart + Math.round(straightLen * 0.62)) % N;
  const rot = (arr) => { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = arr[(i + startIdx) % N]; return o; };
  const x = new Float32Array(N), z = new Float32Array(N);
  for (let i = 0; i < N; i++) { x[i] = pts[(i + startIdx) % N][0]; z[i] = pts[(i + startIdx) % N][1]; }
  const k = rot(raw.k), head = rot(raw.head);
  const tx = new Float32Array(N), tz = new Float32Array(N);
  for (let i = 0; i < N; i++) { tx[i] = Math.cos(head[i]); tz[i] = Math.sin(head[i]); }

  // base speed profile at grip 1
  const vmax = VMAX * (venue.vmax || 1);
  const v = new Float32Array(N);
  for (let i = 0; i < N; i++) v[i] = Math.min(vmax, Math.sqrt(A_LAT / Math.max(Math.abs(k[i]), 1e-5)));
  const accel = (sp) => 13 * (1 - sp / (vmax * 1.05)) + 1.5;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < N; i++) { // forward: traction limit
      const a = (i - 1 + N) % N;
      v[i] = Math.min(v[i], Math.sqrt(v[a] * v[a] + 2 * accel(v[a])));
    }
    for (let i = N - 1; i >= 0; i--) { // backward: braking limit
      const b = (i + 1) % N;
      v[i] = Math.min(v[i], Math.sqrt(v[b] * v[b] + 2 * BRAKE));
    }
  }
  let lapTime = 0; for (let i = 0; i < N; i++) lapTime += 1 / v[i];

  // racing line: drift to the inside of corners, smoothed so cars turn in early
  const raw2 = new Float32Array(N);
  for (let i = 0; i < N; i++) raw2[i] = Math.sign(k[i]) * clamp(Math.abs(k[i]) * 220, 0, 1) * 3.4;
  const ideal = new Float32Array(N);
  for (let i = 0; i < N; i++) { let s2 = 0; for (let j = -40; j <= 40; j += 2) s2 += raw2[(i + j + N) % N]; ideal[i] = s2 / 41; }
  const straight = new Uint8Array(N);
  for (let i = 0; i < N; i++) straight[i] = Math.abs(k[i]) < 1 / 260 && v[i] > 60 ? 1 : 0;

  // centroid and bounds
  let cx = 0, cz = 0, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < N; i++) {
    cx += x[i]; cz += z[i];
    minX = Math.min(minX, x[i]); maxX = Math.max(maxX, x[i]); minZ = Math.min(minZ, z[i]); maxZ = Math.max(maxZ, z[i]);
  }
  cx /= N; cz /= N;

  // pit lane along the main straight, on the outside of the lap
  const width = street ? 12 : 15, half = width / 2;
  const nx0 = -tz[0], nz0 = tx[0];
  const side = ((x[0] + nx0 * 30 - cx) ** 2 + (z[0] + nz0 * 30 - cz) ** 2) > ((x[0] - nx0 * 30 - cx) ** 2 + (z[0] - nz0 * 30 - cz) ** 2) ? 1 : -1;
  const before = Math.round(straightLen * 0.62), after = straightLen - before;
  const inS = -Math.round(before * 0.62), outS = Math.round(after * 0.62);
  // the first box sits far enough down the lane for a car to slow from the entry and move across
  const boxSpacing = Math.min(16, Math.floor((outS - inS - 80) / 9));
  const boxStart = inS + 48;
  const box = []; for (let t = 0; t < 10; t++) box.push(boxStart + t * boxSpacing);
  // two lanes, as in a real pit lane: the fast lane by the pit wall, where cars drive at the limit,
  // and the working lane in front of the garages, where each car stops in its own box only
  const pit = { side, inS, outS, box, lat: side * (half + 15), fast: side * (half + 8.6), speed: 30 };

  // corners: the slowest point of each braking zone, numbered round the lap (Turn 1, Turn 2...)
  const apex = [];
  for (let i = 0; i < N; i++) {
    const a = v[(i - 1 + N) % N], c = v[(i + 1) % N];
    if (v[i] <= a && v[i] < c && v[i] < vmax * 0.85 && (!apex.length || i - apex[apex.length - 1] > 25)) apex.push(i);
  }
  const turnAt = new Int16Array(N).fill(-1);
  apex.forEach((ai, n) => { for (let j = -30; j <= 6; j++) turnAt[(ai + j + N) % N] = n; });

  return {
    seed, N, L: N, x, z, tx, tz, k, v, ideal, straight, lapTime, width, half, vmax, apex, turnAt,
    centroid: [cx, cz], bounds: { minX, maxX, minZ, maxZ }, pit, tries, street,
  };
}

// position at a fractional distance along the lap (m), with a lateral offset (m, + is left)
export function sampleTrack(T, s, lat, out) {
  const N = T.N;
  s = ((s % N) + N) % N;
  const i = Math.floor(s), j = (i + 1) % N, f = s - i;
  const tx = T.tx[i] + (T.tx[j] - T.tx[i]) * f, tz = T.tz[i] + (T.tz[j] - T.tz[i]) * f;
  const l = Math.hypot(tx, tz) || 1;
  out.tx = tx / l; out.tz = tz / l;
  out.x = T.x[i] + (T.x[j] - T.x[i]) * f - out.tz * lat;
  out.z = T.z[i] + (T.z[j] - T.z[i]) * f + out.tx * lat;
  return out;
}

export const idx = (T, s) => ((Math.floor(s) % T.N) + T.N) % T.N;

// A driver's own speed plan: the same calculation as the track's, with that driver's share of the
// car's cornering grip, braking and traction (Driver DNA, js/dna.js simInputs), on a car with its
// own strengths (js/carspec.js carMods: cornering grip, braking and corner entry, top speed). All shares stay within
// the car's limits; a Balanced driver in a neutral car gets the track's own plan back.
const ONE = { lateral: 1, brake: 1, exit: 1, entry: 1 }, NEUTRAL = { lateral: 1, brake: 1, entry: 1, top: 1 };
export function driverPlan(T, d, m) {
  d ||= ONE; m ||= NEUTRAL;
  if (d.lateral === 1 && d.brake === 1 && d.exit === 1 && d.entry === 1 && m.lateral === 1 && m.brake === 1 && m.entry === 1 && m.top === 1) return { v: T.v, lapTime: T.lapTime };
  T.plans ||= new Map();
  const key = [d.lateral, d.brake, d.exit, d.entry, m.lateral, m.brake, m.entry, m.top].map((x) => x.toFixed(4)).join(':');
  if (T.plans.has(key)) return T.plans.get(key);
  const N = T.N, k = T.k, vmax = T.vmax * m.top, v = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let c = Math.sqrt(A_LAT * d.lateral * m.lateral / Math.max(Math.abs(k[i]), 1e-5));
    // entry: on the way into a corner (it is tightening) the driver carries more or less speed
    if (Math.abs(k[(i + 6) % N]) > Math.abs(k[i]) * 1.05) c *= d.entry * m.entry;
    v[i] = Math.min(vmax, c);
  }
  // a car with more top speed also pulls harder down the straights
  const accel = (sp) => (13 * (1 - sp / (vmax * 1.05)) + 1.5) * d.exit * (1 + (m.top - 1) * 2);
  const brake = BRAKE * d.brake * m.brake;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < N; i++) { const a = (i - 1 + N) % N; v[i] = Math.min(v[i], Math.sqrt(v[a] * v[a] + 2 * accel(v[a]))); }
    for (let i = N - 1; i >= 0; i--) { const b = (i + 1) % N; v[i] = Math.min(v[i], Math.sqrt(v[b] * v[b] + 2 * brake)); }
  }
  let lapTime = 0; for (let i = 0; i < N; i++) lapTime += 1 / v[i];
  const plan = { v, lapTime };
  T.plans.set(key, plan);
  return plan;
}
