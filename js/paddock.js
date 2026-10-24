// The paddock: white pit building with open garages, team trucks, hospitality towers,
// coloured pit boxes with gantries, tyre stacks, and a pit crew for each team that
// waits by the garage, gets ready as its car comes in and swarms it during the stop.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sampleTrack } from './track.js';
import { ribbon, vcolor, CAR_SCALE } from './world.js';
import { loadGLB } from './cars.js';
import { facade, facadeMaterial } from './kit.js';

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
    const geos = [], flat = [], glass = [];
    // a box placed in paddock coordinates: a along the lap from s, l across from the lane centre
    const box = (s, a, l, y, w, h, d, c, list = geos) => {
      sampleTrack(T, s + a, P.lat + sd * l, tmp);
      const g = new THREE.BoxGeometry(w, h, d);
      g.rotateY(-Math.atan2(tmp.tz, tmp.tx)); g.translate(tmp.x, y + h / 2, tmp.z);
      list.push(vcolor(g, typeof c === 'string' ? col(c) : c));
    };
    // a truck wheel, axle across the lane
    const wheel = (s, a, l) => {
      sampleTrack(T, s + a, P.lat + sd * l, tmp);
      const g = new THREE.CylinderGeometry(0.5, 0.5, 0.42, 10); g.rotateX(Math.PI / 2);
      g.rotateY(-Math.atan2(tmp.tz, tmp.tx)); g.translate(tmp.x, 0.5, tmp.z);
      geos.push(vcolor(g.toNonIndexed(), col('#16171a')));
    };
    const s0 = P.box[0] - 30, s1 = P.box[9] + 30, len = s1 - s0, mid = (s0 + s1) / 2;
    const spacing = P.box[1] - P.box[0];
    // concrete paddock and the white box outlines
    flat.push(ribbon(T, P.inS + 10, P.outS - 10, P.lat + sd * 4.5, P.lat + sd * 90, 0.02, () => col('#d9dde2'), 4));
    // the pit building: open garages on the ground floor, a canopy over the apron, two glass floors
    // (the upper one set back behind a terrace), a white roof with the accent edge and plant on top
    const white = '#f5f6f8', steel = '#3a3f48';
    const glassBox = (s, a, l, y, w, h, d, ww = 3, style = 1) => {
      box(s, a, l, y, w, h, d, white, glass);
      facade(glass[glass.length - 1], ww, h, style, y);
    };
    box(mid, 0, LB - 1, 0, len, 6, 2, white);                                   // back wall of the garages
    for (let k = 0; k <= 10; k++) {
      const s = P.box[0] - spacing / 2 + k * spacing;
      box(s, 0, LF, 0, 0.7, 6, 0.7, white);                                    // pillars
      box(s, 0, (LF + LB) / 2, 0, 0.3, 5.6, LB - LF - 1, '#e3e6ea');           // garage dividers
    }
    box(mid, 0, (LF - 4 + LB) / 2, 6, len, 0.6, LB - LF + 4, white);            // first floor slab and apron canopy
    box(mid, 0, LF - 4, 5.75, len, 0.35, 0.3, '#d7dbe0');
    glassBox(mid, 0, (LF + 1 + LB) / 2, 6.6, len - 2, 4, LB - LF - 1, 3);       // glass floor one
    box(mid, 0, (LF + LB) / 2 - 0.5, 10.6, len, 0.5, LB - LF + 2, white);       // slab and terrace
    box(mid, 0, LF - 0.4, 11.1, len - 2, 1.05, 0.08, '#c4d6e4');                // glass balustrade
    box(mid, 0, LF - 0.4, 12.12, len - 2, 0.08, 0.14, '#9aa3ad');               // its handrail
    glassBox(mid, 0, (LF + 4 + LB) / 2, 11.1, len - 6, 3.6, LB - LF - 4, 2.4);  // glass floor two
    box(mid, 0, (LF + 2.5 + LB) / 2, 14.7, len - 2, 0.7, LB - LF - 1.5, white); // roof
    box(mid, 0, LF + 2.6, 14.7, len - 2, 0.7, 0.3, '#5b3fd6');                  // accent edge
    for (let k = 0; k < 6; k++) box(s0 + 25 + k * (len - 50) / 5, 0, LB - 6, 15.4, 5, 1.6, 4, '#b9bec6');
    // pit wall pods with white roofs and a row of screens
    for (let k = 0; k < 5; k++) {
      const s = s0 + 20 + k * (len - 40) / 4;
      box(s, 0, -5.6, 0, 3, 2.3, 1.6, '#3a3f48');
      box(s, 0, -5.6, 2.6, 3.8, 0.2, 2.6, white);
      box(s, 0, -6.35, 1.35, 2.6, 0.55, 0.06, '#11151c');
      box(s, 1.7, -5.6, 1.3, 0.12, 1.3, 0.12, '#9aa0aa'); box(s, -1.7, -5.6, 1.3, 0.12, 1.3, 0.12, '#9aa0aa');
    }
    // race control: a glass tower behind the middle of the paddock, and hotel blocks at both ends
    for (let f = 0; f < 4; f++) glassBox(mid, 0, 74, f * 4.4, 22 - f * 1.5, 4.0, 16 - f * 1.2, 2.6);
    for (let f = 0; f < 4; f++) box(mid, 0, 74, f * 4.4 + 4, 23 - f * 1.5, 0.4, 17 - f * 1.2, white);
    box(mid, 0, 74, 4 * 4.4, 17.6, 0.5, 12, '#5b3fd6'); box(mid, 0, 74, 4 * 4.4 + 0.5, 6, 3, 5, '#b9bec6');
    for (const s of [s0 - 14, s1 + 14]) {
      glassBox(s, 0, 46, 0, 24, 16, 16, 3.2, 3);
      box(s, 0, 46, 16, 25, 0.8, 17, white);
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
      // garage: back panel in team colours, the roller door housing, the team band over the door
      box(s, 0, LB - 2.1, 0.2, spacing - 1.6, 4.6, 0.2, c1.clone().multiplyScalar(0.8));
      box(s, 0, LB - 2.0, 4.0, spacing - 3, 0.9, 0.1, '#11151c');                 // timing screens
      box(s, 0, LF + 0.5, 4.9, spacing - 0.9, 0.55, 0.7, steel);
      box(s, 0, LF - 0.5, 5.2, spacing - 0.4, 0.8, 0.3, c1);
      box(s, 0, LF - 4.1, 5.85, spacing - 0.4, 0.45, 0.12, c1);                  // canopy edge
      box(s, -6.2, 7.2, 0, 1.6, 2.2, 1.1, '#7d848f'); box(s, 6.2, 7.2, 0, 1.6, 2.2, 1.1, '#7d848f');
      // the team truck behind the building: two-tone trailer, a cab, wheels and an awning to the garage
      const TL = 34;
      box(s, -1, TL, 1.0, 12, 1.7, 2.56, c1);
      box(s, -1, TL, 2.7, 12, 1.4, 2.55, white);
      box(s, -1, TL, 2.62, 12.02, 0.16, 2.6, col(t.c2));
      box(s, -1, TL, 4.1, 11.9, 0.12, 2.45, '#d4d8de');
      box(s, -1, TL, 0.62, 11.5, 0.4, 2.3, '#24272d');                          // chassis and skirts
      box(s, 6.3, TL, 0.6, 2.4, 2.5, 2.5, c1.clone().multiplyScalar(0.75));     // cab
      box(s, 7.52, TL, 2.0, 0.06, 0.9, 2.2, '#1a2230');                         // windscreen
      box(s, 7.56, TL, 0.7, 0.08, 0.6, 2.3, '#c0c4ca');                         // grille and bumper
      box(s, 6.0, TL, 3.1, 1.9, 0.5, 2.3, c1.clone().multiplyScalar(0.6));      // roof fairing
      for (const a of [-5.8, -4.6, -3.4, 4.0, 6.6]) for (const q of [-1, 1]) wheel(s, a, TL + q * 1.05);
      // the awning from the truck to the garage back wall
      box(s, -1, (LB + TL - 1.3) / 2, 3.9, 11, 0.1, TL - 1.3 - LB, c1.clone().lerp(col('#ffffff'), 0.25));
      for (const a of [-6, 4]) box(s, a, TL - 1.6, 0, 0.1, 3.9, 0.1, '#9aa0aa');
      // the team's motorhome: a two-floor glass unit with a white frame and a terrace on top
      const HL = 50, hw = spacing - 2.6;
      glassBox(s, 0, HL, 0, hw - 1.2, 3.6, 10, 2.2);
      box(s, 0, HL, 3.6, hw, 0.35, 11.5, white);
      glassBox(s, 0, HL, 3.95, hw, 3.3, 11.5, 2.2);
      box(s, 0, HL, 7.25, hw + 0.4, 0.45, 12, white);
      box(s, 0, HL - 6.05, 7.25, hw + 0.4, 0.45, 0.1, c1);
      box(s, 0, HL - 5.3, 0, hw - 1, 0.15, 1.6, '#cfd3d9');                      // steps
      box(s, 0, HL - 5.8, 7.7, hw, 0.9, 0.06, '#c4d6e4');                        // terrace glass
    }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const solid = new THREE.Mesh(mergeGeometries(geos.map((g) => g.index ? g.toNonIndexed() : g)), mat);
    solid.castShadow = solid.receiveShadow = true;
    const glazed = new THREE.Mesh(mergeGeometries(glass), facadeMaterial(world.pal, { glass: '#2f6fa8', lit: 0.75, key: 'paddock' }));
    glazed.castShadow = !world.lite;
    this.group.add(glazed);
    const ground = new THREE.Mesh(mergeGeometries(flat), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    ground.receiveShadow = true;
    this.group.add(solid, ground);
    geos.concat(flat, glass).forEach((g) => g.dispose());

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
    this.loadCrew();
  }

  // the modelled crew (art/people): standing and kneeling, near and far; until it loads, the simple figures stand in
  loadCrew() {
    loadGLB('people/crew').then((scene) => {
      if (this.disposed) return;
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      // overalls (vertex alpha 1) take the team colour; helmets, visors, gloves and boots keep their own
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `
          vColor = vec4(color.rgb, 1.0);
          #ifdef USE_INSTANCING_COLOR
            vColor.rgb = mix(color.rgb, color.rgb * instanceColor.rgb, color.a);
          #endif`);
      };
      mat.customProgramCacheKey = () => 'agp-crew';
      const n = this.crew.length;
      this.figs = {};
      for (const key of ['stand_L0', 'stand_L1', 'kneel_L0', 'kneel_L1']) {
        const o = scene.getObjectByName('crew_' + key);
        const im = new THREE.InstancedMesh(o.geometry, mat, n);
        im.castShadow = !this.w.lite; im.frustumCulled = false; im.count = 0;
        this.crew.forEach((m, i) => im.setColorAt(i, col(m.j === 15 ? '#ff7a1a' : m.team.c1)));
        this.group.add(im); this.figs[key] = im;
      }
      this.bodies.visible = this.helmets.visible = false;
    }).catch(() => {});
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
    const F = this.figs;
    if (F) for (const im of Object.values(F)) im.count = 0;
    this.c ||= new THREE.Color();
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
      if (F) {
        const kneel = crouch < 1;
        const cam = this.w.camera, d2 = cam ? cam.position.distanceToSquared(this.v) : 0, near = d2 < (this.w.lite ? 20 : 45) ** 2;
        if (d2 > (this.w.lite ? 150 : 260) ** 2) return;   // too small to see from here
        this.sc.set(1.1, 1.1, 1.1);
        this.m4.compose(this.v.set(tmp.x, kneel ? 0 : bob, tmp.z), this.q, this.sc);
        const im = F[(kneel ? 'kneel' : 'stand') + (near ? '_L0' : '_L1')];
        const k = im.count++;
        im.setMatrixAt(k, this.m4); im.setColorAt(k, this.c.set(m.j === 15 ? '#ff7a1a' : m.team.c1));
      }
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.helmets.instanceMatrix.needsUpdate = true;
    if (F) for (const im of Object.values(F)) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }

  dispose() { this.disposed = true; this.w.scene.remove(this.group); this.group.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); }); }
}
