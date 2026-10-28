// The showroom: one car on a turntable in your colours. Drag to spin it all the way round, pinch or
// scroll to zoom, and pick your team's colours. The Cutaway slider first turns the bodywork to glass,
// so you see what sits inside from every angle, then pulls the car apart: bodywork up, wheels out,
// parts apart. Tap a part (on the car or in the Inside list) to fly to it and read what it does, or
// take the tour. It has its own small renderer, made when the showroom opens and freed when it
// closes, so the race behind it is untouched.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadCar, liveryMaterial, finishOf, liveryGlow } from './cars.js';
import { CARS, carById, strengthBars } from './carspec.js';
import { LIVERIES, FINISHES } from './data.js';
import { PARTS, partById, buildInside, V } from './cutaway.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
  const cols = () => ({ c1: team().c1, c2: team().c2, glow: team().glow || carById(id).glow, finish: team().finish || 'gloss' });
  // before a team is built, colours picked here wait in a draft for the onboarding
  const setCols = (c) => { S.team = { ...structuredClone(team()), ...c, ...(S.team ? {} : { draft: true, fresh: true }) }; save(); };
  // every change can be undone; a colour dragged across the wheel counts as one change
  const undo = []; let lastPush = 0;
  const change = (c, drag) => {
    const now = performance.now();
    if (!drag || now - lastPush > 700) { undo.push(cols()); if (undo.length > 40) undo.shift(); }
    lastPush = now; setCols(c);
  };

  // opts.onward { label, go }: the step after choosing a car (race setup, onboarding), one tap away
  // opts.wizard: the onboarding's colour step, the car turning while you paint it (no car switching or Cutaway)
  const W = opts.wizard;
  let after = opts.back;
  const sh = show(`
    <div class="sr-stage"><canvas class="sr-gl" aria-label="The car in 3D. Drag to spin it, pinch or scroll to zoom."></canvas>
      <div class="sr-tags" aria-hidden="true"></div>
      <div class="sr-cut"><label for="srCut">Cutaway</label><input id="srCut" type="range" min="0" max="100" value="0" aria-describedby="srCutHelp"><span id="srCutHelp"><i>Car</i><i>See-through</i><i>Pulled apart</i></span></div>
      <button type="button" class="sr-x" data-sr="back" aria-label="Close the showroom">✕</button>
    </div>
    <div class="sr-panel">
      ${W ? W.head : `<div class="sr-tabs" role="tablist"><button type="button" role="tab" data-tab="car" class="on">Car and colours</button><button type="button" role="tab" data-tab="inside">Inside the car</button></div>
      <div class="sr-pane sr-inside" data-pane="inside" hidden>
        <p class="lede">Slide the Cutaway to see through the bodywork, then further to pull the car apart. Tap a part here or on the car.</p>
        <div class="sr-tools"><button type="button" class="btn small" data-sr="tour">▶ Take the tour</button><button type="button" class="btn ghost small" data-sr="whole">Whole car</button></div>
        <ol class="sr-parts">${PARTS.map((p, i) => `<li data-li="${p.id}"><button type="button" data-part="${p.id}"><i>${i + 1}</i><b>${esc(p.name)}</b><span>${esc(p.short)}</span></button>
          <div class="more"><p>${esc(p.how)}</p><p class="fact">${esc(p.fact)}</p></div></li>`).join('')}</ol>
      </div>
      <div class="sr-pane" data-pane="car">`}
      <div class="sr-nav"><button type="button" class="chip" data-sr="prev" aria-label="Previous car">‹</button><div><div class="sub" id="srNo"></div><h2 id="srName"></h2></div><button type="button" class="chip" data-sr="next" aria-label="Next car">›</button></div>
      <p class="lede" id="srLine"></p>
      <div class="sr-bars" id="srBars"></div>
      <p class="note">Every car has the same overall pace: what one gains on the straights it gives back in the corners or under braking.</p>
      <div class="sub">Your colours</div>
      <div class="sr-cols">
        ${[['srC1', 'srH1', 'Main'], ['srC2', 'srH2', 'Accent'], ['srG', 'srHG', 'Lights']].map(([c, h, n]) => `<div class="sr-col"><label><input type="color" id="${c}"><span>${n}</span></label><input class="hex" id="${h}" maxlength="7" spellcheck="false" autocomplete="off" inputmode="text" aria-label="${n} colour code, like #1267F4"></div>`).join('')}
      </div>
      <div class="sr-fin" role="radiogroup" aria-label="Paint finish">${Object.entries(FINISHES).map(([k, f]) => `<button type="button" role="radio" data-fin="${k}">${f.name}</button>`).join('')}</div>
      <div class="swatches sr-sw"><button type="button" data-sr="own" class="own" aria-label="This car's own colours" title="This car's own colours"><i id="srOwn1"></i><i id="srOwn2"></i></button>${LIVERIES.map((l, i) => `<button type="button" data-liv="${i}" aria-label="${esc(l.name)}" title="${esc(l.name)}"><i style="background:${l.c1}"></i><i style="background:${l.c2}"></i></button>`).join('')}</div>
      <div class="sr-tools"><button type="button" class="chip" data-sr="rand">🎲 Randomize</button><button type="button" class="chip" data-sr="undo" disabled>↶ Undo</button><button type="button" class="chip" data-sr="reset">Reset</button><button type="button" class="chip" data-sr="light" aria-pressed="false">🌙 Night</button></div>
      ${W ? `<div class="actions"><button class="btn" data-sr="wnext" type="button">${W.nextLabel || 'Next'}</button><button class="btn ghost" data-sr="back" type="button">Back</button></div>`
    : `<div class="actions sr-go"><button class="btn" data-sr="pick" type="button" id="srPick"></button><button class="btn ghost" data-sr="back" type="button">${opts.onward ? 'All cars' : 'Back'}</button></div></div>`}
    </div>`, W ? 'showroom wizcol' : 'showroom');

  const canvas = sh.querySelector('.sr-gl'), stage = sh.querySelector('.sr-stage'), tags = sh.querySelector('.sr-tags'), slider = sh.querySelector('#srCut');
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
  controls.minDistance = 2.6; controls.maxDistance = 18; controls.maxPolarAngle = Math.PI * 0.53;
  controls.target.set(0, 0.35, 0);
  controls.autoRotate = !reduced; controls.autoRotateSpeed = 0.8;
  controls.addEventListener('start', () => { controls.autoRotate = false; fly = null; stopTour(); });

  const sun = new THREE.DirectionalLight('#ffffff', 2.2); sun.position.set(4, 8, 5); sun.castShadow = true;
  sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
  sun.shadow.bias = -0.0004; sun.shadow.radius = 4;
  const hemi = new THREE.HemisphereLight('#ffffff', '#55585e', 0.6);
  scene.add(sun, hemi);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(7, 64).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.32 }));
  ground.receiveShadow = true; scene.add(ground);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.9, 4.0, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#9aa3ad', transparent: true, opacity: 0.16 }));
  ring.position.y = 0.002; scene.add(ring);

  // the bodywork, the canopy, and a glass ghost of the bodywork that shows through as the paint fades
  const mat = liveryMaterial(env.texture);
  const glass = new THREE.MeshStandardMaterial({ color: '#0a0d12', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.6 });
  const ghost = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 }, uC: { value: new THREE.Color('#7cc4ff') } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 p = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-p.xyz); gl_Position = projectionMatrix * p; }',
    fragmentShader: 'uniform float uK; uniform vec3 uC; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); gl_FragColor = vec4(uC * (0.05 + 0.95 * f) * uK, 1.0); }',
  });

  let car = null, alive = true, cut = 0, token = 0, inside = null, sel = null, fly = null, tour = null;
  const body = new THREE.Group(), wheels = [];
  const C = new THREE.Color();
  function paint() {
    if (!car) return;
    const c = cols();
    const f = finishOf(c.finish);
    for (const im of car.userData.ims) {
      for (const [k, v] of [['iC1', c.c1], ['iC2', c.c2], ['iC3', c.glow]]) { C.set(v); im.geometry.attributes[k].setXYZ(0, C.r, C.g, C.b); im.geometry.attributes[k].needsUpdate = true; }
      im.geometry.attributes.iF.setXY(0, f.r, f.m); im.geometry.attributes.iF.needsUpdate = true;
    }
  }
  async function load() {
    const my = ++token;
    const m = await loadCar(id).catch(() => null);
    if (!alive || my !== token || !m) return;
    if (car) { scene.remove(car); car.traverse((o) => { if (o.isMesh && o.geometry !== undefined && !o.userData.shared) o.geometry.dispose(); }); }
    if (inside) { scene.remove(inside.group); inside.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } }); }
    car = new THREE.Group(); car.userData.ims = []; wheels.length = 0;
    body.clear(); car.add(body);
    const hubs = {};
    for (const p of m.lods[lite ? 1 : 0]) {
      const geo = p.geo.clone();
      for (const k of ['iC1', 'iC2', 'iC3']) geo.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(3), 3));
      geo.setAttribute('iF', new THREE.InstancedBufferAttribute(new Float32Array(2), 2));
      const im = new THREE.InstancedMesh(geo, p.glass ? glass : mat, 1);
      im.setMatrixAt(0, p.local); im.castShadow = !p.glass; im.frustumCulled = false;
      car.userData.ims.push(im);
      if (p.wheel) { const w = new THREE.Group(); w.add(im); car.add(w); wheels.push({ g: w, side: Math.sign(p.hub.z) || 1, front: p.wheel[0] === 'F' }); hubs[p.wheel] = p.hub.clone(); continue; }
      body.add(im);
      if (!p.glass) { const gm = new THREE.Mesh(geo, ghost); gm.applyMatrix4(p.local); gm.userData.shared = true; gm.renderOrder = 2; body.add(gm); }
    }
    inside = buildInside(hubs, lite); scene.add(inside.group);
    scene.add(car); paint(); applyCut();
  }
  // 0: the whole car. Up to 45: the paint fades to glass and the parts inside show through.
  // Beyond 55: the car comes apart, bodywork up, wheels out, the parts inside spread a little.
  const xr = () => Math.min(1, cut / 45), ex = () => Math.max(0, (cut - 55) / 45);
  function applyCut() {
    const x = xr(), e = ex();
    const see = x > 0.01;
    // see-through: the paint fades to glass. Pulled apart: the lifted bodywork turns solid again, so it
    // reads as the shell it is, hovering over the parts it covers
    const op = Math.min(1, 1 - 0.92 * x + 0.85 * e);
    if (mat.transparent !== op < 0.99) { mat.transparent = op < 0.99; mat.needsUpdate = true; }
    mat.opacity = op; mat.depthWrite = op > 0.5;
    glass.opacity = 0.6 * (1 - 0.85 * x + 0.6 * e);
    ghost.uniforms.uK.value = x * (1 - e) * 0.6;
    body.position.y = 1.15 * e * e * (3 - 2 * e);
    for (const w of wheels) { w.g.position.z = w.side * 0.75 * e; w.g.position.x = (w.front ? 0.15 : -0.15) * e; }
    if (inside) {
      inside.group.visible = see;
      for (const p of PARTS) { const q = inside.parts.get(p.id); if (q) q.g.position.copy(V(...p.out)).multiplyScalar(e); }
    }
    for (const im of car ? car.userData.ims : []) im.castShadow = op > 0.6 && im.material !== glass;
    // look a little higher as the car comes apart, so the lifted bodywork stays in the picture
    if (!sel && !fly) controls.target.y = 0.35 + 0.5 * e;
    stage.classList.toggle('cut', cut > 0);
  }

  // pins: a numbered dot on each part you can tap; the chosen one opens a card with its name
  const pins = new Map();
  PARTS.forEach((p, i) => {
    const el = document.createElement('button'); el.type = 'button'; el.className = 'sr-pin'; el.dataset.part = p.id;
    el.setAttribute('aria-label', p.name); el.innerHTML = `<b>${i + 1}</b><span class="card"><strong>${esc(p.name)}</strong><em>${esc(p.short)}</em></span>`;
    tags.append(el); pins.set(p, el);
  });
  const P = new THREE.Vector3();
  // where a part's pin sits now: its own point, moved with the part (or the bodywork) as the car comes apart
  function pinAt(p, out) {
    out.copy(V(...p.at));
    if (p.inside) out.add(V(...p.out).multiplyScalar(ex()));
    else if (p.id === 'tyres') out.add(new THREE.Vector3(0.15 * ex(), 0, -0.75 * ex()));
    else out.y += body.position.y;
    return out;
  }
  function placePins(w, h) {
    const x = xr();
    for (const [p, el] of pins) {
      // outside parts on the whole car, inside ones once you can see in; the chosen part always
      let on = p.id === sel || (p.inside ? x > 0.5 : x < 0.25);
      if (on) {
        pinAt(p, P).project(cam);
        const px = (P.x * 0.5 + 0.5) * w, py = (-P.y * 0.5 + 0.5) * h;
        on = P.z < 1 && px > 10 && px < w - 10 && py > 10 && py < h - 80;
        if (on) { el.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px)`; el.classList.toggle('left', px > w * 0.62); }
      }
      el.classList.toggle('on', on); el.classList.toggle('sel', p.id === sel);
    }
  }
  // pick a part: open it in the list, light it up, and fly the camera to it
  function choose(pid, opts2 = {}) {
    sel = pid; const p = partById(pid);
    sh.querySelectorAll('[data-li]').forEach((li) => li.classList.toggle('open', li.dataset.li === pid));
    if (!p) { inside?.highlight(null); flyTo(new THREE.Vector3(0, 0.35, 0), 9.5); return; }
    // inside parts need the bodywork see-through; outside ones need it back
    const want = p.inside ? Math.max(cut, opts2.apart ? 80 : 50) : 0;
    if (want !== cut) { cut = want; slider.value = cut; applyCut(); }
    inside?.highlight(p.inside ? pid : null);
    setTab('inside');
    const li = sh.querySelector(`[data-li="${pid}"]`); if (li && !opts2.quiet) li.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    flyTo(pinAt(p, new THREE.Vector3()), p.inside ? 4.4 : 5.2);
  }
  function flyTo(target, dist) {
    controls.autoRotate = false;
    // keep looking from the side you're on, a little above, at the new distance
    const dir = cam.position.clone().sub(controls.target); dir.y = Math.max(dir.y, dir.length() * 0.35);
    dir.setLength(dist * (canvas.clientWidth < 560 ? 1.6 : cam.aspect < 0.9 ? 1.25 : 1));
    fly = { t0: controls.target.clone(), t1: target.clone(), p0: cam.position.clone(), p1: target.clone().add(dir), k: reduced ? 1 : 0 };
  }
  // the tour: every part in turn, about five seconds each, until you touch anything
  function startTour() { tour = { i: 0, t: 0 }; choose(PARTS[0].id, { quiet: true }); controls.autoRotate = false; sh.querySelector('[data-sr="tour"]').textContent = '■ Stop the tour'; }
  function stopTour() { if (!tour) return; tour = null; const b = sh.querySelector('[data-sr="tour"]'); if (b) b.textContent = '▶ Take the tour'; }
  function setTab(t) {
    sh.querySelectorAll('[data-tab]').forEach((b) => { const on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    sh.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t; });
  }

  function info() {
    const c = carById(id), i = CARS.indexOf(c);
    sh.querySelector('#srNo').textContent = `AGP-${String(i + 1).padStart(2, '0')}`;
    sh.querySelector('#srName').textContent = c.name;
    sh.querySelector('#srLine').textContent = c.line;
    sh.querySelector('#srBars').innerHTML = strengthBars(id).map(([k, v]) => `<div><span>${k}</span><i><u style="width:${v}%"></u></i></div>`).join('');
    sh.querySelector('#srOwn1').style.background = c.c1; sh.querySelector('#srOwn2').style.background = c.c2;
    const mine = (S.settings.car || 'falcon') === id;
    // one tap moves on: with a next step it takes this car there; from the garage it picks the car and closes
    const pick = sh.querySelector('#srPick'); if (pick) pick.textContent = opts.onward ? `${opts.onward.label} →` : mine ? 'Done' : `Race the ${c.name}`;
    syncCols();
  }
  function syncCols(skip) {
    const c = cols();
    sh.querySelector('#srC1').value = c.c1; sh.querySelector('#srC2').value = c.c2; sh.querySelector('#srG').value = c.glow;
    for (const [h, v] of [['#srH1', c.c1], ['#srH2', c.c2], ['#srHG', c.glow]]) { const el = sh.querySelector(h); if (el !== skip) { el.value = v.toUpperCase(); el.classList.remove('bad'); } }
    sh.querySelectorAll('[data-fin]').forEach((b) => { const on = b.dataset.fin === c.finish; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    const u = sh.querySelector('[data-sr="undo"]'); if (u) u.disabled = !undo.length;
  }
  // a day or night look at the car: at night the paint goes dark and the light strips glow
  let night = false; const glowWas = liveryGlow();
  function lightUp() {
    sun.intensity = night ? 0.35 : 2.2; hemi.intensity = night ? 0.12 : 0.6;
    mat.envMapIntensity = night ? 0.3 : 1.0; liveryGlow(night ? 2.4 : glowWas);
    stage.classList.toggle('night', night);
    const b = sh.querySelector('[data-sr="light"]'); b.textContent = night ? '☀️ Day' : '🌙 Night'; b.setAttribute('aria-pressed', night);
  }
  // a random livery that still looks designed: a strong main colour, an accent that reads against it
  function randomCols() {
    const h = Math.random() * 360, hsl = (hh, s, l) => '#' + new THREE.Color().setHSL(((hh % 360) + 360) % 360 / 360, s, l).getHexString();
    const c1 = hsl(h, 0.55 + Math.random() * 0.35, 0.32 + Math.random() * 0.22);
    const pick = Math.random();
    const c2 = pick < 0.3 ? '#f4f4f4' : pick < 0.5 ? '#121418' : hsl(h + 150 + Math.random() * 60, 0.7, 0.55);
    return { c1, c2, glow: hsl(h + (Math.random() < 0.5 ? 0 : 180), 0.9, 0.8), finish: Object.keys(FINISHES)[Math.floor(Math.random() * 4)] };
  }

  sh.onclick = (e) => {
    const tb = e.target.closest('[data-tab]'); if (tb) return setTab(tb.dataset.tab);
    const pb = e.target.closest('[data-part]');
    if (pb) { stopTour(); return choose(sel === pb.dataset.part && pb.classList.contains('sr-pin') ? null : pb.dataset.part); }
    const b = e.target.closest('[data-sr], [data-liv], [data-fin]'); if (!b) return;
    if (b.dataset.sr === 'tour') return tour ? stopTour() : startTour();
    if (b.dataset.sr === 'whole') { stopTour(); cut = 0; slider.value = 0; applyCut(); return choose(null); }
    if (b.dataset.fin) { change({ finish: b.dataset.fin }); syncCols(); paint(); return; }
    const k = b.dataset.sr;
    if (b.dataset.liv) { const l = LIVERIES[+b.dataset.liv]; change({ c1: l.c1, c2: l.c2, glow: l.glow, finish: l.finish }); syncCols(); paint(); return; }
    if (k === 'own' || k === 'reset') { const c = carById(id); change({ c1: c.c1, c2: c.c2, glow: c.glow, finish: 'gloss' }); syncCols(); paint(); }
    if (k === 'rand') { change(randomCols()); syncCols(); paint(); }
    if (k === 'undo' && undo.length) { setCols(undo.pop()); syncCols(); paint(); }
    if (k === 'light') { night = !night; lightUp(); }
    if (k === 'prev' || k === 'next') { const i = CARS.findIndex((c) => c.id === id); id = CARS[(i + (k === 'next' ? 1 : CARS.length - 1)) % CARS.length].id; info(); load(); }
    if (k === 'pick') { opts.pick?.(id); if (opts.onward) after = opts.onward.go; close(); }
    if (k === 'back') close();
    if (k === 'wnext') { after = W.next; close(); }
  };
  sh.oninput = (e) => {
    if (e.target.id === 'srCut') {
      cut = +e.target.value; applyCut(); stopTour();
      if (cut > 0 && !W) setTab('inside');
      // a part that can't be seen at this setting lets go
      const p = sel && partById(sel); if (p && (p.inside ? xr() < 0.5 : xr() > 0.25)) { sel = null; inside?.highlight(null); sh.querySelectorAll('[data-li]').forEach((li) => li.classList.remove('open')); }
      return;
    }
    const key = { srC1: 'c1', srC2: 'c2', srG: 'glow', srH1: 'c1', srH2: 'c2', srHG: 'glow' }[e.target.id];
    if (!key) return;
    let v = e.target.value.trim();
    if (e.target.classList.contains('hex')) {
      // a colour code typed by hand: #RGB or #RRGGBB, with or without the #
      if (!v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + [...v.slice(1)].map((x) => x + x).join('');
      const ok = /^#[0-9a-f]{6}$/i.test(v); e.target.classList.toggle('bad', !ok);
      if (!ok) return;
    }
    change({ [key]: v.toLowerCase() }, true); syncCols(e.target); paint();
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
    if (fly) {
      fly.k = Math.min(1, fly.k + dt / 1.1);
      const e = fly.k * fly.k * (3 - 2 * fly.k);
      controls.target.lerpVectors(fly.t0, fly.t1, e); cam.position.lerpVectors(fly.p0, fly.p1, e);
      if (fly.k >= 1) fly = null;
    }
    if (tour && !fly && (tour.t += dt) > 5.5) {
      tour.t = 0; tour.i++;
      if (tour.i >= PARTS.length) { stopTour(); choose(null); } else choose(PARTS[tour.i].id, { quiet: true, apart: tour.i > 2 });
    }
    controls.update(dt);
    if (inside) { inside.update(dt, xr(), sel); if (sel) inside.highlight(partById(sel)?.inside ? sel : null); }
    renderer.render(scene, cam);
    placePins(w, h);
  }
  function close() {
    alive = false; cancelAnimationFrame(raf); removeEventListener('keydown', onKey); liveryGlow(glowWas);
    controls.dispose();
    scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material !== mat && o.material !== glass && o.material !== ghost) o.material.dispose?.(); } });
    mat.dispose(); glass.dispose(); ghost.dispose(); env.dispose(); renderer.dispose();
    renderer.forceContextLoss?.();
    (after || (() => {}))();
  }
  info(); load(); raf = requestAnimationFrame(frame);
  return { close };
}
