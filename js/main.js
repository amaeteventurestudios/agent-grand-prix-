// Agent Grand Prix: the page. Home screen over a live race, the race itself with the pit
// wall, results, the season and the Daily Grand Prix.
import * as THREE from 'three';
import { CALENDAR, VENUES, COMPOUNDS, LIVERIES, TEAMS } from './data.js';
import { hashString, clamp } from './rng.js';
import { DT, LIFE, fmtLap, fmtTime } from './sim.js';
import { setupRace, dayNumber, dailyVenue, DEFAULT_TEAM, trackFor } from './game.js';
import { World } from './world.js';
import { MODELS } from './cars.js';
import { Cams } from './cams.js';
import { Sound } from './audio.js';
import { Voice, VOICES } from './voice.js';
import { raceDNA } from './dnastore.js';
import { PARAMS } from './dna.js';
import * as store from './store.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const touch = matchMedia('(pointer: coarse)').matches;
const lite = params.has('lite') || touch;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Driver DNA: ?dna=off races with the engine's own driving (the rollback switch)
const dnaOn = params.get('dna') !== 'off';
const S = store.load();
// which car everyone races: a modelled car, or null for the simple one (?car=falcon or ?car=classic)
const carModel = () => { const q = params.get('car'); return q ? (q === 'classic' ? null : q) : S.settings.car === undefined ? 'falcon' : S.settings.car; };

// ---------- renderer ----------
const canvas = $('#gl'), stage = $('#stage'), app = $('#app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, powerPreference: 'high-performance' });
let dpr = Math.min(devicePixelRatio || 1, lite ? 1.5 : 2);
renderer.setPixelRatio(dpr);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
const camera = new THREE.PerspectiveCamera(45, 1, 0.08, 9000);
const cams = new Cams(camera, canvas);
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  if (cams.mode === 'overview') camera.fov = cams.baseFov();
  camera.updateProjectionMatrix();
  if (world) cams.fitOverview(cams.mode === 'overview' && !G.race?.started);
}
new ResizeObserver(resize).observe(stage);

// ---------- game state ----------
const G = { race: null, setup: null, kind: null, venue: null, seed: 0, speed: 1, paused: false, acc: 0, sel: null, evIdx: 0, gap: 'interval', attract: true, ended: false, radioN: 0, forecastSaid: new Set(), round: null, day: null };
let world = null;
const team = () => S.team || DEFAULT_TEAM;
const mine = () => (G.attract ? [] : ['you-0', 'you-1']);

function loadVenue(venue) {
  if (world && world.venue.id === venue.id) return;
  if (world) world.dispose();
  world = new World(renderer, venue, trackFor(venue), { lite, car: carModel() });
  cams.setWorld(world);
  resize();
}

// ---------- the live race behind the home screen ----------
function attract() {
  G.attract = true; G.ended = false; sound.stop();
  const n = dayNumber(), venue = dailyVenue(n);
  loadVenue(venue);
  const setup = setupRace({ venue, seed: hashString('attract-' + n), team: team(), withPlayer: false, laps: 30 });
  G.race = setup.make(); G.setup = setup; G.venue = venue; G.evIdx = 0;
  world.setCars(G.race.cars);
  G.race.start();
  for (let i = 0; i < 20 * 35; i++) G.race.step();
  G.sel = G.race.order[0].id;
  G.attractT = 0;
  cams.setMode('live');
  $('#hud').hidden = true; $('#camPill').hidden = true; $('#follow').hidden = true;
  app.classList.add('attract');
  buildTower();
  home();
}

// ---------- loop ----------
let last = performance.now(), fpsT = 0, fpsN = 0, uiT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  cheerBurst *= Math.exp(-dt * 0.5);
  const R = G.race;
  if (R && R.started && !G.paused && !R.done) {
    G.acc += dt * (G.attract ? 1 : G.speed);
    let n = 0;
    while (G.acc >= DT && n < 60) { R.step(); G.acc -= DT; n++; }
    if (n === 60) G.acc = 0;
    if (G.attract && R.done) attractRestart();
  }
  if (G.attract && R) { // home screen: cut between TV and chase shots of the leading cars
    G.attractT += dt;
    if (G.attractT > 9) { G.attractT = 0; G.sel = R.order[Math.floor(Math.random() * 4)].id; cams.setMode(cams.mode === 'live' ? 'tv' : 'live'); }
  }
  if (R && world) {
    const showTags = cams.mode !== 'fpv' && cams.mode !== 'pit';
    const focus = cams.mode === 'overview' ? cams.controls.target : cams.look;
    world.update(R, R.started && !G.paused ? clamp(G.acc / DT, 0, 1) : 1, dt, camera, G.attract && cams.mode === 'tv' ? null : G.sel, mine(), showTags,
      { speed: G.paused ? 0 : G.attract ? 1 : G.speed, focus, showRing: cams.mode !== 'fpv' });
    cams.update(dt, cams.mode === 'overview' ? null : G.sel);
    if (!G.attract) sound.update(R, world, camera, G.sel, cams.mode, G.paused || R.done || !$('#screen').hidden ? 0 : G.speed);
  }
  renderer.render(world ? world.scene : new THREE.Scene(), camera);
  uiT += dt;
  if (uiT > 0.2 && R && !G.attract) { uiT = 0; tick(); }
  if (R && !G.attract && R.done && !G.ended) { G.ended = true; setTimeout(results, 1800); }
  // adaptive resolution
  fpsT += dt; fpsN++;
  if (fpsT > 2.5) {
    const fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
    if (!statsEl.hidden) statsEl.textContent = `${fps.toFixed(0)} fps · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris · dpr ${dpr}`;
    if (fps < 38 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); resize(); }
    else if (fps > 57 && dpr < Math.min(devicePixelRatio, lite ? 1.5 : 2)) { dpr = Math.min(dpr + 0.25, devicePixelRatio); renderer.setPixelRatio(dpr); resize(); }
  }
}
// ?stats: frame rate, draw calls and triangles in the corner, for checking real phones
const statsEl = Object.assign(document.body.appendChild(document.createElement('div')), { className: 'stats-ovl' });
statsEl.hidden = !(params.has('stats') || S.settings.stats);
function attractRestart() { attractQueued || (attractQueued = setTimeout(() => { attractQueued = null; if (G.attract) attract(); }, 500)); }
let attractQueued = null;

// ---------- picking ----------
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || G.attract) return;
  if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
  const r = canvas.getBoundingClientRect();
  const id = cams.pick(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
  if (id) select(id);
});

function select(id) {
  G.sel = id;
  if (mine().includes(id)) G.mineSel = id;
  buildCard(); renderControls(true); tick();
}

// ---------- HUD and panels ----------
$$('[data-speed]').forEach((b) => b.addEventListener('click', () => {
  G.speed = +b.dataset.speed; $$('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
}));
$$('[data-cam]').forEach((b) => b.addEventListener('click', () => setCam(b.dataset.cam)));
function setCam(m) { cams.setMode(m); $$('[data-cam]').forEach((x) => x.classList.toggle('on', x.dataset.cam === m)); }
$$('[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
function setTab(t) {
  app.dataset.tab = t; $$('[data-tab]').forEach((x) => x.classList.toggle('on', x.dataset.tab === t));
  if (t === 'radio') $('#radioDot').hidden = true;
}
setTab('wall');
$('#gapMode').addEventListener('click', () => { G.gap = G.gap === 'interval' ? 'leader' : 'interval'; $('#gapMode').textContent = G.gap === 'interval' ? 'Interval' : 'Leader'; tick(); });
$('#menuBtn').addEventListener('click', pauseMenu);

// engine sound: on by default, remembered on this device; it starts with the first tap of a race
const sound = new Sound();
// the engineer on the radio: speaks the calls so you don't have to read them
const voice = new Voice();
voice.duck = (on) => sound.duck(on);
const voiceId = () => (S.settings.voice === undefined || (S.settings.voice && !VOICES.some((v) => v.id === S.settings.voice)) ? 'michael' : S.settings.voice);
const carTag = (id) => (id === 'you-1' ? 'car2' : 'car1');
let lastPassSay = -1e9;
function say(parts, prio) { if (S.settings.sound !== false && voiceId()) voice.say(parts, prio); }
const WHY_CLIPS = [['soaked', 'w_soaked'], ['wet out here', 'w_wet'], ['standing water', 'w_water'], ['overheating', 'w_wetshot'], ['dry line', 'w_dryline'],
  ['Safety car! Cheap', 'w_sc'], ['Virtual safety car. Box', 'w_vsc'], ['finished', 'w_finished'], ['second compound. Box now', 'w_second'], ['Pit window', 'w_window']];
const whyClip = (t) => (WHY_CLIPS.find(([k]) => t.includes(k)) || [])[1];
// the crowd in the stands reacts to the same moments the crowd sound does
let cheerBurst = 0;
{ const roar = sound.roar.bind(sound); sound.roar = (k = 0.6) => { roar(k); cheerBurst = Math.max(cheerBurst, k); }; }
function soundIcon() { const b = $('#soundBtn'), on = S.settings.sound !== false; b.textContent = on ? '🔊' : '🔇'; b.setAttribute('aria-label', on ? 'Sound on. Turn sound off' : 'Sound off. Turn sound on'); b.classList.toggle('off', !on); }
function setSound(on) {
  S.settings.sound = on; store.save(); soundIcon();
  if (on && !G.attract) sound.start(lite); else sound.stop();
}
$('#soundBtn').addEventListener('click', () => setSound(S.settings.sound === false));
soundIcon();
document.addEventListener('visibilitychange', () => { if (!sound.ctx) return; if (document.hidden) sound.ctx.suspend(); else if (sound.on) sound.ctx.resume(); });
document.addEventListener('keydown', (e) => {
  if (G.attract || e.target.closest('input')) return;
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'escape') { e.preventDefault(); $('#screen').hidden ? pauseMenu() : resume(); }
  const cm = { '1': 'live', '2': 'overview', '3': 'chase', '4': 'fpv', '5': 'tv', '6': 'pit' }[k]; if (cm) setCam(cm);
  if (k === 'm') setSound(S.settings.sound === false);
  if (k === 'b' && G.mineSel) cmd({ box: G.race.byId.get(G.mineSel).pitReq ? null : nextDry(G.race.byId.get(G.mineSel)) });
});

function buildTower() {
  const ol = $('#towerList'); ol.innerHTML = '';
  for (const c of G.race.cars) {
    const li = document.createElement('li');
    li.dataset.id = c.id;
    li.innerHTML = `<span class="p"></span><span class="bar" style="background:${c.team.c1}"></span><span class="n"></span><span class="g"></span><span class="t"></span>`;
    li.addEventListener('click', () => { select(c.id); if (matchMedia('(max-width: 999px)').matches && cams.mode === 'overview') setCam('live'); });
    ol.append(li);
  }
}

const tyreHTML = (c) => `<span class="tyre" style="--c:${COMPOUNDS[c].color}"><b>${c}</b></span>`;

function tick() {
  const R = G.race; if (!R) return;
  // HUD
  const lead = R.order[0];
  $('#hudLap').textContent = R.leaderLap(); $('#hudLaps').textContent = R.laps;
  $('#hudFlag').textContent = G.venue.flag; $('#hudCity').textContent = G.venue.city;
  $('#hudWx').innerHTML = weatherHTML(R);
  const sc = $('#hudSc');
  sc.hidden = !R.sc;
  if (R.sc) sc.textContent = R.sc.kind === 'VSC' ? 'VIRTUAL SAFETY CAR' : R.sc.phase === 'in' ? 'SC IN THIS LAP' : 'SAFETY CAR';
  // the crowd gets louder over the last laps
  sound.excite = clamp((R.leaderLap() - (R.laps - 3)) / 3, 0, 1);
  if (world) world.cheer = Math.min(1, Math.max(sound.excite, cheerBurst * 1.4));
  // tower
  const ol = $('#towerList'), my = mine();
  for (const c of R.order) {
    const li = ol.querySelector(`[data-id="${c.id}"]`);
    li.children[0].textContent = c.pos;
    li.children[2].innerHTML = `${esc(c.code)}${c.team.you ? '<small>you</small>' : ''}`;
    const g = li.children[3];
    let txt, cls = 'g';
    if (c.dnf) { txt = 'OUT'; cls += ' out'; }
    else if (c.pit) { txt = 'PIT'; cls += ' pit'; }
    else if (c.pos === 1) txt = c.finished ? 'FIN' : 'Leader';
    else if (c.lapsDown > 0) txt = `+${c.lapsDown}L`;
    else txt = '+' + (G.gap === 'interval' ? Math.max(0, c.interval) : c.gap).toFixed(1);
    g.textContent = txt; g.className = cls;
    li.children[4].innerHTML = tyreHTML(c.tyre.c);
    li.classList.toggle('mine', my.includes(c.id));
    li.classList.toggle('sel', c.id === G.sel);
    ol.append(li);
  }
  updateCard();
  renderControls();
  drainEvents();
  forecast();
  const f = R.byId.get(G.sel);
  const fl = $('#follow');
  if (f && cams.mode !== 'overview') {
    fl.hidden = false;
    fl.innerHTML = `<span class="sw" style="background:${f.team.c1}"></span>P${f.pos} ${esc(f.name)} · ${Math.round(f.v * 3.6)} km/h${f.drs ? ' · <b>DRS</b>' : ''}`;
  } else fl.hidden = true;
  stageCards(R, f);
  pitLine(R, f);
  boostBtn(R);
  coach(R);
}

// ERS boost: one tap deploys the battery for about 12 seconds, then back to what it was
function boostBtn(R) {
  const b = $('#boost'), c = R.byId.get(G.mineSel);
  b.hidden = !c || G.attract;
  if (b.hidden) return;
  if (G.boost && R.t >= G.boost.until) { const p = R.byId.get(G.boost.id); if (p.ersMode === 'deploy') R.command(p.id, { ers: G.boost.prev }); G.boost = null; }
  const e = Math.round(c.ers * 100), on = !!(G.boost && G.boost.id === c.id);
  b.classList.toggle('on', on);
  b.disabled = c.dnf || c.finished || c.pit != null || (!on && e < 8);
  b.querySelector('i').style.width = e + '%';
  b.querySelector('small').textContent = on ? `${Math.ceil(G.boost.until - R.t)} s · ${e}%` : `${c.code} · ${e}%`;
}
function boostCar(c) {
  const R = G.race;
  if (G.boost && G.boost.id === c.id) { cmd({ ers: G.boost.prev }, c.id); G.boost = null; return; }
  if (G.boost) { const p = R.byId.get(G.boost.id); if (p.ersMode === 'deploy') R.command(p.id, { ers: G.boost.prev }); }
  const prev = c.ersMode === 'deploy' ? 'balanced' : c.ersMode; cmd({ ers: 'deploy' }, c.id); G.boost = { id: c.id, until: R.t + 12, prev }; toast(`⚡ ${c.code}: boost!`);
}
$('#boost').addEventListener('click', () => {
  const R = G.race, c = R && R.byId.get(G.mineSel); if (!c) return;
  boostCar(c);
  tick();
});

// ---------- race coach ----------
// On for quick races and a player's first races: watches your two cars and suggests the call that
// fits the moment, in plain words, with a button that makes it. Each tip has a cooldown and a cap.
function coachDefault(kind) { return S.settings.coach ?? (kind === 'quick' || S.stats.starts < 3); }
function coachShow(tip) {
  const el = $('#coach');
  G.coachTip = { ...tip, at: performance.now() };
  if (tip.say) say(tip.say);
  el.innerHTML = `<div class="ch"><span>🎧 Coach</span><button type="button" class="x" aria-label="Close">×</button></div><p>${tip.text}</p>
    <div class="acts">${tip.act ? `<button type="button" class="go">${tip.act}</button>` : ''}<button type="button" class="no">${tip.act ? 'Not now' : 'Got it'}</button></div>`;
  el.hidden = false;
  el.querySelector('.x').onclick = el.querySelector('.no').onclick = coachHide;
  const go = el.querySelector('.go'); if (go) go.onclick = () => { tip.run(); coachHide(); renderControls(true); };
}
function coachHide() { $('#coach').hidden = true; G.coachTip = null; }
function coach(R) {
  if (!G.coach || G.attract || G.ended || !R || R.t < 3) { if (G.coachTip && !G.coach) coachHide(); return; }
  const now = performance.now();
  if (G.coachTip) { if (now - G.coachTip.at > 13000) coachHide(); else return; }
  const C = (G.coachState ||= { last: -1e9, n: {} });
  if (R.t - C.last < 18) return;
  const ok = (k, max) => (C.n[k] || 0) < max;
  const fire = (k, tip) => { C.n[k] = (C.n[k] || 0) + 1; C.last = R.t; coachShow(tip); };
  const my = mine().map((id) => R.byId.get(id)).filter((c) => !c.dnf && !c.finished && !c.pit && !c.auto);
  if (!my.length || R.sc) return;
  const [a, b] = mine().map((id) => R.byId.get(id));
  if (ok('team', 1)) return fire('team', { say: ['k_team'], text: `You run a team of <b>two cars</b>: ${esc(a.code)} (P${a.pos}) and ${esc(b.code)} (P${b.pos}). The tabs at the top of the pit wall switch between them, and each car has its own calls.`, act: `Show ${esc(b.code)}`, run: () => { G.mineSel = b.id; select(b.id); } });
  const left = R.laps - R.leaderLap();
  const [f, r2] = a.pos < b.pos ? [a, b] : [b, a];
  if (!f.dnf && !r2.dnf && !f.pit && !r2.pit && r2.pos === f.pos + 1 && r2.interval < 1 && !f.auto && !r2.auto && !f.letBy) {
    if (r2.tyre.wear + 0.25 < f.tyre.wear && ok('swap', 2))
      return fire('swap', { say: ['k_swap'], text: `${esc(r2.code)} is right behind ${esc(f.code)} on much fresher tyres. <b>Swap places</b> so your faster car can chase the cars ahead.`, act: 'Swap places', run: () => teamOrder('swap') });
    if (f.order !== 'hold' && ok('hold', 1))
      return fire('hold', { say: ['k_hold'], text: `Your two cars are fighting each other, which costs them both time. <b>Hold positions</b> tells them not to attack each other.`, act: 'Hold positions', run: () => teamOrder('hold') });
  }
  for (const c of my) {
    const ahead = R.order[c.pos - 2], behind = R.order[c.pos], gap = c.interval, back = behind && !behind.dnf && !behind.pit ? behind.interval : 99;
    const theirs = (x) => x && !mine().includes(x.id) && !x.dnf && !x.pit;
    if (left <= 1 && c.pace !== 'push' && ok('push', 1))
      return fire('push', { say: ['k_push'], text: 'Last lap! Tyre wear doesn\'t matter any more, so <b>Push</b> with both cars.', act: 'Push both cars', run: () => mine().forEach((id) => cmd({ pace: 'push' }, id)) });
    if (theirs(ahead) && gap > 0.25 && gap < 1.2 && c.ers > 0.3 && !(G.boost && G.boost.id === c.id) && ok('chase', 3))
      return fire('chase', { say: [carTag(c.id), 'k_chase'], text: `${esc(c.code)} is ${gap.toFixed(1)} s behind ${esc(ahead.code)} for P${ahead.pos}. <b>Attack</b> makes the driver go for the gap, and <b>BOOST</b> fires the battery for 12 seconds of extra speed.`, act: 'Attack + BOOST', run: () => { G.mineSel = c.id; select(c.id); cmd({ battle: 'attack' }, c.id); boostCar(c); } });
    if (theirs(behind) && back < 0.6 && c.battle !== 'defend' && ok('defend', 2))
      return fire('defend', { say: [carTag(c.id), 'k_defend'], text: `${esc(behind.code)} is right behind ${esc(c.code)}. <b>Defend</b> covers the inside line and makes ${esc(c.code)} about half as easy to pass.`, act: `Defend with ${esc(c.code)}`, run: () => cmd({ battle: 'defend' }, c.id) });
    if (c.tyre.wear > 0.66 && !c.pitReq && left > 1 && ok('tyre-' + c.id, 1)) {
      const wm = G.venue.wear || 1, nx = !COMPOUNDS[c.tyre.c].dry ? c.tyre.c : !R.ruleMet(c) ? nextDry(c) : left <= LIFE.S / wm * 0.85 ? 'S' : left <= LIFE.M / wm * 0.85 ? 'M' : 'H';
      return fire('tyre-' + c.id, { say: [carTag(c.id), 'k_tyre', 'q_' + nx], text: `${esc(c.code)}'s ${COMPOUNDS[c.tyre.c].name}s are down to ${Math.round((1 - c.tyre.wear) * 100)}%. Under 25% the grip falls away and a puncture gets likely. Box for ${COMPOUNDS[nx].name}s?`, act: `Box for ${COMPOUNDS[nx].name}s`, run: () => cmd({ box: nx }, c.id) });
    }
    if (gap > 2.5 && back > 2.5 && c.ers < 0.45 && c.ersMode !== 'harvest' && ok('harvest', 2))
      return fire('harvest', { say: [carTag(c.id), 'k_harvest'], text: `${esc(c.code)} has clear air. <b>Harvest</b> recharges the battery as the car brakes, like regen in an electric car, so you have charge for the next fight.`, act: `Harvest with ${esc(c.code)}`, run: () => cmd({ ers: 'harvest' }, c.id) });
    if (c.battle === 'attack' && !(theirs(ahead) && gap < 2) && ok('calm', 1))
      return fire('calm', { say: [carTag(c.id), 'k_calm'], text: `${esc(c.code)} is on Attack with nobody close ahead. That wears the tyres for nothing. Back to <b>Neutral</b> until the next fight.`, act: 'Neutral', run: () => cmd({ battle: 'neutral' }, c.id) });
  }
}

// floating cards on the race view: position, gap to the leader, average stop, tyre life
function stageCards(R, f) {
  const el = $('#stats');
  if (!f || cams.mode === 'fpv') { el.hidden = true; return; }
  el.hidden = false;
  const st = f.stopTimes || [], avg = st.length ? (st.reduce((a, b) => a + b, 0) / st.length).toFixed(1) + ' s' : '–';
  const life = Math.round((1 - Math.min(1, f.tyre.wear)) * 100);
  const gap = f.dnf ? 'Out' : f.pos === 1 ? 'Leader' : f.lapsDown > 0 ? `+${f.lapsDown} lap${f.lapsDown > 1 ? 's' : ''}` : `+${f.gap.toFixed(1)} s`;
  const html = `<div class="c4 pos"><i style="background:${f.team.c1}"></i><b>P${f.pos}</b><span>${esc(f.code)} · #${f.num ?? ''}</span></div>`
    + `<div class="c4"><b>${gap}</b><span>Gap to leader</span></div>`
    + `<div class="c4"><b>${avg}</b><span>Avg pit stop</span></div>`
    + `<div class="c4">${tyreHTML(f.tyre.c)}<b>${life}%</b><span>Tyre life</span></div>`;
  if (el.dataset.k !== html) { el.innerHTML = html; el.dataset.k = html; }
}

// the pit stop as five steps, lit while the followed car goes through them
function pitLine(R, f) {
  const el = $('#pitline');
  let step = -1;
  if (f && !f.dnf) {
    if (f.pitReq && !f.pit) step = 0;
    else if (f.pit && f.stopT > 0) step = 2;
    else if (f.pit && f.pit.phase === 'in') step = 1;
    else if (f.pit && f.pit.phase === 'out') step = 3;
    const pl = G.pitLine;
    if (step >= 0) G.pitLine = { id: f.id, t: R.t };
    else if (pl && pl.id === f.id && R.t - pl.t < 6) step = 4;
  }
  el.hidden = step < 0 || cams.mode === 'fpv';
  if (el.hidden) return;
  [...el.children].forEach((li, i) => { li.className = i < step ? 'done' : i === step ? 'now' : ''; });
  const now = el.children[2];
  now.textContent = step === 2 ? `Stationary ${Math.max(0, f.stopT).toFixed(1)} s` : step > 2 && f.stopTimes?.length ? `Stationary ${f.stopTimes.at(-1).toFixed(1)} s` : 'Stationary';
}

// temperatures in both scales
const tempTxt = (c) => `${c}°C / ${Math.round(c * 9 / 5 + 32)}°F`;
function wetWord(w) { return w < 0.08 ? 'Dry' : w < 0.25 ? 'Damp' : w < 0.6 ? 'Wet' : 'Soaked'; }
function weatherHTML(R) {
  const fc = nextRain(R);
  const icon = R.rain > 0.5 ? '🌧️' : R.rain > 0.05 ? '🌦️' : G.venue.time === 'night' ? '🌙' : G.venue.time === 'dusk' ? '🌇' : '☀️';
  let txt = `${icon} <span class="state">${wetWord(R.wet)}</span> ${tempTxt(G.venue.temp)}`;
  if (fc !== null && R.rain < 0.05) txt += ` <span class="fc">· rain in ~${fc} lap${fc > 1 ? 's' : ''}</span>`;
  return txt;
}
function nextRain(R) {
  const lt = R.track.lapTime * 1.05;
  for (const s of R.weather.showers) {
    if (s.start > R.t) { const laps = (s.start - R.t) / lt; if (laps < 3.2) return Math.max(1, Math.round(laps)); }
  }
  return null;
}
function forecast() {
  const R = G.race;
  R.weather.showers.forEach((s, i) => {
    const laps = (s.start - R.t) / (R.track.lapTime * 1.05);
    if (laps > 0 && laps < 2.2 && !G.forecastSaid.has(i)) {
      G.forecastSaid.add(i);
      addRadio({ from: 'engineer', text: `Radar shows rain in about ${Math.max(1, Math.round(laps))} lap${laps > 1.5 ? 's' : ''}. ${s.peak > 0.6 ? 'It looks heavy.' : 'Could be light.'} Your call on tyres.` });
      toast('📡 Rain expected soon', true);
      say([laps > 1.5 ? 'radar2' : 'radar1', s.peak > 0.6 ? 'looksheavy' : 'lookslight', 'yourcall'], true);
    }
  });
}

// selected car card
function buildCard() {
  const R = G.race, c = R.byId.get(G.sel), el = $('#carCard');
  if (!c) { el.innerHTML = ''; return; }
  const isMine = mine().includes(c.id);
  el.innerHTML = `
    <div class="top"><span class="sw" style="background:${c.team.c1}"></span><div class="pos" data-k="pos"></div>
      <div class="who"><b>${esc(c.name)}</b><span>${esc(c.team.name)}${c.player ? '' : ' · AI agent'}</span></div>
      ${isMine ? '' : '<button class="link" type="button" data-act="back">My car</button>'}</div>
    <div class="stats">
      <div><small>Ahead</small><b data-k="ahead"></b></div>
      <div><small>Behind</small><b data-k="behind"></b></div>
      <div><small>Speed</small><b data-k="speed"></b></div>
      <div><small>Tyres</small><b data-k="tyre"></b><div class="meter"><i data-k="tyreBar"></i></div></div>
      <div><small>ERS battery</small><b data-k="ers"></b><div class="meter"><i data-k="ersBar"></i></div></div>
      <div><small>Last lap</small><b data-k="last"></b></div>
    </div>`;
  const b = el.querySelector('[data-act="back"]');
  if (b) b.addEventListener('click', () => select(G.mineSel || 'you-0'));
  updateCard();
}
function updateCard() {
  const R = G.race, c = R.byId.get(G.sel), el = $('#carCard'); if (!c || !el.firstElementChild) return;
  const k = (n) => el.querySelector(`[data-k="${n}"]`);
  k('pos').textContent = 'P' + c.pos;
  const ahead = R.order[c.pos - 2], behind = R.order[c.pos];
  k('ahead').textContent = ahead && !c.dnf ? `${ahead.code} +${Math.max(0, c.interval).toFixed(1)}` : '–';
  k('behind').textContent = behind && !behind.dnf ? `${behind.code} ${Math.max(0, behind.interval).toFixed(1)}` : '–';
  k('speed').textContent = Math.round(c.v * 3.6) + ' km/h';
  const life = Math.round((1 - Math.min(1, c.tyre.wear)) * 100);
  k('tyre').innerHTML = `${COMPOUNDS[c.tyre.c].name} ${life}%`;
  const tb = k('tyreBar'); tb.style.width = life + '%'; tb.className = life < 25 ? 'low' : life < 50 ? 'mid' : '';
  const e = Math.round(c.ers * 100); k('ers').textContent = e + '%';
  const eb = k('ersBar'); eb.style.width = e + '%'; eb.className = e < 20 ? 'low' : e < 45 ? 'mid' : '';
  k('last').textContent = c.lastLap ? fmtLap(c.lastLap) : '–';
}

// pit wall controls for the player's cars, each with a plain-words line for the current choice
const PACE_WHY = {
  save: '<b>Save tyres:</b> a little slower, but the tyres wear about a third less. Use it to make a set last longer.',
  normal: '<b>Normal:</b> steady speed and normal tyre wear.',
  push: '<b>Push:</b> faster, but tyres wear 50% quicker and mistakes are more likely. Best in the last laps.',
};
const ERS_WHY = {
  harvest: '<b>Harvest:</b> recharges the battery when the car brakes and lifts off, like regen in an electric car. A bit slower on the straights.',
  balanced: '<b>Balanced:</b> uses a little battery on each straight and tops it up in the corners.',
  deploy: '<b>Deploy:</b> spends the battery for about 3% more speed on the straights and easier passes. A full battery lasts about half a minute of straights.',
};
const ORDER_WHY = {
  free: '<b>Race freely:</b> your two drivers may fight each other for position.',
  hold: '<b>Hold positions:</b> your drivers won\'t attack each other, so neither loses time in a team fight.',
  swap: '<b>Swap places:</b> the car in front lets its teammate through, for when the one behind is faster or on fresher tyres.',
};
const BATTLE_WHY = {
  defend: '<b>Defend:</b> your driver covers the inside line. About half as easy to pass, a touch slower.',
  neutral: '<b>Neutral:</b> races normally and passes when there is a clear chance.',
  attack: '<b>Attack:</b> goes for every gap. Many more passes, but more tyre wear and a higher risk of contact.',
};
let ctlSig = '';
function renderControls(force) {
  const R = G.race, el = $('#controls');
  if (G.attract || !R) { el.innerHTML = ''; return; }
  const id = G.mineSel || 'you-0', c = R.byId.get(id);
  const sig = [id, c.pace, c.ersMode, c.battle, c.pitReq, c.auto, !!c.pit, c.finished, c.dnf, c.tyre.c, R.byId.get('you-0').pos, R.byId.get('you-1').pos, c.order, !!(c.letBy || R.mate(c).letBy), Math.abs(R.byId.get('you-0').pos - R.byId.get('you-1').pos) === 1].join('|');
  if (sig === ctlSig && !force) return; ctlSig = sig;
  const a = R.byId.get('you-0'), b = R.byId.get('you-1');
  const opt = (key, val, label) => `<button type="button" data-set="${key}" data-val="${val}" class="${c[key] === val ? 'on' : ''}">${label}</button>`;
  const dis = c.auto || c.finished || c.dnf;
  const why = (t) => `<p class="why">${t}</p>`;
  let box;
  if (c.finished) box = `<p class="ro">${c.pos <= 3 ? '🏆 ' : ''}Finished P${c.pos}.</p>`;
  else if (c.dnf) box = '<p class="ro">Out of the race.</p>';
  else if (c.pit) box = `<div class="boxing">In the pit lane…</div>`;
  else if (c.pitReq) box = `<div class="boxing"><span>Boxing this lap: ${COMPOUNDS[c.pitReq].name}s</span>${c.auto ? '' : '<button type="button" data-act="cancel">Cancel</button>'}</div>`;
  else box = `<div class="box-row">${Object.keys(COMPOUNDS).map((k) => `<button type="button" data-box="${k}" ${dis ? 'disabled' : ''}>${tyreHTML(k)}${COMPOUNDS[k].name}</button>`).join('')}</div>`;
  el.innerHTML = `
    <div class="card">
      <div class="mine-tabs">${[a, b].map((x) => `<button type="button" data-mine="${x.id}" class="${x.id === id ? 'on' : ''}"><span class="sw" style="width:5px;height:16px;border-radius:2px;background:${x.team.c1}"></span>${esc(x.code)} · P${x.pos}</button>`).join('')}</div>
      <div class="auto-row"><p><b>${c.auto ? 'Autonomous' : 'Team Principal'}</b><br>${c.auto ? 'Your AI makes every call.' : 'You make the calls. Your engineer advises.'}</p>
        <button type="button" class="switch" role="switch" aria-checked="${c.auto}" aria-label="Autonomous mode" data-act="auto"></button></div>
    </div>
    <div class="ctl"><label>Box this lap</label>${box}${c.pit || c.finished || c.dnf ? '' : why(c.pitReq ? 'Your driver pits the next time past the pit entry. A stop costs about 8 seconds.' : 'Tap a tyre and your driver pits next time round, about 8 seconds. Soft: fastest, wears quickest. Medium: all-rounder. Hard: slowest, lasts longest. Inter: damp. Wet: heavy rain.')}</div>
    <div class="ctl"><label>Pace</label><div class="opts">${opt('pace', 'save', 'Save tyres')}${opt('pace', 'normal', 'Normal')}${opt('pace', 'push', 'Push')}</div>${why(PACE_WHY[c.pace])}</div>
    <div class="ctl"><label>ERS (battery)</label><div class="opts">${opt('ersMode', 'harvest', 'Harvest')}${opt('ersMode', 'balanced', 'Balanced')}${opt('ersMode', 'deploy', 'Deploy')}</div>${why(ERS_WHY[c.ersMode])}</div>
    <div class="ctl"><label>Battle</label><div class="opts">${opt('battle', 'defend', 'Defend')}${opt('battle', 'neutral', 'Neutral')}${opt('battle', 'attack', 'Attack')}</div>${why(BATTLE_WHY[c.battle])}</div>
    <div class="ctl"><label>Team orders · both cars</label><div class="opts">
      <button type="button" data-order="free" class="${c.order === 'free' ? 'on' : ''}">Race freely</button>
      <button type="button" data-order="hold" class="${c.order === 'hold' ? 'on' : ''}">Hold positions</button>
      <button type="button" data-order="swap" class="${c.letBy || R.mate(c).letBy ? 'on' : ''}" ${Math.abs(a.pos - b.pos) === 1 && !a.pit && !b.pit ? '' : 'disabled'}>Swap places</button></div>
      ${why(c.letBy || R.mate(c).letBy ? ORDER_WHY.swap : Math.abs(a.pos - b.pos) === 1 ? ORDER_WHY[c.order] : ORDER_WHY[c.order] + ' Swap places works when your cars run nose to tail.')}</div>`;
  if (dis) $$('.opts button', el).forEach((x) => (x.disabled = true));
}
$('#controls').addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t || t.disabled) return;
  const R = G.race, id = G.mineSel || 'you-0';
  if (t.dataset.mine) { G.mineSel = t.dataset.mine; select(t.dataset.mine); return; }
  if (t.dataset.act === 'auto') { const c = R.byId.get(id); R.command(id, { auto: !c.auto }); toast(c.auto ? `${c.code}: Autonomous. Your AI is in charge.` : `${c.code}: Team Principal. You're in charge.`); }
  if (t.dataset.act === 'cancel') cmd({ box: null });
  if (t.dataset.box) cmd({ box: t.dataset.box });
  if (t.dataset.set) { const m = { pace: 'pace', ersMode: 'ers', battle: 'battle' }[t.dataset.set]; cmd({ [m]: t.dataset.val }); }
  if (t.dataset.order) teamOrder(t.dataset.order);
  renderControls(true);
});
function cmd(c, id = G.mineSel || 'you-0') {
  const car = G.race.byId.get(id);
  if (car.auto && !('auto' in c)) { G.race.command(id, { auto: false }); toast(`${car.code}: you took over the calls.`); }
  G.race.command(id, c);
  if (c.box) say([carTag(id), 'copy', 'b_' + c.box]);
  G.assisted = true;
  renderControls(true);
}
function teamOrder(o) {
  const id = G.mineSel || 'you-0', c = G.race.byId.get(id);
  if (c.auto) G.race.command(id, { auto: false });
  G.race.command(id, { order: o });
  say([o === 'swap' ? 'o_swap' : o === 'hold' ? 'o_hold' : 'o_free']);
  G.assisted = true; renderControls(true);
}
function nextDry(c) { return c.tyre.c === 'S' ? 'M' : c.tyre.c === 'M' ? 'H' : 'M'; }

// ---------- radio and toasts ----------
function addRadio(m) {
  const ol = $('#radio'), li = document.createElement('li');
  const who = m.from === 'engineer' ? 'Engineer' : m.from === 'driver' ? (m.code || 'Driver') : 'Race control';
  li.className = m.from;
  li.innerHTML = `<div class="who"><span>${esc(who)}</span><span>Lap ${G.race.leaderLap()}</span></div><div>${esc(m.text)}</div>`;
  if (m.action) {
    const acts = document.createElement('div'); acts.className = 'acts';
    const label = m.action.box ? `Box for ${COMPOUNDS[m.action.box].name}s` : m.action.ers ? 'Harvest' : 'Do it';
    acts.innerHTML = `<button type="button">${label}</button><button type="button" class="no">Stay out</button>`;
    acts.children[0].addEventListener('click', () => { cmd(m.action, m.car); acts.remove(); });
    acts.children[1].addEventListener('click', () => acts.remove());
    li.append(acts);
  }
  ol.prepend(li);
  while (ol.children.length > 30) ol.lastChild.remove();
  if (app.dataset.tab !== 'radio') $('#radioDot').hidden = false;
}
function toast(text, hot) {
  const box = $('#toast'), d = document.createElement('div');
  d.textContent = text; if (hot) d.className = 'hot';
  box.append(d); while (box.children.length > 2) box.firstChild.remove();
  setTimeout(() => d.remove(), 3800);
}
// the TV director: cut to an aerial shot for a pit-exit battle or an incident, if you're watching Live
let droneAt = -1e9;
function director(ids, dur, big) {
  const now = performance.now();
  if (cams.mode !== 'live' && cams.mode !== 'drone') return;
  if (now - droneAt < (big ? 8000 : 20000)) return;
  if (cams.drone(ids.filter(Boolean), dur)) droneAt = now;
}
function drainEvents() {
  const R = G.race, my = mine();
  while (G.evIdx < R.events.length) {
    const e = R.events[G.evIdx++];
    const isMine = e.car && my.includes(e.car), car = e.car && R.byId.get(e.car);
    if (e.type === 'advice' && isMine) {
      if (e.action?.box) say([carTag(e.car), whyClip(e.text), /Reminder/.test(e.text) ? 'reminder' : 'q_' + e.action.box].filter(Boolean), true);
      else if (e.action?.ers) say([carTag(e.car), 'battery']);
      addRadio({ from: 'engineer', text: `${car.code}: ${e.text}`, action: e.action, car: e.car });
      toast(`📻 ${car.code}: ${e.text}`, true);
    } else if ((e.type === 'radio' || e.type === 'pit') && isMine) {
      const bx = /Boxing this lap for (\w)/.exec(e.text);
      if (bx) say([carTag(e.car), whyClip(e.text), 'b_' + bx[1]].filter(Boolean));
      else if (/Slow stop/.test(e.text)) say([carTag(e.car), 'slowstop']);
      else if (/ s stop/.test(e.text)) say([carTag(e.car), 'goodstop']);
      addRadio({ from: 'driver', code: car.code, text: e.text });
    } else if (e.type === 'weather' || e.type === 'flag' || e.type === 'lap' || e.type === 'dnf') {
      addRadio({ from: 'race', text: e.text }); toast(e.text, e.type === 'flag' || e.type === 'dnf');
      if (/Lights out/.test(e.text)) say(['lights']);
      else if (/Final lap/.test(e.text)) say(['final']);
      else if (/Heavy rain/.test(e.text)) say(['heavy']);
      else if (/Rain is starting/.test(e.text)) say(['rain']);
      else if (/rain has stopped/.test(e.text)) say(['stopped']);
      else if (e.type === 'dnf' && isMine) say([carTag(e.car), 'out'], true);
      if (e.type === 'dnf' && car) director([car.id], 7);
      if (e.type === 'flag' && /Chequered/.test(e.text)) sound.roar(1);
      if (e.type === 'lap') sound.roar(0.5);
    } else if (e.type === 'sc') {
      addRadio({ from: 'race', text: e.text }); toast((e.phase === 'green' ? '🟢 ' : '🟡 ') + e.text, true);
      say([/GREEN|Green flag/.test(e.text) ? 'green' : /in this lap/.test(e.text) ? 'scin' : /VIRTUAL/.test(e.text) ? 'vsc' : 'sc'], true);
      if (e.phase === 'green') sound.roar(0.7);
    } else if (e.type === 'incident') {
      addRadio({ from: isMine ? 'engineer' : 'race', text: e.text }); toast('⚠️ ' + e.text, isMine);
      const hit = isMine ? e.car : e.other && my.includes(e.other) ? e.other : null;
      if (hit && /Puncture|puncture/.test(e.text)) say([carTag(hit), 'puncture'], true);
      else if (hit && /Contact/.test(e.text)) say([carTag(hit), 'contact']);
      if (car && (car.pos <= 6 || isMine)) director([car.id], 7);
    } else if (e.type === 'dna' && isMine) {
      // a moment the driver's DNA caused, with the settings behind it
      const prof = G.setup?.grid.find((g) => g.id === e.car)?.dnaProfile;
      const why = (e.keys || []).slice(0, 2).map((k) => `${PARAMS.find((p) => p.key === k).label} ${prof ? prof.params[k] : ''}`.trim()).join(', ');
      addRadio({ from: 'engineer', text: e.text + (why ? ` (Driver DNA: ${why})` : '') });
      toast('⚠️ ' + e.text, true);
    } else if (e.type === 'order' && (isMine || (e.other && my.includes(e.other)))) {
      addRadio({ from: 'engineer', text: e.text }); toast('📻 ' + e.text, true);
    } else if (e.type === 'battle') {
      toast('🔥 ' + e.text, true); addRadio({ from: 'race', text: e.text });
      director([e.car, e.other], 12, true);
      sound.roar(0.5);
    } else if (e.type === 'pass' && (isMine || (e.other && my.includes(e.other)))) {
      toast(e.text, isMine); addRadio({ from: 'race', text: e.text });
      const both = isMine && e.other && my.includes(e.other), now = performance.now();
      if (!both && now - lastPassSay > 9000) {
        lastPassSay = now;
        const who = isMine ? car : R.byId.get(e.other);
        say([carTag(who.id), isMine ? 'nice' : 'lost', 'p' + who.pos]);
      }
    } else if (e.type === 'pass') {
      if (!lite || Math.random() < 0.5) toast(e.text);
      if (/for P[123]\b/.test(e.text)) sound.roar(0.55);
    } else if (e.type === 'fastest') {
      toast('⏱ ' + e.text); if (isMine) { addRadio({ from: 'race', text: e.text }); say([carTag(e.car), 'fastest']); }
    } else if (e.type === 'mistake' && (isMine || car.pos <= 5)) toast(e.text);
  }
}

// ---------- screens ----------
function show(html, cls = '') {
  const sc = $('#screen'); sc.className = 'screen ' + cls; sc.hidden = false;
  $('#sheet').innerHTML = html; $('#sheet').scrollTop = 0;
  return $('#sheet');
}
function hide() { $('#screen').hidden = true; }

function home() {
  const n = dayNumber(), dv = dailyVenue(n), done = S.daily.days[n];
  const sv = CALENDAR[(S.season.round - 1) % CALENDAR.length], seasonOver = S.season.round > CALENDAR.length;
  const sh = show(`
    <h1 class="brand">AGENT <em>GRAND PRIX</em></h1>
    <p class="tag">Your AI drivers race. You run the team: tyres, pit stops, battery and the weather call. 25 Grands Prix from Abuja to Anchorage.</p>
    <div class="cards">
      <div class="hc"><span class="k">Daily Grand Prix #${n}${S.daily.streak > 1 ? ` · 🔥 ${S.daily.streak}-day streak` : ''}</span><h3>${dv.flag} ${esc(dv.city)}</h3>
        <p>${done ? `You finished P${done.best} today. Come back tomorrow for a new race, or run it again for fun.` : 'The same race and the same weather for everyone today. Beat the field and share your result.'}</p>
        <div class="row"><button class="btn" data-go="daily" type="button">${done ? 'Race it again' : "Race today's GP"}</button>${done ? '<button class="btn ghost" data-go="share" type="button">Share</button>' : ''}</div></div>
      <div class="hc"><span class="k">Season ${S.season.no}${seasonOver ? ' · complete' : ` · round ${S.season.round} of ${CALENDAR.length}`}</span><h3>${seasonOver ? '🏆 Season over' : `${sv.flag} ${esc(sv.city)}`}</h3>
        <p>${seasonOver ? 'See the final standings and start a new season.' : esc(sv.note)}</p>
        <div class="row"><button class="btn" data-go="season" type="button">${seasonOver ? 'Standings' : S.season.round > 1 ? 'Next round' : 'Start the season'}</button><button class="btn ghost" data-go="standings" type="button">Standings</button></div></div>
      <div class="hc"><span class="k">Quick race</span><h3>Pick any circuit</h3>
        <p>Every venue on the calendar, any time. No points, just practice.</p>
        <div class="row"><button class="btn ghost" data-go="quick" type="button">Choose a circuit</button></div></div>
    </div>
    <div class="home-foot"><span>Team: <b>${esc(team().name)}</b> · ${S.stats.starts} starts · ${S.stats.wins} wins</span>
      <span><button data-go="team" type="button">${S.team ? 'Edit team' : 'Name your team'}</button> <button data-go="help" type="button">How to play</button> <button data-go="win" type="button">How to win</button></span></div>`, 'home');
  sh.addEventListener('click', homeClick);
}
function homeClick(e) {
  const b = e.target.closest('[data-go]'); if (!b) return;
  const go = b.dataset.go, n = dayNumber();
  if (go === 'daily') needTeam(() => pre({ kind: 'daily', venue: dailyVenue(n), seed: hashString('daily-' + n), day: n }));
  if (go === 'season') {
    if (S.season.round > CALENDAR.length) return standings(true);
    const v = CALENDAR[S.season.round - 1];
    needTeam(() => pre({ kind: 'season', venue: v, seed: hashString(`season-${S.season.no}-${S.season.round}`), round: S.season.round }));
  }
  if (go === 'standings') standings();
  if (go === 'quick') quickPick();
  if (go === 'team') teamSheet(home);
  if (go === 'help') helpSheet(home);
  if (go === 'win') winSheet(home);
  if (go === 'share') shareSheet(S.daily.days[n].share, home);
}

function needTeam(next) { if (S.team) next(); else teamSheet(next, true); }

function teamSheet(next, first) {
  const t = structuredClone(team());
  let liv = Math.max(0, LIVERIES.findIndex((l) => l.c1 === t.c1));
  const sh = show(`
    <h2>${first ? 'Your team' : 'Edit team'}</h2>
    <p class="lede">${first ? 'You are the team principal. Name your team and your two AI drivers.' : 'Change names and colours any time.'}</p>
    <div class="grid2">
      <label class="field"><span>Team name</span><input id="tName" maxlength="22" value="${esc(t.name)}"></label>
      <label class="field"><span>Short code</span><input id="tShort" maxlength="3" value="${esc(t.short)}"></label>
      <label class="field"><span>Driver 1</span><input id="d1" maxlength="14" value="${esc(t.drivers[0].name)}"></label>
      <label class="field"><span>Driver 2</span><input id="d2" maxlength="14" value="${esc(t.drivers[1].name)}"></label>
    </div>
    <div class="sub" style="margin-top:14px">Colours</div>
    <div class="swatches">${LIVERIES.map((l, i) => `<button type="button" data-l="${i}" class="${i === liv ? 'on' : ''}" aria-label="${l.name}"><i style="background:${l.c1}"></i><i style="background:${l.c2}"></i></button>`).join('')}</div>
    <div class="actions"><button class="btn" id="tSave" type="button">${first ? 'Save and race' : 'Save'}</button><button class="btn ghost" id="tSkip" type="button">${first ? 'Skip' : 'Cancel'}</button></div>`);
  $$('[data-l]', sh).forEach((b) => b.addEventListener('click', () => { liv = +b.dataset.l; $$('[data-l]', sh).forEach((x) => x.classList.toggle('on', x === b)); }));
  $('#tSave').addEventListener('click', () => {
    const code = (s) => s.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
    const d1 = $('#d1').value.trim() || 'Nova', d2 = $('#d2').value.trim() || 'Echo';
    let c1 = code(d1), c2 = code(d2); if (c1 === c2) c2 = c2.slice(0, 2) + '2';
    S.team = { name: $('#tName').value.trim() || 'Your Team', short: code($('#tShort').value || $('#tName').value), c1: LIVERIES[liv].c1, c2: LIVERIES[liv].c2,
      drivers: [{ name: d1, code: c1 }, { name: d2, code: c2 }] };
    store.save(); next();
  });
  $('#tSkip').addEventListener('click', () => { if (first) { S.team = DEFAULT_TEAM; store.save(); } next(); });
}

function helpSheet(back) {
  const sh = show(`
    <h2>How to play</h2>
    <p class="lede">Your two AI drivers do the driving. You make the calls from the pit wall.</p>
    <ul class="help">
      <li><b>Tyres.</b> Softs are fastest but wear out quickest. Mediums and Hards last longer. In a dry race you must use two different dry compounds.</li>
      <li><b>Rain.</b> Watch the radar in the top bar. On a damp track switch to Inters (green); on a soaked track, Wets (blue). Back to slicks when it dries.</li>
      <li><b>Pit stop.</b> Tap a tyre under <i>Box this lap</i>. Your driver pits the next time past the pit entry. A stop costs about 8 seconds.</li>
      <li><b>ERS (battery).</b> Deploy for speed on the straights, Harvest to recharge.</li>
      <li><b>Battle.</b> Attack to go for gaps, Defend to hold position. Both cost a little.</li>
      <li><b>Autonomous.</b> Flip the switch and your AI makes every call. Races you run fully autonomous are marked that way.</li>
      <li><b>Boost.</b> The green BOOST button on the race view fires the battery for 12 seconds. Use it when you're within a second of the car ahead.</li>
      <li><b>Cameras.</b> Tap any car to follow it. Live (the TV director), Overview, Chase, Cockpit, TV and Pit views. Keys 1–6 on a keyboard, space to pause.</li>
    </ul>
    <div class="actions"><button class="btn" id="hBack" type="button">Got it</button><button class="btn ghost" id="hWin" type="button">How to win</button></div>`);
  $('#hBack').addEventListener('click', back);
  $('#hWin').addEventListener('click', () => winSheet(() => helpSheet(back)));
}

// the engineer's plan for this race: start tyres for each driver and when to stop
function planFor(v, probe) {
  const laps = probe.laps, wm = v.wear || 1, W = probe.weather, lines = [];
  const life = (c) => LIFE[c] / wm;
  if (W.wet0 > 0.17) {
    const c = W.wet0 > 0.7 ? 'W' : 'I';
    lines.push(`The track is ${c === 'W' ? 'soaked' : 'damp'}: start both cars on <b>${COMPOUNDS[c].name}s</b>.`);
    lines.push('Watch the top bar. Once the rain has stopped and it reads Dry, box for slicks that lap. The first car on slicks usually wins.');
    return { start: [c, c], lines };
  }
  const oneStop = life('M') + life('H') >= laps * 1.05;
  const stopM = Math.max(2, Math.min(laps - 2, Math.round(Math.min(life('M') * 0.8, laps * 0.5))));
  const stopS = Math.max(1, Math.min(laps - 2, Math.round(life('S') * 0.75)));
  const after = (from, at) => { const rem = laps - at; return rem <= life('S') * 0.85 ? 'S' : rem <= life('M') * 0.85 && from !== 'M' ? 'M' : 'H'; };
  lines.push(`<b>Car 1:</b> start on Mediums, box around lap ${stopM} for ${COMPOUNDS[after('M', stopM)].name}s. Safe and steady.`);
  lines.push(`<b>Car 2:</b> start on Softs to gain places early, box around lap ${stopS} for ${COMPOUNDS[after('S', stopS)].name}s.`);
  if (!oneStop) lines.push('Tyre wear is high here, so you may need two stops. Box when tyre life drops under 25%.');
  if (W.showers.length || v.rain > 0.35) lines.push('Rain is possible. If a shower is due within two laps of your stop, wait and fit Inters instead. Splitting your two cars covers both bets.');
  lines.push('If the safety car comes out near your pit window, box straight away: the stop costs about half the time.');
  return { start: ['M', 'S'], lines };
}

function winSheet(back) {
  show(`
    <h2>How to win</h2>
    <p class="lede">The fastest car doesn't always win. The best calls do.</p>
    <ul class="help">
      <li><b>Pick a plan before the start.</b> Use the engineer's plan, then adjust as the race unfolds. Mediums to start is the safe one-stop. Softs gain places early but wear out fast.</li>
      <li><b>Split your two cars.</b> Put them on different tyres or stop on different laps. If the weather or a safety car goes against one, the other benefits.</li>
      <li><b>The undercut.</b> Stuck behind someone? Box a lap before they do. Fresh tyres are about a second a lap faster, so you can come out ahead when they stop.</li>
      <li><b>Watch tyre life.</b> Under 25%, grip falls off a cliff. Near 0% a tyre can puncture, and a puncture can end your race.</li>
      <li><b>Safety car means a cheap stop.</b> A normal stop costs about 8 seconds. Under the safety car it costs about half. If your stop was due in the next few laps, box now.</li>
      <li><b>Rain.</b> Damp track: Inters. Soaked: Wets. When it dries, the first car on slicks gains the most. The radar in the top bar warns you a few laps ahead.</li>
      <li><b>ERS (battery).</b> Harvest when you're alone so you have charge for a fight. Then hit BOOST or Deploy when you're within a second of the car ahead, or to defend.</li>
      <li><b>Pace.</b> Save tyres on a long stint and Push in the last two laps. Attack makes passes more likely but risks contact. Defend makes you harder to pass.</li>
      <li><b>Two compounds.</b> In a dry race you must use two different dry tyres, or you get a 20-second penalty.</li>
      <li><b>Pit-exit fights.</b> Coming out just ahead of a rival? Defend and BOOST for the first lap while your new tyres warm up.</li>
    </ul>
    <div class="actions"><button class="btn" id="wBack" type="button">Back</button></div>`);
  $('#wBack').addEventListener('click', back);
}


function quickPick() {
  const sh = show(`<h2>Quick race</h2><p class="lede">Pick a circuit. No points; good for practice.</p>
    <div class="venues">${VENUES.map((v) => `<button type="button" data-v="${v.id}"><b>${v.flag} ${esc(v.city)}</b><span>${esc(v.country)} · ${esc(v.circuit)}</span></button>`).join('')}</div>
    <div class="actions"><button class="btn ghost" id="qBack" type="button">Back</button></div>`);
  $$('[data-v]', sh).forEach((b) => b.addEventListener('click', () => {
    const v = VENUES.find((x) => x.id === b.dataset.v);
    needTeam(() => pre({ kind: 'quick', venue: v, seed: hashString('quick-' + v.id + '-' + Date.now()) }));
  }));
  $('#qBack').addEventListener('click', home);
}

// the garage: every car in the series. Only the modelled ones can race yet.
const ROSTER = [
  ['falcon', 'Falcon', 'Sharp nose, big side pods'], ['vortex', 'Vortex', '2040 racing vision'], ['spectre', 'Spectre', 'Graphite future racer'],
  ['raptor', 'Raptor', 'Aerodynamic future racer'], ['arrowhead', 'Arrowhead', 'Fighter-jet inspired'], ['manta', 'Manta', 'Wide, low and flat'],
  ['kestrel', 'Kestrel', 'Light and nimble'], ['stratos', 'Stratos', 'Tall fins, high wing'], ['peregrine', 'Peregrine', 'Built for top speed'],
  ['tempest', 'Tempest', 'Storm-grey brawler'],
];
// a little top-down outline of each car, shaped by its name so every tile looks different
function carSvg(id, col) {
  const h = hashString(id || 'simple'), k = (n) => ((h >>> n) & 15) / 15;
  if (!id) return `<svg viewBox="0 0 40 80" aria-hidden="true"><rect x="6" y="6" width="28" height="68" rx="4" fill="${col}"/><rect x="2" y="12" width="6" height="14" rx="2" fill="#222"/><rect x="32" y="12" width="6" height="14" rx="2" fill="#222"/><rect x="2" y="54" width="6" height="16" rx="2" fill="#222"/><rect x="32" y="54" width="6" height="16" rx="2" fill="#222"/></svg>`;
  const nose = 3 + k(0) * 5, pod = 9 + k(4) * 5, fw = 15 + k(8) * 4, rw = 12 + k(12) * 4;
  return `<svg viewBox="0 0 40 80" aria-hidden="true">
    <rect x="${20 - fw}" y="${nose + 1}" width="${fw * 2}" height="4" rx="1" fill="#222"/>
    <rect x="1" y="14" width="6" height="12" rx="2" fill="#222"/><rect x="33" y="14" width="6" height="12" rx="2" fill="#222"/>
    <rect x="0" y="52" width="7" height="15" rx="2" fill="#222"/><rect x="33" y="52" width="7" height="15" rx="2" fill="#222"/>
    <path d="M20 ${nose} L23 24 L${20 + pod} 36 L${20 + pod} 56 L24 70 L16 70 L${20 - pod} 56 L${20 - pod} 36 L17 24 Z" fill="${col}"/>
    <ellipse cx="20" cy="40" rx="3" ry="5" fill="#111"/>
    <rect x="${20 - rw}" y="70" width="${rw * 2}" height="5" rx="1" fill="#222"/></svg>`;
}
function carTiles() {
  const cur = carModel() || '', ready = new Set(MODELS.map((m) => m.id)), col = team().c1;
  const tile = (id, name, line, ok) => `<button type="button" data-car-model="${id}" class="car-tile ${cur === id ? 'on' : ''}" ${ok ? '' : 'disabled'}>
    ${carSvg(id, ok ? col : '#9aa3ad')}<b>${name}</b><span>${line}</span>${ok ? '' : '<em>In the workshop</em>'}</button>`;
  return `<div class="garage">${ROSTER.map(([id, name, line]) => tile(id, name, line, ready.has(id))).join('')}
    ${tile('', 'Simple cars', 'Plain blocky cars from the first version. Pick these only if the race stutters on your phone.', true)}</div>`;
}
// what each tyre does at this track: speed, and roughly how many laps before it fades
function tyreGuide(v) {
  const wm = v.wear || 1, laps = (c) => Math.max(1, Math.round(LIFE[c] / wm * 0.8));
  const rows = [
    ['S', 100, `Fastest. Lasts about ${laps('S')} laps here. Use it to gain places at the start or for a short last stint.`],
    ['M', 82, `A little slower. Lasts about ${laps('M')} laps. The safe all-rounder.`],
    ['H', 64, `Slowest dry tyre, but lasts about ${laps('H')} laps. For a long stint so you only stop once.`],
    ['I', 40, 'Intermediate. For a damp track or light rain. Too slow once it dries.'],
    ['W', 26, 'Full wet. For heavy rain and standing water.'],
  ];
  return `<div class="tguide">${rows.map(([c, sp, t]) => `<div>${tyreHTML(c)}<b>${COMPOUNDS[c].name}</b><i title="Speed on a dry track"><u style="width:${sp}%;background:${COMPOUNDS[c].color}"></u></i><span>${t}</span></div>`).join('')}
    <p>In a dry race each car must use two different dry tyres (Soft, Medium or Hard), so every car stops at least once.</p></div>`;
}

// pre-race: forecast, grid slots, starting tyres, mode
function pre(o) {
  Object.assign(G, { kind: o.kind, venue: o.venue, seed: o.seed, round: o.round || null, day: o.day || null });
  const probe = setupRace({ venue: o.venue, seed: o.seed, team: team() });
  const T = probe.track, W = probe.weather;
  const grid = (id) => probe.grid.findIndex((e) => e.id === id) + 1;
  const wetStart = W.wet0 > 0.17;
  const rainTxt = W.wet0 > 0.17 ? 'Wet track at the start' : W.showers.length ? `${Math.round(clamp(o.venue.rain + 0.25, 0.3, 0.9) * 100)}% chance of rain` : o.venue.rain > 0.2 ? `${Math.round(o.venue.rain * 60)}% chance of rain` : 'Dry';
  const picks = { 'you-0': wetStart ? (W.wet0 > 0.7 ? 'W' : 'I') : 'M', 'you-1': wetStart ? (W.wet0 > 0.7 ? 'W' : 'I') : 'M' };
  let auto = !!S.settings.auto;
  let coachOn = coachDefault(o.kind);
  const label = o.kind === 'daily' ? `Daily Grand Prix #${o.day}` : o.kind === 'season' ? `Season ${S.season.no} · Round ${o.round}` : 'Quick race';
  const sh = show(`
    <div class="sub">${label}</div>
    <h2>${o.venue.flag} ${esc(o.venue.city)} Grand Prix</h2>
    <p class="lede">${esc(o.venue.circuit)}, ${esc(o.venue.country)}. ${esc(o.venue.note)}</p>
    <div class="facts">
      <div><small>Laps</small><b>${probe.laps}</b></div>
      <div><small>Lap length</small><b>${(T.L / 1000).toFixed(2)} km</b></div>
      <div><small>Weather</small><b>${tempTxt(o.venue.temp)} · ${rainTxt}</b></div>
      <div><small>Tyre wear</small><b>${o.venue.wear >= 1.15 ? 'High' : o.venue.wear <= 0.85 ? 'Low' : 'Medium'}</b></div>
    </div>
    <div class="sub">Your car</div>
    <p class="note">Every car in the race uses the car you pick, each in its own team colours. All cars perform the same: your calls make the difference. More cars are on the way.</p>
    ${carTiles()}
    <div class="plan"><div class="sub">Your engineer's plan</div><ul>${planFor(o.venue, probe).lines.map((l) => `<li>${l}</li>`).join('')}</ul>
      <button class="btn ghost" id="usePlan" type="button">Use this plan</button> <button class="btn ghost" id="howWin" type="button">How to win</button></div>
    <div class="sub">Tyres</div>
    ${tyreGuide(o.venue)}
    <div class="sub">Starting tyres</div>
    <p class="note">You run a team of two cars, and you make the calls for both. Starting them on different tyres covers more bets.</p>
    <div class="pick">${team().drivers.map((d, i) => `<div><div class="who"><span class="sw" style="width:5px;height:16px;border-radius:2px;background:${team().c1}"></span>${esc(d.name)} · starts P${grid('you-' + i)}</div>
      <div class="box-row" data-car="you-${i}">${Object.keys(COMPOUNDS).map((k) => `<button type="button" data-c="${k}" class="${picks['you-' + i] === k ? 'on' : ''}">${tyreHTML(k)}${COMPOUNDS[k].name}</button>`).join('')}</div></div>`).join('')}</div>
    <div class="sub">Who makes the calls?</div>
    <div class="mode">
      <button type="button" data-m="0" class="${auto ? '' : 'on'}"><b>Team Principal</b><span>You call pit stops, tyres and tactics. Your engineer advises.</span></button>
      <button type="button" data-m="1" class="${auto ? 'on' : ''}"><b>Autonomous</b><span>Your AI makes every call. Sit back and watch. You can take over any time.</span></button>
    </div>
    <div class="sub">Radio voice</div>
    <p class="note">Your engineer speaks the calls on the team radio, so you can watch the race instead of reading. Tap a voice to hear it.</p>
    <div class="vpick">${[...VOICES, { id: '', name: 'Off', note: 'Text only' }].map((v) => `<button type="button" data-voice="${v.id}" class="${(voiceId() || '') === v.id ? 'on' : ''}"><b>${v.name}</b><span>${v.note}</span></button>`).join('')}</div>
    <label class="coachopt"><input type="checkbox" id="coachOpt" ${coachOn ? 'checked' : ''}><span><b>Race coach</b> Tips at the right moment during the race, with a button to act on them in one tap. Good for your first races.</span></label>
    <label class="statsopt"><input type="checkbox" id="statsOpt" ${statsEl.hidden ? '' : 'checked'}> Show frame rate (for testing on your phone)</label>
    <div class="actions"><button class="btn" id="goGrid" type="button">Go to the grid</button><button class="btn ghost" id="preBack" type="button">Back</button></div>`);
  $$('.box-row', sh).forEach((row) => $$('button', row).forEach((b) => b.addEventListener('click', () => {
    picks[row.dataset.car] = b.dataset.c; $$('button', row).forEach((x) => x.classList.toggle('on', x === b));
  })));
  $$('[data-m]', sh).forEach((b) => b.addEventListener('click', () => { auto = b.dataset.m === '1'; $$('[data-m]', sh).forEach((x) => x.classList.toggle('on', x === b)); }));
  $$('[data-car-model]', sh).forEach((b) => b.addEventListener('click', () => {
    S.settings.car = b.dataset.carModel || null; store.save();
    $$('[data-car-model]', sh).forEach((x) => x.classList.toggle('on', x === b));
    if (world) world.setModel(carModel());
  }));
  $$('[data-voice]', sh).forEach((b) => b.addEventListener('click', () => {
    S.settings.voice = b.dataset.voice || null; store.save();
    $$('[data-voice]', sh).forEach((x) => x.classList.toggle('on', x === b));
    voice.use(voiceId(), sound.ctx);
    if (voiceId()) voice.say(['car1', 'w_window', 'q_M'], true);
  }));
  $('#coachOpt').addEventListener('change', (e) => { coachOn = e.target.checked; S.settings.coach = coachOn; store.save(); });
  $('#statsOpt').addEventListener('change', (e) => { S.settings.stats = e.target.checked; store.save(); statsEl.hidden = !e.target.checked; });
  $('#preBack').addEventListener('click', home);
  $('#usePlan').addEventListener('click', () => {
    const p = planFor(o.venue, probe);
    $$('.box-row', sh).forEach((row, i) => { picks[row.dataset.car] = p.start[i]; $$('button', row).forEach((x) => x.classList.toggle('on', x.dataset.c === p.start[i])); });
    toast('Plan set: ' + p.start.map((c) => COMPOUNDS[c].name).join(' and ') + ' to start.');
  });
  $('#howWin').addEventListener('click', () => winSheet(() => pre(o)));
  $('#goGrid').addEventListener('click', () => { S.settings.auto = auto; store.save(); G.coach = coachOn && !auto; startRace(picks, auto); });
}

function startRace(picks, auto) {
  hide();
  G.attract = false; G.ended = false; G.paused = false; G.acc = 0; G.evIdx = 0; G.assisted = false; G.forecastSaid = new Set();
  app.classList.remove('attract');
  loadVenue(G.venue);
  const setup = setupRace({ venue: G.venue, seed: G.seed, team: team(), startCompounds: picks, auto, dna: raceDNA(S, dnaOn) });
  G.setup = setup; G.race = setup.make(); G.auto0 = auto;
  world.setCars(G.race.cars);
  G.sel = 'you-0'; G.mineSel = 'you-0'; G.coachState = null; coachHide();
  $('#radio').innerHTML = '';
  buildTower(); buildCard(); renderControls(true);
  $('#hud').hidden = false; $('#camPill').hidden = false;
  setCam('live');
  if (S.settings.sound !== false) sound.start(lite);
  voice.use(voiceId(), sound.ctx);
  addRadio({ from: 'engineer', text: auto ? 'Autonomous mode. I\'ll make the calls; take over whenever you like.' : `Radio check. You have the calls. ${G.setup.weather.showers.length || G.setup.weather.wet0 ? 'Keep an eye on the sky today.' : 'It looks dry: we need one stop for a second compound.'}` });
  if (!auto) for (const id of ['you-0', 'you-1']) {
    const c = G.race.byId.get(id);
    if (c.plan.lap) addRadio({ from: 'engineer', text: `${c.code} plan: one stop around lap ${c.plan.lap + 1}, then ${COMPOUNDS[c.plan.next].name}s. I'll call it when the window opens.` });
  }
  tick();
  lightsSequence();
}

let lightsTimers = [];
function lightsSequence(skip) {
  const L = $('#lights'), dots = $$('i', L);
  lightsTimers.forEach(clearTimeout); lightsTimers = [];
  if (skip) { L.hidden = true; world.setLights(0, true); if (!G.race.started) G.race.start(); return; }
  L.hidden = false; L.classList.remove('go'); dots.forEach((d) => d.classList.remove('on'));
  world.setLights(0);
  const step = 700;
  for (let i = 0; i < 5; i++) lightsTimers.push(setTimeout(() => { dots[i].classList.add('on'); world.setLights(i + 1); beep(440, 0.12); }, 600 + i * step));
  const hold = 600 + 5 * step + 400 + Math.random() * 900;
  lightsTimers.push(setTimeout(() => {
    dots.forEach((d) => d.classList.remove('on')); L.classList.add('go'); world.setLights(0, true); beep(880, 0.3);
    G.race.start();
    lightsTimers.push(setTimeout(() => (L.hidden = true), 900));
  }, hold));
}
let actx = null;
function beep(f, d) {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = f; o.type = 'square'; g.gain.value = 0.04;
    o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + d);
  } catch { /* no sound */ }
}

function pauseMenu() {
  if (G.attract) return;
  G.paused = true;
  const sh = show(`<h2>Paused</h2><p class="lede">${G.venue.flag} ${esc(G.venue.city)} · lap ${G.race.leaderLap()} of ${G.race.laps}</p>
    <div class="actions" style="flex-direction:column">
      <button class="btn wide" id="pResume" type="button">Resume</button>
      <button class="btn ghost wide" id="pHelp" type="button">How to play</button>
      <button class="btn ghost wide" id="pRestart" type="button">Restart race</button>
      <button class="btn ghost wide" id="pQuit" type="button">Quit to home</button></div>`);
  $('#pResume').addEventListener('click', resume);
  $('#pHelp').addEventListener('click', () => helpSheet(pauseMenu));
  $('#pRestart').addEventListener('click', () => pre({ kind: G.kind, venue: G.venue, seed: G.seed, round: G.round, day: G.day }));
  $('#pQuit').addEventListener('click', () => { lightsTimers.forEach(clearTimeout); $('#lights').hidden = true; attract(); });
}
function resume() { hide(); G.paused = false; }

// ---------- results ----------
const TROPHIES = {
  first: '🏁 First race', points: '🔟 First points', podium: '🥉 First podium', win: '🥇 First win',
  fastest: '⏱ Fastest lap', double: '👯 Both cars in the points', rain: '🌧️ Rain master', comeback: '🚀 Comeback (+8 places)',
  abuja: '🇳🇬 Home win in Abuja', midnight: '🌅 Midnight sun', aloha: '🌺 Aloha', streak3: '🔥 3-day streak', champion: '🏆 Season champion',
};
const TYRE_EMOJI = { S: '🔴', M: '🟡', H: '⚪', I: '🟢', W: '🔵' };

function results() {
  const R = G.race, res = R.result, my = res.filter((x) => x.car.team.you);
  const best = Math.min(...my.map((x) => x.pos));
  const pts = my.reduce((s, x) => s + x.points, 0);
  say(['flag', 'p' + best, best === 1 ? 'won' : best <= 3 ? 'podium' : pts > 0 ? 'points' : 'nopoints'], true);
  const wet = R.weather.showers.length > 0 || R.weather.wet0 > 0;
  const assisted = G.assisted || !G.auto0;
  const earned = [];
  const give = (k) => { if (!S.trophies[k]) { S.trophies[k] = Date.now(); earned.push(TROPHIES[k]); } };
  if (G.kind !== 'quick' || true) {
    S.stats.starts++; S.stats.points += pts;
    if (best === 1) S.stats.wins++;
    if (best <= 3) S.stats.podiums++;
  }
  give('first');
  if (pts > 0) give('points');
  if (best <= 3) give('podium');
  if (best === 1) give('win');
  if (my.some((x) => x.fastest)) { give('fastest'); S.stats.fastest++; }
  if (my.every((x) => x.points > 0)) give('double');
  if (wet && best <= 3) give('rain');
  if (my.some((x) => !x.dnf && x.car.grid - x.pos >= 8)) give('comeback');
  if (G.venue.id === 'abuja' && best === 1) give('abuja');
  if (G.venue.id === 'anchorage') give('midnight');
  if (G.venue.id === 'honolulu') give('aloha');

  let seasonLine = '';
  if (G.kind === 'season' && G.round === S.season.round) {
    for (const x of res) {
      S.season.pts[x.id] = (S.season.pts[x.id] || 0) + x.points;
      S.season.teamPts[x.car.team.id] = (S.season.teamPts[x.car.team.id] || 0) + x.points;
    }
    S.season.results.push({ round: G.round, venue: G.venue.id, top: res.slice(0, 3).map((x) => x.car.code), you: my.map((x) => x.pos) });
    S.season.round++;
    const order = Object.entries(S.season.teamPts).sort((a, b) => b[1] - a[1]);
    const tp = order.findIndex(([k]) => k === 'you') + 1;
    seasonLine = `Your team is P${tp} in the constructors' standings after round ${G.round}.`;
    if (S.season.round > CALENDAR.length && tp === 1) give('champion');
  }
  let dailyLine = '', share = '';
  if (G.kind === 'daily') {
    const n = G.day, rec = S.daily.days[n];
    const lines = [
      `Agent Grand Prix · Daily #${n}`,
      `${G.venue.flag} ${G.venue.city}`,
      my.map((x) => `${x.car.code} ${x.dnf ? 'DNF' : 'P' + x.pos}${x.pos === 1 ? ' 🥇' : x.pos === 2 ? ' 🥈' : x.pos === 3 ? ' 🥉' : ''}`).join(' · '),
      my.map((x) => x.used.map((c) => TYRE_EMOJI[c]).join('→')).join('  ') + (wet ? ' · 🌧️' : '') + (assisted ? '' : ' · 🤖 autonomous'),
      `+${pts} pts`,
      location.origin + location.pathname,
    ];
    share = lines.join('\n');
    if (!rec) {
      S.daily.days[n] = { best, pts, share };
      S.daily.streak = S.daily.last === n - 1 ? S.daily.streak + 1 : 1;
      S.daily.last = n;
      if (S.daily.streak >= 3) give('streak3');
      dailyLine = `Today's result is saved. ${S.daily.streak > 1 ? `🔥 ${S.daily.streak}-day streak.` : 'Come back tomorrow for a new venue.'}`;
    } else {
      dailyLine = `Replay only: your scored run today was P${rec.best}.`;
      if (best < rec.best) { rec.best = best; rec.pts = pts; rec.share = share; dailyLine = `New best today: P${best}.`; }
    }
  }
  store.save();
  const top = res.slice(0, 3);
  const pod = (x, cls) => `<div class="${cls}" style="background:${x.car.team.c1};color:${readable(x.car.team.c1)}"><b>${x.pos}</b>${esc(x.car.code)}<br><small>${esc(x.car.team.short)}</small></div>`;
  const sh = show(`
    <div class="sub">${G.venue.flag} ${esc(G.venue.city)} Grand Prix · ${G.kind === 'daily' ? 'Daily #' + G.day : G.kind === 'season' ? 'Round ' + G.round : 'Quick race'}</div>
    <h2>${best === 1 ? 'You won!' : best <= 3 ? 'Podium!' : best <= 10 ? 'In the points' : 'Tough day'}</h2>
    <p class="lede">${my.map((x) => `${esc(x.car.name)} ${x.dnf ? 'retired' : 'finished P' + x.pos}${x.penalty ? ' (with a 20 s penalty: one compound only)' : ''}`).join(', ')}. +${pts} points.${assisted ? '' : ' Fully autonomous.'}</p>
    <div class="podium">${pod(top[1], 'p2')}${pod(top[0], 'p1')}${pod(top[2], 'p3')}</div>
    ${earned.length ? `<div class="tro">${earned.map((t) => `<span>${t}</span>`).join('')}</div>` : ''}
    ${seasonLine || dailyLine ? `<p class="lede">${seasonLine} ${dailyLine}</p>` : ''}
    <table class="res"><tbody>${res.map((x) => `<tr class="${x.car.team.you ? 'mine' : ''}"><td>${x.pos}</td><td><span class="sw" style="display:inline-block;width:5px;height:14px;border-radius:2px;background:${x.car.team.c1};margin-right:6px"></span>${esc(x.car.name)}</td><td class="m">${esc(x.car.team.short)}</td><td class="m">${x.used.join('›')}${x.fastest ? ' ⏱' : ''}</td><td class="r">${x.gapText}</td><td class="r">${x.points || ''}</td></tr>`).join('')}</tbody></table>
    <div class="actions">
      ${G.kind === 'season' && S.season.round <= CALENDAR.length ? '<button class="btn" data-r="next" type="button">Next round</button>' : ''}
      ${G.kind === 'daily' ? '<button class="btn" data-r="share" type="button">Share result</button>' : ''}
      <button class="btn ghost" data-r="again" type="button">Race again</button>
      ${G.kind === 'season' ? '<button class="btn ghost" data-r="standings" type="button">Standings</button>' : ''}
      <button class="btn ghost" data-r="home" type="button">Home</button>
    </div>`);
  sh.addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    const r = b.dataset.r;
    if (r === 'next') { const v = CALENDAR[S.season.round - 1]; pre({ kind: 'season', venue: v, seed: hashString(`season-${S.season.no}-${S.season.round}`), round: S.season.round }); }
    if (r === 'share') shareSheet(share, results);
    if (r === 'again') pre({ kind: G.kind === 'season' ? 'quick' : G.kind, venue: G.venue, seed: G.kind === 'daily' ? G.seed : hashString('quick-' + Date.now()), day: G.day });
    if (r === 'standings') standings();
    if (r === 'home') attract();
  });
  setCam('overview');
}

function readable(hex) {
  const c = new THREE.Color(hex); return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) > 0.6 ? '#111827' : '#ffffff';
}

function shareSheet(text, back) {
  const sh = show(`<h2>Share</h2><p class="lede">Copy this and send it to friends.</p>
    <textarea class="share" id="shareTxt" rows="7" readonly>${esc(text)}</textarea>
    <div class="actions"><button class="btn" id="sCopy" type="button">Copy</button><button class="btn ghost" id="sBack" type="button">Back</button></div>`);
  $('#sCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); $('#sCopy').textContent = 'Copied'; }
    catch { const t = $('#shareTxt'); t.focus(); t.select(); $('#sCopy').textContent = 'Selected: copy it'; }
  });
  $('#sBack').addEventListener('click', back);
}

function standings(over) {
  const drivers = [];
  TEAMS.forEach((t) => t.drivers.forEach((d, i) => drivers.push({ id: `${t.id}-${i}`, name: d.name, team: t.short, c: t.c1 })));
  team().drivers.forEach((d, i) => drivers.push({ id: `you-${i}`, name: d.name, team: team().short, c: team().c1, you: true }));
  drivers.forEach((d) => (d.pts = S.season.pts[d.id] || 0));
  drivers.sort((a, b) => b.pts - a.pts);
  const teams = [...TEAMS.map((t) => ({ id: t.id, name: t.name, c: t.c1 })), { id: 'you', name: team().name, c: team().c1, you: true }]
    .map((t) => ({ ...t, pts: S.season.teamPts[t.id] || 0 })).sort((a, b) => b.pts - a.pts);
  const done = S.season.round - 1;
  const sh = show(`<h2>Season ${S.season.no}</h2><p class="lede">${done ? `After ${done} of ${CALENDAR.length} rounds.` : 'The season starts in Abuja.'}</p>
    <div class="grid2">
      <div><div class="sub">Drivers</div><table class="res"><tbody>${drivers.map((d, i) => `<tr class="${d.you ? 'mine' : ''}"><td>${i + 1}</td><td><span class="sw" style="display:inline-block;width:5px;height:14px;border-radius:2px;background:${d.c};margin-right:6px"></span>${esc(d.name)}</td><td class="m">${esc(d.team)}</td><td class="r">${d.pts}</td></tr>`).join('')}</tbody></table></div>
      <div><div class="sub">Teams</div><table class="res"><tbody>${teams.map((t, i) => `<tr class="${t.you ? 'mine' : ''}"><td>${i + 1}</td><td><span class="sw" style="display:inline-block;width:5px;height:14px;border-radius:2px;background:${t.c};margin-right:6px"></span>${esc(t.name)}</td><td class="r">${t.pts}</td></tr>`).join('')}</tbody></table></div>
    </div>
    <div class="sub" style="margin-top:14px">Calendar</div>
    <div class="venues">${CALENDAR.map((v) => { const r = S.season.results.find((x) => x.round === v.round); return `<button type="button" class="${r ? 'done' : v.round === S.season.round ? 'next' : ''}" tabindex="-1"><b>${v.round}. ${v.flag} ${esc(v.city)}</b><span>${r ? `You: ${r.you.map((p) => 'P' + p).join(', ')} · won by ${esc(r.top[0])}` : `${esc(v.country)} · ${esc(v.circuit)}`}</span></button>`; }).join('')}</div>
    <div class="actions">${S.season.round > CALENDAR.length ? '<button class="btn" id="newSeason" type="button">Start season ' + (S.season.no + 1) + '</button>' : ''}<button class="btn ghost" id="stBack" type="button">Back</button></div>`);
  $('#stBack').addEventListener('click', () => (G.attract ? home() : results()));
  const ns = $('#newSeason');
  if (ns) ns.addEventListener('click', () => { S.season = { no: S.season.no + 1, round: 1, pts: {}, teamPts: {}, results: [] }; store.save(); home(); });
}

// ---------- test hooks ----------
window.__agp = {
  skipIntro() { lightsSequence(true); },
  ff(sec) { const R = G.race; for (let i = 0; i < sec / DT && !R.done; i++) R.step(); tick(); },
  start(kind = 'daily', id) {
    S.team ||= DEFAULT_TEAM;
    const n = dayNumber(), v = id ? VENUES.find((x) => x.id === id) : dailyVenue(n);
    Object.assign(G, { kind, venue: v, seed: hashString((kind === 'daily' ? 'daily-' : 'quick-') + (kind === 'daily' ? n : v.id)), day: n, round: kind === 'season' ? S.season.round : null });
    startRace({}, false); lightsSequence(true);
  },
  cam: setCam, tab: setTab, select, results, pre,
  car(id) { S.settings.car = id || null; if (world) world.setModel(carModel()); },
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, dpr }),
  get race() { return G.race; }, get world() { return world; }, renderer, camera, cams, THREE,
};

attract();
requestAnimationFrame(frame);
