// The paddock: white pit building with open garages, team trucks, hospitality towers,
// coloured pit boxes with gantries, tyre stacks, and a pit crew for each team that
// waits by the garage, gets ready as its car comes in and swarms it during the stop. Your crew
// watches the race on a screen at the front of the garage, and celebrates when your cars gain places.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sampleTrack } from './track.js';
import { ribbon, vcolor, CAR_SCALE } from './world.js';
import { loadGLB } from './cars.js';
import { facade, facadeMaterial } from './kit.js';

const col = (h) => new THREE.Color(h);
const tmp = {};
const CREW = 16;
const POSES = ['stand', 'kneel', 'cheer', 'pump', 'watch', 'despair'];
const LF = 11;   // garage front, metres from the lane centre towards the garages
const LB = 28;   // garage back wall
const SCR = [0, 10.4];   // your garage's screens (along, across): live timing on one side, the race on the other
const SCRW = 1.75;       // how far each screen sits from the middle
const CAM = [6.2, 4.4, 2.7];   // where the director's camera stands for a shot of your crew

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

    // your garage's race screen: live timing for your two cars, and the place you just gained
    this.mineTeam = teams.find((t) => t.you) || null;
    if (this.mineTeam) {
      const sB = P.box[this.mineTeam.box];
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 288;
      this.scr = { cv, g: cv.getContext('2d'), tex: new THREE.CanvasTexture(cv), at: -1, flash: null };
      this.scr.tex.colorSpace = THREE.SRGBColorSpace;
      // the race itself, as the TV shows it (main.js renders into it every few frames when you're near)
      const rt = new THREE.WebGLRenderTarget(world.lite ? 256 : 384, world.lite ? 144 : 216, { depthBuffer: true });
      this.feed = { rt, cam: new THREE.PerspectiveCamera(42, 16 / 9, 1, 2500), pos: new THREE.Vector3() };
      const fmat = new THREE.MeshBasicMaterial({ map: rt.texture });
      const frameMat = new THREE.MeshLambertMaterial({ color: '#15181e' });
      [[SCR[0] + SCRW, new THREE.MeshBasicMaterial({ map: this.scr.tex, toneMapped: false })], [SCR[0] - SCRW, fmat]].forEach(([al, m]) => {
        const a = sampleTrack(T, sB + al, P.lat + sd * SCR[1], {}), b = sampleTrack(T, sB + al, P.lat + sd * (SCR[1] - 1), {});
        const ny = Math.atan2(b.x - a.x, b.z - a.z);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), m);
        face.position.set(a.x + (b.x - a.x) * 0.07, 2.55, a.z + (b.z - a.z) * 0.07); face.rotation.y = ny;
        const frame = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.0, 0.12), frameMat);
        frame.position.set(a.x, 2.55, a.z); frame.rotation.y = ny;
        const pole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.6, 0.14), frameMat);
        pole.position.set(a.x, 0.8, a.z);
        frame.castShadow = pole.castShadow = true;
        this.group.add(face, frame, pole);
        if (m === fmat) this.feed.pos.set(a.x, 2.5, a.z);
      });
      this.drawScreen(null);
    }

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
    this.buildKit(teams.length);
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
      this.figs = {}; this.figM = {};
      scene.updateMatrixWorld(true);
      for (const key of POSES.flatMap((p) => [p + '_L0', p + '_L1'])) {
        const node = scene.getObjectByName('crew_' + key), o = node && (node.isMesh ? node : node.getObjectByProperty('isMesh', true));
        if (!o) continue;
        this.figM[key] = o.matrixWorld.clone();   // the compressed mesh's own scale and offset
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
    if (phase === 'watch') {   // a loose crescent in front of the screen, two rows deep
      const row = j >= 8 ? 1 : 0, k = j % 8, th = (row ? 212 : 204) + k * (row ? 8.6 : 10.2) + (j * 37 % 5 - 2);
      const r = row ? 5.3 : 3.7, rad = th * Math.PI / 180;
      return [SCR[0] + Math.cos(rad) * r, SCR[1] + Math.sin(rad) * r];
    }
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
      if (phase === 'idle' && t === this.mineTeam) phase = 'watch';
      state.set(t.id, [phase, a0]);
    }
    const step = Math.min(1, dt * speed * 3.2);
    const mood = this.mood && this.t < this.mood.until ? this.mood.kind : null;
    if (this.scr && (this.t - this.scr.at > 0.4 || this.scr.dirty)) { this.scr.at = this.t; this.scr.dirty = false; this.drawScreen(race); }
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
      let face, pose = 'stand', jump = 0;
      if (moving) face = Math.atan2(sd * dl, da);
      else if (phase === 'idle') face = -Math.PI / 2 * sd;
      else if (phase === 'watch') {
        face = Math.atan2(sd * (SCR[1] - m.l), SCR[0] - m.a);
        if (mood === 'cheer') {
          // arms up, fist pumps, jumping, turning to each other
          const k = m.j % 3, ph = this.t * 8 + m.j * 1.3;
          pose = k === 1 ? (Math.sin(this.t * 15 + m.j) > 0 ? 'pump' : 'cheer') : 'cheer';
          jump = k === 0 ? Math.max(0, Math.sin(ph)) * 0.34 : Math.abs(Math.sin(ph * 0.8)) * 0.1;
          // they turn round from the screen to celebrate (towards the director's camera), and to each other
          face = Math.atan2(sd * (CAM[1] - m.l), CAM[0] - m.a) + Math.sin(this.t * 3.1 + m.j * 2.1) * 0.6;
        } else if (mood === 'despair') pose = m.j % 2 ? 'despair' : 'watch';
        else pose = m.j % 3 === 0 ? 'watch' : 'stand';
      }
      else face = Math.atan2(-sd * m.l, a0 - m.a);
      m.face += Math.atan2(Math.sin(face - m.face), Math.cos(face - m.face)) * Math.min(1, step * 2);
      const bob = phase === 'work' && !moving ? Math.abs(Math.sin(this.t * 14 + m.j)) * 0.08 : moving ? Math.abs(Math.sin(this.t * 10 + m.j)) * 0.06 : jump;
      const crouch = phase === 'work' && m.j < 12 && !moving ? 0.78 : 1;
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), -(hd + m.face * 1));
      m.wx = tmp.x; m.wz = tmp.z; m.yaw = -(hd + m.face); m.kneel = crouch < 1; m.ph = phase; m.mv = moving;
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
        const key = (kneel ? 'kneel' : moving ? 'stand' : pose) + (near ? '_L0' : '_L1');
        const im = F[key] || F['stand' + (near ? '_L0' : '_L1')];
        const k = im.count++;
        im.setMatrixAt(k, this.m4.multiply(this.figM[key] || this.figM['stand' + (near ? '_L0' : '_L1')])); im.setColorAt(k, this.c.set(m.j === 15 ? '#ff7a1a' : m.team.c1));
      }
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.helmets.instanceMatrix.needsUpdate = true;
    if (F) for (const im of Object.values(F)) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    this.kit(state);
  }

  // pit stop equipment, shown only for crews getting ready or working: front and rear jacks, a wheel
  // gun on each corner with its air hose up to the gantry, new tyres carried in and old ones carried
  // away, and the lollipop over the nose
  buildKit(nTeams) {
    const dark = '#22252b', steel = '#9aa0aa';
    const part = (g, c) => { g = g.index ? g.toNonIndexed() : g; return vcolor(g, col(c)); };
    // jack: a long handle along +x from the hands, a cross-head at the far end and two small wheels
    const jack = mergeGeometries([
      part(new THREE.BoxGeometry(1.5, 0.06, 0.06).translate(0.75, 0, 0), steel),
      part(new THREE.BoxGeometry(0.22, 0.14, 0.62).translate(1.55, 0, 0), '#e8b100'),
      part(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 10).rotateX(Math.PI / 2).translate(1.35, -0.08, 0.2), dark),
      part(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 10).rotateX(Math.PI / 2).translate(1.35, -0.08, -0.2), dark),
    ]);
    // wheel gun: body, handle and socket, held out in front
    const gun = mergeGeometries([
      part(new THREE.BoxGeometry(0.3, 0.12, 0.12), '#c8ccd2'),
      part(new THREE.BoxGeometry(0.06, 0.16, 0.06).translate(-0.06, -0.12, 0), dark),
      part(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 8).rotateZ(Math.PI / 2).translate(0.2, 0, 0), dark),
    ]);
    // lollipop: a pole with a round red sign
    const lolly = mergeGeometries([
      part(new THREE.BoxGeometry(1.3, 0.04, 0.04).translate(0.65, 0, 0), steel),
      part(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 18).rotateZ(Math.PI / 2).translate(1.3, 0.2, 0), '#e10600'),
    ]);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mk = (g, n, m = mat) => { const im = new THREE.InstancedMesh(g, m, n); im.count = 0; im.frustumCulled = false; im.castShadow = !this.w.lite; this.group.add(im); return im; };
    this.kitM = { jack: mk(jack, nTeams * 2), gun: mk(gun, nTeams * 4), lolly: mk(lolly, nTeams), tyre: mk(this.tyres.geometry, nTeams * 4, this.tyres.material) };
    // hoses: thin dark lines from each gun up to the gantry beam, sagging a little
    this.hoseSeg = 8;
    const hp = new Float32Array(nTeams * 4 * this.hoseSeg * 2 * 3);
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
    this.hoses = new THREE.LineSegments(hg, new THREE.LineBasicMaterial({ color: '#15171b' }));
    this.hoses.frustumCulled = false; this.group.add(this.hoses);
    this.kq = new THREE.Quaternion(); this.ke = new THREE.Euler(0, 0, 0, 'YXZ'); this.kv = new THREE.Vector3(); this.km = new THREE.Matrix4(); this.ks = new THREE.Vector3(1, 1, 1);
  }
  kit(state) {
    const K = this.kitM; if (!K) return;
    for (const im of Object.values(K)) im.count = 0;
    let h = 0;
    const T = this.w.T, P = T.pit, sd = P.side, hp = this.hoses.geometry.attributes.position.array, cam = this.w.camera;
    const place = (im, x, y, z, yaw, pitch = 0, roll = 0) => {
      this.ke.set(roll, yaw, pitch, 'YXZ');
      this.km.compose(this.kv.set(x, y, z), this.kq.setFromEuler(this.ke), this.ks);
      im.setMatrixAt(im.count++, this.km);
    };
    for (const m of this.crew) {
      if (m.ph !== 'work' && m.ph !== 'ready') continue;
      if (cam && (cam.position.x - m.wx) ** 2 + (cam.position.z - m.wz) ** 2 > 220 ** 2) continue;
      const fx = Math.cos(m.yaw), fz = -Math.sin(m.yaw), work = m.ph === 'work' && !m.mv;
      const at = (d, y) => [m.wx + fx * d, y, m.wz + fz * d];
      if (m.j === 12 || m.j === 13) {
        // jacks: held level while waiting, angled down under the nose or the tail during the stop
        const [x, y, z] = at(0.3, work ? 0.62 : 0.85);
        place(K.jack, x, y, z, m.yaw, work ? -0.38 : -0.08);
      } else if (m.j === 15) {
        const [x, y, z] = at(0.25, 1.35);
        place(K.lolly, x, y, z, m.yaw, work ? 0.22 : 0.5);
      } else if (m.j < 12) {
        const role = m.j % 3;   // 0 takes the old tyre off, 1 runs the gun, 2 brings the new tyre
        if (role === 1) {
          const [x, y, z] = at(work ? 0.55 : 0.4, work ? 0.5 : 0.95);
          place(K.gun, x, y, z, m.yaw);
          // the hose up to the gantry over the front of the box, above this corner
          const a0 = P.box[m.team.box];
          sampleTrack(T, a0 + 4.8, P.lat + sd * Math.max(-3, Math.min(3, m.l)), tmp);
          const gx = tmp.x, gz = tmp.z, gy = 4.0;
          const S = this.hoseSeg;
          for (let k = 0; k < S && h < hp.length / 6; k++) {
            const p0 = k / S, p1 = (k + 1) / S;
            const pt = (u, o) => { hp[o] = x + (gx - x) * u; hp[o + 2] = z + (gz - z) * u; hp[o + 1] = y + (gy - y) * u - Math.sin(u * Math.PI) * 0.9 * (1 - u * 0.4); };
            pt(p0, h * 6); pt(p1, h * 6 + 3); h++;
          }
        } else if ((role === 2 && !work) || (role === 0 && work)) {
          // a new tyre carried in, or the old one held once it's off
          const [x, y, z] = at(0.42, 0.78);
          place(K.tyre, x, y, z, m.yaw, Math.PI / 2);
        }
      }
    }
    this.hoses.geometry.setDrawRange(0, h * 2);
    this.hoses.geometry.attributes.position.needsUpdate = true;
    for (const im of Object.values(K)) im.instanceMatrix.needsUpdate = true;
  }

  // your crew reacts to a place gained ('cheer') or lost ('despair') for a few seconds
  celebrate(kind, info = null, sec = 4.5) {
    if (!this.mineTeam) return;
    this.mood = { kind, until: this.t + sec };
    if (this.scr) { this.scr.flash = info && { ...info, kind, until: this.t + sec }; this.scr.dirty = true; }
  }
  // the director's shot of your crew: where the camera stands, the screen and the middle of the crew
  shot() {
    if (!this.mineTeam) return null;
    const T = this.w.T, P = T.pit, sd = P.side, s = P.box[this.mineTeam.box];
    const at = (a, l, y) => { sampleTrack(T, s + a, P.lat + sd * l, tmp); return new THREE.Vector3(tmp.x, y, tmp.z); };
    return { cam: at(CAM[0], CAM[1], CAM[2]), screen: at(SCR[0], SCR[1], 2.5), crew: at(SCR[0] - 2.4, SCR[1] - 3.9, 1.3) };
  }
  drawScreen(race) {
    const { g, cv, tex } = this.scr, W = cv.width, H = cv.height, t = this.mineTeam;
    g.fillStyle = '#0b0e14'; g.fillRect(0, 0, W, H);
    g.fillStyle = t.c1; g.fillRect(0, 0, W, 46);
    g.fillStyle = '#ffffff'; g.font = 'bold 26px system-ui, sans-serif'; g.textBaseline = 'middle';
    g.fillText('LIVE TIMING', 18, 24);
    g.fillStyle = '#ff3b3b'; g.beginPath(); g.arc(W - 30, 23, 8, 0, Math.PI * 2); g.fill();
    const f = this.scr.flash && this.t < this.scr.flash.until ? this.scr.flash : null;
    if (f) {
      const up = f.kind === 'cheer';
      g.fillStyle = up ? '#1f9d4c' : '#b3262e'; g.fillRect(0, 46, W, H - 46);
      g.fillStyle = '#ffffff'; g.textAlign = 'center';
      g.font = 'bold 40px system-ui, sans-serif'; g.fillText(f.code, W / 2, 98);
      g.font = 'bold 84px system-ui, sans-serif'; g.fillText(`P${f.from} ${up ? '▲' : '▼'} P${f.to}`, W / 2, 190);
      g.textAlign = 'left'; tex.needsUpdate = true; return;
    }
    const cars = race ? race.cars.filter((c) => c.team === t || c.team.id === t.id) : [];
    cars.forEach((c, i) => {
      const y = 100 + i * 92;
      g.fillStyle = '#1a2030'; g.fillRect(14, y - 36, W - 28, 76);
      g.fillStyle = t.c2 || '#d4ff3a'; g.fillRect(14, y - 36, 8, 76);
      g.fillStyle = '#ffffff'; g.font = 'bold 50px system-ui, sans-serif'; g.fillText(c.dnf ? 'OUT' : 'P' + c.pos, 36, y + 2);
      g.font = 'bold 34px system-ui, sans-serif'; g.fillText(c.code, 190, y + 2);
      g.fillStyle = '#9fb0c8'; g.font = '30px system-ui, sans-serif'; g.textAlign = 'right';
      g.fillText(c.pit ? 'PIT' : c.pos === 1 ? 'LEADER' : '+' + Math.max(0, c.interval).toFixed(1), W - 30, y + 2);
      g.textAlign = 'left';
    });
    tex.needsUpdate = true;
  }

  dispose() { this.disposed = true; this.feed?.rt.dispose(); this.w.scene.remove(this.group); this.group.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); }); }
}
