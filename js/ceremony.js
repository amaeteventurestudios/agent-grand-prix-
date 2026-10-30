// After the flag: the top three drive back down the pit lane to their boxes, climb out and stand on
// the car to wave to the fans, pump a fist, then both, jump down, run to their crew and leap on them.
// Then the podium over the pit lane: trophies for P3, P2 and P1, champagne sprayed and poured, and
// ticker tape. It is a scene of its own: the race is over, so it moves the cars, the drivers and the
// crews itself (world.carPose, world.hideCars, world.emptyCars and paddock.fest) and holds the camera.
import * as THREE from 'three';
import { sampleTrack } from './track.js';
import { loadGLB } from './cars.js';

const tmp = {}, tmp2 = {};
const UP = new THREE.Vector3(0, 1, 0);
const ease = (x) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const POSES = ['stand', 'wave', 'pump', 'pumpd', 'cheer', 'fists', 'run1', 'run2', 'leap', 'hold', 'spray', 'pour'];
const DRIVE = 110;       // metres of pit lane each car drives back to its box
const LANE_V = 22;       // the pit lane limit, m/s
const CROWD_L = [5.9, 7.0];   // the crew's two rows in front of their garage, metres from the lane centre
const ON_CAR = 0.62;     // where the driver stands on the car: on the sidepod on the garage side
const ON_L = 0.74;
// the podium on the canopy ledge over the pit lane, in front of the first-floor glass
const POD = { l: 7.95, y: 6.6, w: 1.5, d: 1.3, h: [1.0, 0.72, 0.48], gap: 1.55 };
const TROPHY = ['#f2c14e', '#d7dce3', '#cd7f32'];
// a driver's two scripts: the winner's in full, the other two shorter (the camera visits each in turn)
const FULL = { climb: 1.0, wave: 1.4, pump1: 1.5, pump2: 1.5, down: 0.5, leap: 0.7, hug: 1.6 };
const SHORT = { climb: 0.9, wave: 0, pump1: 0, pump2: 1.4, down: 0.45, leap: 0.7, hug: 0.8 };

export class Ceremony {
  // race: the finished race; world, camera, cams: the 3D view; ui: the stage element for the captions;
  // sound: the crowd roar; done(): called once, when it ends or is skipped
  constructor({ race, world, camera, cams, ui, sound, lite, done, venue }) {
    Object.assign(this, { race: race, w: world, camera, cams, sound, lite, onDone: done, venue });
    this.t = 0; this.over = false;
    // in the Gulf the podium sprays a sparkling rosewater drink rather than champagne, as it does there for real
    this.rosewater = /^(Bahrain|Saudi Arabia|Qatar|UAE)$/.test(venue?.country || '');
    const T = world.T, P = T.pit;
    this.T = T; this.P = P; this.sd = P.side;
    this.top = race.result.filter((x) => !x.dnf).slice(0, 3).map((x, k) => ({ k, car: x.car, team: x.car.team, name: x.car.name, code: x.car.code }));
    // each car's box; a team with both cars on the podium parks the second one behind the first
    const teams = new Set();
    for (const d of this.top) {
      d.sBox = P.box[d.team.box];
      d.aStop = teams.has(d.team.id) ? -8 : 0; teams.add(d.team.id);
      d.d = d.sBox + d.aStop - DRIVE - d.k * 14; d.v = LANE_V; d.arrived = null;
      d.script = d.k === 0 ? FULL : SHORT;
    }
    this.podTeams = teams;
    this.prevMode = cams.mode;
    cams.setMode('free');
    world.carPose = new Map(); world.hideCars = new Set(); world.emptyCars = new Set();
    for (const c of race.cars) if (!this.top.some((d) => d.car === c)) world.hideCars.add(c.id);
    this.group = new THREE.Group(); world.scene.add(this.group);
    this.buildPodium();
    this.buildProps();
    this.buildFx();
    this.loadDrivers();
    // the timeline is set once the winner is in its box (the drive takes a few seconds)
    this.plan = null;
    this.paddockFest();
    // captions and the Skip button
    this.ui = Object.assign(document.createElement('div'), { className: 'cere' });
    this.ui.innerHTML = `<div class="cere-top"><span class="cere-k">Podium celebration</span><button type="button" class="cere-skip">Skip to results ›</button></div>
      <div class="cere-cap" hidden><small></small><b></b><span></span></div>`;
    ui.append(this.ui);
    this.ui.querySelector('.cere-skip').addEventListener('click', () => this.finish());
    this.cap = this.ui.querySelector('.cere-cap');
    sound?.roar(0.8);
  }

  // ---------- places ----------
  // a point in a team's box: a along the lane from the box, l across towards the garages
  at(sBox, a, l, y = 0, out = new THREE.Vector3()) {
    sampleTrack(this.T, sBox + a, this.P.lat + this.sd * l, tmp);
    return out.set(tmp.x, y, tmp.z);
  }
  // the yaw (three.js rotation.y) for a figure at (a, l) of a box facing (fa, fl)
  yawTo(sBox, a, l, fa, fl) {
    sampleTrack(this.T, sBox + a, this.P.lat + this.sd * l, tmp2);
    return -(Math.atan2(tmp2.tz, tmp2.tx) + Math.atan2(this.sd * (fl - l), fa - a));
  }
  get mid() { const B = this.P.box; return (B[0] + B[9]) / 2; }

  // ---------- the podium ----------
  buildPodium() {
    const m = this.mid, sd = this.sd, g = new THREE.Group();
    // which way along the lane is the camera's left: P2 stands there, P3 on the right
    const cam = this.at(m, 0, -9, 4), look = this.at(m, 0, POD.l, POD.y + 1.5);
    const right = new THREE.Vector3().subVectors(look, cam).cross(UP);
    const side = this.at(m, 1, POD.l).sub(this.at(m, 0, POD.l)).dot(right) > 0 ? 1 : -1;
    this.podA = [0, -side * POD.gap, side * POD.gap];   // P1, P2, P3 along the lane
    const white = new THREE.MeshLambertMaterial({ color: '#f4f5f7' }), dark = new THREE.MeshLambertMaterial({ color: '#141a2a' });
    const lime = new THREE.MeshBasicMaterial({ color: '#c6ff3d' });
    const hd = (a) => { sampleTrack(this.T, m + a, this.P.lat + sd * POD.l, tmp); return -Math.atan2(tmp.tz, tmp.tx); };
    this.podA.forEach((a, k) => {
      const h = POD.h[k];
      const step = new THREE.Mesh(new THREE.BoxGeometry(POD.w, h, POD.d), white);
      step.position.copy(this.at(m, a, POD.l, POD.y + h / 2)); step.rotation.y = hd(a);
      step.castShadow = step.receiveShadow = true;
      // a lime band round the top and the place number on the front
      const band = new THREE.Mesh(new THREE.BoxGeometry(POD.w + 0.02, 0.06, POD.d + 0.02), lime);
      band.position.copy(this.at(m, a, POD.l, POD.y + h - 0.05)); band.rotation.y = hd(a);
      const num = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: this.label(String(k + 1), '#141a2a', '#ffffff', 128, 128, 110), transparent: true }));
      num.position.copy(this.at(m, a, POD.l - POD.d / 2 - 0.012, POD.y + h / 2));
      num.rotation.y = hd(a) + (sd > 0 ? Math.PI : 0);
      g.add(step, band, num);
    });
    // a dark stage floor and the backdrop with the race's name, in front of the glass
    const floor = new THREE.Mesh(new THREE.BoxGeometry(POD.gap * 2 + POD.w + 2.4, 0.08, 4.4), dark);
    floor.position.copy(this.at(m, 0, POD.l + 1.2, POD.y + 0.04)); floor.rotation.y = hd(0); floor.receiveShadow = true;
    const city = (this.venue && this.venue.city) || '';
    const back = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 3.6), new THREE.MeshBasicMaterial({ map: this.backdrop(city) }));
    back.position.copy(this.at(m, 0, POD.l + 2.9, POD.y + 1.85));
    back.rotation.y = hd(0) + (sd > 0 ? Math.PI : 0);
    g.add(floor, back);
    this.group.add(g);
  }
  label(text, bg, fg, w, h, size) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const x = cv.getContext('2d');
    x.fillStyle = bg; x.beginPath(); x.roundRect ? x.roundRect(4, 4, w - 8, h - 8, 18) : x.rect(4, 4, w - 8, h - 8); x.fill();
    x.fillStyle = fg; x.font = `800 italic ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, w / 2, h / 2 + size * 0.06);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  backdrop(city) {
    const W = 1024, H = 384, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    const gr = x.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#0d1424'); gr.addColorStop(1, '#1b2a55');
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    // speed stripes in the brand's lime and blue
    x.save(); x.globalAlpha = 0.9;
    for (let k = 0; k < 5; k++) { x.fillStyle = k % 2 ? '#1f4fd8' : '#c6ff3d'; x.beginPath(); const o = 40 + k * 26; x.moveTo(o, H); x.lineTo(o + 120, 0); x.lineTo(o + 132, 0); x.lineTo(o + 12, H); x.fill(); }
    x.restore();
    x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '800 italic 112px "Barlow Condensed", "Arial Narrow", sans-serif'; x.fillText('AGENT GRAND PRIX', W / 2 + 60, H * 0.42);
    x.fillStyle = '#c6ff3d'; x.font = '700 54px "Barlow Semi Condensed", "Arial Narrow", sans-serif';
    x.fillText(city ? `${city.toUpperCase()} GRAND PRIX` : 'GRAND PRIX', W / 2 + 60, H * 0.72);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  // ---------- trophies and bottles ----------
  buildProps() {
    const cup = new THREE.LatheGeometry([[0.1, 0], [0.1, 0.04], [0.045, 0.07], [0.03, 0.2], [0.05, 0.25], [0.12, 0.3], [0.16, 0.42], [0.17, 0.52], [0.155, 0.52], [0.14, 0.43], [0.02, 0.33]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
    const handle = new THREE.TorusGeometry(0.075, 0.016, 6, 14, Math.PI);
    this.trophies = this.top.map((d, k) => {
      const mat = new THREE.MeshPhongMaterial({ color: TROPHY[k], specular: '#ffffff', shininess: 90, emissive: TROPHY[k], emissiveIntensity: 0.12 });
      const g = new THREE.Group(), s = k === 0 ? 1.15 : 0.95;
      g.add(new THREE.Mesh(cup, mat));
      for (const sx of [1, -1]) { const h = new THREE.Mesh(handle, mat); h.rotation.z = sx > 0 ? -Math.PI / 2 : Math.PI / 2; h.position.set(sx * 0.16, 0.42, 0); g.add(h); }
      g.scale.setScalar(s); g.visible = false; this.group.add(g);
      return g;
    });
    const bottle = new THREE.LatheGeometry([[0.001, 0], [0.045, 0], [0.047, 0.02], [0.047, 0.2], [0.03, 0.25], [0.017, 0.3], [0.017, 0.36], [0.001, 0.37]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
    const foil = new THREE.CylinderGeometry(0.02, 0.021, 0.08, 10); foil.translate(0, 0.33, 0);
    const glass = new THREE.MeshPhongMaterial({ color: '#1d4a2a', specular: '#cfe8d0', shininess: 80 }), gold = new THREE.MeshPhongMaterial({ color: '#e6c25a', shininess: 60 });
    this.bottles = this.top.map(() => {
      const g = new THREE.Group(); g.add(new THREE.Mesh(bottle, glass), new THREE.Mesh(foil, gold));
      g.scale.setScalar(1.2); g.visible = false; this.group.add(g); return g;
    });
  }

  // ---------- champagne and ticker tape ----------
  buildFx() {
    const n = this.lite ? 700 : 1600;
    this.drops = { n, k: 0, p: new Float32Array(n * 3).fill(-999), v: new Float32Array(n * 3), life: new Float32Array(n) };
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.drops.p, 3));
    // round, soft drops of champagne foam
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const x = cv.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,246,206,0.9)'); gr.addColorStop(1, 'rgba(255,240,190,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
    const map = new THREE.CanvasTexture(cv);
    this.dropPts = new THREE.Points(g, new THREE.PointsMaterial({ color: this.rosewater ? '#ffdbe6' : '#fff0bf', map, size: 0.075, transparent: true, opacity: 0.9, depthWrite: false }));
    this.dropPts.frustumCulled = false; this.group.add(this.dropPts);
    const nc = this.lite ? 160 : 420;
    const pg = new THREE.PlaneGeometry(0.12, 0.075);
    this.conf = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), nc);
    this.conf.frustumCulled = false; this.conf.count = 0;
    const cols = ['#c6ff3d', '#1f4fd8', '#ffffff', '#f2c14e', '#ff5a5f', '#4b8dff'], c = new THREE.Color();
    this.confS = [];
    for (let i = 0; i < nc; i++) { this.conf.setColorAt(i, c.set(cols[i % cols.length])); this.confS.push({ a: 0, l: 0, y: -99, r: Math.random() * 6, w: 1 + Math.random() * 2, ph: Math.random() * 6 }); }
    this.group.add(this.conf);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v3 = new THREE.Vector3(); this.e = new THREE.Euler(); this.one = new THREE.Vector3(1, 1, 1);
  }
  confetti() {
    const m = this.mid;
    this.conf.count = this.confS.length;
    for (const s of this.confS) { s.a = (Math.random() - 0.5) * 16; s.l = POD.l - 6 + Math.random() * 9; s.y = POD.y + 3 + Math.random() * 7; }
    this.confAt = m;
  }
  spray(from, dir, rate, dt, spread = 0.18) {
    const D = this.drops, k = Math.floor(rate * dt + Math.random());
    for (let i = 0; i < k; i++) {
      const j = D.k = (D.k + 1) % D.n;
      D.p[j * 3] = from.x; D.p[j * 3 + 1] = from.y; D.p[j * 3 + 2] = from.z;
      D.v[j * 3] = dir.x * (0.8 + Math.random() * 0.4) + (Math.random() - 0.5) * spread * 8;
      D.v[j * 3 + 1] = dir.y * (0.8 + Math.random() * 0.4) + (Math.random() - 0.5) * spread * 8;
      D.v[j * 3 + 2] = dir.z * (0.8 + Math.random() * 0.4) + (Math.random() - 0.5) * spread * 8;
      D.life[j] = 1.4;
    }
  }
  // the velocity that carries a drop from p0 to p1 in time T
  aim(p0, p1, T) {
    return new THREE.Vector3().subVectors(p1, p0).divideScalar(T).addScaledVector(UP, 0.5 * 9.8 * T);
  }

  // ---------- the drivers: the crew's figure in a race suit, in the celebration poses ----------
  loadDrivers() {
    loadGLB('people/driver').then((scene) => {
      if (this.over) return;
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `
          vColor = vec4(color.rgb, 1.0);
          #ifdef USE_INSTANCING_COLOR
            vColor.rgb = mix(color.rgb, color.rgb * instanceColor.rgb, color.a);
          #endif`);
      };
      mat.customProgramCacheKey = () => 'agp-driver';
      scene.updateMatrixWorld(true);
      this.figs = {}; this.figM = {};
      for (const p of POSES) {
        const node = scene.getObjectByName('driver_' + p), o = node && (node.isMesh ? node : node.getObjectByProperty('isMesh', true));
        if (!o) continue;
        this.figM[p] = o.matrixWorld.clone();
        const im = new THREE.InstancedMesh(o.geometry, mat, 3);
        im.castShadow = true; im.frustumCulled = false; im.count = 0;
        this.group.add(im); this.figs[p] = im;
      }
    }).catch(() => {});
  }
  drawDriver(d) {
    const F = this.figs; if (!F || !d.show) return;
    const im = F[d.pose] || F.stand; if (!im) return;
    const k = im.count++;
    this.q.setFromAxisAngle(UP, d.yaw);
    this.m4.compose(d.pos, this.q, this.v3.set(1.1, 1.1, 1.1)).multiply(this.figM[d.pose] || this.figM.stand);
    this.c ||= new THREE.Color();
    im.setMatrixAt(k, this.m4); im.setColorAt(k, this.c.set(d.team.c1));
  }
  // a point in a driver's own frame (x forward, y up, z to the right), in the world
  hand(d, x, y, z, out = new THREE.Vector3()) {
    return out.set(x * 1.1, y * 1.1, z * 1.1).applyAxisAngle(UP, d.yaw).add(d.pos);
  }

  // ---------- the crews ----------
  paddockFest() {
    const pd = this.w.paddock; if (!pd) return;
    const m = this.mid;
    pd.fest = (mem, t) => {
      const ti = pd.teams.indexOf(mem.team), j = mem.j, phase = this.phase;
      const cheer = (k) => {
        const ph = t * 7 + j * 1.3 + ti;
        const kind = (j + ti) % 3;
        return { pose: kind === 1 ? (Math.sin(t * 13 + j) > 0 ? 'pump' : 'cheer') : 'cheer', jump: kind === 0 ? Math.max(0, Math.sin(ph)) * 0.32 * k : Math.abs(Math.sin(ph * 0.8)) * 0.1 * k };
      };
      if (phase === 'podium') {
        // every crew below the podium, a crowd looking up at it
        const g = ti * 16 + j, cols = 20, row = Math.floor(g / cols);
        const jit = Math.sin(g * 12.9898) * 0.35;
        const a = (g % cols - (cols - 1) / 2) * 1.3 + (row % 2) * 0.6 + jit, l = POD.l - 10.5 + row * 1.2 + Math.cos(g * 7.1) * 0.3;
        const box = pd.w.T.pit.box[mem.team.box];
        const c = cheer(this.podTeams.has(mem.team.id) ? 1.2 : 0.8);
        return { a: a + m - box, l, snap: this.snapCrew, fa: m - box, fl: POD.l + 4, ...c };
      }
      if (!this.podTeams.has(mem.team.id)) return null;
      // the podium teams wait in front of their garage, cheering their car home
      const row = j >= 8 ? 1 : 0, k = j % 8;
      const a = -3.7 + k * 1.05 + row * 0.5, l = CROWD_L[row] + Math.sin(j * 3.3) * 0.15;
      return { a, l, snap: false, fa: a * 0.4, fl: 0, ...cheer(1) };
    };
    this.snapCrew = false;
  }

  // ---------- the timeline ----------
  makePlan() {
    const [p1, p2, p3] = this.top, P = {};
    let t = Math.max(p1.arrived + 0.5, this.t + 0.3);
    p1.t0 = t; t += this.len(p1) + 0.4;
    if (p2) { p2.t0 = t; t += this.len(p2) + 0.3; }
    if (p3) { p3.t0 = t; t += this.len(p3) + 0.3; }
    P.podium = t; P.end = t + 17.2;
    this.plan = P;
  }
  len(d) { const s = d.script; return s.climb + s.wave + s.pump1 + s.pump2 + s.down + this.runT(d) + s.leap + s.hug; }
  runT(d) { return Math.hypot(this.runTo(d)[0] - (d.aStop + 0.4), this.runTo(d)[1] - 1.7) / 5.5; }
  runTo(d) { return [Math.max(-3, Math.min(3, d.aStop)) + 0.2, 4.2]; }

  // where a driver is, and how they stand, u seconds into their own script
  driver(d, u) {
    const s = d.script, a0 = d.aStop + 0.12;
    d.show = true; d.yawTarget = null;
    let a = a0, l = 0, y = ON_CAR, pose = 'stand', fa = a0 + 2, fl = -9;   // facing the fans across the pit wall
    const T1 = s.climb, T2 = T1 + s.wave, T3 = T2 + s.pump1, T4 = T3 + s.pump2, T5 = T4 + s.down, T6 = T5 + this.runT(d), T7 = T6 + s.leap;
    const [ra, rl] = this.runTo(d);
    if (u >= T1 && u < T4) { a = a0 - 0.35; l = ON_L; }
    if (u < T1) {
      // up out of the cockpit and onto the sidepod
      const k = u / T1; y = -1.2 + (ON_CAR + 1.2) * ease(k); l = ON_L * smooth((k - 0.45) / 0.55); a = a0 - 0.35 * smooth((k - 0.45) / 0.55);
      pose = k < 0.55 ? 'stand' : 'cheer';
    } else if (u < T2) {
      pose = 'wave'; fa = a0 + 2 + Math.sin(u * 2.4) * 3;
    } else if (u < T3) {
      // one fist, pumped: up, down, up
      pose = Math.floor((u - T2) / 0.22) % 2 ? 'pumpd' : 'pump'; y = ON_CAR + (pose === 'pump' ? 0.04 : 0);
    } else if (u < T4) {
      // both fists, with a little bounce on the car
      const ph = (u - T3) / 0.26; pose = Math.floor(ph) % 2 ? 'fists' : 'cheer'; y = ON_CAR + Math.abs(Math.sin(ph * Math.PI)) * 0.12;
      fa = a0 + 2 + Math.sin(u * 1.7) * 2;
    } else if (u < T5) {
      // down off the car on the garage side
      const k = (u - T4) / s.down; a = a0 - 0.35 + 0.65 * k; l = ON_L + (1.7 - ON_L) * k; y = ON_CAR * (1 - k) + Math.sin(k * Math.PI) * 0.35; pose = 'stand';
      fa = ra; fl = rl;
    } else if (u < T6) {
      // run to the crew
      const k = (u - T5) / (T6 - T5); a = a0 + 0.3 + (ra - a0 - 0.3) * k; l = 1.7 + (rl - 1.7) * k;
      const st = Math.floor(u / 0.17); pose = st % 2 ? 'run1' : 'run2'; y = Math.abs(Math.sin(u / 0.17 * Math.PI)) * 0.12;
      fa = ra + (ra - a0) * 2; fl = rl + 6;
    } else if (u < T7) {
      // and leap on them
      const k = (u - T6) / s.leap; a = ra; l = rl + 1.6 * k; y = Math.sin(k * Math.PI) * 0.95 + 0.55 * k; pose = 'leap';
      fa = ra; fl = rl + 9;
    } else {
      // held up by the crew, arms in the air
      const ph = (u - T7) / 0.3; a = ra; l = rl + 1.6; y = 0.55 + Math.abs(Math.sin(ph * Math.PI)) * 0.18; pose = Math.floor(ph) % 2 ? 'fists' : 'cheer';
      fa = ra + Math.sin(u) * 3; fl = rl - 6;
    }
    d.pose = pose; d.inCar = u < T1 * 0.15;
    d.pos = this.at(d.sBox, a, l, y, d.pos || new THREE.Vector3());
    d.yaw = this.yawTo(d.sBox, a, l, fa, fl);
    d.al = [a, l, y];
  }

  // on the podium: each on their step, facing the pit lane
  onStep(d, pose, turnTo = null) {
    const m = this.mid, a = this.podA[d.k], y = POD.y + POD.h[d.k];
    d.show = true; d.pose = pose;
    d.pos = this.at(m, a, POD.l - 0.1, y, d.pos || new THREE.Vector3());
    d.yaw = turnTo != null ? this.yawTo(m, a, POD.l, this.podA[turnTo], POD.l - 0.4) : this.yawTo(m, a, POD.l, a * 0.5, POD.l - 10);
  }

  // ---------- each frame ----------
  update(dt) {
    if (this.over) return;
    this.t += dt;
    const t = this.t, W = this.w;
    // the cars: down the pit lane at the limit, slowing into the box
    for (const d of this.top) {
      const stop = d.sBox + d.aStop, rem = stop - d.d;
      if (rem > 0.02) { d.v = Math.min(LANE_V, Math.sqrt(2 * 8 * rem) + 0.4); d.d = Math.min(stop, d.d + d.v * dt); }
      else if (d.arrived == null) { d.arrived = t; if (d.k === 0) this.sound?.roar(0.7); }
      const lat = this.laneLat(d.d, stop);
      sampleTrack(this.T, d.d, lat, tmp);
      sampleTrack(this.T, d.d + 1.5, this.laneLat(d.d + 1.5, stop), tmp2);
      const ry = rem > 0.3 ? -Math.atan2(tmp2.z - tmp.z, tmp2.x - tmp.x) : (W.carPose.get(d.car.id)?.ry ?? -Math.atan2(tmp.tz, tmp.tx));
      W.carPose.set(d.car.id, { x: tmp.x, z: tmp.z, ry });
    }
    // (the drivers' figures load as the celebration starts; the show waits for them, a few seconds at most)
    if (!this.plan && this.top[0].arrived != null && (this.figs || this.t > 12)) this.makePlan();
    const P = this.plan;
    const podium = P && t >= P.podium;
    this.phase = podium ? 'podium' : 'box';
    // the crews are moved under the podium in one go, on the cut
    this.snapCrew = podium && !this.wasPodium;
    if (podium) this.wasPodium = true;
    // the drivers
    for (const d of this.top) {
      d.show = false;
      if (!P) continue;
      if (podium) this.podiumPose(d, t - P.podium);
      else if (t >= d.t0) this.driver(d, t - d.t0);
      if (d.show && !d.inCar) W.emptyCars.add(d.car.id); else W.emptyCars.delete(d.car.id);
    }
    if (this.figs) for (const im of Object.values(this.figs)) im.count = 0;
    for (const d of this.top) this.drawDriver(d);
    if (this.figs) for (const im of Object.values(this.figs)) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    if (podium) this.podiumFx(dt, t - P.podium);
    this.stepFx(dt);
    this.shoot(dt);
    if (P && t >= P.end) this.finish();
  }
  laneLat(s, stop) {
    const P = this.P;
    const a = Math.min(1, Math.max(0, (s - P.inS) / 45)), e = a * a * (3 - 2 * a);
    const k = smooth(1 - (stop - s) / 26);
    return P.fast * e + (P.lat - P.fast * e) * k;
  }

  // the podium, second by second
  podiumPose(d, u) {
    const pr = this.trophies[d.k], bt = this.bottles[d.k];
    const give = [6.2, 4.2, 2.2][d.k];   // P3 gets theirs first, the winner last
    pr.visible = false; bt.visible = false;
    if (u < give) this.onStep(d, u < 1.2 ? 'stand' : 'wave', null);
    else if (u < 8.6) {
      this.onStep(d, 'hold');
      pr.visible = true; pr.position.copy(this.hand(d, 0.05, 2.11, 0)); pr.rotation.set(0, d.yaw, 0);
      if (u - give < 0.05 && !d['got' + d.k]) { d['got' + d.k] = true; this.sound?.roar(d.k === 0 ? 1 : 0.6); if (d.k === 0) this.confetti(); }
    } else {
      // the trophy goes down at the front of the step; the champagne comes out
      pr.visible = true; const m = this.mid;
      pr.position.copy(this.at(m, this.podA[d.k] + (d.k === 1 ? 0.45 : -0.45) * (this.podA[1] > 0 ? 1 : -1), POD.l - POD.d / 2 + 0.25, POD.y + POD.h[d.k])); pr.rotation.set(0, 0, 0);
      const pour = u >= 12.3 && u < 14.6;
      if (u < 9.3) this.onStep(d, 'spray');
      else if (u < 12.3) this.onStep(d, 'spray', d.k === 0 ? null : 0);
      else if (pour) this.onStep(d, d.k === 0 ? 'pour' : 'spray', d.k === 0 ? 1 : d.k === 1 ? null : 0);
      else this.onStep(d, Math.floor(u / 0.3) % 2 ? 'fists' : 'cheer');
      if (u < 14.6) {
        bt.visible = true;
        const shake = u < 9.3 ? Math.sin(u * 40) * 0.05 : 0;
        if (d.pose === 'pour') {
          bt.position.copy(this.hand(d, 0.42, 2.05, 0.12)); bt.quaternion.setFromAxisAngle(UP, d.yaw).multiply(this.q.setFromEuler(this.e.set(0, 0, -2.3)));
        } else {
          bt.position.copy(this.hand(d, 0.46 + shake, 1.45, 0)); bt.quaternion.setFromAxisAngle(UP, d.yaw).multiply(this.q.setFromEuler(this.e.set(0, 0, -1.15)));
        }
        if (u >= 12.3 && u < 12.35 && !this.pourRoar) { this.pourRoar = true; this.sound?.roar(0.7); }
        if (u >= 9.3 && u < 9.35 && !this.sprayRoar) { this.sprayRoar = true; this.sound?.roar(1); }
      }
    }
  }
  podiumFx(dt, u) {
    if (u < 9.3 || u > 14.6) return;
    const [p1, p2] = this.top, rate = this.lite ? 160 : 380, m = this.mid;
    const tip = (d) => (d.pose === 'pour' ? this.hand(d, 0.66, 1.88, 0.12) : this.hand(d, 0.76, 1.6, 0));
    const head = (d) => this.v3.copy(d.pos).addScaledVector(UP, 2.05);
    const crowd = this.at(m, Math.sin(u * 1.3) * 5, POD.l - 7, 1.6);
    for (const d of this.top) {
      if (!d.show) continue;
      const from = tip(d);
      let to;
      if (u < 12.3) to = d.k === 0 ? crowd : head(p1).clone();
      else if (d.k === 0) to = p2 ? head(p2).clone() : crowd;
      else if (d.k === 2) to = head(p1).clone();
      else to = crowd;
      const T = d.pose === 'pour' ? 0.4 : 0.3;
      this.spray(from, this.aim(from, to, T), d.pose === 'pour' ? rate * 0.6 : rate, dt, d.pose === 'pour' ? 0.05 : 0.16);
    }
  }
  stepFx(dt) {
    const D = this.drops; let live = 0;
    for (let j = 0; j < D.n; j++) {
      if (D.life[j] <= 0) { D.p[j * 3 + 1] = -999; continue; }
      live++; D.life[j] -= dt;
      D.v[j * 3 + 1] -= 9.8 * dt;
      D.p[j * 3] += D.v[j * 3] * dt; D.p[j * 3 + 1] += D.v[j * 3 + 1] * dt; D.p[j * 3 + 2] += D.v[j * 3 + 2] * dt;
      if (D.p[j * 3 + 1] < 0) D.life[j] = 0;
    }
    this.dropPts.visible = live > 0;
    if (live) this.dropPts.geometry.attributes.position.needsUpdate = true;
    if (this.conf.count) {
      const m = this.confAt;
      this.confS.forEach((s, i) => {
        s.y -= dt * (0.7 + 0.25 * Math.sin(s.ph + this.t * s.w));
        s.a += Math.sin(this.t * 1.3 + s.ph) * dt * 0.4;
        if (s.y < 0.05) s.y = 0.05;
        const p = this.at(m, s.a, s.l, s.y, this.v3);
        this.q.setFromEuler(this.e.set(this.t * s.w + s.r, s.r, this.t * s.w * 0.7));
        this.m4.compose(p, this.q, this.one);
        this.conf.setMatrixAt(i, this.m4);
      });
      this.conf.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------- the camera ----------
  shoot(dt) {
    const c = this.camera, t = this.t, P = this.plan, portrait = c.aspect < 0.8;
    let pos, look, fov, cut = false;
    const shot = (key) => { if (this.shotKey !== key) { this.shotKey = key; cut = true; } };
    const p1 = this.top[0];
    if (!P || t < p1.t0 - 0.4) {
      // the pit lane: the winner comes down it towards the camera
      shot('lane');
      pos = this.at(p1.sBox, p1.aStop + 15, -8.6, 2.3);
      const cp1 = this.w.carPose.get(p1.car.id);
      look = cp1 ? new THREE.Vector3(cp1.x, 0.9, cp1.z) : this.at(p1.sBox, p1.aStop, 0, 0.9);
      fov = portrait ? 58 : 34;
    } else if (t < P.podium) {
      // each driver in turn, from the pit wall side of their car
      const d = [...this.top].reverse().find((x) => t >= x.t0 - 0.4) || p1;
      shot('drv' + d.k);
      const u = t - d.t0, [a, l, y] = d.al || [d.aStop, 0, 0.6];
      // (between this box's gantry and the one behind, above the pit wall stands)
      const drift = Math.min(u, 9) * 0.12;
      pos = this.at(d.sBox, d.aStop + 2.6 - drift, -9.2 + drift * 0.3, 4.4);
      look = this.at(d.sBox, a * 0.7 + d.aStop * 0.3, l * 0.8, Math.max(1.1, y + 1.0));
      fov = portrait ? 60 : 40;
    } else {
      const u = t - P.podium, m = this.mid, top = POD.y + 1.6;
      const close = (k) => this.at(m, this.podA[k] * 0.6, -1.5, 5.0);
      const at = (k) => this.at(m, this.podA[k], POD.l, POD.y + POD.h[k] + 1.6);
      // wide shots from low in the pit lane: the crews' heads in front, the podium over them
      // (a phone on its side has no room for the crowd under it: the higher shot instead)
      const low = c.aspect < 1.3, wide = () => {
        if (low) { pos = this.at(m, 0.8, -4.6, 2.3); look = this.at(m, 0, POD.l, POD.y + 1.0); fov = portrait ? 74 : 52; }
        else { pos = this.at(m, 0, -6.5, 5.4); look = this.at(m, 0, POD.l, top + 0.3); fov = 44; }
      };
      if (u < 2.0) { shot('wide'); wide(); }
      else if (u < 8.6) {
        const k = u < 4.2 ? 2 : u < 6.2 ? 1 : 0; shot('pod' + k);
        pos = close(k); look = at(k); fov = portrait ? 58 : 30;
        if (k === 0 && u > 7.2) { fov = portrait ? 68 : 38; }
      } else if (u < 14.6) { shot('spray'); pos = this.at(m, 0, -6.5, 5.4); look = this.at(m, 0, POD.l, top + 0.5); fov = portrait ? 66 : 38; }
      else { shot('end'); wide(); }
      this.caption(u);
    }
    if (!P || t < P.podium) this.caption(-1);
    // a wide, short screen (a phone on its side) sees the same height closer in
    if (c.aspect > 1.7) fov *= 0.8;
    if (cut || !this.camInit) { c.position.copy(pos); this.look = look.clone(); this.camInit = true; }
    else { const k = 1 - Math.exp(-dt * 2.5); c.position.lerp(pos, k); this.look.lerp(look, Math.min(1, k * 1.8)); }
    c.lookAt(this.look);
    this.cams.look.copy(this.look);
    if (Math.abs(c.fov - fov) > 0.05) { c.fov = cut ? fov : c.fov + (fov - c.fov) * Math.min(1, dt * 3); c.updateProjectionMatrix(); }
  }

  caption(u) {
    let k = null, text = null;
    if (u < 0) {
      // in the pit lane and at the boxes: the driver on camera
      const t = this.t, d = this.plan ? [...this.top].reverse().find((x) => t >= x.t0 - 0.4) : null;
      if (d && t - d.t0 < 3.2) k = d.k;
      if (!d) text = ['Cool-down', 'Back to the pits', ''];
    } else if (u < 2) text = ['Podium', this.venue ? `${this.venue.city} Grand Prix` : 'Grand Prix', this.top.map((d) => d.code).join(' · ')];
    else if (u < 8.6) k = u < 4.2 ? 2 : u < 6.2 ? 1 : 0;
    else if (u < 14.6) text = [this.rosewater ? 'Rosewater' : 'Champagne', 'On the podium', ''];
    if (k != null && this.top[k]) { const d = this.top[k]; text = [`P${k + 1}`, d.name, d.team.name]; }
    const key = text ? text.join('|') : '';
    if (key === this.capKey) return;
    this.capKey = key;
    this.cap.hidden = !text;
    if (text) {
      [this.cap.querySelector('small').textContent, this.cap.querySelector('b').textContent, this.cap.querySelector('span').textContent] = text;
      this.cap.style.setProperty('--tc', k != null ? this.top[k].team.c1 : '#c6ff3d');
      this.cap.classList.remove('in'); void this.cap.offsetWidth; this.cap.classList.add('in');
    }
  }

  finish() {
    if (this.over) return;
    this.over = true;
    const W = this.w;
    W.carPose = null; W.hideCars = null; W.emptyCars = null;
    if (W.paddock) W.paddock.fest = null;
    W.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    this.ui.remove();
    this.cams.setMode(this.prevMode === 'free' ? 'live' : this.prevMode);
    this.onDone && this.onDone();
  }
}
