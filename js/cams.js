// Cameras: overview (orbit the whole circuit), chase, cockpit, TV (trackside) and pit box.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { sampleTrack } from './track.js';

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Cams {
  constructor(camera, dom) {
    this.camera = camera; this.dom = dom;
    this.controls = new OrbitControls(camera, dom);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: 1.32, minPolarAngle: 0.25, enablePan: true, screenSpacePanning: false, zoomSpeed: 0.8 });
    this.controls.addEventListener('start', () => { this.idle = 0; this.autoRotate = false; });
    this.mode = 'overview'; this.look = new THREE.Vector3(); this.idle = 0; this.autoRotate = !reduce;
    this.tvIdx = -1;
    // look around: in every camera but Overview a drag swings the view round the car (or round the
    // cockpit), a pinch or the wheel zooms, and a few seconds after letting go it eases back
    this.oYaw = 0; this.oPitch = 0; this.oZoom = 1; this.oIdle = 9; this.basePos = new THREE.Vector3();
    const ptrs = new Map();
    let pinch = 0;
    dom.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, [e.clientX, e.clientY, e.clientX, e.clientY]); pinch = 0; });
    dom.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId); if (!p || this.mode === 'overview' || this.mode === 'free') return;
      const dx = e.clientX - p[0], dy = e.clientY - p[1]; p[0] = e.clientX; p[1] = e.clientY;
      if (ptrs.size === 1) {
        if (Math.hypot(e.clientX - p[2], e.clientY - p[3]) < 6) return;   // a tap still picks a car
        const fpv = this.mode === 'fpv';
        this.oYaw += dx * (fpv ? -0.004 : 0.007);
        this.oPitch = THREE.MathUtils.clamp(this.oPitch + dy * (fpv ? -0.003 : 0.004), fpv ? -0.5 : -0.9, fpv ? 0.5 : 1.1);
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) this.oZoom = THREE.MathUtils.clamp(this.oZoom * pinch / d, 0.35, 3);
        pinch = d;
      }
      this.oIdle = 0;
    });
    const up = (e) => { ptrs.delete(e.pointerId); pinch = 0; };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    dom.addEventListener('wheel', (e) => {
      if (this.mode === 'overview' || this.mode === 'free') return;
      e.preventDefault();
      this.oZoom = THREE.MathUtils.clamp(this.oZoom * Math.exp(e.deltaY * 0.0012), 0.35, 3); this.oIdle = 0;
    }, { passive: false });
    this.dragging = () => ptrs.size > 0;
  }

  // swing the camera round what it is looking at by the look-around offsets
  lookAround(dt) {
    const c = this.camera;
    if (!this.dragging()) {
      this.oIdle += dt;
      if (this.oIdle > 2.5) {
        const e = 1 - Math.exp(-dt * 1.8);
        this.oYaw -= this.oYaw * e; this.oPitch -= this.oPitch * e; this.oZoom += (1 - this.oZoom) * e;
      }
    }
    if (Math.abs(this.oYaw) < 1e-4 && Math.abs(this.oPitch) < 1e-4 && Math.abs(this.oZoom - 1) < 1e-4) return;
    if (this.mode === 'fpv') {
      // in the cockpit: turn the head
      const dir = v2.copy(this.look).sub(c.position);
      dir.applyAxisAngle(up, this.oYaw);
      const side = new THREE.Vector3().crossVectors(dir, up).normalize();
      dir.applyAxisAngle(side, this.oPitch);
      c.lookAt(v1.copy(c.position).add(dir));
      const fov = THREE.MathUtils.clamp(c.fov * this.oZoom, 30, 100);
      if (Math.abs(c.fov - fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); }
      return;
    }
    const t = this.look, rel = v2.copy(c.position).sub(t);
    const sp = new THREE.Spherical().setFromVector3(rel);
    sp.radius *= this.oZoom; sp.theta += this.oYaw;
    sp.phi = THREE.MathUtils.clamp(sp.phi - this.oPitch, 0.12, 1.36);
    c.position.copy(t).add(v1.setFromSpherical(sp));
    if (c.position.y < 1.6) c.position.y = 1.6;
    c.lookAt(t);
  }

  setWorld(world) {
    this.world = world;
    const T = world.T;
    // trackside TV cameras about every 170 m, alternating sides
    this.tv = [];
    const n = Math.floor(T.L / 170);
    for (let k = 0; k < n; k++) {
      const s = k * 170 + 40, sd = k % 2 ? 1 : -1;
      const p = sampleTrack(T, s, sd * (T.half + world.runoff + 9), {});
      this.tv.push({ s, pos: new THREE.Vector3(p.x, 7 + (k % 3) * 3, p.z) });
    }
    this.controls.target.copy(world.center);
    this.fitOverview(true);
  }

  fitOverview(reset) {
    const c = this.camera, w = this.world; if (!w) return;
    const vf = THREE.MathUtils.degToRad(c.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * c.aspect);
    const d = (w.radius + 60) / Math.tan(Math.min(vf, hf) / 2) * 0.82;
    this.controls.maxDistance = d * 2.2; this.controls.minDistance = 30;
    if (reset) {
      const a = 0.9;
      c.position.set(w.center.x + Math.cos(a) * d * 0.62, d * 0.72, w.center.z + Math.sin(a) * d * 0.62);
      this.controls.target.copy(w.center);
    }
  }

  setMode(m) {
    this.mode = m; this.oYaw = this.oPitch = 0; this.oZoom = 1;
    this.camera.near = m === 'overview' ? 4 : m === 'fpv' ? 0.08 : m === 'live' ? 1 : 0.5;
    this.camera.updateProjectionMatrix();
    this.controls.enabled = m === 'overview';
    if (m === 'overview') { this.camera.fov = this.baseFov(); this.camera.updateProjectionMatrix(); this.fitOverview(true); }
    this.snap = true; this.tvIdx = -1;
  }

  baseFov() { return this.camera.aspect < 0.8 ? 62 : 45; }

  carPose(id) {
    const o = this.world.carObjs.get(id); if (!o) return null;
    const g = o.group, ry = g.rotation.y;
    return { p: g.position, f: v2.set(Math.cos(-ry), 0, Math.sin(-ry)).clone(), car: o.car };
  }

  // the director's aerial shot: glide up over one or two cars for a few seconds, then back to Live
  drone(ids, dur) {
    if (this.mode !== 'live' && this.mode !== 'drone') return false;
    this.droneIds = ids; this.droneT = dur; this.dAng = undefined;
    if (this.mode === 'live') { this.mode = 'drone'; this.camera.near = 1; this.camera.updateProjectionMatrix(); }
    return true;
  }

  // Live view: every quarter second, check that nothing solid stands between the camera and the car
  // on the current side; if it does, try the other side, then a higher shot. Each choice holds for a
  // second at least, so the camera doesn't flick back and forth.
  livePos(p, sideK, lift, portrait) {
    const W = this.world, P = W.T.pit;
    const hd = this.liveHd ?? 0, back = (portrait ? 46 : 36) * (1 - 0.45 * lift), height = (portrait ? 34 : 24) * (1 + 1.1 * lift);
    const a = hd + Math.PI + 0.62 * P.side * sideK;
    return v2.set(p.x + Math.cos(a) * back, height, p.z + Math.sin(a) * back);
  }
  blocked(p, cam) {
    const occ = this.world.occluders?.(); if (!occ?.length) return false;
    const from = this.rayFrom.set(p.x, p.y + 1.2, p.z), dir = this.rayDir.copy(cam).sub(from), len = dir.length();
    this.ray.set(from, dir.divideScalar(len)); this.ray.far = len - 1;
    return this.ray.intersectObjects(occ, false).length > 0;
  }
  clearShot(dt, p, portrait) {
    this.ray ||= new THREE.Raycaster(); this.rayFrom ||= new THREE.Vector3(); this.rayDir ||= new THREE.Vector3();
    this.shotT = (this.shotT || 0) - dt; this.shotHold = (this.shotHold || 0) - dt;
    if (this.snap) { this.liveSide = 1; this.liveLift = 0; this.swingK = 1; this.liftK = 0; this.shotHold = 0; }
    if (this.shotT > 0) return;
    this.shotT = 0.25;
    const side = this.liveSide ?? 1, lift = this.liveLift || 0;
    if (!this.blocked(p, this.livePos(p, side, lift, portrait))) {
      // clear: drift back towards the usual shot when that one is clear too
      if (this.shotHold <= 0 && (side !== 1 || lift) && !this.blocked(p, this.livePos(p, 1, 0, portrait))) { this.liveSide = 1; this.liveLift = 0; this.shotHold = 1.5; }
      return;
    }
    if (this.shotHold > 0) return;
    for (const [s, l] of [[-side, 0], [side, 1], [-side, 1]]) {
      if (!this.blocked(p, this.livePos(p, s, l, portrait))) { this.liveSide = s; this.liveLift = l; this.shotHold = 1.2; return; }
    }
    this.liveSide = side; this.liveLift = 1; this.shotHold = 1.2;
  }

  // the director's cut to your garage: a quick pan from the race screen to your crew celebrating,
  // then back to the shot you were watching
  crewShot(shot, dur = 3.4) {
    if (!shot || !['live', 'tv', 'drone'].includes(this.mode)) return false;
    this.crewS = { ...shot, t: 0, dur, back: this.mode === 'drone' ? 'live' : this.mode };
    this.mode = 'crew'; this.camera.near = 0.2; this.camera.updateProjectionMatrix();
    return true;
  }

  update(dt, sel) {
    if (this.mode === 'free') return; // tests place the camera themselves
    const follow = this.mode !== 'overview' && !!sel;
    // each camera works from where it would be without the look-around swing
    if (follow && this.swung) this.camera.position.copy(this.basePos);
    const fovBase = this.fovBase;
    if (follow && this.swung && fovBase && this.camera.fov !== fovBase) { this.camera.fov = fovBase; this.camera.updateProjectionMatrix(); }
    this.updateBase(dt, sel);
    this.swung = false;
    if (!follow || this.mode === 'overview') { this.oYaw = this.oPitch = 0; this.oZoom = 1; return; }
    this.basePos.copy(this.camera.position); this.fovBase = this.camera.fov;
    this.lookAround(dt);
    this.swung = true;
  }

  updateBase(dt, sel) {
    const c = this.camera, k = 1 - Math.exp(-dt * 6);
    if (this.mode === 'crew') {
      const S = this.crewS; S.t += dt;
      if (S.t >= S.dur) { this.setMode(S.back); this.liveHd = undefined; }
      else {
        // a whip pan from the screen to the crew, then a slow push in
        const u = S.t / S.dur, e = THREE.MathUtils.smoothstep(u, 0.12, 0.42);
        c.position.copy(S.cam).lerp(S.crew, 0.12 * u);
        this.look.copy(S.screen).lerp(S.crew, e);
        c.lookAt(this.look);
        const fov = c.aspect < 0.8 ? 66 : 48;
        if (c.fov !== fov) { c.fov = fov; c.updateProjectionMatrix(); }
        return;
      }
    }
    if (this.mode === 'drone') {
      const ps = this.droneIds.map((id) => this.world.carObjs.get(id)).filter(Boolean).map((o) => o.group.position);
      this.droneT -= dt;
      if (!ps.length || this.droneT <= 0) { this.mode = 'live'; this.liveHd = undefined; }
      else {
        const mid = new THREE.Vector3(); ps.forEach((p) => mid.add(p)); mid.divideScalar(ps.length);
        const spread = ps.length > 1 ? ps[0].distanceTo(ps[1]) : 0, portrait = c.aspect < 0.8;
        const h = THREE.MathUtils.clamp(46 + spread * 0.7, 46, 170) * (portrait ? 1.3 : 1);
        if (this.dAng === undefined) this.dAng = Math.atan2(c.position.z - mid.z, c.position.x - mid.x);
        this.dAng += dt * 0.16;
        const pos = v1.set(mid.x + Math.cos(this.dAng) * h * 0.5, h, mid.z + Math.sin(this.dAng) * h * 0.5);
        const kk = 1 - Math.exp(-dt * 1.4);
        c.position.lerp(pos, kk); this.look.lerp(mid, Math.min(1, kk * 2.2)); c.lookAt(this.look);
        const fov = portrait ? 60 : 46;
        if (Math.abs(c.fov - fov) > 0.05) { c.fov += (fov - c.fov) * kk; c.updateProjectionMatrix(); }
        return;
      }
    }
    if (this.mode === 'overview' || !sel) {
      this.idle += dt;
      if (this.idle > 8 && !reduce) this.autoRotate = true;
      this.controls.autoRotate = this.autoRotate; this.controls.autoRotateSpeed = 0.35;
      this.controls.update();
      return;
    }
    const pose = this.carPose(sel); if (!pose) return;
    const { p, f } = pose;
    let fov = this.baseFov(), pos, look;
    if (this.mode === 'live') {
      // TV director: a high three-quarter view that trails the car smoothly, and glides
      // down over the pit box while the car is in the pits
      const W = this.world, T = W.T, P = T.pit, car = pose.car;
      let d = (((car.dist % T.L) + T.L) % T.L) - P.box[car.team.box]; if (d > T.L / 2) d -= T.L;
      const inBox = car.pit && (car.stopT > 0 || (car.pit.phase === 'in' && d > -70) || (car.pit.phase === 'out' && d < 30));
      const portrait = c.aspect < 0.8;
      this.boxBlend = (this.boxBlend || 0) + ((inBox ? 1 : 0) - (this.boxBlend || 0)) * Math.min(1, dt * 1.6);
      const b = this.boxBlend;
      // trailing direction: smoothed heading, swung 35 degrees to the side
      const hd = Math.atan2(f.z, f.x);
      if (this.liveHd === undefined || this.snap) this.liveHd = hd;
      this.liveHd += Math.atan2(Math.sin(hd - this.liveHd), Math.cos(hd - this.liveHd)) * Math.min(1, dt * 1.2);
      // which side of the car the camera swings to: the default side, unless a building, the
      // paddock or a tree would stand between the camera and the car; then the other side, and if
      // both are blocked, a higher, steeper shot over the top
      this.clearShot(dt, p, portrait);
      this.swingK = (this.swingK ?? 1) + ((this.liveSide ?? 1) - (this.swingK ?? 1)) * Math.min(1, dt * 1.5);
      this.liftK = (this.liftK || 0) + ((this.liveLift || 0) - (this.liftK || 0)) * Math.min(1, dt * 1.5);
      const side = P.side, sw = 0.62 * side * this.swingK;
      const lift = this.liftK * (1 - b);
      const back = ((portrait ? 46 : 36) * (1 - b) + (portrait ? 34 : 26) * b) * (1 - 0.45 * lift), height = ((portrait ? 34 : 24) * (1 - b) + (portrait ? 30 : 22) * b) * (1 + 1.1 * lift);
      const bx = sampleTrack(T, P.box[car.team.box], P.lat, {});
      const tgt = new THREE.Vector3().copy(p).lerp(new THREE.Vector3(bx.x, 0, bx.z), b);
      const ang = this.liveHd + Math.PI + sw * (1 - b) + b * (Math.PI / 2 * -side + Math.PI) * 0;
      const boxAng = Math.atan2(bx.tz, bx.tx) - side * 2.2;
      const a2 = ang + Math.atan2(Math.sin(boxAng - ang), Math.cos(boxAng - ang)) * b;
      pos = v1.set(tgt.x + Math.cos(a2) * back, height, tgt.z + Math.sin(a2) * back);
      look = tgt.clone().add(new THREE.Vector3(Math.cos(this.liveHd), 0, Math.sin(this.liveHd)).multiplyScalar(6 * (1 - b)));
      fov = portrait ? 58 : 40;
      const kk = 1 - Math.exp(-dt * 2.2);
      if (this.snap) { c.position.copy(pos); this.look.copy(look); this.snap = false; }
      else { c.position.lerp(pos, kk); this.look.lerp(look, Math.min(1, kk * 2)); }
      c.lookAt(this.look);
      if (Math.abs(c.fov - fov) > 0.05) { c.fov += (fov - c.fov) * kk; c.updateProjectionMatrix(); }
      return;
    } else if (this.mode === 'chase') {
      // modelled cars get a lower, closer broadcast chase, like an onboard from the car behind
      const low = !!this.world.fleets?.size, back = c.aspect < 0.8 ? (low ? 13 : 17) : low ? 10 : 13;
      pos = v1.copy(p).addScaledVector(f, -back).addScaledVector(up, low ? 3.4 : 5.2);
      look = p.clone().addScaledVector(f, low ? 12 : 9).addScaledVector(up, low ? 1.2 : 1.4);
    } else if (this.mode === 'fpv') {
      pos = v1.copy(p).addScaledVector(f, 0.98).addScaledVector(up, 1.02);
      look = p.clone().addScaledVector(f, 30).addScaledVector(up, 0.7);
      fov = c.aspect < 0.8 ? 82 : 68;
      c.position.copy(pos); this.look.copy(look); c.lookAt(look);
      if (c.fov !== fov) { c.fov = fov; c.updateProjectionMatrix(); }
      return;
    } else if (this.mode === 'tv') {
      // the camera just ahead of the car along the lap
      const T = this.world.T, cs = ((pose.car.dist % T.L) + T.L) % T.L;
      let best = 0, bd = 1e9;
      this.tv.forEach((t, i) => { let d = t.s - cs; if (d < -30) d += T.L; if (d < bd) { bd = d; best = i; } });
      if (best !== this.tvIdx) { this.tvIdx = best; this.snap = true; }
      pos = this.tv[best].pos;
      look = p.clone().addScaledVector(up, 1);
      const dist = pos.distanceTo(look);
      fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(9 / dist)), 5, 50) * (c.aspect < 0.8 ? 1.5 : 1);
    } else if (this.mode === 'pit') {
      const W = this.world, P = W.T.pit, box = pose.car.team.box;
      const b = sampleTrack(W.T, P.box[box], P.lat, {});
      const cp = sampleTrack(W.T, P.box[box] - 14, P.lat - P.side * 12, {});
      pos = v1.set(cp.x, 14, cp.z);
      look = new THREE.Vector3(b.x, 0.8, b.z);
      fov = c.aspect < 0.8 ? 70 : 50;
    }
    if (this.snap) { c.position.copy(pos); this.look.copy(look); this.snap = false; }
    else { c.position.lerp(pos, this.mode === 'tv' || this.mode === 'pit' ? 1 : k); this.look.lerp(look, Math.min(1, k * 1.6)); }
    c.lookAt(this.look);
    if (Math.abs(c.fov - fov) > 0.05) { c.fov += (fov - c.fov) * Math.min(1, k * 1.5); c.updateProjectionMatrix(); }
  }

  // nearest car to a screen point, within about 36 px
  pick(x, y, w, h) {
    let best = null, bd = 36 * 36;
    for (const [id, o] of this.world.carObjs) {
      if (!o.group.visible) continue;
      v1.copy(o.group.position); v1.y += 1; v1.project(this.camera);
      if (v1.z > 1) continue;
      const sx = (v1.x + 1) / 2 * w, sy = (1 - v1.y) / 2 * h, d = (sx - x) ** 2 + (sy - y) ** 2;
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }
}
