// The showroom: one car on a turntable in your colours. Drag to spin it, pinch or scroll to zoom,
// pull the Cutaway slider to slice the bodywork away and see what sits inside, and pick your
// team's colours. It has its own small renderer, made when the showroom opens and freed when it
// closes, so the race behind it is untouched.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadCar, liveryMaterial } from './cars.js';
import { CARS, carById, strengthBars } from './carspec.js';
import { LIVERIES } from './data.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Blender's car frame (X forward, Y left, Z up) to the scene's (glTF: Y up)
const V = (x, y, z) => new THREE.Vector3(x, z, -y);

// what's inside, the same for every car: where it sits (Blender frame) and what it does
const INSIDE = [
  { id: 'driver', name: 'Driver', text: 'Lies almost flat, feet up in the nose, inside a carbon survival cell.', at: [0.3, 0, 0.42] },
  { id: 'fuel', name: 'Fuel cell', text: 'A rubber bag behind the seat, so a crash can\'t split it.', at: [-0.42, 0, 0.42] },
  { id: 'battery', name: 'Battery', text: 'Stores energy saved under braking for the boost button.', at: [-0.4, 0.2, 0.13] },
  { id: 'engine', name: 'Power unit', text: 'A small turbo engine plus an electric motor. Together, about 1000 hp.', at: [-1.05, 0, 0.5] },
  { id: 'gearbox', name: 'Gearbox', text: 'Eight gears; a shift takes a few hundredths of a second.', at: [-1.75, 0, 0.32] },
  { id: 'radiator', name: 'Radiators', text: 'Air from the side intakes cools the engine and battery.', at: [0.1, -0.52, 0.36] },
  { id: 'brakes', name: 'Brakes', text: 'Carbon discs glow at about 1000 °C and stop the car from 300 km/h in 4 seconds.', at: [1.55, -0.62, 0.34] },
];
const OUTSIDE = [
  { id: 'fwing', name: 'Front wing', text: 'Pushes the front tyres into the road for grip in the corners.', at: [2.75, 0.55, 0.16] },
  { id: 'rwing', name: 'Rear wing', text: 'Grip for the rear tyres. A flap opens on the straights for top speed.', at: [-2.15, 0.4, 1.12] },
  { id: 'canopy', name: 'Canopy', text: 'A closed bubble of tough glass shields the driver.', at: [0.4, 0, 0.84] },
  { id: 'floor', name: 'Floor', text: 'Shaped tunnels underneath suck the car to the track.', at: [-0.6, -0.86, 0.08] },
];

// the parts inside, in simple rounded shapes and their own colours, as one group
function internals() {
  const g = new THREE.Group();
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.15, ...o });
  const put = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.copy(V(x, y, z)); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  // a capsule lying along the car (Blender X), scaled to a length, width and height
  const pod = (x0, x1, w, z0, z1, m, y = 0) => {
    const r = Math.min(w, (z1 - z0) / 2), len = Math.max(0.01, x1 - x0 - 2 * r);
    const o = put(new THREE.CapsuleGeometry(r, len, 6, 16), m, (x0 + x1) / 2, y, (z0 + z1) / 2, 0, 0, Math.PI / 2);
    o.scale.set((z1 - z0) / 2 / r, 1, w / r); return o;
  };
  const suit = mat('#1f2a44'), carbon = mat('#14161a', { roughness: 0.35 }), alloy = mat('#9aa1ab', { metalness: 0.85, roughness: 0.28 });
  pod(-0.12, 0.6, 0.17, 0.1, 0.2, carbon);                                   // seat shell
  pod(-0.02, 0.56, 0.15, 0.17, 0.35, suit);                                  // the driver, lying back
  pod(0.5, 1.35, 0.12, 0.15, 0.29, suit);                                    // legs, up in the nose
  pod(-0.72, -0.12, 0.22, 0.18, 0.54, mat('#3b3f46', { roughness: 0.8 }));   // fuel cell
  put(new THREE.BoxGeometry(0.58, 0.07, 0.46), mat('#2f6bff', { emissive: '#163c9c', emissiveIntensity: 0.7 }), -0.43, 0, 0.13); // battery
  // the power unit: a block with two cylinder banks in a V, a turbo and an electric motor
  pod(-1.42, -0.76, 0.16, 0.14, 0.38, alloy);
  for (const s of [1, -1]) {
    const bank = pod(-1.38, -0.8, 0.07, 0.36, 0.5, alloy, s * 0.1); bank.rotation.x = s * 0.45;
    put(new THREE.BoxGeometry(0.5, 0.03, 0.09), mat('#c4262e'), -1.09, s * 0.14, 0.53, s * 0.45);
  }
  const turbo = put(new THREE.TorusGeometry(0.06, 0.03, 10, 24), mat('#b9bfc8', { metalness: 0.9, roughness: 0.2 }), -0.8, 0, 0.56); turbo.rotation.y = Math.PI / 2;
  put(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 20), mat('#e0a21b', { metalness: 0.5, roughness: 0.35 }), -0.9, 0.18, 0.22, Math.PI / 2); // MGU-K
  const gb = put(new THREE.CylinderGeometry(0.075, 0.12, 0.6, 4, 1), mat('#5b616b', { metalness: 0.7, roughness: 0.35 }), -1.72, 0, 0.26, 0, 0, Math.PI / 2);
  gb.rotation.y = Math.PI / 4;                                               // gearbox, tapering to the back
  for (const s of [1, -1]) {
    const r = put(new THREE.BoxGeometry(0.62, 0.24, 0.05), mat('#b5763e', { metalness: 0.6, roughness: 0.45 }), 0.08, s * 0.5, 0.3); r.rotation.y = s * 0.15;
    for (const [x, y] of [[1.55, 0.62], [-1.55, 0.6]]) put(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 28), mat('#ff6a1a', { emissive: '#ff3a00', emissiveIntensity: 0.9 }), x, s * y, 0.34);
  }
  return g;
}

// a soft studio to reflect in: a gradient dome with a few bright light panels
function studioEnv(renderer) {
  const s = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 p; void main(){ float h = normalize(p).y; gl_FragColor = vec4(mix(vec3(0.16, 0.17, 0.19), vec3(0.85, 0.88, 0.92), smoothstep(-0.2, 0.7, h)), 1.0); }',
  }));
  s.add(dome);
  for (const [x, y, z, w, h] of [[0, 9, 0, 14, 4], [10, 4, 6, 3, 6], [-9, 5, -7, 3, 5]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
    p.position.set(x, y, z); p.lookAt(0, 0, 0); s.add(p);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.03); pm.dispose();
  return rt;
}

export function openShowroom(ctx, opts = {}) {
  const { S, show, save } = ctx;
  let id = opts.id || S.settings.car || 'falcon';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lite = !!opts.lite;
  const team = () => S.team || ctx.team();
  // your colours: the team's, or the car's own until you change them
  const cols = () => ({ c1: team().c1, c2: team().c2, glow: team().glow || carById(id).glow });
  // before a team is built, colours picked here wait in a draft for the onboarding
  const setCols = (c) => { S.team = { ...structuredClone(team()), ...c, ...(S.team ? {} : { draft: true, fresh: true }) }; save(); };

  // opts.wizard: the onboarding's colour step, the car turning while you paint it (no car switching or Cutaway)
  const W = opts.wizard;
  let after = opts.back;
  const sh = show(`
    <div class="sr-stage"><canvas class="sr-gl" aria-label="The car in 3D. Drag to spin it, pinch or scroll to zoom."></canvas>
      <div class="sr-tags" aria-hidden="true"></div>
      <div class="sr-cut"><label for="srCut">Cutaway</label><input id="srCut" type="range" min="0" max="100" value="0" aria-describedby="srCutHelp"><span id="srCutHelp">Slide to see inside</span></div>
      <button type="button" class="sr-x" data-sr="back" aria-label="Close the showroom">✕</button>
    </div>
    <div class="sr-panel">
      ${W ? W.head : ''}
      <div class="sr-nav"><button type="button" class="chip" data-sr="prev" aria-label="Previous car">‹</button><div><div class="sub" id="srNo"></div><h2 id="srName"></h2></div><button type="button" class="chip" data-sr="next" aria-label="Next car">›</button></div>
      <p class="lede" id="srLine"></p>
      <div class="sr-bars" id="srBars"></div>
      <p class="note">Every car has the same overall pace: what one gains on the straights it gives back in the corners or under braking.</p>
      <div class="sub">Your colours</div>
      <div class="sr-cols">
        <label><input type="color" id="srC1"><span>Main</span></label>
        <label><input type="color" id="srC2"><span>Accent</span></label>
        <label><input type="color" id="srG"><span>Lights</span></label>
      </div>
      <div class="swatches sr-sw"><button type="button" data-sr="own" class="own" aria-label="This car's own colours"><i id="srOwn1"></i><i id="srOwn2"></i></button>${LIVERIES.map((l, i) => `<button type="button" data-liv="${i}" aria-label="${esc(l.name)}"><i style="background:${l.c1}"></i><i style="background:${l.c2}"></i></button>`).join('')}</div>
      ${W ? `<div class="actions"><button class="btn" data-sr="wnext" type="button">${W.nextLabel || 'Next'}</button><button class="btn ghost" data-sr="back" type="button">Back</button></div>`
    : '<div class="actions"><button class="btn" data-sr="pick" type="button" id="srPick"></button><button class="btn ghost" data-sr="back" type="button">Back</button></div>'}
    </div>`, W ? 'showroom wizcol' : 'showroom');

  const canvas = sh.querySelector('.sr-gl'), stage = sh.querySelector('.sr-stage'), tags = sh.querySelector('.sr-tags');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, lite ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const env = studioEnv(renderer);
  scene.environment = env.texture;
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const controls = new OrbitControls(cam, canvas);
  controls.enableDamping = true; controls.enablePan = false;
  controls.minDistance = 5; controls.maxDistance = 18; controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 0.35, 0);
  controls.autoRotate = !reduced; controls.autoRotateSpeed = 0.8;
  controls.addEventListener('start', () => { controls.autoRotate = false; if (glide) glide.t = 2; });

  const sun = new THREE.DirectionalLight('#ffffff', 2.2); sun.position.set(4, 8, 5); sun.castShadow = true;
  sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
  sun.shadow.bias = -0.0004; sun.shadow.radius = 4;
  scene.add(sun, new THREE.HemisphereLight('#ffffff', '#55585e', 0.6));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(7, 64).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.32 }));
  ground.receiveShadow = true; scene.add(ground);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.9, 4.0, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#9aa3ad', transparent: true, opacity: 0.16 }));
  ring.position.y = 0.002; scene.add(ring);

  // the cut: everything of the car beyond the plane is sliced away (the side facing you at the start)
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 2);
  const mat = liveryMaterial(env.texture); mat.clippingPlanes = [plane]; mat.clipShadows = true;
  const glass = new THREE.MeshStandardMaterial({ color: '#0a0d12', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.6, clippingPlanes: [plane] });
  const inner = new THREE.MeshBasicMaterial({ color: '#0d0f13', side: THREE.BackSide, clippingPlanes: [plane] });  // the shell's inside, seen through the cut
  const insides = internals(); insides.visible = false; scene.add(insides);
  
  let car = null, alive = true, cut = 0, token = 0;
  const C = new THREE.Color();
  function paint() {
    if (!car) return;
    const c = cols();
    for (const im of car.userData.ims) for (const [k, v] of [['iC1', c.c1], ['iC2', c.c2], ['iC3', c.glow]]) {
      C.set(v); im.geometry.attributes[k].setXYZ(0, C.r, C.g, C.b); im.geometry.attributes[k].needsUpdate = true;
    }
  }
  async function load() {
    const my = ++token;
    const m = await loadCar(id).catch(() => null);
    if (!alive || my !== token || !m) return;
    if (car) { scene.remove(car); car.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
    car = new THREE.Group(); car.userData.ims = [];
    for (const p of m.lods[lite ? 1 : 0]) {
      const geo = p.geo.clone();
      for (const k of ['iC1', 'iC2', 'iC3']) geo.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(3), 3));
      const im = new THREE.InstancedMesh(geo, p.glass ? glass : mat, 1);
      im.setMatrixAt(0, p.local); im.castShadow = !p.glass; im.frustumCulled = false;
      car.add(im); car.userData.ims.push(im);
      if (!p.glass) { const back = new THREE.Mesh(geo, inner); back.applyMatrix4(p.local); car.add(back); }
    }
    scene.add(car); paint(); applyCut();
  }
  function applyCut() {
    // 0: whole car; 100: the half nearer you gone, down the centre line
    plane.normal.set(0, 0, cam.position.z >= 0 ? -1 : 1);
    plane.constant = cut <= 0 ? 3 : 1.25 * (1 - cut / 100);
    insides.visible = cut > 4;
    stage.classList.toggle('cut', cut > 25);
  }

  // callouts: the outside parts on the whole car, the inside ones once it is cut open
  const tagEls = new Map();
  for (const t of [...OUTSIDE, ...INSIDE]) {
    const el = document.createElement('div'); el.className = 'sr-tag'; el.innerHTML = `<i class="dot"></i><em class="stem"></em><div class="card"><b>${esc(t.name)}</b><span>${esc(t.text)}</span></div>`;
    tags.append(el); tagEls.set(t, el);
  }
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  function placeTags(w, h) {
    const showIn = cut > 35;
    const list = showIn ? INSIDE : cut === 0 ? OUTSIDE : [];
    const placed = [];
    for (const [t, el] of tagEls) {
      let on = list.includes(t);
      if (on) {
        P.copy(V(...t.at)); P.project(cam);
        const x = (P.x * 0.5 + 0.5) * w, y = (-P.y * 0.5 + 0.5) * h;
        const card = el.lastElementChild, left = x > w * 0.6, tw = card.offsetWidth || 160, th = card.offsetHeight || 40;
        on = P.z < 1 && x > 4 && x < w - 4 && y > 4 && y < h - 70;
        // the card sits beside its point, or is lifted above or dropped below it on a stem, so cards
        // never cover each other; one with nowhere to go waits for a better angle
        let dy = null;
        if (on) for (const d of [0, -(th + 10), th + 10, -(2 * th + 20)]) {
          const r = { x0: left ? x - tw - 12 : x + 12, x1: left ? x - 12 : x + tw + 12, y0: y + d - 14, y1: y + d - 14 + th };
          if (r.x0 < 4 || r.x1 > w - 4 || r.y0 < 4 || r.y1 > h - 70) continue;
          if (placed.some((q) => r.x0 < q.x1 + 6 && r.x1 > q.x0 - 6 && r.y0 < q.y1 + 6 && r.y1 > q.y0 - 6)) continue;
          placed.push(r); dy = d; break;
        }
        on = dy !== null;
        if (on) {
          el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`; el.classList.toggle('left', left);
          card.style.top = `${dy - 14}px`;
          const stem = el.children[1]; stem.style.top = `${Math.min(0, dy)}px`; stem.style.height = `${Math.abs(dy)}px`;
        }
      }
      el.classList.toggle('on', on);
    }
  }
  // once you start cutting, the camera glides round to the side so the section faces you
  let glide = null;
  function toSide() {
    if (glide || cut <= 0) return;
    controls.autoRotate = false;
    const side = cam.position.z >= 0 ? 1 : -1, to = new THREE.Vector3(1.4, 3.2, side * 10.5).multiplyScalar(cam.aspect < 0.9 ? 1.15 : 1);
    glide = { from: cam.position.clone(), to, t: reduced ? 1 : 0 };
  }

  function info() {
    const c = carById(id), i = CARS.indexOf(c);
    sh.querySelector('#srNo').textContent = `AGP-${String(i + 1).padStart(2, '0')}`;
    sh.querySelector('#srName').textContent = c.name;
    sh.querySelector('#srLine').textContent = c.line;
    sh.querySelector('#srBars').innerHTML = strengthBars(id).map(([k, v]) => `<div><span>${k}</span><i><u style="width:${v}%"></u></i></div>`).join('');
    sh.querySelector('#srOwn1').style.background = c.c1; sh.querySelector('#srOwn2').style.background = c.c2;
    const mine = (S.settings.car || 'falcon') === id;
    const pick = sh.querySelector('#srPick'); if (pick) { pick.textContent = mine ? 'Racing this car' : `Race the ${c.name}`; pick.disabled = mine; }
    syncCols();
  }
  function syncCols() {
    const c = cols();
    sh.querySelector('#srC1').value = c.c1; sh.querySelector('#srC2').value = c.c2; sh.querySelector('#srG').value = c.glow;
  }

  sh.onclick = (e) => {
    const b = e.target.closest('[data-sr], [data-liv]'); if (!b) return;
    const k = b.dataset.sr;
    if (b.dataset.liv) { const l = LIVERIES[+b.dataset.liv]; setCols({ c1: l.c1, c2: l.c2 }); syncCols(); paint(); return; }
    if (k === 'own') { const c = carById(id); setCols({ c1: c.c1, c2: c.c2, glow: c.glow }); syncCols(); paint(); }
    if (k === 'prev' || k === 'next') { const i = CARS.findIndex((c) => c.id === id); id = CARS[(i + (k === 'next' ? 1 : CARS.length - 1)) % CARS.length].id; info(); load(); }
    if (k === 'pick') { opts.pick?.(id); info(); }
    if (k === 'back') close();
    if (k === 'wnext') { after = W.next; close(); }
  };
  sh.oninput = (e) => {
    if (e.target.id === 'srCut') { cut = +e.target.value; applyCut(); toSide(); if (!cut) glide = null; }
    if (e.target.id === 'srC1') setCols({ c1: e.target.value });
    if (e.target.id === 'srC2') setCols({ c2: e.target.value });
    if (e.target.id === 'srG') setCols({ glow: e.target.value });
    if (/^srC|^srG/.test(e.target.id)) paint();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onKey);

  const fitCam = (w, h) => {
    cam.aspect = w / h;
    // narrow screens: a wider lens and a step back so the whole car fits
    cam.fov = w / h < 0.9 ? 40 : 32;
    cam.updateProjectionMatrix();
  };
  cam.position.set(7.2, 3.1, 7.8);
  let lastW = 0, lastH = 0, raf = 0, t0 = performance.now();
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (w !== lastW || h !== lastH) {
      lastW = w; lastH = h; renderer.setSize(w, h, false); fitCam(w, h);
      if (w / h < 0.9) cam.position.setLength(9.4);
    }
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
    if (glide && glide.t < 1.0001) {
      glide.t = Math.min(1.0002, glide.t + dt / 0.9);
      const k = Math.min(1, glide.t), e = k * k * (3 - 2 * k);
      cam.position.lerpVectors(glide.from, glide.to, e);
    }
    controls.update(dt);
    if (cut > 0) applyCut();
    renderer.render(scene, cam);
    placeTags(w, h);
  }
  function close() {
    alive = false; cancelAnimationFrame(raf); removeEventListener('keydown', onKey);
    controls.dispose();
    scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
    mat.dispose(); glass.dispose(); inner.dispose(); env.dispose(); renderer.dispose();
    renderer.forceContextLoss?.();
    (after || (() => {}))();
  }
  info(); load(); raf = requestAnimationFrame(frame);
  return { close };
}
