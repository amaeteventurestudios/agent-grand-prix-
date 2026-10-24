// The paddock: white pit building with open garages, team trucks, hospitality towers,
// coloured pit boxes with gantries, tyre stacks, and a pit crew for each team that
// waits by the garage, gets ready as its car comes in and swarms it during the stop.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sampleTrack } from './track.js';
import { ribbon, vcolor, CAR_SCALE } from './world.js';

const col = (h) => new THREE.Color(h);
const tmp = {};
const CREW = 16;
const LF = 11;   // garage front, metres from the lane centre towards the garages
const LB = 28;   // garage back wall

export class Paddock {
  constructor(world, teams, carGeo) {
    this.w = world; this.teams = teams;
    const T = world.T, P = T.pit, sd = P.side;
    this.group = new THREE.Group();
    world.scene.add(this.group);
    const geos = [], flat = [];
    // a box placed in paddock coordinates: a along the lap from s, l across from the lane centre
    const box = (s, a, l, y, w, h, d, c, list = geos) => {
      sampleTrack(T, s + a, P.lat + sd * l, tmp);
      const g = new THREE.BoxGeometry(w, h, d);
      g.rotateY(-Math.atan2(tmp.tz, tmp.tx)); g.translate(tmp.x, y + h / 2, tmp.z);
      list.push(vcolor(g, typeof c === 'string' ? col(c) : c));
    };
    const s0 = P.box[0] - 30, s1 = P.box[9] + 30, len = s1 - s0, mid = (s0 + s1) / 2;
    const spacing = P.box[1] - P.box[0];
    // concrete paddock and the white box outlines
    flat.push(ribbon(T, P.inS + 10, P.outS - 10, P.lat + sd * 4.5, P.lat + sd * 75, 0.02, () => col('#d9dde2'), 4));
    // building: back wall, roof, upper floor with a glass band, pillars
    const white = '#f5f6f8';
    box(mid, 0, LB - 1.5, 0, len, 7, 3, white);
    box(mid, 0, (LF - 1.5 + LB) / 2, 6.2, len, 0.8, LB - LF + 1.5, white);
    box(mid, 0, (15 + LB) / 2, 7, len - 8, 4.2, LB - 15, white);
    box(mid, 0, 14.9, 7.9, len - 8, 2.2, 0.3, '#24314a');
    box(mid, 0, 14.9, 10.4, len - 8, 0.5, 0.35, '#5b3fd6');
    for (let k = 0; k <= 10; k++) box(P.box[0] - spacing / 2 + k * spacing, 0, LF, 0, 0.7, 6.2, 0.7, white);
    // pit wall pods with white roofs
    for (let k = 0; k < 5; k++) {
      const s = s0 + 20 + k * (len - 40) / 4;
      box(s, 0, -5.6, 0, 3, 2.3, 1.6, '#3a3f48');
      box(s, 0, -5.6, 2.6, 3.8, 0.2, 2.6, white);
      box(s, 1.7, -5.6, 1.3, 0.12, 1.3, 0.12, '#9aa0aa'); box(s, -1.7, -5.6, 1.3, 0.12, 1.3, 0.12, '#9aa0aa');
    }
    // hospitality towers and race control
    for (const [s, l, floors] of [[s0 - 8, 44, 3], [s1 + 8, 44, 3], [mid, 52, 5]]) {
      for (let f = 0; f < floors; f++) {
        box(s, 0, l, f * 4, 18, 3.2, 14, white);
        box(s, 0, l, f * 4 + 3.2, 18.4, 0.8, 14.4, f === floors - 1 ? '#5b3fd6' : '#2a3550');
      }
    }
    for (const t of teams) {
      const s = P.box[t.box], c1 = col(t.c1);
      // the box: white outline, team-tinted square, yellow marks
      flat.push(ribbon(T, s - 5, s + 5, P.lat - sd * 4.1, P.lat + sd * 4.1, 0.03, () => col('#ffffff'), 1));
      flat.push(ribbon(T, s - 4.6, s + 4.6, P.lat - sd * 3.7, P.lat + sd * 3.7, 0.04, () => c1.clone().lerp(col('#8d96a3'), 0.45), 1));
      for (const [a, l] of [[2.1 * CAR_SCALE, 1.12], [2.1 * CAR_SCALE, -1.12], [-2.1 * CAR_SCALE, 1.12], [-2.1 * CAR_SCALE, -1.12]]) {
        flat.push(ribbon(T, s + a - 0.12, s + a + 0.12, P.lat + sd * (l * CAR_SCALE - 0.7), P.lat + sd * (l * CAR_SCALE + 0.7), 0.05, () => col('#f2c230'), 0.24));
      }
      flat.push(ribbon(T, s + 3.6, s + 3.85, P.lat - sd * 1.2, P.lat + sd * 1.2, 0.05, () => col('#f2c230'), 0.25));
      // gantry over the front of the box
      box(s, 4.8, 3.6, 0, 0.25, 4.2, 0.25, '#2b2f36'); box(s, 4.8, -3.6, 0, 0.25, 4.2, 0.25, '#2b2f36');
      box(s, 4.8, 0, 4.1, 0.3, 0.3, 7.6, '#2b2f36'); box(s, 4.8, 0, 3.7, 0.5, 0.4, 2.4, c1);
      // garage: back panel in team colours, the roof stripe, tyre racks
      box(s, 0, LB - 3.1, 0.2, spacing - 1.6, 4.6, 0.2, c1.clone().multiplyScalar(0.8));
      box(s, 0, LF - 1.6, 5.4, spacing - 0.4, 0.8, 0.3, c1);
      box(s, -6.2, 7.2, 0, 1.6, 2.2, 1.1, '#7d848f'); box(s, 6.2, 7.2, 0, 1.6, 2.2, 1.1, '#7d848f');
      // the team truck behind the building
      box(s, 0, 36, 0.6, 12, 3.6, 2.6, white); box(s, 0, 36 + 1.31, 1.9, 12, 0.8, 0.05, c1);
      box(s, 0, 36 - 1.31, 1.9, 12, 0.8, 0.05, c1);
      box(s, 7.4, 36, 0.6, 2.4, 2.8, 2.6, c1.clone().multiplyScalar(0.7));
      for (const a of [-4, -2.6, 3, 7]) box(s, a, 36, 0, 1, 1, 2.8, '#1b1d22');
    }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const solid = new THREE.Mesh(mergeGeometries(geos), mat);
    solid.castShadow = solid.receiveShadow = true;
    const ground = new THREE.Mesh(mergeGeometries(flat), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    ground.receiveShadow = true;
    this.group.add(solid, ground);
    geos.concat(flat).forEach((g) => g.dispose());

    // spare cars inside the garages, nose out
    this.spares = [];
    for (const t of teams) {
      const g = carGeo(t);
      const m = new THREE.Mesh(g, world.carMat);
      sampleTrack(T, P.box[t.box], P.lat + sd * 19, tmp);
      m.position.set(tmp.x, 0.02, tmp.z);
      const nx = sd * tmp.tz, nz = -sd * tmp.tx; // towards the lane
      m.rotation.y = -Math.atan2(nz, nx);
      m.castShadow = true; m.userData.shared = true; // the race cars use this geometry too
      this.group.add(m); this.spares.push({ mesh: m, team: t });
    }

    // tyre stacks: black tyres, the band takes the compound colour
    const tyre = new THREE.CylinderGeometry(0.34, 0.34, 0.3, 12);
    const tc = new Float32Array(tyre.attributes.position.count * 3);
    for (let i = 0; i < tyre.attributes.position.count; i++) {
      const y = tyre.attributes.position.getY(i), r = Math.hypot(tyre.attributes.position.getX(i), tyre.attributes.position.getZ(i));
      const band = Math.abs(y) > 0.14 && r > 0.2 && r < 0.3;
      const v = band ? 1 : 0.09; tc[i * 3] = tc[i * 3 + 1] = tc[i * 3 + 2] = v;
    }
    tyre.setAttribute('color', new THREE.BufferAttribute(tc, 3));
    const nT = teams.length * 3 * 4;
    this.tyres = new THREE.InstancedMesh(tyre, new THREE.MeshLambertMaterial({ vertexColors: true }), nT);
    const m4 = new THREE.Matrix4(), cs = ['#e8303a', '#f2c230', '#e9ecef', '#2fb75a'];
    let k = 0;
    teams.forEach((t) => {
      [[-8, 6.4], [8, 6.4], [-6.2, 8.4]].forEach(([a, l], j) => {
        for (let q = 0; q < 4; q++) {
          sampleTrack(T, P.box[t.box] + a, P.lat + sd * l, tmp);
          m4.makeTranslation(tmp.x, 0.15 + q * 0.31, tmp.z);
          this.tyres.setMatrixAt(k, m4); this.tyres.setColorAt(k, col(cs[(j + t.box) % 4])); k++;
        }
      });
    });
    this.tyres.castShadow = true;
    this.group.add(this.tyres);

    // the crew: overalls in team colours, white helmets
    // a person facing +x: legs, overalls with arms, gloves (vertex colour times the team colour)
    const piece = (w, h, d, x, y, z, shade) => {
      const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.translate(x, y, z);
      const c = new Float32Array(g.attributes.position.count * 3).fill(shade);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
    };
    const body = mergeGeometries([
      piece(0.17, 0.82, 0.15, 0, 0.41, 0.11, 0.55), piece(0.17, 0.82, 0.15, 0, 0.41, -0.11, 0.55),
      piece(0.27, 0.62, 0.44, 0, 1.12, 0, 1), piece(0.2, 0.12, 0.3, 0, 1.44, 0, 1),
      piece(0.12, 0.56, 0.11, 0.03, 1.1, 0.28, 0.9), piece(0.12, 0.56, 0.11, 0.03, 1.1, -0.28, 0.9),
      piece(0.13, 0.1, 0.12, 0.04, 0.78, 0.28, 0.25), piece(0.13, 0.1, 0.12, 0.04, 0.78, -0.28, 0.25),
    ]);
    body.scale(1.12, 1.12, 1.12);
    const helmet = new THREE.SphereGeometry(0.17, 10, 8); helmet.scale(1.05, 1, 1); helmet.translate(0.01, 1.74, 0);
    const n = teams.length * CREW;
    this.bodies = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true }), n);
    this.helmets = new THREE.InstancedMesh(helmet, new THREE.MeshPhongMaterial({ color: '#ffffff', shininess: 60 }), n);
    this.bodies.castShadow = this.helmets.castShadow = true;
    this.crew = [];
    teams.forEach((t, ti) => {
      for (let j = 0; j < CREW; j++) {
        const i = ti * CREW + j;
        this.bodies.setColorAt(i, col(j === 15 ? '#ff7a1a' : t.c1));
        const [a, l] = this.slot('idle', j);
        this.crew.push({ team: t, j, a, l, y: 0, face: 0 });
      }
    });
    this.group.add(this.bodies, this.helmets);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.sc = new THREE.Vector3(1, 1, 1);
    this.t = 0;
    this.update(null, 0, 1);
  }

  // where crew member j stands, in box coordinates (a along, l across), for each phase
  slot(phase, j, a0 = 0) {
    const wa = 2.1 * CAR_SCALE, wl = 1.12 * CAR_SCALE;
    if (phase === 'idle') return [-5.6 + (j % 8) * 1.6, 7.6 + (j >= 8 ? 1.3 : 0)];
    const wheel = Math.floor(j / 3), off = (j % 3) - 1;
    const ready = phase === 'ready';
    if (j < 12) {
      const sa = wheel < 2 ? wa : -wa, sl = wheel % 2 ? -1 : 1;
      return [a0 + sa + off * (ready ? 0.9 : 0.7), sl * (wl + (ready ? 2.4 : 0.85 + Math.abs(off) * 0.25))];
    }
    if (j === 12) return [a0 + (ready ? 6.2 : 4.1), 0];          // front jack
    if (j === 13) return [a0 - (ready ? 6.2 : 4.0), 0];          // rear jack
    if (j === 14) return [a0, ready ? 3.8 : 2.1];                 // stabiliser
    return [a0 + 4.8, ready ? 4.6 : 4.4];                         // lollipop / release
  }

  update(race, dt, speed = 1) {
    const T = this.w.T, P = T.pit, L = T.L, sd = P.side;
    this.t += dt;
    const state = new Map();
    for (const t of this.teams) {
      let phase = 'idle', a0 = 0;
      if (race) for (const c of race.cars) {
        if (c.team.id !== t.id) continue;
        let d = (((c.dist % L) + L) % L) - P.box[t.box]; if (d > L / 2) d -= L; if (d < -L / 2) d += L;
        if (c.stopT > 0) { phase = 'work'; a0 = d; break; }
        if ((c.pit && c.pit.phase === 'in') || (c.pitReq && !c.pit && d > -450 && d < 0)) phase = 'ready';
        if (c.pit && c.pit.phase === 'out' && d < 25 && phase === 'idle') phase = 'ready';
      }
      state.set(t.id, [phase, a0]);
    }
    const step = Math.min(1, dt * speed * 3.2);
    this.crew.forEach((m, i) => {
      const [phase, a0] = state.get(m.team.id);
      const [ta, tl] = this.slot(phase, m.j, a0);
      const da = ta - m.a, dl = tl - m.l, dist = Math.hypot(da, dl);
      const mv = Math.min(dist, dt * speed * 7);
      if (dist > 0.01) { m.a += da / dist * mv; m.l += dl / dist * mv; }
      const moving = dist > 0.15;
      // face the car while working, the walking direction while moving
      sampleTrack(T, P.box[m.team.box] + m.a, P.lat + sd * m.l, tmp);
      const hd = Math.atan2(tmp.tz, tmp.tx);
      let face;
      if (moving) face = Math.atan2(sd * dl, da);
      else if (phase === 'idle') face = -Math.PI / 2 * sd;
      else face = Math.atan2(-sd * m.l, a0 - m.a);
      m.face += Math.atan2(Math.sin(face - m.face), Math.cos(face - m.face)) * Math.min(1, step * 2);
      const bob = phase === 'work' && !moving ? Math.abs(Math.sin(this.t * 14 + m.j)) * 0.08 : moving ? Math.abs(Math.sin(this.t * 10 + m.j)) * 0.06 : 0;
      const crouch = phase === 'work' && m.j < 12 && !moving ? 0.78 : 1;
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), -(hd + m.face * 1));
      this.sc.set(1, crouch, 1);
      this.m4.compose(this.v.set(tmp.x, bob, tmp.z), this.q, this.sc);
      this.bodies.setMatrixAt(i, this.m4);
      this.helmets.setMatrixAt(i, this.m4);
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.helmets.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.w.scene.remove(this.group); this.group.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); }); }
}
