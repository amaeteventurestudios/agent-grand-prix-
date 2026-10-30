// Agent Grand Prix: the page. Home screen over a live race, the race itself with the pit
// wall, results, the season and the Daily Grand Prix.
import { LANGS, LOCALE, lang as LANG, setLang, guessed as langGuessed, keepLang } from './i18n.js';   // first: the page translates as it draws
import { startHere } from './here.js';
import * as THREE from 'three';
import { CALENDAR, VENUES, COMPOUNDS, LIVERIES, TEAMS } from './data.js';
import { hashString, clamp } from './rng.js';
import { DT, LIFE, tyreLife, fmtLap, fmtTime } from './sim.js';
import { QualiSession, Q_LEN, fmtQ } from './quali.js';
import { setupRace, dayNumber, dailyVenue, DEFAULT_TEAM, TAKEN_NUMS, trackFor, LENGTHS, raceLaps } from './game.js';
import { World } from './world.js';
import { MODELS } from './cars.js';
import { Cams } from './cams.js';
import { Sound } from './audio.js';
import { Voice, VOICES } from './voice.js';
import { raceDNA, activeProfiles, dnaState, setProfile } from './dnastore.js';
import { STRATEGISTS, decide } from './strategist.js';
import './coach.js';
import { carMetrics } from './proving.js';
import { PARAMS, PRESETS, SLOTS, QUICK, fromPreset } from './dna.js';
import { openStudio, dnaLine, proposalHTML } from './studio.js';
import { openShowroom } from './showroom.js';
import { buildReport, reportHTML, shareText } from './report.js';
import { PLAYBOOK_CHOICES, playbookOf, dueDailies } from './agent.js';
import { account, start as accountStart, signIn, signOut, emailStart, emailVerify, mergeAnswer, setProfile as saveProfile, refreshPass, passCheckout, passManage, wallet as fetchWallet, memories as fetchMemories, forget, rememberRace } from './account.js';
import { careerState, recordRace, rankOf, lessonFor, learned, strengths, nextLesson, LESSON_TITLES } from './career.js';
import { fetchBoard, fetchWeek, submitDaily, boardHTML, leagueHTML } from './board.js';
import { liveOn, joinLive, readRoom, sendCall, listen as listenRoom, stop as stopListening, stepAt, secondsToStart, applyDue } from './live.js';
import { portraitSVG, helmetSVG, helmetOf, faceOf, HELMET_PATTERNS, VISORS, SKINS, HAIRS, HAIR_COLOURS, BEARDS, EYES } from './portrait.js';
import { strengthBars } from './carspec.js';
import * as store from './store.js';
import { parseCall, radioSupported, listen, wakeSplit, setRadioLang } from './teamradio.js';
import { lookup as wikiLookup } from './wiki.js';
setRadioLang(LANG);
import { Brain, intent as brainIntent, read as brainRead } from './brain.js';
import { plans as briefPlans } from './briefing.js';
import { LESSONS, Lesson, lessonById, fill, progress, complete, doneCount } from './academy.js';

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
  heroView();
}
new ResizeObserver(resize).observe(stage);

// ---------- game state ----------
const G = { race: null, setup: null, kind: null, venue: null, seed: 0, speed: 1, paused: false, acc: 0, sel: null, evIdx: 0, gap: 'interval', attract: true, ended: false, radioN: 0, forecastSaid: new Set(), round: null, day: null };
let world = null;
const team = () => (S.team && !S.team.draft ? S.team : DEFAULT_TEAM);   // a team still being built races as the default one
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
  G.attract = true; G.ended = false; sound.stop(); live.clear(); G.room = null; stopListening(); G.lesson = null; lessonCard(null);
  const n = dayNumber(), venue = dailyVenue(n);
  loadVenue(venue);
  const setup = setupRace({ venue, seed: hashString('attract-' + n), team: team(), withPlayer: false, laps: 30, car: carModel() || 'falcon' });
  G.race = setup.make(); G.setup = setup; G.venue = venue; G.evIdx = 0;
  world.setCars(G.race.cars);
  G.race.start();
  for (let i = 0; i < 20 * 35; i++) G.race.step();
  G.sel = G.race.order[0].id;
  G.attractT = 0;
  cams.setMode(GLANCE.matches ? 'chase' : 'live');
  $('#hud').hidden = true; $('#camPill').hidden = true; $('#follow').hidden = true;
  $('#boost').hidden = true; $('#boxBtn').hidden = true; $('#talkBtn').hidden = true; $('#talkSaid').hidden = true; $('#stats').hidden = true; $('#pitline').hidden = true; $('#coach').hidden = true;
  $('#drivers').hidden = true; $('#suggest').hidden = true; $('#ack').hidden = true; G.suggest = null; sheet('peek');
  app.classList.add('attract');
  buildTower();
  G.homeFull = false;   // every return home starts on the race itself; the menu opens on a tap
  home();
}

// ---------- a race survives a refresh ----------
// The race engine is deterministic: the same setup and the same calls at the same moments give the
// same race. So the browser keeps the setup, every call you made (with the engine step it was made
// on) and how far the race has run; after a refresh the race is rebuilt and run forward to that
// point in a blink. Saved on this device only; across devices needs the game server.
const LIVE_KEY = 'agp.live.v1';
const live = {
  rec: null,
  track(R, args, saved) {
    const rec = this.rec = { id: (saved && saved.id) || Math.random().toString(36).slice(2, 12), kind: G.kind, venue: G.venue.id, seed: G.seed, round: G.round, day: G.day, laps: G.laps || null, args, cmds: saved ? saved.cmds.slice() : [], n: 0, at: 0 };
    const step = R.step.bind(R), command = R.command.bind(R);
    R.step = () => { step(); rec.n++; };
    R.command = (id, c, from) => { if (!this.replaying) rec.cmds.push(from ? [rec.n, id, c, from] : [rec.n, id, c]); return command(id, c, from); };
  },
  replay(R, saved) {
    this.replaying = true;
    if (!R.started) R.start();
    const cmds = saved.cmds; let k = 0;
    while (this.rec.n < saved.n && !R.done) {
      while (k < cmds.length && cmds[k][0] <= this.rec.n) { R.command(cmds[k][1], cmds[k][2], cmds[k][3]); k++; }
      R.step();
    }
    while (k < cmds.length) { R.command(cmds[k][1], cmds[k][2], cmds[k][3]); k++; }
    this.replaying = false;
    G.speed = saved.speed || 1; speedUI();
  },
  save(force) {
    const R = G.race, rec = this.rec;
    if (!rec || G.attract || !R || R.done || !R.started || G.kind === 'academy') return;
    const now = performance.now(); if (!force && now - rec.at < 1000) return; rec.at = now;
    try { localStorage.setItem(LIVE_KEY, JSON.stringify({ ...rec, at: undefined, speed: G.speed, savedAt: Date.now() })); } catch (e) { /* storage full or blocked: the race just won't survive a refresh */ }
  },
  load() {
    try { const x = JSON.parse(localStorage.getItem(LIVE_KEY) || 'null'); return x && Date.now() - x.savedAt < 6 * 3600e3 ? x : null; } catch (e) { return null; }
  },
  clear() { this.rec = null; try { localStorage.removeItem(LIVE_KEY); } catch (e) { /* ignore */ } },
};
// ---------- your AI agent on WhatsApp follows this race (server/accounts.mjs, agent/whatsapp.mjs) ----------
// Once linked, the race record above goes to the server every two seconds; the agent rebuilds the
// same race from it and its calls (a box, a handover) come back here, where they're made like any
// other call. When your agents run the team, the agent asks you on WhatsApp before a big call; if
// it stops following (the agent is down), your agents go back to deciding for themselves.
const wa = { linked: false, own: null, name: null, wa: null, seq: 0, follow: false, at: 0, busy: false, sent: null, lost: 0 };
// the player's agent: the name they gave it, or a plain word until they've made one
const aName = () => wa.name || 'your agent';
async function agentStatus() {
  try { const r = await fetch('/api/me/agent', { credentials: 'same-origin' }); if (r.ok) Object.assign(wa, await r.json()); } catch (e) { /* no server: nothing to follow */ }
  return wa;
}
const callText = (c, cmd) => cmd.box ? `${c.code} boxes for ${COMPOUNDS[cmd.box].name.toLowerCase()}s` : 'box' in cmd ? `${c.code} stays out`
  : cmd.auto === true ? `${c.code}: your agents have the car` : cmd.auto === false ? `${c.code}: back to you` : cmd.pace ? `${c.code}: ${cmd.pace === 'save' ? 'save tyres' : cmd.pace}`
  : cmd.ers ? `${c.code}: ${cmd.ers === 'deploy' ? 'boost' : cmd.ers}` : cmd.battle ? `${c.code}: ${cmd.battle}` : null;
function agentSync(R) {
  if (!wa.linked || wa.busy || !account.on) return;
  const rec = live.rec, now = performance.now();
  const racing = rec && R && !G.attract && R.started && G.kind !== 'live' && G.kind !== 'academy';
  if (!racing) {
    // not racing here: clear what the agent follows (also a race left open by an earlier visit, once per page)
    if (wa.sent || !wa.cleared) { wa.sent = null; wa.cleared = true; fetch('/api/me/race', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {}); }
    return;
  }
  if (now - wa.at < 2000 || (wa.sent === rec.id && wa.doneSent)) return;
  if (wa.sent !== rec.id) { wa.seq = 0; wa.doneSent = false; wa.lost = 0; }
  wa.at = now; wa.busy = true;
  const done = R.done;
  fetch(`/api/me/race?after=${wa.seq}`, { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...rec, at: undefined, done }) })
    .then((x) => (x.ok ? x.json() : null)).catch(() => null).then((r) => {
      wa.busy = false; wa.sent = rec.id; if (done) wa.doneSent = true;
      wa.follow = !!(r && r.follow);
      if (r) for (const c of r.cmds || []) {
        if (c.seq <= wa.seq) continue;
        wa.seq = c.seq;
        const car = G.race === R && !R.done && R.byId.get(c.car); if (!car) continue;
        R.command(c.car, c.cmd);
        const t = callText(car, c.cmd);
        if (t) { addRadio({ from: 'info', text: `📱 ${aName()} on WhatsApp: ${t}.` }); toast(`📱 ${t}`); }
        renderControls(true);
      }
      // nobody on the other end: cars that were waiting for your answer decide for themselves again
      if (wa.follow) wa.lost = 0; else wa.lost ||= performance.now();
      if (wa.lost && performance.now() - wa.lost > 20000 && G.race === R && !R.done) for (const id of mine()) { const c = R.byId.get(id); if (c && c.ask) R.command(id, { ask: false }); }
    });
}
addEventListener('pagehide', () => live.save(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) live.save(true); });
function resumeRace(saved) {
  const v = VENUES.find((x) => x.id === saved.venue); if (!v) return false;
  // a live race is rejoined from its room, which holds every call; the browser's own copy isn't needed
  if (saved.kind === 'live') { readRoom(saved.args.room).then((r) => { if (r && r.you >= 0 && !r.error) liveStart(r); else { live.clear(); attract(); } }); return true; }
  Object.assign(G, { kind: saved.kind, venue: v, seed: saved.seed, round: saved.round, day: saved.day, laps: saved.laps });
  startRace(saved.args.startCompounds, saved.args.auto, saved);
  return true;
}

// ---------- loop ----------
let last = performance.now(), fpsT = 0, fpsN = 0, uiT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  cheerBurst *= Math.exp(-dt * 0.5);
  if (G.qs && world) { qualiFrame(dt); return; }
  const R = G.race;
  if (wa.linked) agentSync(R);
  if (R && R.started && !R.done && G.room && !G.attract) liveCatchUp();
  else if (R && R.started && !G.paused && !R.done) {
    // reduced motion: the race behind the home page holds still, a picture rather than a film
    G.acc += dt * (G.attract ? (reduce ? 0 : 1) : G.speed);
    let n = 0;
    while (G.acc >= DT && n < 60) { R.step(); G.acc -= DT; n++; }
    if (n === 60) G.acc = 0;
    if (G.attract && R.done) attractRestart();
  }
  if (G.attract && R) { // home screen: cut between TV and chase shots of the leading cars
    G.attractT += dt;
    // a phone's home screen is mostly the race, so it stays close on the cars: chase, then TV, then the director
    const shots = GLANCE.matches ? ['chase', 'tv', 'live'] : ['live', 'tv'];
    if (G.attractT > 9 && !reduce) { G.attractT = 0; G.sel = R.order[Math.floor(Math.random() * 4)].id; cams.setMode(shots[(shots.indexOf(cams.mode) + 1) % shots.length]); }
  }
  if (R && world) {
    // behind the home screen and menus the race is scenery: no tags or rings over the titles
    const showTags = !G.attract && cams.mode !== 'fpv' && cams.mode !== 'pit' && cams.mode !== 'crew';
    const focus = cams.mode === 'overview' ? cams.controls.target : cams.look;
    world.update(R, R.started && !G.paused ? clamp(G.acc / DT, 0, 1) : 1, dt, camera, G.attract && cams.mode === 'tv' ? null : G.sel, mine(), showTags,
      { speed: G.paused ? 0 : G.attract ? 1 : G.speed, focus, showRing: !G.attract && cams.mode !== 'fpv' });
    cams.update(dt, cams.mode === 'overview' ? null : G.sel);
    if (!G.attract) sound.update(R, world, camera, G.sel, cams.mode, G.paused || R.done || !$('#screen').hidden ? 0 : G.speed);
  }
  if (world && R && !G.attract) garageFeed(R);
  renderer.render(world ? world.scene : new THREE.Scene(), camera);
  uiT += dt;
  if (uiT > 0.2 && R && !G.attract) { uiT = 0; tick(); }
  if (R && !G.attract && R.done && !G.ended) {
    G.ended = true;
    // a lesson keeps its card: the summary has a Results button, and a race that ends mid-lesson says so
    const L = G.lesson;
    if (G.kind === 'academy' && L && !L.done) lessonOver();
    else if (G.kind === 'academy' && L && !$('#lesson').hidden) { if (L.summed) lessonSummary(L, L.summed); }
    else setTimeout(results, 1800);
  }
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
  lessonEvent({ type: 'select', id });
  buildCard(); renderControls(true); tick();
}

// ---------- HUD and panels ----------
$$('[data-speed]').forEach((b) => b.addEventListener('click', () => {
  if (fairRace()) return;
  G.speed = +b.dataset.speed; $$('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
}));
// the Daily Grand Prix and the season are competitive: everyone races them at real speed (and a
// lesson runs at real speed too, so the engineer and the race keep time)
const fairRace = () => G.kind === 'daily' || G.kind === 'dailyfull' || G.kind === 'season' || G.kind === 'academy' || G.kind === 'live';
function speedUI() {
  if (fairRace()) G.speed = 1;
  $('.hud .speed').hidden = fairRace();
  $$('[data-speed]').forEach((x) => x.classList.toggle('on', +x.dataset.speed === G.speed));
}
$$('[data-cam]').forEach((b) => b.addEventListener('click', () => setCam(b.dataset.cam)));
function setCam(m) { cams.setMode(m); $$('[data-cam]').forEach((x) => x.classList.toggle('on', x.dataset.cam === m)); camOpen(false); }
// phones: one Camera button opens the six views; picking one closes it
function camOpen(on) { app.classList.toggle('camopen', on); $('#camBtn').setAttribute('aria-expanded', String(on)); }
$('#camBtn').addEventListener('click', () => camOpen(!app.classList.contains('camopen')));
// phones held upright: the race fills the screen and Strategy, Timing and Radio live in a panel you
// swipe up from the bottom (peek: just the tab bar, half, full)
const PHONE_UP = '(orientation: portrait) and (max-width: 1199px)';
const phoneUp = () => matchMedia(PHONE_UP).matches;
const SHEETS = ['peek', 'half', 'full'];
function sheet(s) { if (app.dataset.sheet !== s) app.dataset.sheet = s; }
app.dataset.sheet = 'peek';
$$('[data-tab]').forEach((b) => b.addEventListener('click', () => {
  if (phoneUp() || appOn()) { if (app.dataset.sheet === 'peek') sheet('half'); else if (app.dataset.tab === b.dataset.tab) sheet('peek'); }
  setTab(b.dataset.tab);
}));
$('#grip').addEventListener('click', () => sheet(SHEETS[(SHEETS.indexOf(app.dataset.sheet) + 1) % 3]));
{ // swipe the tab bar up or down
  let y0 = null;
  $('#tabs').addEventListener('pointerdown', (e) => { y0 = e.clientY; });
  $('#tabs').addEventListener('pointerup', (e) => {
    if (y0 === null || !phoneUp()) return; const dy = e.clientY - y0; y0 = null;
    const i = SHEETS.indexOf(app.dataset.sheet);
    if (dy < -28) sheet(SHEETS[Math.min(2, i + 1)]); else if (dy > 28) sheet(SHEETS[Math.max(0, i - 1)]);
  });
}
function setTab(t) {
  app.dataset.tab = t; $$('[data-tab]').forEach((x) => x.classList.toggle('on', x.dataset.tab === t));
  if (t === 'eng') engPane(); camOpen(false);
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
let lastDnaSay = -1e9;
function say(parts, prio) {
  if (S.settings.sound === false || !voiceId()) return;
  // Team Principal mode: the engineer keeps quiet, so only you and your drivers are on the radio
  if (engineerQuiet(parts)) { parts = parts.filter((p) => String(p).startsWith('@')); if (!parts.length) return; }
  voice.say(parts, prio);
}
// The engineer talks only when it has the car (Autonomous mode, or its own stop calls in beginner
// assist), when you asked it (Ask the engineer, "strategist, …"), and in Academy lessons. Otherwise
// it shows race information on the pit wall and says nothing; your drivers still answer you.
const PIT_CLIPS = /^(bbb|bb_|s_box|q_|u_outlap)/;
function engineerQuiet(parts) {
  const R = G.race; if (!R || G.attract) return false;
  if (G.lesson && !G.lesson.done) return false;
  if (performance.now() - (G.askT || -1e9) < 12000) return false;
  const tag = parts && parts[0], cars = (tag === 'car1' ? ['you-0'] : tag === 'car2' ? ['you-1'] : mine()).map((id) => R.byId.get(id)).filter(Boolean);
  if (cars.some((c) => c.auto)) return false;
  if (cars.some((c) => c.assist) && parts?.some((p) => PIT_CLIPS.test(p))) return false;
  return true;
}
// your drivers answer on the radio in their own voices ("Copy. Boxing."), never the engineer's
const DRIVER_VOICES = ['george', 'lewis', 'daniel', 'fable', 'michael', 'alex'];
const driverVoice = (id) => DRIVER_VOICES.filter((v) => v !== voiceId())[id === 'you-1' ? 1 : 0];
function reply(id, clip) { if (S.settings.replies !== false) say(['@' + driverVoice(id) + '/' + clip]); }
const WHY_CLIPS = [['soaked', 'w_soaked'], ['wet out here', 'w_wet'], ['standing water', 'w_water'], ['overheating', 'w_wetshot'], ['dry line', 'w_dryline'],
  ['Safety car! Cheap', 'w_sc'], ['Virtual safety car. Box', 'w_vsc'], ['finished', 'w_finished'], ['second compound. Box now', 'w_second'], ['Pit window', 'w_window']];
const FACT_CLIPS = ['w_finished', 'w_second', 'w_window', 'w_water'];
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
  if (k === 't' && !e.repeat) { e.preventDefault(); talkStart(); }
  if (k === 'b' && G.mineSel) cmd({ box: G.race.byId.get(G.mineSel).pitReq ? null : boxPick(G.race.byId.get(G.mineSel)) });
});

document.addEventListener('keyup', (e) => { if (e.key.toLowerCase() === 't') talkStop(); });

function buildTower() {
  const ol = $('#towerList'); ol.innerHTML = '';
  for (const c of G.race.cars) {
    const li = document.createElement('li');
    li.dataset.id = c.id;
    li.innerHTML = `<span class="p"></span><span class="bar" style="background:${c.team.c1}"></span><span class="n"></span><span class="g"></span><span class="t"></span>`;
    li.addEventListener('click', () => { select(c.id); if (matchMedia('(max-width: 999px), (max-width: 1199px) and (orientation: portrait)').matches && cams.mode === 'overview') setCam('live'); });
    ol.append(li);
  }
}

const tyreHTML = (c) => `<span class="tyre" style="--c:${COMPOUNDS[c].color}"><b>${c}</b></span>`;

// time to the chequered flag at each car's current pace (its last lap), in race time: the leader's
// and your lead car's, so you can see whether there's time left to attack or it's time to defend
function toFlag(R, c) {
  if (!c || c.dnf) return null;
  if (c.finished) return 0;
  const pace = c.lastLap > 0 ? c.lastLap : R.track.lapTime * 1.1;
  return Math.max(0, (R.laps * R.track.L - c.dist) / R.track.L * pace);
}
const clock = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
function finUI(R) {
  const el = $('#hudFin'), lead = R.order[0];
  el.hidden = !R.started || G.attract || !lead;
  if (el.hidden) return;
  if (!el.firstChild) el.innerHTML = '<span aria-hidden="true">🏁</span><span class="fl">Leader</span><b class="tl"></b><span class="fy">· You <b class="ty"></b></span><span class="fyl">· You lead</span><b class="fdone">Chequered flag</b>';
  const you = mine().map((id) => R.byId.get(id)).filter((c) => c && !c.dnf).sort((a, b) => a.pos - b.pos)[0];
  const ty = you && you !== lead ? toFlag(R, you) : null, done = lead.finished;
  const put = (sel, v) => { const n = el.querySelector(sel); if (n.textContent !== v) n.textContent = v; };
  const show = (sel, on) => { const n = el.querySelector(sel); if (n.hidden === on) n.hidden = !on; };
  show('.fl', !done); show('.tl', !done); show('.fdone', done);
  show('.fy', !done && ty !== null); show('.fyl', !done && you === lead);
  if (!done) put('.tl', clock(toFlag(R, lead)));
  if (!done && ty !== null) put('.ty', clock(ty));
}

function tick() {
  lessonTick();
  const R = G.race; if (!R) return;
  agentsUI();
  // HUD
  const lead = R.order[0];
  $('#hudLap').textContent = R.leaderLap(); $('#hudLaps').textContent = R.laps;
  finUI(R);
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
  // the car you follow retired and has been taken away: follow your other car, or the leader
  const out = R.byId.get(G.sel);
  if (out && out.dnf && out.cleared && !G.attract) {
    const next = mine().map((id) => R.byId.get(id)).find((c) => !c.dnf && !c.finished) || R.order.find((c) => !c.dnf);
    if (next) { toast(`${out.code} is out of the race. Now following ${next.code}.`); return select(next.id); }
  }
  const f = R.byId.get(G.sel);
  const fl = $('#follow');
  if (f && cams.mode !== 'overview') {
    fl.hidden = false;
    fl.innerHTML = `<span class="sw" style="background:${f.team.c1}"></span>P${f.pos} ${esc(f.name)} · ${Math.round(f.v * 3.6)} km/h${f.drs ? ' · <b>DRS</b>' : ''}`;
  } else fl.hidden = true;
  stageCards(R, f);
  driverCards(R);
  pitLine(R, f);
  boostBtn(R);
  boxBtn(R);
  talkBtn(R);
  if (!G.suggest) coach(R);
  suggestCheck(R);
  driverNudges(R);
  engineer(R);
  live.save();
}

// the race screen in your garage: the TV view of the car you're following, redrawn every few frames
// and only when the camera is close enough to see it
let feedN = 0;
const feedV = new THREE.Vector3();
function garageFeed(R) {
  const f = world.paddock?.feed, o = f && world.carObjs.get(G.sel);
  if (!o || ++feedN % (lite ? 4 : 3) || camera.position.distanceTo(f.pos) > 90) return;
  const g = o.group, ry = g.rotation.y, fx = Math.cos(-ry), fz = Math.sin(-ry);
  f.cam.position.set(g.position.x - fx * 30 + fz * 14, 20, g.position.z - fz * 30 - fx * 14);
  f.cam.lookAt(feedV.set(g.position.x + fx * 8, 1, g.position.z + fz * 8));
  const sh = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;   // reuse this frame's shadows
  renderer.setRenderTarget(f.rt); renderer.render(world.scene, f.cam); renderer.setRenderTarget(null);
  renderer.shadowMap.autoUpdate = sh;
}

// ---------- the engineer in your ear ----------
// Between the calls, the engineer keeps both drivers posted: every lap each car hears its position,
// the gap ahead (or to a teammate), how the gap is moving, the car behind when it's close, and one of
// tyres, battery, pace or laps to go. Mid-lap, a car in a fight hears the gap again. Rivals boxing
// right ahead or behind get a call. These only play when the radio is quiet, so they never push out
// a real call, and each car keeps only its newest update.
const gapClip = (g) => (g < 3.5 ? 'n' + String(clamp(Math.round(g * 10), 1, 30)).padStart(2, '0') : g < 15.5 ? 's' + Math.round(g) : 's_big');
const engState = () => (G.eng ||= { lap: new Map(), mid: new Map(), pend: new Map(), ia: new Map(), ib: new Map(), topic: 0, pits: new WeakSet(), inPit: new Set() });
function engineer(R) {
  if (G.attract || G.ended || !R || !R.started || R.done || G.paused) return;
  const E = engState();
  const L = R.track.L;
  for (const id of mine()) {
    const c = R.byId.get(id); if (!c || c.dnf || c.finished) continue;
    if (!E.lap.has(id)) E.lap.set(id, c.lapsDone);
    if (c.lapsDone > E.lap.get(id)) { E.lap.set(id, c.lapsDone); E.pend.set(id, { kind: 'lap', at: performance.now() }); }
    const frac = (((c.dist % L) + L) % L) / L;
    if (frac > 0.5 && E.mid.get(id) !== c.lapsDone && c.lapsDone > 0) { E.mid.set(id, c.lapsDone); if (!E.pend.has(id)) E.pend.set(id, { kind: 'mid', at: performance.now() }); }
    // the last call before the pit entry, and push on the out lap
    const P = R.track.pit;
    if (c.pitReq && !c.pit) {
      let toEntry = (((P.inS % L) + L) % L) - (((c.dist % L) + L) % L); if (toEntry < 0) toEntry += L;
      if (toEntry < 700 && toEntry > 60 && E.bbb !== c.lapsDone + ':' + id) { E.bbb = c.lapsDone + ':' + id; say([carTag(id), 'bbb'], true); }
    }
    if (c.pit) E.inPit.add(id);
    else if (E.inPit.has(id)) { E.inPit.delete(id); say([carTag(id), 'u_outlap']); }
    // a rival boxing right ahead or right behind
    const ahead = R.order[c.pos - 2], behind = R.order[c.pos];
    for (const [o, clip] of [[ahead, 'u_rival_pit'], [behind, 'u_rival_pit_b']]) {
      if (o && !o.team.you && o.pit && o.pit.phase === 'in' && !E.pits.has(o.pit)) {
        E.pits.add(o.pit);
        if (Math.abs(o.gap - c.gap) < 6) say([carTag(id), clip]);
      }
    }
  }
  if (!voice.idle() || S.settings.sound === false || !voiceId()) return;
  if (engineerQuiet()) { E.pend.clear(); return; }
  // the oldest waiting update, if it's still fresh
  let best = null;
  for (const [id, p] of E.pend) if (!best || p.at < best[1].at) best = [id, p];
  if (!best) return;
  const [id, p] = best; E.pend.delete(id);
  if (performance.now() - p.at > 15000) return;
  const parts = engUpdate(R, R.byId.get(id), p.kind, E);
  if (parts) say(parts);
}
function engUpdate(R, c, kind, E) {
  if (!c || c.dnf || c.finished || c.pit) return null;
  const ahead = R.order[c.pos - 2], behind = R.order[c.pos];
  const ga = ahead && !ahead.dnf && !ahead.pit ? Math.max(0, c.interval) : null;
  const gb = behind && !behind.dnf && !behind.pit && !behind.lapsDown ? Math.max(0, behind.interval) : null;
  const pa = E.ia.get(c.id), pb = E.ib.get(c.id);
  const parts = [carTag(c.id)];
  const mateAhead = ahead && ahead.team.you, mateBehind = behind && behind.team.you;
  if (kind === 'mid') {
    // only worth a word when there's a fight on
    if (ga !== null && ga < 1.3) {
      parts.push(mateAhead ? 'u_mate_ahead' : 'u_ahead', gapClip(ga));
      if (pa !== undefined && !mateAhead) parts.push(ga < pa - 0.15 ? (ga < 1.0 && c.auto ? 'u_pushpush' : 'u_catching') : ga > pa + 0.15 ? 'u_pulling' : null);
    } else if (gb !== null && gb < 1.0) {
      parts.push(mateBehind ? 'u_mate_behind' : 'u_behind', gapClip(gb));
      if (pb !== undefined && !mateBehind && gb < pb - 0.15) parts.push('u_closing');
    } else return null;
    return parts.filter(Boolean);
  }
  // once a lap: position, the gap ahead and its trend, a close car behind, then one more thing
  if (c.pos === 1) parts.push('u_leading'); else parts.push('p' + c.pos);
  if (ga !== null && c.pos > 1) {
    if (mateAhead && ga < 2.5) parts.push('u_mate_ahead');
    else {
      parts.push('u_ahead', gapClip(ga));
      if (pa !== undefined) parts.push(ga < pa - 0.25 ? 'u_catching' : ga > pa + 0.25 && ga < 6 ? 'u_pulling' : null);
    }
  }
  if (gb !== null && gb < 2.2) {
    if (mateBehind) parts.push('u_mate_behind');
    else { parts.push('u_behind', gapClip(gb)); if (pb !== undefined) parts.push(gb < pb - 0.25 ? 'u_closing' : gb > pb + 0.25 ? 'u_clearing' : null); }
  } else if (c.pos === 1 && gb !== null) parts.push('u_behind', gapClip(gb));
  if (ga !== null) E.ia.set(c.id, ga); if (gb !== null) E.ib.set(c.id, gb);
  const togo = R.laps - c.lapsDone;
  if (togo >= 2 && togo <= 10 && (togo <= 3 || c.lapsDone === Math.floor(R.laps / 2))) parts.push(togo <= 3 ? 'u_laps' + togo : 'u_half');
  else {
    const extras = [
      () => (c.tyre.wear < 0.35 ? 'u_tyre_good' : c.tyre.wear < 0.62 ? 'u_tyre_ok' : 'u_tyre_worn'),
      () => (c.ers > 0.95 ? 'u_bat_full' : c.ers < 0.15 ? 'u_bat_low' : null),
      () => (c.lastLap && c.best < Infinity ? (c.lastLap < c.best * 1.004 ? 'u_pace' : c.lastLap > c.best * 1.02 && !R.sc && R.rain < 0.1 ? 'u_pace_slow' : null) : null),
      () => (togo >= 4 && togo <= 10 ? 'u_laps' + togo : null),
      () => (ga === null && gb === null ? 'u_clear' : null),
    ];
    for (let k = 0; k < extras.length; k++) { const x = extras[(E.topic + k) % extras.length](); if (x) { parts.push(x); E.topic = (E.topic + k + 1) % extras.length; break; } }
  }
  return parts.filter(Boolean);
}

// ERS boost: one tap deploys the battery for about 12 seconds, then back to what it was
// the tyres a BOX call fits: your pick for that car, or what suits the track right now
function boxPick(c) {
  const p = G.boxPicks?.[c.id]; if (p) return p;
  const R = G.race;
  return R.wet > 0.6 ? 'W' : R.wet > 0.17 ? 'I' : nextDry(c);
}
// BOX on the race view: one tap boxes the car you're running this lap; tap again to cancel
function boxBtn(R) {
  const b = $('#boxBtn'), c = R.byId.get(G.mineSel);
  b.hidden = !c || G.attract;
  if (b.hidden) return;
  const req = !!c.pitReq && !c.pit;
  b.classList.toggle('on', req || !!c.pit);
  b.disabled = c.dnf || c.finished || !!c.pit || c.auto;
  b.querySelector('b').textContent = c.pit ? 'PIT' : req ? 'BOXING' : 'BOX';
  b.querySelector('small').textContent = `${c.code} · ${req ? 'tap to cancel' : COMPOUNDS[c.pit ? c.pit.box || c.tyre.c : boxPick(c)].name}`;
}
$('#boxBtn').addEventListener('click', () => {
  const R = G.race, c = R && R.byId.get(G.mineSel); if (!c || c.pit) return;
  cmd({ box: c.pitReq ? null : boxPick(c) });
  tick();
});
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
  lessonEvent({ type: 'boost', id: c.id });
}
$('#boost').addEventListener('click', () => {
  const R = G.race, c = R && R.byId.get(G.mineSel); if (!c) return;
  boostCar(c);
  tick();
});

// ---------- team radio: talk to your drivers ----------
// Hold the mic button (or T on a keyboard) and speak: "Box box, softs", "Nova, boost", "Echo, conserve
// your tyres", "Tell Nova to let Echo through", "Strategist, what's our best option?", "Nova, why are you
// losing time?". The browser turns speech into words while you talk (js/teamradio.js) and plain
// JavaScript matches them to the same calls the buttons make: no server, no AI call. Drivers answer in
// their own voices from what the car is really doing, and push back once on a call that looks wrong;
// say it again and they do it. Anything the matcher can't place goes to the optional interpreter
// (Jev, on our server) when it's switched on, and a call it isn't sure of is asked back, never guessed.
const talk = { rec: null, done: false, heard: '', timer: 0, insist: {}, last: {}, plans: [], offer: null, n: 0, stats: [] };
const myCars = () => ['you-0', 'you-1'].map((id) => G.race.byId.get(id));
const radioStats = /[?&]radiostats\b/.test(location.search);
function talkBtn(R) {
  const b = $('#talkBtn');
  b.hidden = G.attract || !radioSupported() || !R.byId.get(G.mineSel) || S.settings.talk === false;
  const hf = !!S.settings.handsfree;
  if (b.classList.contains('free') !== hf) {
    b.classList.toggle('free', hf);
    $('small', b).textContent = hf ? 'SAY “RADIO”' : 'HOLD TO TALK';
    b.title = hf ? 'Hands-free: say "Radio" then the call. Hold to talk still works.' : 'Hold and speak (or hold T)';
  }
  radioPlans(R);
}
function talkSaid(text, kind) {
  const el = $('#talkSaid'); clearTimeout(talkSaid.t);
  if (!text) { el.hidden = true; return; }
  el.hidden = false; el.className = 'talk-said ' + (kind || ''); el.textContent = text;
  if (kind) talkSaid.t = setTimeout(() => { el.hidden = true; }, 2800);
}
// timings for each step of one transmission, in ms from pressing the button
function mark(k) { const m = talk.m; if (m && m[k] == null) m[k] = Math.round(performance.now() - m.t0); }
// iPhone Safari shows "Microphone access allowed" each time the mic opens. Holding one mic stream for
// the race keeps it open between holds, so the note shows once; it's let go when the race is paused,
// hidden or over, or after two quiet minutes. Speech is still only listened to while you hold.
const isIOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const keepMic = { stream: null, asking: false, at: 0 };
function micKeep() {
  keepMic.at = performance.now();
  if (!isIOS || keepMic.stream || keepMic.asking || !navigator.mediaDevices?.getUserMedia) return;
  keepMic.asking = true;
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then((s) => { keepMic.asking = false; if (micWanted()) keepMic.stream = s; else s.getTracks().forEach((t) => t.stop()); })
    .catch(() => { keepMic.asking = false; });
}
function micWanted() {
  const R = G.race;
  return !!(R && !G.attract && !G.paused && !document.hidden && performance.now() - keepMic.at < 120000 && myCars().some((c) => c && !c.dnf && !c.finished));
}
setInterval(() => { if (keepMic.stream && !micWanted()) { keepMic.stream.getTracks().forEach((t) => t.stop()); keepMic.stream = null; } }, 1000);
function talkStart() {
  if (talk.rec || !G.race || G.attract || !radioSupported()) return;
  freeStop(); micKeep();
  talk.done = false; talk.heard = ''; talk.n++;
  talk.m = { t0: performance.now(), id: talk.n };
  voice.stop(); sound.duck(true);
  $('#talkBtn').classList.add('on'); talkSaid('Listening…');
  try {
    talk.rec = listen({
      lang: LANG !== 'en' ? LOCALE[LANG] : /^en/i.test(navigator.language || '') ? navigator.language : 'en-GB',
      onStart: () => mark('mic'),
      onWords: (text, final, alts) => {
        mark('words'); talk.heard = text; talkSaid('“' + text.trim() + '”');
        clearTimeout(talk.timer);
        if (talk.done) return;
        // act on a partial result once it has held still for a moment, so a call lands while you talk
        const go = () => { if (talk.done) return; const r = understand(text, alts); if (r) { talk.done = true; mark('understood'); radioDo(r, text); talkStop(); } };
        if (final) go(); else talk.timer = setTimeout(go, 350);
      },
      onError: (err) => {
        if (err === 'not-allowed' || err === 'service-not-allowed') { toast('Allow the microphone in your browser to talk to your drivers. The buttons still work.'); }
        else if (err === 'network') toast('Team radio lost its connection. Hold the mic and try again.');
        else if (err === 'audio-capture') toast('No microphone found.');
      },
      onEnd: () => {
        clearTimeout(talk.timer); clearTimeout(talk.guard);
        if (!talk.rec) return;
        if (!talk.done && talk.heard.trim()) {
          const heard = talk.heard, r = understand(heard);
          if (r) { mark('understood'); radioDo(r, heard); }
          else interpret(heard);
        } else if (!talk.done) talkSaid('');
        talk.rec = null; sound.duck(false); $('#talkBtn').classList.remove('on');
      },
    });
  } catch { talk.rec = null; sound.duck(false); $('#talkBtn').classList.remove('on'); talkSaid(''); }
}
// some browsers never close the mic after stop(): give it a moment, then end the transmission ourselves
function talkStop() {
  const rec = talk.rec; if (!rec) return;
  rec.stop(); clearTimeout(talk.guard);
  talk.guard = setTimeout(() => { if (talk.rec === rec) { rec.abort(); rec.end(); } }, 1500);
}
// Hands-free radio (Radio voices sheet): the mic stays open through the race, and a call is anything
// said after "Radio". It closes whenever our own radio is talking, so the engineer's and drivers' voices
// coming out of the speaker are never heard as calls, and while the race is paused, hidden or over.
// Holding the button still works, and takes over the mic for that one transmission.
const free = { rec: null, n: 0, armed: 0, retry: 0, fails: 0, done: false };
function freeWanted() {
  const R = G.race;
  return !!(S.settings.handsfree && S.settings.talk !== false && R && !G.attract && !G.paused && !document.hidden && !talk.rec
    && radioSupported() && myCars().some((c) => c && !c.dnf && !c.finished));
}
function freeStop() {
  const rec = free.rec; if (!rec) return;
  free.rec = null; rec.abort();
  if (free.armed) { free.armed = 0; sound.duck(false); }
  $('#talkBtn').classList.remove('on');
}
function freeTick() {
  if (!freeWanted() || voice.speaking()) return freeStop();
  if (free.rec || performance.now() < free.retry) return;
  const n = ++free.n; free.done = false;
  const mine = () => free.n === n && free.rec;
  try {
    free.rec = listen({
      lang: LANG !== 'en' ? LOCALE[LANG] : /^en/i.test(navigator.language || '') ? navigator.language : 'en-GB',
      onStart: () => { if (mine()) free.fails = 0; },
      onWords: (text, final, alts) => {
        if (!mine() || free.done) return;
        clearTimeout(free.timer);
        let said = wakeSplit(text);
        if (said === null) { if (performance.now() > free.armed) return; said = text.trim(); }   // "Radio." ... "box now"
        if (!free.armed) { sound.duck(true); $('#talkBtn').classList.add('on'); }
        free.armed = performance.now() + 6000;
        if (!said) { talkSaid('Radio… go ahead'); return; }
        talkSaid('“' + said + '”');
        const others = alts.map(wakeSplit).filter((a) => a);
        const go = (last) => {
          if (!mine() || free.done) return;
          const r = understand(said, others);
          if (!r && !last) return;
          free.done = true; talk.m = { t0: performance.now(), id: ++talk.n };
          if (r) radioDo(r, said); else interpret(said);
          freeStop(); free.retry = performance.now() + 400;   // a fresh mic, so the same words aren't heard twice
        };
        if (final) go(true); else free.timer = setTimeout(() => go(false), 350);
      },
      onError: (err) => {
        if (!mine()) return;
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          // some browsers (iPhone Safari among them) only open the mic while a finger is on the button
          S.settings.handsfree = false; store.save(); talkBtn(G.race);
          toast(free.fails ? 'This browser only listens while you hold the mic. Hands-free is off; hold to talk still works.' : 'Allow the microphone to use hands-free radio. The buttons still work.');
        }
        free.fails++;
      },
      onEnd: () => {
        if (free.n !== n) return;
        if (free.rec) { free.rec = null; if (free.armed) { free.armed = 0; sound.duck(false); } $('#talkBtn').classList.remove('on'); }
        // browsers close a quiet mic after a while: open it again, a little slower after each failure
        free.retry = performance.now() + Math.min(8000, 300 * 2 ** Math.min(free.fails, 5));
      },
    });
  } catch { free.rec = null; free.fails++; free.retry = performance.now() + 3000; }
}
setInterval(freeTick, 400);
function understand(text, alts = []) {
  const cars = myCars().map((c) => ({ id: c.id, name: c.name, code: c.code }));
  // a question for a driver ("Nova, can you pass him?", "how are the tyres?") goes to that driver's
  // brain; a remark ("good job") too, unless it also carries a call
  // "what does dirty air mean?", "what's an undercut?": the engineer answers from the racing wiki
  if (/\b(mean|means|meaning|define|explain|wiki)\b|^\s*what(?:'s|’s| is| are)\s+(?:an?\s|the\s(?:two|overcut|undercut|slipstream|cliff|apex|racing line|safety|virtual))/i.test(text)) { const w = wikiLookup(text); if (w) return { wiki: w }; }
  const k = brainIntent(text), q = isQuestion(text);
  // "can you save the tyres?" is a call said politely, not a question about the tyres
  const ask = q && !(/^\s*(\w+,?\s+)?(can|could|would|will) you\b/i.test(text) && k !== 'pass' && parseCall(text, cars, G.mineSel || 'you-0')?.calls);
  if (k && (ask || k === 'orders' || k === 'opinion') && !/strategist|engineer/i.test(text)) return { brain: k, id: addressed(text, cars) };
  for (const t of [text, ...alts]) { const r = parseCall(t, cars, G.mineSel || 'you-0'); if (r) return r; }
  if (k) return { brain: k, id: addressed(text, cars) };
  return null;
}
const isQuestion = (t) => /\?\s*$/.test(t) || /^\s*(what|whats|what's|why|how|how's|hows|where|where's|wheres|who|whos|who's|is|are|any|can|could|do|does|should|will|tell me|talk to me)\b/i.test(t);
function addressed(text, cars) {
  const t = ' ' + text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ') + ' ';
  const hit = cars.find((c) => [String(c.name || '').toLowerCase().split(/\s+/)[0], String(c.code || '').toLowerCase()].some((w) => w && w.length > 1 && t.includes(' ' + w + ' ')));
  return hit ? hit.id : G.mineSel || 'you-0';
}
// the optional interpreter for what the matcher can't place (off unless our server has a key)
async function interpret(heard) {
  const miss = () => (G.aiBrain ? aiTalk(heard) : (talkSaid(`Didn't catch a call in “${heard.trim()}”`, 'miss'), reply(G.mineSel || 'you-0', 'r_sayagain')));
  if (!G.interp) return miss();
  const R = G.race, cars = myCars();
  talkSaid('“' + heard.trim() + '” …');
  try {
    const t = performance.now();
    const res = await fetch('/api/radio/interpret', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(1500),
      body: JSON.stringify({ text: heard, sel: G.mineSel || 'you-0', cars: cars.map((c) => ({ id: c.id, name: c.name, code: c.code, pos: c.pos, tyre: c.tyre.c, wear: +c.tyre.wear.toFixed(2), ers: +c.ers.toFixed(2) })), wet: +R.wet.toFixed(2) }) });
    const r = await res.json(); mark('understood'); if (talk.m) talk.m.interp = Math.round(performance.now() - t);
    if (r && r.calls && r.calls.length) radioDo(r, heard);
    else if (r && r.clarify) radioDo(r, heard);
    else miss();
  } catch { miss(); }
}
// one transmission: commands, questions, confirmations and questions back
function radioDo(r, text) {
  const R = G.race; if (!R) return;
  addRadio({ from: 'you', text: text.trim().replace(/^./, (x) => x.toUpperCase()) });
  talkSaid('“' + text.trim() + '”', 'ok');
  if (r.clarify) { reply(G.mineSel || 'you-0', 'r_sayagain'); addRadio({ from: 'driver', code: R.byId.get(G.mineSel || 'you-0').code, text: `Say again: ${r.clarify}` }); return radioDone(); }
  if (r.wiki) { addRadio({ from: 'engineer', text: `${r.wiki.term}: ${r.wiki.short}` }); toast(`📖 ${r.wiki.term}: ${r.wiki.short}`); return radioDone(); }
  if (r.brain) { driverAsk(R.byId.get(r.id), r.brain); return radioDone(); }
  if (r.ask === 'why') { driverAsk(R.byId.get(r.id), brainIntent(text) || 'why'); return radioDone(); }
  if (r.ask === 'best') { if (/strategist|engineer/i.test(text)) strategist(R.byId.get(r.id)); else driverAsk(R.byId.get(r.id), brainIntent(text) || 'opinion'); return radioDone(); }
  if (r.confirm) {
    const o = talk.offer;
    if (o && R.t - o.t < 30) { talk.offer = null; radioCalls([].concat(o.call)); } else reply(G.mineSel || 'you-0', 'r_sayagain');
    return radioDone();
  }
  radioCalls(r.calls);
  lessonEvent({ type: 'radio' });
  radioDone();
}
function radioDone() {
  mark('done'); G.assisted = true; tick();
  if (talk.m) { talk.stats.push(talk.m); if (talk.stats.length > 30) talk.stats.shift(); if (radioStats) toast(`📻 mic ${talk.m.mic ?? '–'} · words ${talk.m.words ?? '–'} · call ${talk.m.understood ?? '–'} · done ${talk.m.done} ms${talk.m.interp ? ` · interp ${talk.m.interp}` : ''}`); talk.m = null; }
}
// each call goes through the same functions as the buttons; a call that's still in flight (the same
// call for the same car inside 2 seconds, from a repeated or partial transcript) is dropped
function radioCalls(calls) {
  const R = G.race, now = R.t;
  for (const call of calls) {
    const c = R.byId.get(call.id);
    if (!c) continue;
    // a retired car takes no more calls: the engineer says so instead of the radio going quiet
    if (c.dnf || c.finished) { if (!calls.some((x, i) => x.id === c.id && i < calls.indexOf(call))) { say([carTag(c.id), c.dnf ? 'out' : 'flag']); addRadio({ from: 'engineer', text: c.dnf ? `${c.code} is out of the race. That car can't take calls any more.` : `${c.code} has finished the race.` }); } continue; }
    if (call.after) { talk.plans.push({ id: c.id, call: { ...call, after: null }, lap: R.lapOf(c) + call.after.laps }); continue; }
    const key = c.id + ':' + call.k + (call.tyre || '');
    if (performance.now() - (talk.last[key] || -1e9) < 2000) continue;
    talk.last[key] = performance.now();
    const insisted = talk.insist[c.id + call.k.replace('now', '')] > now - 40;
    const back = (k, clip, line) => { talk.insist[c.id + k] = now; reply(c.id, clip); addRadio({ from: 'driver', code: c.code, text: line }); };
    const planned = calls.some((x) => x.after && x.id === c.id);
    const k = call.k;
    if (k === 'box' || k === 'boxnow') {
      if (c.pit) continue;
      const tyre = call.tyre || boxPick(c);
      const dryNow = R.wet < 0.17 && 'SMH'.includes(c.tyre.c) && 'SMH'.includes(tyre);
      if (k === 'box' && !insisted && dryNow && c.tyre.wear < 0.25) { back('box', 'r_no_box', 'Tyres still feel good. I\'d rather stay out.'); continue; }
      cmd({ box: tyre }, c.id, { spoken: true, reply: insisted ? 'r_ok_box' : 'r_box' });
    } else if (k === 'cancel') { if (c.pitReq) cmd({ box: null }, c.id, { spoken: true }); else reply(c.id, 'r_stay'); }
    else if (k === 'push') {
      if (!insisted && c.tyre.wear > 0.72) { back('push', 'r_no_push', 'Tyres are gone. I can\'t push much longer.'); continue; }
      cmd({ pace: 'push' }, c.id, { spoken: true, quietReply: c.tyre.wear > 0.5 });
      if (c.tyre.wear > 0.5) { reply(c.id, 'r_push_worn'); addRadio({ from: 'driver', code: c.code, text: 'Copy, boss. But my tyres are starting to go.' }); }
    } else if (k === 'save' || k === 'normal') {
      cmd({ pace: k }, c.id, { spoken: true, quietReply: planned || (k === 'save' && talk.insist[c.id + 'push'] > now - 40) });
      if (planned) { reply(c.id, 'r_plan'); addRadio({ from: 'driver', code: c.code, text: 'Copy. Saving now, then I\'ll push.' }); }
      else if (k === 'save' && talk.insist[c.id + 'push'] > now - 40) { reply(c.id, 'r_manage'); addRadio({ from: 'driver', code: c.code, text: 'Understood. Managing the tyres.' }); }
    } else if (k === 'boost') {
      if (c.ers < 0.08 && !(G.boost && G.boost.id === c.id)) { back('boost', 'r_lowbat', 'Battery\'s empty. I need to charge first.'); continue; }
      if (!(G.boost && G.boost.id === c.id)) { boostCar(c); reply(c.id, 'r_going'); }
    } else if (k === 'harvest' || k === 'balanced') {
      cmd({ ers: k }, c.id, { spoken: true, quietReply: !!call.until });
      if (call.until) { talk.plans.push({ id: c.id, call: { id: c.id, k: 'balanced' }, gap: call.until.gap }); reply(c.id, 'r_wait'); addRadio({ from: 'driver', code: c.code, text: 'Copy. Charging until we\'re close.' }); }
    } else if (k === 'attack' || k === 'defend' || k === 'neutral') cmd({ battle: k }, c.id, { spoken: true });
    else if (k === 'swap') {
      const [a, b] = myCars();
      if (Math.abs(a.pos - b.pos) !== 1 || a.pit || b.pit) { toast('Swap places works when your two cars run nose to tail.'); continue; }
      teamOrder('swap', true);
    } else if (k === 'hold' || k === 'free') teamOrder(k, true);
  }
}
// calls waiting for a lap ("then push in two laps") or a gap ("charge until we're close")
function radioPlans(R) {
  if (!talk.plans.length || !R) return;
  const due = talk.plans.filter((p) => { const c = R.byId.get(p.id); return c && (p.lap != null ? R.lapOf(c) >= p.lap : c.interval > 0 && c.interval < p.gap); });
  if (!due.length) return;
  talk.plans = talk.plans.filter((p) => !due.includes(p));
  for (const p of due) { const c = R.byId.get(p.id); addRadio({ from: 'engineer', car: c.id, text: `${c.code}: ${p.lap != null ? 'laps done' : 'you\'re within a second'}. ${p.call.k === 'balanced' ? 'Battery back to balanced.' : cap1(p.call.k) + ' now.'}` }); }
  radioCalls(due.map((p) => p.call));
}
const cap1 = (k) => k[0].toUpperCase() + k.slice(1);
// free talk: what neither the matcher nor the interpreter could place goes to the driver's AI brain on
// our server (Claude, checked against the race data there); with no answer in time, the rules brain
// answers. The driver never acts: a call in the reply comes back as an offer for you to accept.
async function aiTalk(heard) {
  const R = G.race; if (!R) return;
  const c = R.byId.get(addressed(heard, myCars())), b = G.brains?.[c.id];
  if (!c || !b) return;
  addRadio({ from: 'you', text: heard.trim().replace(/^./, (x) => x.toUpperCase()) });
  talkSaid('“' + heard.trim() + '” …');
  const P = b.p, dna = `${P.bold > 0.6 ? 'aggressive racer' : P.bold < 0.4 ? 'patient racer' : 'balanced racer'}, ${P.care > 0.6 ? 'gentle on tyres' : P.care < 0.4 ? 'hard on tyres' : 'average on tyres'}`;
  const memory = b.mem.slice(0, 6).map((m) => `${m.from}: ${m.text || m.kind || (m.cmd && JSON.stringify(m.cmd)) || ''}`);
  const asked = R.t;
  try {
    const res = await fetch('/api/radio/talk', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(3200),
      body: JSON.stringify({ driver: { name: c.name, tone: P.tone, dna }, facts: brainRead(R, c), memory, said: heard }) });
    const r = res.ok ? await res.json() : null;
    if (!r || !r.text || G.race !== R) throw new Error('no reply');
    talkSaid('“' + heard.trim() + '”', 'ok');
    b.remember({ t: Date.now(), from: 'you', kind: 'talk', text: heard.slice(0, 120) });
    b.remember({ t: Date.now(), from: 'driver', kind: 'talk', text: r.text });
    // the free words are read in the driver's own voice by our server (Kokoro), a sentence at a time;
    // without it the driver's recorded "copy" plays and the words show on the radio
    if (G.aiVoice && S.settings.replies !== false && S.settings.sound !== false && voiceId()) {
      // short pieces (a sentence, or its clauses when it runs long) so the first is heard quickly
      const v = driverVoice(c.id), parts = r.text.match(/[^.!?]+[.!?]*/g).map((x) => x.trim()).filter(Boolean)
        .flatMap((x) => (x.split(' ').length > 9 ? x.split(/(?<=,)\s+/) : [x])).slice(0, 6);
      voice.sayLive(parts.map((t) => fetch('/api/radio/voice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: t, voice: v }), signal: AbortSignal.timeout(20000) })
        .then((x) => (x.ok ? x.arrayBuffer() : null)).catch(() => null)));
    } else reply(c.id, 'r_copy');
    addRadio({ from: 'driver', code: c.code, text: r.text });
    if (r.call && R.t - asked < 10) { talk.offer = { call: r.call, t: R.t, from: c.id }; driverCard(c, { text: r.text, call: r.call }); }
    G.assisted = true;
  } catch {
    talkSaid('“' + heard.trim() + '”', 'ok');
    driverAsk(c, brainIntent(heard) || (isQuestion(heard) ? 'opinion' : 'why'));
  }
  radioDone();
}
// ---------- your drivers' brains (js/brain.js) ----------
// A driver speaks in its own voice: 'br_*' clips from its brain pack, the rest from its main pack.
function driverSay(c, res) {
  if (!res) return;
  const v = driverVoice(c.id);
  if (S.settings.replies !== false && res.clips?.length) say(res.clips.map((k) => '@' + v + (k.startsWith('br_') ? '-brain/' : '/') + k));
  addRadio({ from: 'driver', code: c.code, text: res.text });
}
// you asked a driver something (radio or the Talk buttons): the answer, and its call as an offer
function driverAsk(c, kind, asked) {
  const R = G.race, b = G.brains?.[c?.id]; if (!R || !c || !b) return;
  if (asked) addRadio({ from: 'you', text: asked });
  if (c.dnf || c.finished) { say([carTag(c.id), c.dnf ? 'out' : 'flag']); addRadio({ from: 'engineer', text: c.dnf ? `${c.code} is out of the race. That car can't take calls any more.` : `${c.code} has finished the race.` }); return; }
  b.remember({ t: Date.now(), from: 'you', kind });
  const mate = R.mate(c), res = b.answer(kind, brainRead(R, c), mate ? brainRead(R, mate) : null);
  if (!res) { reply(c.id, 'r_sayagain'); return; }
  driverSay(c, res);
  if (res.call) { talk.offer = { call: res.call, t: R.t, from: c.id }; driverCard(c, res); }
  G.assisted = true;
}
// a driver's suggestion on screen, with its call on a button (still your call, through your path)
function driverCard(c, res) {
  if (G.lesson && !G.lesson.done) return;
  const el = $('#suggest'), calls = [].concat(res.call);
  const k = calls[calls.length - 1].k;
  const label = k === 'boxnow' ? `Box for ${COMPOUNDS[calls[0].tyre].name}s` : { attack: 'Attack', boost: 'Attack + boost', defend: 'Defend', harvest: 'Harvest', push: 'Push', save: 'Save tyres', swap: 'Swap places' }[k] || 'Do it';
  coachHide();
  const at = performance.now(); G.suggest = { id: c.id, at, action: k === 'boxnow' ? { box: calls[0].tyre } : {} };
  el.innerHTML = `<div class="ch"><span class="who">${portraitSVG(c, c.team, { size: 30, bg: false })}🎙️ ${esc(c.code)} · ${esc(c.name.split(' ')[0])}</span><button type="button" class="x" aria-label="Dismiss">×</button></div><p>${esc(res.text.replace(/ Say do it, and I'll go\.$/, ''))}</p>
    <div class="acts"><button type="button" class="go">${label}</button><button type="button" class="no">Not now</button></div>`;
  el.hidden = false;
  const close = () => { if (G.suggest && G.suggest.at === at) { el.hidden = true; G.suggest = null; } };
  el.querySelector('.x').onclick = el.querySelector('.no').onclick = close;
  el.querySelector('.go').onclick = () => { close(); talk.offer = null; radioCalls(calls); renderControls(true); tick(); };
  setTimeout(close, 20000);
}
// a call reached the car: the brain remembers it, and says so if it reads the race differently
const CALL_OF = (c) => (c.pace ? { k: c.pace } : c.ers ? { k: c.ers } : c.battle ? { k: c.battle } : c.box ? { k: 'box', tyre: c.box } : c.order ? { k: c.order } : null);
function heardBy(car, c) {
  const R = G.race, b = G.brains?.[car.id]; if (!b || car.dnf || car.finished) return;
  b.heard(c, R.lapOf(car), R.t);
  const call = CALL_OF(c); if (!call || (G.lesson && !G.lesson.done)) return;
  const mate = R.mate(car), w = b.react(call, brainRead(R, car), mate ? brainRead(R, mate) : null);
  if (w) setTimeout(() => driverSay(car, w), 600);
}
// the driver calls you when something needs your decision; it never acts on its own
let nudgeAt = 0;
function driverNudges(R) {
  const now = performance.now();
  if (now - nudgeAt < 1000 || !G.brains || G.attract || G.ended || (G.lesson && !G.lesson.done) || R.t < 20) return;
  nudgeAt = now;
  for (const c of myCars()) { const n = G.brains[c.id].nudge(brainRead(R, c), now); if (n) { driverSay(c, n); break; } }
}
// "Strategist, what's our best option?": the same reading of the race the coach uses, with a call you
// can accept by saying "do it"
function strategist(c) {
  G.askT = performance.now();
  const R = G.race, left = R.laps - R.leaderLap(), ahead = R.order[c.pos - 2], behind = R.order[c.pos];
  const rain = R.weather.showers.find((s) => s.start > R.t && (s.start - R.t) / (R.track.lapTime * 1.05) < 2.5);
  let o;
  if (c.pit || c.pitReq) o = { clip: ['s_stay'], text: `${c.code} is already boxing. Nothing to change.` };
  else if (rain && 'SMH'.includes(c.tyre.c)) o = { clip: ['s_rain'], text: `Rain due in about ${Math.max(1, Math.round((rain.start - R.t) / (R.track.lapTime * 1.05)))} laps. Stay out until it starts, then box ${c.code} for inters.` };
  else if (R.wet > 0.17 && 'SMH'.includes(c.tyre.c)) { const ty = boxPick(c); o = { clip: ['s_box', 'q_' + ty], text: `It's wet. Box ${c.code} for ${COMPOUNDS[ty].name}s.`, call: { id: c.id, k: 'boxnow', tyre: ty } }; }
  else if (c.tyre.wear > 0.6 && left > 1) { const ty = boxPick(c); o = { clip: ['s_box', 'q_' + ty], text: `${c.code}'s tyres are at ${Math.round((1 - c.tyre.wear) * 100)}%. Box for ${COMPOUNDS[ty].name}s.`, call: { id: c.id, k: 'boxnow', tyre: ty } }; }
  else if (behind && behind.pit && c.tyre.wear > 0.35 && left > 2) { const ty = boxPick(c); o = { clip: ['s_undercut'], text: `${behind.code} behind has pitted. Box ${c.code} now to cover the undercut.`, call: { id: c.id, k: 'boxnow', tyre: ty } }; }
  else if (ahead && c.interval > 0 && c.interval < 1.0 && c.ers > 0.3) o = { clip: ['k_chase'], text: `${c.code} is ${c.interval.toFixed(1)} s behind ${ahead.code} with ${Math.round(c.ers * 100)}% battery. Boost and attack.`, call: { id: c.id, k: 'boost' } };
  else if (c.ers < 0.25) o = { clip: ['k_harvest'], text: `${c.code}'s battery is at ${Math.round(c.ers * 100)}%. Harvest now for the next fight.`, call: { id: c.id, k: 'harvest' } };
  else o = { clip: ['s_stay'], text: `Stay out. ${c.code}'s tyres are at ${Math.round((1 - c.tyre.wear) * 100)}% with ${left} laps to go.` };
  if (o.call) { talk.offer = { call: o.call, t: R.t }; o.clip = [...o.clip, 's_confirm']; o.text += ' Say "do it" and I\'ll make the call.'; }
  say(o.clip, true); addRadio({ from: 'engineer', text: o.text });
  return o;
}
{
  const b = $('#talkBtn');
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); talkStart(); });
  b.addEventListener('pointerup', talkStop); b.addEventListener('pointercancel', talkStop);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  // the interpreter is on only when our server says so (it holds the key; the browser never does)
  // (asked again a little later if the first try is lost while the page is still busy loading)
  const health = (again) => fetch('/api/radio/health', { signal: AbortSignal.timeout(4000) }).then((r) => (r.ok ? r.json() : null))
    .then((j) => { G.interp = !!(j && j.interpreter); G.aiBrain = !!(j && j.brain); G.aiVoice = !!(j && j.voice); })
    .catch(() => { G.interp = G.aiBrain = G.aiVoice = false; if (again) setTimeout(() => health(false), 8000); });
  health(true);
}

// ---------- race coach ----------
// On for quick races and a player's first races: watches your two cars and suggests the call that
// fits the moment, in plain words, with a button that makes it. Each tip has a cooldown and a cap.
function coachDefault(kind) { return S.settings.coach ?? (kind === 'quick' || S.stats.starts < 3); }
function coachShow(tip, how) {
  const el = $('#coach');
  if (!how) { G.coachTip = { ...tip, at: performance.now() }; if (tip.say) say(tip.say); }
  // folded away: a small pill with the call, tap it to read the tip
  const small = how === 'pill' || (!how && S.settings.coachMin);
  el.classList.toggle('pill', !!small);
  if (small) {
    el.innerHTML = `<button type="button" class="pillb" aria-label="Open the coach tip">🎧 <b>Coach</b><span>${tip.act ? esc(tip.act.replace(/<[^>]+>/g, '')) : 'New tip'}</span><i>›</i></button>`;
    el.hidden = false;
    el.querySelector('.pillb').onclick = () => { G.coachTip.at = performance.now(); coachShow(tip, 'open'); };
    return;
  }
  el.innerHTML = `<div class="ch"><span>🎧 Coach</span><span><button type="button" class="x min" aria-label="${S.settings.coachMin ? 'Show tips open' : 'Fold the coach away'}" title="${S.settings.coachMin ? 'Show tips open' : 'Fold away'}">${S.settings.coachMin ? '⤢' : '–'}</button><button type="button" class="x" aria-label="Close">×</button></span></div><p>${tip.text}</p>
    <div class="acts">${tip.act ? `<button type="button" class="go">${tip.act}</button>` : ''}<button type="button" class="no">${tip.act ? 'Not now' : 'Got it'}</button></div>`;
  el.hidden = false;
  el.querySelector('.x:not(.min)').onclick = el.querySelector('.no').onclick = coachHide;
  el.querySelector('.x.min').onclick = () => {
    S.settings.coachMin = !S.settings.coachMin; store.save();
    if (S.settings.coachMin) { toast('Coach folded away. New tips show as a small pill.'); coachShow(tip, 'pill'); } else { toast('Coach tips open in full again.'); coachShow(tip, 'open'); }
  };
  const go = el.querySelector('.go'); if (go) go.onclick = () => { tip.run(); coachHide(); renderControls(true); };
}
function coachHide() { $('#coach').hidden = true; $('#coach').classList.remove('pill'); G.coachTip = null; }
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
      const wm = G.venue.wear || 1, nx = !COMPOUNDS[c.tyre.c].dry ? c.tyre.c : !R.ruleMet(c) ? nextDry(c) : left <= LIFE.S * R.life / wm * 0.85 ? 'S' : left <= LIFE.M * R.life / wm * 0.85 ? 'M' : 'H';
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

// phones: your two cars as cards across the top of the race; tap one to give it calls
function driverCards(R) {
  const el = $('#drivers');
  if (G.attract || !phoneUp()) { el.hidden = true; return; }
  el.hidden = false;
  const hud = $('#hud'), below = hud.offsetTop + hud.offsetHeight + 4;
  if (el.dataset.top !== String(below)) { el.dataset.top = below; el.style.top = below + 'px'; stage.style.setProperty('--below', (below + 50) + 'px'); }
  // the buttons stay put and only their insides change, so a tap is never lost to a redraw
  if (el.children.length !== 2) el.innerHTML = ['you-0', 'you-1'].map((id) => `<button type="button" data-mine="${id}" class="dc"></button>`).join('');
  ['you-0', 'you-1'].forEach((id, k) => {
    const c = R.byId.get(id), life = Math.round((1 - Math.min(1, c.tyre.wear)) * 100);
    const state = c.dnf ? 'Out' : c.finished ? 'Finished' : c.pit ? 'In the pits' : c.pitReq ? `Boxing · ${COMPOUNDS[c.pitReq].name}s` : c.auto ? 'Autonomous' : { push: 'Pushing', save: 'Saving tyres', normal: '' }[c.pace] + (c.battle !== 'neutral' ? (c.pace === 'normal' ? '' : ' · ') + (c.battle === 'attack' ? 'Attack' : 'Defend') : '');
    const b = el.children[k], cls = `dc${id === G.mineSel ? ' on' : ''}${life < 25 && !c.dnf ? ' low' : ''}${c.dnf ? ' out' : ''}${b.classList.contains('hl') ? ' hl' : ''}`;
    if (b._pk !== c.team.c1 + c.name) { b._pk = c.team.c1 + c.name; b._ps = portraitSVG(c, c.team, { size: 28, bg: false }); }
    const html = `${b._ps}<b>${c.dnf ? 'OUT' : 'P' + c.pos}</b><span class="nm">${esc(c.code)}</span>${tyreHTML(c.tyre.c)}<span class="lf">${life}%</span>${state ? `<small>${esc(state)}</small>` : ''}`;
    if (b.className !== cls) b.className = cls;
    if (b.dataset.k !== html) { b.innerHTML = html; b.dataset.k = html; }
  });
}
$('#drivers').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mine]'); if (!b) return;
  const id = b.dataset.mine;
  // a second tap on the car you're already running opens its calls
  if (G.mineSel === id && G.sel === id && app.dataset.sheet === 'peek') { setTab('wall'); sheet('half'); }
  G.mineSel = id; select(id);
});

// Team Principal mode: the engineer shows what matters (the fact, never an order) and gives a view
// only when you ask. "Ask the engineer" gets the strategist's reading with the call on a button; the
// call is still yours to make, so it goes through your own command path.
function suggest(car, fact, action) {
  const el = $('#suggest');
  // a lesson teaches one thing at a time, so race info waits until it's over
  if (!fact || car.dnf || car.finished || car.auto || (G.lesson && !G.lesson.done)) return;
  coachHide();
  const at = performance.now(); G.suggest = { id: car.id, at, action };
  el.innerHTML = `<div class="ch"><span>📊 Race info · ${esc(car.code)}</span><button type="button" class="x" aria-label="Dismiss">×</button></div><p>${esc(fact)}</p>
    <div class="acts"><button type="button" class="go">Ask the engineer</button><button type="button" class="no">OK</button></div>`;
  el.hidden = false;
  const close = () => { if (G.suggest && G.suggest.at === at) { el.hidden = true; G.suggest = null; } };
  el.querySelector('.x').onclick = el.querySelector('.no').onclick = close;
  el.querySelector('.go').onclick = () => { close(); askEngineer(car); };
  setTimeout(close, 16000);
}
// you asked: the engineer's view in the same card, with the call ready if there is one
function askEngineer(car) {
  const R = G.race; if (!R || car.dnf || car.finished || (G.lesson && !G.lesson.done)) return;
  const o = strategist(car), el = $('#suggest');
  coachHide();
  const at = performance.now(); G.suggest = { id: car.id, at, action: o.call ? callAction(o.call) : {}, asked: true };
  const label = !o.call ? '' : o.call.k === 'boxnow' ? `Box for ${COMPOUNDS[o.call.tyre].name}s` : o.call.k === 'boost' ? 'Boost' : o.call.k === 'harvest' ? 'Harvest' : 'Do it';
  el.innerHTML = `<div class="ch"><span>🎧 Engineer · ${esc(car.code)}</span><button type="button" class="x" aria-label="Dismiss">×</button></div><p>${esc(o.text.replace(/ Say "do it".*$/, ''))}</p>
    <div class="acts">${o.call ? `<button type="button" class="go">${label}</button>` : ''}<button type="button" class="no">${o.call ? 'Not now' : 'OK'}</button></div>`;
  el.hidden = false;
  const close = () => { if (G.suggest && G.suggest.at === at) { el.hidden = true; G.suggest = null; } };
  el.querySelector('.x').onclick = el.querySelector('.no').onclick = close;
  const go = el.querySelector('.go');
  if (go) go.onclick = () => { close(); talk.offer = null; radioCalls([o.call]); renderControls(true); tick(); };
  setTimeout(close, 20000);
}
const callAction = (c) => (c.k === 'boxnow' ? { box: c.tyre } : c.k === 'harvest' ? { ers: 'harvest' } : c.k === 'boost' ? { boost: true } : {});
function suggestCheck(R) {
  const s = G.suggest; if (!s) return;
  const c = R.byId.get(s.id);
  // the moment passed: the car pitted, you handed it over, or the call was made some other way
  if (c.pit || c.dnf || c.finished || c.auto || (s.action.box && c.pitReq) || (s.action.ers && c.ersMode === s.action.ers)) { $('#suggest').hidden = true; G.suggest = null; }
}
let ackT = 0;
function ack(text) {
  const el = $('#ack'); el.textContent = '✓ ' + text; el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
  clearTimeout(ackT); ackT = setTimeout(() => { el.hidden = true; }, 1900);
}
const CALL_WORDS = { pace: { push: 'Push', save: 'Save tyres', normal: 'Normal pace' }, ers: { harvest: 'Harvest', balanced: 'Balanced battery', deploy: 'Deploy' }, battle: { attack: 'Attack', defend: 'Defend', neutral: 'Neutral' } };

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
  // the weather is the race's own forecast, not the real one at the venue, and says so
  let txt = `<span class="sim" title="Simulated weather, not the real forecast">SIM</span> ${icon} <span class="state">${wetWord(R.wet)}</span> ${G.venue.temp}°C<span class="tf"> / ${Math.round(G.venue.temp * 9 / 5 + 32)}°F</span>`;
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
    <div class="top"><span class="sw" style="background:${c.team.c1}"></span><div class="pos" data-k="pos"></div>${portraitSVG(c, c.team, { size: 44 })}
      <div class="who"><b>${esc(c.name)}</b><span>${esc(c.team.name)}${c.player ? '' : ' · AI agent'}</span></div>
      ${isMine ? '' : '<button class="link" type="button" data-act="back">My car</button>'}</div>
    <p class="why" data-k="why" hidden></p>
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
  k('pos').textContent = c.dnf ? 'OUT' : 'P' + c.pos;
  // a stopped car says why it is there: the race control message that put it out, and the lap
  const why = k('why');
  if (c.dnf && why.hidden) {
    const ev = [...R.events].reverse().find((e) => e.type === 'dnf' && e.car === c.id);
    why.textContent = `${ev ? ev.text.replace(/\s*Out( of the race)?\.?$/, '') : `${c.code} has stopped.`}${ev ? ` Lap ${ev.lap}.` : ''} ${c.cleared ? 'The marshals have cleared the car.' : 'Out of the race; the marshals are clearing it.'}`;
    why.hidden = false;
  } else if (!c.dnf) why.hidden = true;
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
// The handover between modes, said once and shown at once. Calls you queued (a call "in two laps",
// a boost) belong to you, so they're dropped when the strategist takes over rather than firing later
// and grabbing the car back; a box call already made stays, and you're told whose it is.
// the Talk buttons: the same questions you can ask on the radio
const TALK = [['feel', "How's the car?"], ['tyres', 'Tyres?'], ['gaps', 'Gaps?'], ['pass', 'Can you pass?'], ['opinion', 'What do you think?'], ['orders', 'Your orders?']];
const BY = { principal: 'your call', strategist: "the strategist's call", engineer: "the engineer's call", puncture: 'puncture' };
function handover(c, took) {
  const R = G.race;
  if (c.auto) {
    talk.plans = talk.plans.filter((p) => p.id !== c.id);
    if (G.boost && G.boost.id === c.id) G.boost = null;
    if (G.suggest && G.suggest.id === c.id) { $('#suggest').hidden = true; G.suggest = null; }
    if (talk.offer && talk.offer.call.id === c.id) talk.offer = null;
  }
  const pend = c.pitReq && !c.pit ? ` Box this lap for ${COMPOUNDS[c.pitReq].name}s stays (${BY[c.pitBy] || 'already made'}).` : '';
  const text = c.auto ? `${c.code}: Autonomous. The AI strategist runs the car now.${pend}`
    : `${c.code}: Team Principal. ${took ? 'You took over the calls' : 'You run the car'}; the strategist has stopped.${pend}${pend && c.pitBy !== 'principal' ? ' Cancel it if you like.' : ''}`;
  toast(text, true); addRadio({ from: 'race', text });
  renderControls(true);
}
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
  const sig = [id, boxPick(c), !!c.assist, c.pace, c.ersMode, c.battle, c.pitReq, c.pitBy, c.auto, !!c.pit, c.finished, c.dnf, c.tyre.c, R.byId.get('you-0').pos, R.byId.get('you-1').pos, c.order, !!(c.letBy || R.mate(c).letBy), Math.abs(R.byId.get('you-0').pos - R.byId.get('you-1').pos) === 1].join('|');
  if (sig === ctlSig && !force) return; ctlSig = sig;
  const a = R.byId.get('you-0'), b = R.byId.get('you-1');
  const opt = (key, val, label) => `<button type="button" data-set="${key}" data-val="${val}" class="${c[key] === val ? 'on' : ''}">${label}</button>`;
  const dis = c.auto || c.finished || c.dnf;
  const why = (t) => `<p class="why">${t}</p>`;
  let box;
  if (c.finished) box = `<p class="ro">${c.pos <= 3 ? '🏆 ' : ''}Finished P${c.pos}.</p>`;
  else if (c.dnf) box = '<p class="ro">Out of the race.</p>';
  else if (c.pit) box = `<div class="boxing">In the pit lane…</div>`;
  else if (c.pitReq) box = `<div class="boxing"><span>Boxing this lap: ${COMPOUNDS[c.pitReq].name}s${c.pitBy && c.pitBy !== 'principal' ? ` <small>(${BY[c.pitBy]})</small>` : ''}</span>${c.auto ? '' : '<button type="button" data-act="cancel">Cancel</button>'}</div>`;
  else {
    const pk = boxPick(c);
    box = `<div class="box-row">${Object.keys(COMPOUNDS).map((k) => `<button type="button" data-pick="${k}" class="${pk === k ? 'on' : ''}" ${dis ? 'disabled' : ''}>${tyreHTML(k)}${COMPOUNDS[k].name}</button>`).join('')}</div>
      <button type="button" class="boxnow" data-act="boxnow" ${dis ? 'disabled' : ''}>BOX, BOX · ${COMPOUNDS[pk].name}s</button>`;
  }
  el.innerHTML = `
    <div class="card">
      ${G.kind !== 'academy' && myRunning().length ? `<button type="button" class="teamhand${agentsOn() ? ' on' : ''}" data-act="team">🤖 ${agentsOn() ? 'Your agents run the team · Take it back' : 'Hand the team to my agents'}</button>` : ''}
      <div class="mine-tabs">${[a, b].map((x) => `<button type="button" data-mine="${x.id}" class="${x.id === id ? 'on' : ''}${x.dnf ? ' out' : ''}"><span class="sw" style="width:5px;height:16px;border-radius:2px;background:${x.team.c1}"></span>${esc(x.code)} · ${x.dnf ? 'OUT' : 'P' + x.pos}</button>`).join('')}</div>
      <div class="auto-row"><p><b>${c.auto ? 'Autonomous' : 'Team Principal'}</b><br>${c.auto ? 'The AI strategist runs this car and talks to your driver.' : c.assist ? 'You make the calls. The engineer only calls the stops.' : 'You alone make the calls and talk to your drivers. The engineer stays off the radio until you ask.'}</p>
        <button type="button" class="switch" role="switch" aria-checked="${c.auto}" aria-label="Autonomous mode" data-act="auto"></button></div>
      ${c.auto || c.dnf || c.finished ? '' : '<button type="button" class="ask" data-act="ask">🎧 Ask the engineer</button>'}
      ${c.dnf || c.finished ? '' : `<div class="talkto"><p>🎙️ Talk to ${esc(c.name.split(' ')[0])}</p><div class="chips">${TALK.map(([k, l]) => `<button type="button" data-talk="${k}">${l}</button>`).join('')}</div></div>`}
      ${c.auto ? '' : `<label class="assist"><input type="checkbox" data-act="assist" ${c.assist ? 'checked' : ''}><span><b>Engineer calls the stops</b> Beginner assist: your engineer boxes both cars at the right time. You keep pace, battery and battles.</span></label>`}
    </div>
    <div class="ctl"><label>Box this lap</label>${box}${c.pit || c.finished || c.dnf ? '' : why(c.pitReq ? 'Your driver pits the next time past the pit entry. A stop costs about 8 seconds (a quarter of a lap).' : 'Pick the tyres, then BOX: your driver pits next time round, about 8 seconds. Soft: fastest, wears quickest. Medium: all-rounder. Hard: slowest, lasts longest. Inter: damp. Wet: heavy rain.')}</div>
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
$('#controls').addEventListener('change', (e) => {
  if (e.target.dataset.act !== 'assist') return;
  const on = e.target.checked; S.settings.assist = on; store.save();
  mine().forEach((id) => G.race.command(id, { assist: on }));
  toast(on ? 'Beginner assist on: your engineer calls the pit stops.' : 'Beginner assist off: you call the pit stops.');
  renderControls(true);
});
$('#controls').addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t || t.disabled) return;
  const R = G.race, id = G.mineSel || 'you-0';
  if (t.dataset.mine) { G.mineSel = t.dataset.mine; select(t.dataset.mine); return; }
  if (t.dataset.act === 'team') { handTeam(!agentsOn()); return; }
  if (t.dataset.act === 'auto') { const c = R.byId.get(id); R.command(id, { auto: !c.auto }); say([carTag(id), c.auto ? 'c_auto' : 'c_manual']); handover(c); }
  if (t.dataset.act === 'ask') askEngineer(R.byId.get(id));
  if (t.dataset.talk) driverAsk(R.byId.get(id), t.dataset.talk, TALK.find(([k]) => k === t.dataset.talk)[1]);
  if (t.dataset.act === 'cancel') cmd({ box: null });
  if (t.dataset.pick) { (G.boxPicks ||= {})[id] = t.dataset.pick; }
  if (t.dataset.act === 'boxnow') cmd({ box: boxPick(R.byId.get(id)) });
  if (t.dataset.set) { const m = { pace: 'pace', ersMode: 'ers', battle: 'battle' }[t.dataset.set]; cmd({ [m]: t.dataset.val }); }
  if (t.dataset.order) teamOrder(t.dataset.order);
  renderControls(true);
});
function cmd(c, id = G.mineSel || 'you-0', o = {}) {
  const car = G.race.byId.get(id);
  if (car.auto && !('auto' in c)) { G.race.command(id, { auto: false }); handover(car, true); }
  if (G.race.command(id, c)) heardBy(car, c);
  lessonEvent({ type: 'cmd', id, c });
  { const k = Object.keys(c).find((x) => CALL_WORDS[x]); const w = c.box ? `Box this lap · ${COMPOUNDS[c.box].name}s` : 'box' in c ? 'Staying out' : k ? CALL_WORDS[k][c[k]] : null; if (w && !(k === 'ers' && G.boost)) ack(`${car.code}: ${w}`); }
  // a call you spoke on the radio needs no echo from the engineer, only the driver's answer
  const eng = (parts) => { if (!o.spoken) say(parts); };
  if (c.box) { eng([carTag(id), 'bb_' + c.box]); reply(id, o.reply || 'r_box'); }
  else if ('box' in c) { eng([carTag(id), 'c_cancel']); reply(id, 'r_stay'); }
  const set = c.pace || c.ers || c.battle;
  if (set) { eng([carTag(id), 'c_' + set]); if (!o.quietReply) reply(id, { push: 'r_push', save: 'r_save', attack: 'r_attack', defend: 'r_defend' }[set] || 'r_copy'); }
  G.assisted = true;
  renderControls(true);
}
function teamOrder(o, spoken) {
  const id = G.mineSel || 'you-0', c = G.race.byId.get(id);
  if (c.auto) { G.race.command(id, { auto: false }); handover(c, true); }
  G.race.command(id, { order: o });
  for (const m of myCars()) heardBy(m, { order: o }, o);
  lessonEvent({ type: 'order', o });
  ack({ hold: 'Hold positions', free: 'Race freely', swap: 'Swap places' }[o]);
  if (spoken) reply(id, 'r_copy'); else say([o === 'swap' ? 'o_swap' : o === 'hold' ? 'o_hold' : 'o_free']);
  G.assisted = true; renderControls(true);
}
// the plan's next tyre (the briefing's or the engineer's), else the next harder one
function nextDry(c) { if (c.plan?.next && c.plan.next !== c.tyre.c) return c.plan.next; return c.tyre.c === 'S' ? 'M' : c.tyre.c === 'M' ? 'H' : 'M'; }

// ---------- radio and toasts ----------
function addRadio(m) {
  if (m.from === 'engineer' && engineerQuiet(m.car ? [carTag(m.car)] : null)) { if (m.chat) return; m = { ...m, from: 'info' }; }
  const ol = $('#radio'), li = document.createElement('li');
  const who = m.from === 'engineer' ? 'Engineer' : m.from === 'info' ? 'Pit wall' : m.from === 'driver' ? (m.code || 'Driver') : m.from === 'you' ? 'You' : 'Race control';
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
// your crew in the garage watches the race on its screen: a place gained gets cheers (and, in Live,
// a quick cut to them), a place lost gets hands on helmets
let crewCutAt = -1e9;
function crewReact(c, up, big = false) {
  const pd = world?.paddock; if (!pd || !c) return;
  pd.celebrate(up ? 'cheer' : 'despair', { code: c.code, from: up ? c.pos + 1 : c.pos - 1, to: c.pos }, big ? 7 : 4.5);
  if (up) sound.roar(0.4);
  const now = performance.now();
  if (up && (big || now - crewCutAt > 22000) && cams.crewShot(pd.shot(), big ? 4.5 : 3.4)) crewCutAt = now;
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
      // Team Principal mode: the fact only, spoken only when the clip is a plain reading (no "box now")
      const fact = e.fact || e.text, clip = /Reminder/.test(e.text) ? 'w_second' : whyClip(e.text);
      if (FACT_CLIPS.includes(clip)) say([carTag(e.car), clip], true);
      addRadio({ from: 'race', text: `${car.code}: ${fact}` });
      suggest(car, fact, e.action);
    } else if ((e.type === 'radio' || e.type === 'pit') && isMine) {
      const bx = /Boxing this lap for (\w)/.exec(e.text);
      if (bx) { say([carTag(e.car), whyClip(e.text), 'bb_' + bx[1]].filter(Boolean)); reply(e.car, 'r_box'); }
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
      const now = performance.now();
      if (e.kind === 'spin' || now - lastDnaSay > 25000) { lastDnaSay = now; say([carTag(e.car), 'd_' + e.kind], e.kind === 'spin'); }
    } else if (e.type === 'order' && (isMine || (e.other && my.includes(e.other)))) {
      addRadio({ from: 'engineer', text: e.text }); toast('📻 ' + e.text, true);
      if (/lets .* through/.test(e.text)) say(['u_teamwork']);
    } else if (e.type === 'battle') {
      toast('🔥 ' + e.text, true); addRadio({ from: 'race', text: e.text });
      director([e.car, e.other], 12, true);
      sound.roar(0.5);
      const hit = isMine ? e.car : e.other && my.includes(e.other) ? e.other : null;
      if (hit) say([carTag(hit), 'u_fight']);
    } else if (e.type === 'pass' && (isMine || (e.other && my.includes(e.other)))) {
      toast(e.text, isMine); addRadio({ from: 'race', text: e.text });
      const both = isMine && e.other && my.includes(e.other), now = performance.now();
      if (!both && now - lastPassSay > 9000) {
        lastPassSay = now;
        const who = isMine ? car : R.byId.get(e.other);
        say([carTag(who.id), isMine ? 'nice' : 'lost', 'p' + who.pos]);
      }
      if (!both) crewReact(isMine ? car : R.byId.get(e.other), isMine);
    } else if (e.type === 'pass') {
      if (!lite || Math.random() < 0.5) toast(e.text);
      if (/for P[123]\b/.test(e.text)) sound.roar(0.55);
    } else if (e.type === 'fastest') {
      toast('⏱ ' + e.text); if (isMine) { addRadio({ from: 'race', text: e.text }); say([carTag(e.car), 'fastest']); }
    } else if (e.type === 'mistake' && (isMine || car.pos <= 5)) { toast(e.text); if (isMine) { addRadio({ from: 'engineer', text: e.text }); say([carTag(e.car), 'u_mistake']); } }
  }
}

// ---------- screens ----------
function show(html, cls = '') {
  const sc = $('#screen'); sc.className = 'screen ' + cls; sc.hidden = false;
  const sheet = $('#sheet'); sheet.onclick = sheet.oninput = sheet.onchange = null;   // screens that use handler properties start clean
  sheet.innerHTML = html; sheet.scrollTop = 0;
  heroView();
  return sheet;
}
function hide() { $('#screen').hidden = true; heroView(); }

// On a phone (portrait, or landscape with little height) the home screen opens on the race itself:
// the cars running behind a small title and one card, and the full menu fills the screen only when you
// tap Menu. Portrait gets a quiet note that the race looks better sideways; both ways work.
const GLANCE = matchMedia('(max-width: 760px), (max-height: 540px)');
GLANCE.addEventListener?.('change', () => { if (G.attract && /\bhome\b/.test($('#screen').className) && !$('#screen').hidden) home(); });
// The home screen: the race keeps running behind one notebook card. Play opens every way to race,
// and the menu under it has the rest. Everything a phone shows fits beside the cars.
// line icons for the home menu (20x20, drawn with the current colour)
const IC = {
  daily: '<rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M3 8.5h14M7 2.5v4M13 2.5v4M7 12h2v2H7z"/>',
  quick: '<path d="M4 18V3M4 3.5c3-1.5 5 1.5 8 0s4-.5 4-.5v8s-1-1-4 .5-5-1.5-8 0"/>',
  season: '<path d="M6 3h8v4a4 4 0 0 1-8 0zM6 5H3.5a2.5 2.5 0 0 0 3 3M14 5h2.5a2.5 2.5 0 0 1-3 3M10 11v3M7 17h6M8 14h4v3H8z"/>',
  live: '<circle cx="7" cy="7" r="2.6"/><circle cx="14" cy="8" r="2.1"/><path d="M2.5 16.5c.6-2.8 2.4-4.3 4.5-4.3s3.9 1.5 4.5 4.3M11.5 13.2c.7-.9 1.5-1.3 2.5-1.3 1.8 0 3.1 1.3 3.5 3.6"/>',
  dailyfull: '<circle cx="10" cy="11" r="6.5"/><path d="M10 7.5V11l2.5 1.5M8 2.5h4M10 2.5v2"/>',
  academy: '<path d="M2 7.5 10 4l8 3.5-8 3.5zM5.5 9v4c1.2 1.4 2.8 2 4.5 2s3.3-.6 4.5-2V9M18 7.5v4.5"/>',
  practice: '<path d="M12.5 3.5a3.5 3.5 0 0 0-3.3 4.7L3.5 14v2.5H6l5.8-5.7a3.5 3.5 0 0 0 4.7-3.3l-2.2 2.2-2.4-.6-.6-2.4z"/>',
  team: '<path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H8l1.5 2h6A1.5 1.5 0 0 1 17 7.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z"/>',
  board: '<path d="M3 17h14M5 17V10h3v7M8.5 17V6h3v11M12 17v-5h3v5"/>',
  account: '<circle cx="10" cy="7" r="3.5"/><path d="M3.5 17.5c.9-3.4 3.4-5.2 6.5-5.2s5.6 1.8 6.5 5.2"/>',
  pass: '<path d="m10 2.8 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z"/>',
  settings: '<circle cx="10" cy="10" r="2.7"/><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6"/>',
  help: '<circle cx="10" cy="10" r="7.5"/><path d="M7.8 7.8a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.5v.6M10 14.6v.1"/>',
  install: '<rect x="5.5" y="2" width="9" height="16" rx="2"/><path d="M10 6v6M7.5 9.5 10 12l2.5-2.5"/>',
  more: '<circle cx="5" cy="10" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="15" cy="10" r="1"/>',
};
const icon = (k) => `<svg class="ic" viewBox="0 0 20 20" aria-hidden="true">${IC[k] || ''}</svg>`;
// The home screen, after CityRT: the live race fills the screen; a notebook panel on the left holds Continue
// and every way to race; the Anti-Bot Pass sits on the right, Get the app and Join us in the middle. On a phone
// the panel shows Continue and the main modes (the rest behind "All modes"), and can be tucked away to watch.
function home() {
  if (appOn()) return appTab(G.tab);
  const n = dayNumber(), dv = dailyVenue(n), done = S.daily.days[n], first = firstVisit();
  const sv = CALENDAR[(S.season.round - 1) % CALENDAR.length], seasonOver = S.season.round > CALENDAR.length;
  const lr = S.lastRace && venueById(S.lastRace.venue), nAc = doneCount(S), newcomer = first && !S.stats.starts && !nAc;
  const next = !done ? { go: 'daily', what: `Daily Grand Prix #${n}`, where: `${dv.flag} ${esc(dv.city)}` }
    : !seasonOver && !passLocked('season') ? { go: 'season', what: `Championship round ${S.season.round}`, where: `${sv.flag} ${esc(sv.city)}` }
    : { go: 'daily', what: `Daily #${n} again`, where: `${dv.flag} ${esc(dv.city)} · you finished P${done.best}` };
  const item = (go, ic, title, sub, pri) => `<button type="button" class="lp-i${pri ? ' pri' : ''}${passLocked(go) ? ' locked' : ''}" data-go="${go}">${icon(ic)}<span><b>${title}</b><small>${sub}</small></span>${star(go)}</button>`;
  const car = carModel() || 'falcon';
  const cont = newcomer
    ? `<div class="lp-cont"><span class="k">${icon('daily')} Welcome to the paddock</span><h2>Your team awaits</h2>
        <p>Two AI drivers race for you. You make the calls: tyres, pit stops, battery and the weather.</p>
        <button class="btn lp-go" data-go="play" type="button">▶ Start here</button></div>`
    : `<div class="lp-cont"><span class="k">${icon('daily')} Continue</span>
        <div class="lp-row"><div><h2>${esc(first ? 'Your team' : team().name)}</h2>
          <p class="lp-meta">${S.stats.starts} starts · ${S.stats.wins} wins</p><p class="lp-meta">Next: <b>${next.what}</b><br>${next.where}</p></div>
          <img src="assets/cars/${car}.webp" alt="" width="120" height="68" decoding="async"></div>
        <button class="btn lp-go" data-go="${next.go}" type="button">▶ Continue</button></div>`;
  const pr = account.pass.price || { monthly: '0.50', yearly: '5.99' };
  const sh = show(`
    <aside class="lp" aria-label="Menu">
      <div class="lp-head"><p class="lp-brand">AGENT <em>GRAND PRIX</em></p><p class="lp-tag">racing team management</p>
        <button type="button" class="lp-hide" data-go="peek" aria-label="Hide the menu and watch the race">Watch ▾</button><span class="lp-grab" aria-hidden="true"></span></div>
      ${awayCard()}
      ${cont}
      ${agentCard('in')}
      <nav class="lp-list">
        ${item('daily', 'daily', 'Daily Challenge', done ? `#${n} ${dv.flag} ${esc(dv.city)} · you finished P${done.best}` : `#${n} ${dv.flag} ${esc(dv.city)} · free for everyone`, 1)}
        ${item('quick', 'quick', 'New race', `any of ${VENUES.length} circuits${lr ? `, last: ${esc(lr.city)}` : ''}`, 1)}
        ${item('season', 'season', 'Season & career', seasonOver ? 'season over: see the standings' : `round ${S.season.round} of ${CALENDAR.length}: ${sv.flag} ${esc(sv.city)}`, 1)}
        ${item('live', 'live', 'Live Grand Prix', 'ten real teams on one grid', 1)}
        ${item('dailyfull', 'dailyfull', 'Full distance', 'today’s Daily, a whole Grand Prix')}
        ${item('academy', 'academy', 'Racing Academy', `five short lessons${nAc ? ` · ${nAc}/${LESSONS.length} done` : ''}`)}
        ${item('practice', 'practice', 'Free practice', 'no points, no pressure')}
        <hr>
        ${item('team', 'team', first ? 'Build my team' : 'My team', first ? 'name it, pick a car and colours' : 'drivers, car, colours, garage')}
        ${item('board', 'board', 'Leaderboard', 'today and the weekly Sora prizes')}
        ${item('account', 'account', signedIn() ? 'Profile & wallet' : 'Profile', signedIn() ? 'your account and Sora' : 'sign in so your team follows you')}
        ${item('pass', 'pass', 'Anti-Bot Pass', account.pass.active ? 'active: verified human' : `every mode for $${esc(pr.monthly)} a month`)}
        <button type="button" class="lp-i lp-more" data-go="play">${icon('more')}<span><b>All modes &amp; more</b><small>full distance, academy, practice, your team…</small></span></button>
        <hr>
        <div class="lp-pair"><button type="button" data-go="settings">${icon('settings')} Settings</button><button type="button" data-go="help">${icon('help')} How to play</button></div>
        <p class="lp-links"><button type="button" class="link" data-go="garage">Garage</button> · <button type="button" class="link" data-go="dna">Driver DNA</button> · <button type="button" class="link" data-go="agent">My agent</button> · <button type="button" class="link" data-go="rules">Support &amp; rules</button></p>
      </nav>
      ${joinUs('in')}
      <div class="lp-foot"><span>v1.0</span>${signedIn() ? '<button type="button" class="lp-btn" data-go="signout">Sign out</button>' : canSignIn() ? '<button type="button" class="lp-btn" data-go="account">Sign in</button>' : ''}${langPicker(false)}</div>
      ${legalLinks()}
    </aside>
    ${langNote()}
    <div class="mhero" aria-label="Agent Grand Prix"><p class="lp-brand">AGENT <em>GRAND PRIX</em></p><p class="mhero-t">You are the team principal</p>
      <p class="mhero-s">Two AI drivers. One AI race engineer.</p>${S.settings.noDesk ? '' : '<button type="button" class="mhero-d" data-go="nodesk">💻 Best on a computer<span class="mhero-p">. On a phone, turn it sideways</span>. <b aria-hidden="true">×</b></button>'}</div>
    <div class="lp-mini" data-go="unpeek" role="group" aria-label="Menu">
      <div class="lp-mtop"><span class="lp-mhint" aria-hidden="true"><i>⌃</i> slide up for the menu</span><span class="lp-grab" aria-hidden="true"></span><button type="button" class="lp-mtuck" data-go="tuck"><i aria-hidden="true">⌄</i> slide down to watch</button></div>
      <div class="lp-mrow"><span class="lp-mhel">${team().drivers.map((d) => helmetSVG(d, team(), { size: 34, bg: false })).join('')}</span><div class="lp-mtxt"><b>${esc(newcomer ? 'Your team awaits' : team().name)}</b><small>${newcomer ? 'Two AI drivers race for you. You make the calls.' : `Next: ${next.what} · ${next.where}`}</small></div></div>
      <div class="lp-macts"><button class="btn lp-go" data-go="${newcomer ? 'play' : next.go}" type="button">▶ ${newcomer ? 'Start here' : 'Play'}</button><button type="button" class="lp-mmenu" data-go="unpeek" aria-label="Open the menu">☰ Menu</button></div>
      <div class="lp-mcon"><button type="button" class="lp-mwa${wa.linked ? ' on' : ''}" data-go="agent"><i><svg viewBox="0 0 24 24" aria-hidden="true">${WA_ICON}</svg></i><span><b>${wa.linked ? 'WhatsApp connected' : 'Connect your AI agent'}</b><small>${wa.linked ? `✓ ${esc(aName())} is linked` : 'on WhatsApp, takes one minute'}</small></span></button>
        <span class="lp-msoon" title="Telegram: coming soon"><i style="--c:#2aabee"><svg viewBox="0 0 24 24" aria-hidden="true">${SOCIAL[0][2]}</svg></i></span><span class="lp-msoon" title="Your own bot: coming soon"><i style="--c:#1d1f24"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="8" width="12" height="9" rx="3" fill="#fff"/><circle cx="10" cy="12.5" r="1.2" fill="#1d1f24"/><circle cx="14" cy="12.5" r="1.2" fill="#1d1f24"/><path d="M12 5v3" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg></i></span></div>
      <div class="lp-mchips"><button type="button" data-go="pass">★ Anti-Bot Pass${account.pass.active ? ' · active' : ` · $${esc(pr.monthly)}/mo`}</button>${standalone() ? '' : '<button type="button" data-go="install">📲 Get the app</button>'}</div>
      ${legalLinks()}
    </div>
    <button type="button" class="lp-tab" data-go="untuck"><i aria-hidden="true">⌃</i> Slide up for Play</button>
    ${legalLinks(' pg')}
    ${heroCard()}
    <div class="rcol">${appCard()}${passCard()}${joinUs('out')}</div>
    ${homeStrip()}${agentCard()}${acChip()}`, `home nbhome${homePeek() ? ' hpeek' : ''}${G.tuck ? ' htuck' : ''}`);
  sh.onclick = homeClick;
  sheetSwipe(sh);
  sh.onchange = langChange;
  bootDone();
}
// On a phone the menu starts tucked away, so the race is the first thing you see: a small bar with
// Play stays at the bottom (at the left when sideways). Tap it or swipe it up for the menu; swipe the
// menu down (or left, sideways) to put it away. The race behind can be turned and zoomed with a finger.
// the small print on the front page, as on most game sites
const SUPPORT = 'hello@agentgrandprix.com';
const legalLinks = (c = '') => `<p class="lp-legal${c}"><a href="privacy.html" target="_blank" rel="noopener">Privacy</a> · <a href="terms.html" target="_blank" rel="noopener">Terms</a> · <a href="wiki" target="_blank" rel="noopener">Wiki</a> · <a href="mailto:${SUPPORT}">Support</a></p>`;
const homePeek = () => (G.peek === undefined ? GLANCE.matches : G.peek);
function setPeek(on) { G.peek = on; $('#screen').classList.toggle('hpeek', on); if (!on) $('.lp')?.scrollTo(0, 0); }
function sheetSwipe(sh) {
  const lp = $('.lp', sh), mini = $('.lp-mini', sh);
  if (!lp || !mini) return;
  const side = () => matchMedia('(max-height: 540px)').matches;
  // drag: follows the finger, and past a third of the way (or a quick flick) it opens or closes
  const drag = (el, opening) => {
    let st = null;
    el.addEventListener('pointerdown', (e) => {
      if (!GLANCE.matches || e.button > 0) return;
      if (!opening && lp.scrollTop > 2 && !e.target.closest('.lp-head')) return;   // scrolling the menu, not closing it
      st = { x: e.clientX, y: e.clientY, t: performance.now(), on: false };
    });
    el.addEventListener('pointermove', (e) => {
      if (!st) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y, d = side() && !opening ? -dx : opening ? -dy : dy;
      if (!st.on) {
        if (Math.hypot(dx, dy) < 10) return;
        const along = side() && !opening ? Math.abs(dx) > Math.abs(dy) : Math.abs(dy) > Math.abs(dx);
        if (!along || (d < 0 && !opening)) { st = null; return; }
        st.down = opening && d < 0;   // the Play bar pulled down: tuck it away to watch the race
        st.on = true; el.setPointerCapture?.(e.pointerId); (st.down ? mini : lp).classList.add('drag');
      }
      if (st.down) mini.style.transform = `translateY(${Math.max(0, -d)}px)`;
      else if (!opening) lp.style.transform = side() ? `translateX(${-Math.max(0, d)}px)` : `translateY(${Math.max(0, d)}px)`;
      st.d = d;
    });
    const end = () => {
      if (!st) return;
      const was = st; st = null; lp.classList.remove('drag'); lp.style.transform = ''; mini.classList.remove('drag'); mini.style.transform = '';
      if (!was.on) return;
      if (was.down) { if (-was.d > 40 || -was.d / Math.max(1, performance.now() - was.t) > 0.5) setTuck(true); el.dragAt = performance.now(); return; }
      const size = side() ? lp.offsetWidth : lp.offsetHeight, fast = was.d / Math.max(1, performance.now() - was.t) > 0.5;
      if (was.d > (opening ? 30 : size / 3) || fast) setPeek(!opening);
      el.dragAt = performance.now();
    };
    // a drag is not a tap: the click that ends it is dropped
    el.addEventListener('click', (e) => { if (performance.now() - (el.dragAt || 0) < 400) { e.stopPropagation(); e.preventDefault(); } }, { capture: true });
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  };
  drag(mini, true); drag(lp, false);
  // the tab left behind when the Play bar is tucked away: tap it or slide it up to bring the bar back
  const tab = $('.lp-tab', sh);
  if (tab) {
    let y0 = null;
    tab.addEventListener('pointerdown', (e) => { y0 = e.clientY; });
    tab.addEventListener('pointerup', (e) => { if (y0 != null && y0 - e.clientY > 20) { tab.dragAt = performance.now(); setTuck(false); } y0 = null; });
  }
}
function setTuck(on) { G.tuck = on; $('#screen').classList.toggle('htuck', on); }
// the big title at the top of the home screen (desktop)
function heroCard() {
  return `<div class="hero"><p class="hero-brand">AGENT <em>GRAND PRIX</em></p><p class="hero-t">You are the team principal</p>
    <p class="hero-s">Two AI drivers. One AI race engineer. Your championship.</p>
    <button class="btn hero-go" data-go="team" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.7-3.2 3-5 6-5s5.3 1.8 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14c2.4.2 4 1.8 4.5 4.5"/></svg>${firstVisit() ? 'Build my team' : 'Manage my team'}<span aria-hidden="true">›</span></button></div>`;
}
// your team along the bottom of the home screen (desktop): both drivers and the AI race engineer,
// who is also where you connect your own AI agent on WhatsApp (Telegram and your own bot come later)
function homeStrip() {
  const t = team(), prof = activeProfiles(S), auto = !!S.settings.auto, on = wa.linked;
  const done = S.season.round - 1, teams = Object.entries(S.season.teamPts).sort((a, b) => b[1] - a[1]);
  const tp = teams.findIndex(([k]) => k === 'you') + 1, pts = S.season.teamPts.you || 0;
  const ord = (n) => n + (n % 100 > 10 && n % 100 < 14 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const where = done ? `Season ${S.season.no || 1} · ${tp ? ord(tp) : ord(teams.length + 1)} place · ${pts} pts` : `Season ${S.season.no || 1} · round 1 of ${CALENDAR.length}`;
  const traits = (p) => {
    if (!p || !p.params) return [];
    return QUICK.map((q) => ({ q, v: (q.maps.reduce((a, m) => a + (m[0] === '-' ? 100 - p.params[m.slice(1)] : p.params[m]), 0) / q.maps.length) }))
      .filter(({ v }) => Math.abs(v - 50) >= 6)
      .sort((a, b) => Math.abs(b.v - 50) - Math.abs(a.v - 50)).slice(0, 3).map(({ q, v }) => (v > 50 ? q.hi : q.lo));
  };
  const drv = (d, i) => {
    const p = prof[SLOTS[i]], tr = traits(p);
    return `<button type="button" class="hs-d" data-go="driver:car${i + 1}" title="${esc(d.name)}: career and Driver DNA">${helmetSVG(d, t, { size: 76 })}
      <span class="hs-dt"><small>Driver 0${i + 1}${d.num != null ? ` · #${esc(d.num)}` : ''}</small><b>${esc(d.name)}</b><em>${esc(p?.name || 'Balanced')}</em>
      <span class="hs-tr">${(tr.length ? tr : ['Even in everything']).map((x) => `<span>${esc(x)}</span>`).join('')}</span></span></button>`;
  };
  return `<div class="hs" aria-label="Your team">
    <div class="hs-head">${helmetSVG({ name: t.name, code: t.short }, t, { size: 30, num: false, bg: false })}<b>${esc(t.name)}</b><span>${where}</span>
      <button type="button" class="hs-cfg" data-go="team"><svg viewBox="0 0 20 20" aria-hidden="true">${IC.settings}</svg>Configure drivers</button></div>
    <div class="hs-row">${t.drivers.map(drv).join('')}
      <div class="hs-e"><div class="hs-et"><svg class="hs-eh" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="20" r="11" fill="#1267f4"/><path d="M14 18a10 10 0 0 1 20 0" stroke="#0b2a6b" stroke-width="3" fill="none"/><rect x="9" y="17" width="6" height="9" rx="2.5" fill="#20232a"/><rect x="33" y="17" width="6" height="9" rx="2.5" fill="#20232a"/><path d="M36 26c0 5-4 7-8 7" stroke="#20232a" stroke-width="2" fill="none"/><path d="M8 47c1-8 7-12 16-12s15 4 16 12z" fill="#0b2a6b"/></svg>
        <div><b>AI race engineer</b><small>Your second-in-command</small></div></div>
        <div class="hs-chips"><span>📊 Strategy &amp; analysis</span><span>⚙️ Runs the team when you hand it over</span><span>💬 WhatsApp updates</span></div>
        <p class="hs-del">Delegation: <b>${auto ? 'Autonomous' : 'Advisory'}</b> <span title="${auto ? 'Your AI agents make the calls.' : 'You make the calls; the engineer advises.'}">ⓘ</span></p>
        <div class="hs-con"><button type="button" class="ag-wa${on ? ' on' : ''}" data-go="agent"><i><svg viewBox="0 0 24 24" aria-hidden="true">${WA_ICON}</svg></i><span><b>${on ? 'WhatsApp connected' : 'Connect WhatsApp'}</b><small>${on ? `✓ ${esc(aName())} is linked` : 'takes one minute'}</small></span></button>
          <span class="ag-soon" title="Telegram: coming soon"><i style="--c:#2aabee"><svg viewBox="0 0 24 24" aria-hidden="true">${SOCIAL[0][2]}</svg></i><span><b>Telegram</b><small>coming soon</small></span></span>
          <span class="ag-soon" title="Your own bot: coming soon"><i style="--c:#1d1f24"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="8" width="12" height="9" rx="3" fill="#fff"/><circle cx="10" cy="12.5" r="1.2" fill="#1d1f24"/><circle cx="14" cy="12.5" r="1.2" fill="#1d1f24"/><path d="M12 5v3" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg></i><span><b>Your own bot</b><small>coming soon</small></span></span></div>
      </div></div></div>`;
}
// the Anti-Bot Pass on the home screen's right
function passCard() {
  const P_ = account.pass, pr = P_.price || { monthly: '0.50', yearly: '5.99' };
  const until = P_.until ? new Date(P_.until).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return `<div class="pc"><div class="pc-top"><span class="pass-chip">★ Anti-Bot Pass</span><span class="pc-v">✓ verified human</span></div>
    <h3>${P_.active ? 'You’re a verified human' : 'All of Agent Grand Prix'}</h3>
    <ul class="pc-list"><li><b>New races</b> on all ${VENUES.length} circuits</li><li><b>The Championship</b>, all ${CALENDAR.length} rounds</li><li><b>Live Grand Prix</b> against people</li><li><b>Full-distance races</b></li><li>A share of the <b>weekly Sora prizes</b></li></ul>
    ${P_.active ? `<p class="pc-fine">${P_.renews ? 'Renews' : 'Active until'} ${esc(until)}.</p><button class="btn pc-buy" data-go="pass" type="button">Manage pass</button>`
      : P_.sell ? `<div class="pc-price"><b>$${esc(pr.monthly)}</b><span>per month</span></div><button class="btn pc-buy" data-go="pass" type="button">Unlock everything</button>
        <p class="pc-fine">$${esc(pr.yearly)} a year, renews yearly. Cancel any time.</p>`
      : '<p class="pc-fine">Opens very soon. Every mode is free until then.</p>'}</div>`;
}
// Get the app: the game installs from the browser, no store needed
function appCard() {
  if (standalone()) return '';
  return `<div class="gc"><h3>Get the app</h3><p>full screen, one tap from your home screen</p>
    <div class="gc-row"><button type="button" data-go="install:desk"><i>${'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>'}</i><b>Computer</b><small>Chrome or Edge</small></button>
      <button type="button" data-go="install:ios"><i>${'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>'}</i><b>iPhone</b><small>Safari</small></button>
      <button type="button" data-go="install:android"><i>${'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2"/><path d="M6.5 5.5h11M6.5 18h11"/></svg>'}</i><b>Android</b><small>Chrome</small></button></div>
    <button type="button" class="gc-play" data-go="play"><span aria-hidden="true">▶</span> Or play in the browser</button></div>`;
}
// ---------- the phone app ----------
// On a phone (and an iPad held upright) the game opens as an app, not a small desktop: five tabs along
// the bottom (Home, Race, Team, Engineer, More), one job per screen, and the race itself as its own
// full-screen space with no tabs. Everything here reads the same saved state and opens the same sheets
// as the desktop home, so a call or a setting made on a phone goes through the same code.
const MOB = matchMedia('(pointer: coarse) and (max-width: 760px), (pointer: coarse) and (max-height: 540px), (pointer: coarse) and (orientation: portrait) and (max-width: 1080px)');
const appOn = () => !params.has('desk') && (params.has('app') || MOB.matches);
// on a phone, Hand to agents / Take control sits above the race buttons, under your thumb, rather than in the top bar
const appMark = () => { const on = appOn(), b = $('#agentsBtn'); document.documentElement.classList.toggle('mob', on); if (on) $('meta[name="theme-color"]')?.setAttribute('content', '#060b18'); if (b) (on ? $('#stage') : $('.hud-right')).append(b); };
appMark();
MOB.addEventListener?.('change', () => { appMark(); if (G.attract && !$('#screen').hidden && /\b(nbhome|appsc)\b/.test($('#screen').className)) home(); });
const TABS = [
  ['home', 'Home', '<path d="M3.5 10.5 12 3.8l8.5 6.7M6 9v10.5h4.5v-6h3v6H18V9"/>'],
  ['race', 'Race', '<path d="M5 21V4M5 4.5c4-2 6.5 2 10.5 0S20 4 20 4v9s-1.5-1-4.5.5-6.5-2-10.5 0"/>'],
  ['team', 'Team', '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c.7-3.4 3-5.2 6-5.2s5.3 1.8 6 5.2"/><circle cx="17" cy="9" r="2.5"/><path d="M16.6 14.2c2.4.2 4 1.9 4.6 4.6"/>'],
  ['eng', 'Engineer', '<path d="M4.5 13v-1a7.5 7.5 0 0 1 15 0v1"/><rect x="3" y="12.5" width="4" height="6" rx="1.6"/><rect x="17" y="12.5" width="4" height="6" rx="1.6"/><path d="M19 18.5c0 2-2 3-4.5 3H12"/>'],
  ['more', 'More', '<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>'],
];
const tabIcon = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const ordinal = (n) => n + (n % 100 > 10 && n % 100 < 14 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
// the season so far: points and place of your team among those that have scored
function seasonLine() {
  const teams = Object.entries(S.season.teamPts).sort((a, b) => b[1] - a[1]);
  const pts = S.season.teamPts.you || 0, idx = teams.findIndex(([k]) => k === 'you');
  return { no: S.season.no || 1, pts, place: S.season.round > 1 ? (idx >= 0 ? idx + 1 : teams.length + 1) : 0, round: S.season.round };
}
// the weather you can expect, from the circuit's own climate
const climate = (v) => `${v.temp >= 30 ? 'Hot' : v.temp >= 22 ? 'Warm' : v.temp >= 14 ? 'Mild' : 'Cool'} · ${v.rain >= 0.35 ? 'rain likely' : v.rain >= 0.15 ? 'showers possible' : 'dry'}`;
const tempC = (v) => `${Math.round(v.temp)}°C`;
// a driver's Driver DNA as the eight Quick dials (0 to 100), straight from their profile
const dialsOf = (p) => (p && p.params ? QUICK.map((q) => ({ q, v: Math.round(q.maps.reduce((a, m) => a + (m[0] === '-' ? 100 - p.params[m.slice(1)] : p.params[m]), 0) / q.maps.length) })) : []);
const traitsOf = (p) => dialsOf(p).filter(({ v }) => Math.abs(v - 50) >= 6).sort((a, b) => Math.abs(b.v - 50) - Math.abs(a.v - 50)).map(({ q, v }) => (v > 50 ? q.hi : q.lo));
// each car's place in the last race you ran (not the agent's), when there is one
const lastPlace = (k) => { const r = S.lastReport, id = r && r.mine && r.mine[k], row = id && r.rows.find((x) => x.id === id); return row ? (row.dnf ? 'DNF' : 'P' + row.pos) : ''; };
const engName = () => { const v = VOICES.find((x) => x.id === voiceId()); return v ? v.name : 'Your engineer'; };
const ENG_FACE = '<svg class="ap-eface" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#0d2a66"/><circle cx="24" cy="21" r="9.5" fill="#f2c9a5"/><path d="M14.5 19a9.5 9.5 0 0 1 19 0" stroke="#08132e" stroke-width="3.2" fill="none"/><rect x="11" y="17" width="5" height="8" rx="2.2" fill="#c6ff3d"/><rect x="32" y="17" width="5" height="8" rx="2.2" fill="#c6ff3d"/><path d="M34.5 25c0 4-3 6-7 6" stroke="#c6ff3d" stroke-width="1.8" fill="none"/><path d="M9 48c1.2-8 7-12 15-12s13.8 4 15 12z" fill="#1267f4"/></svg>';

function appTab(t = 'home') {
  if (!TABS.some(([k]) => k === t)) t = 'home';
  G.tab = t;
  const body = { home: appHome, race: appRace, team: appTeam, eng: appEng, more: appMore }[t]();
  const sh = show(`<div class="ma ma-${t}">${body}
    <nav class="app-tabs" aria-label="Main">${TABS.map(([k, name, p]) => `<button type="button" data-at="${k}" class="${k === t ? 'on' : ''}"${k === t ? ' aria-current="page"' : ''}>${tabIcon(p)}<span>${name}</span></button>`).join('')}</nav></div>`,
    `appsc${t === 'home' ? ' apphome' : ''}`);
  sh.onclick = appClick; sh.onchange = langChange;
  const main = $('.app-main', sh);
  if (main) { main.scrollTop = G.appScroll?.[t] || 0; main.onscroll = () => { (G.appScroll ||= {})[t] = main.scrollTop; heroView(); }; }
  heroView();
  bootDone();
}
function appClick(e) {
  const tb = e.target.closest('[data-at]'); if (tb) { (G.appScroll ||= {})[tb.dataset.at] = 0; return appTab(tb.dataset.at); }
  const b = e.target.closest('[data-go]'), go = b && b.dataset.go;
  if (go === 'play' || go === 'menu') return appTab('race');
  if (go === 'voice') return voiceSheet(home);
  if (go === 'deleg:0' || go === 'deleg:1') { S.settings.auto = go === 'deleg:1'; store.save(); return appTab('eng'); }
  homeClick(e);
}
// the Home tab's Next race card is a window onto the live race behind the app: the 3D view is
// shifted so the cars sit in that window, and follows it as the page scrolls
function heroView() {
  const hero = G.attract && !$('#screen').hidden && $('#screen').classList.contains('apphome') ? $('.ap-hero') : null;
  const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
  if (!hero) { if (camera.view && camera.view.enabled) { camera.clearViewOffset(); camera.aspect = w / h; camera.updateProjectionMatrix(); } return; }
  // centre the full view on the window: a bigger virtual frame, of which the screen shows one part
  const r = hero.getBoundingClientRect(), sy = Math.round(h / 2 - clamp(r.top + r.height * 0.55, 40, h / 2)), sx = Math.round(Math.max(0, w / 2 - (r.left + r.width / 2)));
  camera.aspect = (w + 2 * sx) / (h + 2 * sy); camera.setViewOffset(w + 2 * sx, h + 2 * sy, 2 * sx, 2 * sy, w, h); camera.updateProjectionMatrix();
}

function appHome() {
  const t = team(), nx = nextRace(), v = nx.venue, sl = seasonLine(), prof = activeProfiles(S), first = firstVisit();
  const newcomer = first && !S.stats.starts && !doneCount(S);
  const drv = (d, k) => {
    const pl = lastPlace(k), tr = traitsOf(prof[SLOTS[k]]).slice(0, 2);
    return `<button type="button" class="ap-d" data-go="driver:car${k + 1}" style="--c1:${esc(t.c1 || '#1267f4')}">
      <span class="ap-dn">${d.num != null ? esc(d.num) : k + 1}</span>${portraitSVG(d, t, { size: 84, bg: false })}
      <span class="ap-dt"><b>${esc(d.name)}</b>${pl ? `<i class="ap-pl">${pl}</i>` : ''}</span>
      <span class="ap-tr">${(tr.length ? tr : ['Even in everything']).map((x) => `<small>${esc(x)}</small>`).join('')}</span></button>`;
  };
  const review = S.lastReport && S.lastReport.review && S.lastReport.review.find((x) => x.kind !== 'note' || !x.id);
  return `<header class="app-top ap-hd">
      <div class="ap-brand">${helmetSVG({ name: t.name, code: t.short }, t, { size: 38, num: false, bg: false })}<div><b>${esc(newcomer ? 'Agent Grand Prix' : t.name)}</b><small>You are the team principal</small></div></div>
      <div class="ap-ssn"><small>Season ${sl.no}</small><b>${sl.pts} pts</b><small>${sl.place ? ordinal(sl.place) + ' place' : `round ${Math.min(sl.round, CALENDAR.length)} of ${CALENDAR.length}`}</small></div>
    </header>
    <main class="app-main">
      <section class="ap-hero" aria-label="Next race">${signedIn() ? '' : acChip()}
        <span class="ap-k">${esc(nx.kicker)}</span>
        <h1>${esc(v.city)}</h1><p class="ap-where">${v.flag} ${esc(v.country)} · ${esc(v.circuit)}</p>
        <div class="ap-facts"><span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg>${tempC(v)}</span><span>${esc(climate(v))}</span>${nx.note ? `<span>${esc(nx.note)}</span>` : ''}</div>
      </section>
      <div class="ap-sheet">
        ${awayCard()}
        <div class="ap-h"><h2>Drivers</h2><button type="button" class="ap-more" data-at="team">My team ›</button></div>
        <div class="ap-drv">${t.drivers.map(drv).join('')}</div>
        <button type="button" class="ap-eng" data-at="eng">${ENG_FACE}
          <span class="ap-et"><small>AI race engineer</small><b>${esc(engName())}</b>
            <span class="ap-st"><i class="${wa.linked ? 'on' : ''}"></i>${wa.linked ? 'WhatsApp linked' : 'WhatsApp not linked'} · ${S.settings.auto ? 'Autonomous' : 'Advisory'}</span></span>
          <span class="ap-say">${review ? esc(review.text) : newcomer ? 'Two AI drivers race for you. I read the race and advise; you make the calls.' : `I'll have a plan for ${esc(v.city)} on the grid.`}</span></button>
        ${standalone() ? '' : `<button type="button" class="ap-inst" data-go="install"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M12 7v7M9 11l3 3 3-3"/></svg><span><b>Get the app</b><small>full screen, one tap from your home screen</small></span><em>›</em></button>`}
      </div>
      <div class="ap-cta-wrap"><button type="button" class="ap-cta" data-go="${newcomer ? 'play' : nx.go}">${newcomer ? 'Start here' : nx.cta}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button></div>
    </main>`;
}
// what Home offers next: today's Daily if you haven't raced it, else the next Championship round
function nextRace() {
  const n = dayNumber(), dv = dailyVenue(n), done = S.daily.days[n];
  const sv = CALENDAR[(S.season.round - 1) % CALENDAR.length], seasonOver = S.season.round > CALENDAR.length;
  if (!done) return { go: 'daily', venue: dv, kicker: `Next race · Daily Grand Prix #${n}`, cta: 'Enter race', note: 'free for everyone' };
  if (!seasonOver && !passLocked('season')) return { go: 'season', venue: sv, kicker: `Next race · Round ${S.season.round} of ${CALENDAR.length}`, cta: 'Enter race', note: '' };
  return { go: 'daily', venue: dv, kicker: `Daily Grand Prix #${n}`, cta: 'Race it again', note: `you finished P${done.best}` };
}

function appRace() {
  const n = dayNumber(), dv = dailyVenue(n), done = S.daily.days[n], first = firstVisit();
  const sv = CALENDAR[(S.season.round - 1) % CALENDAR.length], seasonOver = S.season.round > CALENDAR.length;
  const lr = S.lastRace && venueById(S.lastRace.venue), nAc = doneCount(S), newcomer = first && !S.stats.starts && !nAc;
  const row = (go, ic, title, sub) => `<button type="button" class="ap-row${passLocked(go) ? ' locked' : ''}" data-go="${go}">${icon(ic)}<span><b>${title}</b><small>${sub}</small></span>${star(go) || '<em>›</em>'}</button>`;
  return `<header class="app-top"><h1 class="ap-title">Race</h1>${acChip()}</header>
    <main class="app-main"><div class="ap-pad">
      ${newcomer ? `<p class="ap-lede">New to the pit wall? Start with one of these.</p>
        <div class="ap-group">${row('academy', 'academy', 'Racing Academy', 'learn the pit wall in five short lessons')}${row('just', 'quick', 'Jump into a race', 'a short race at Sakhir with the coach beside you')}${row('practice', 'practice', 'Free practice', 'no points, no pressure')}</div>` : ''}
      <button type="button" class="ap-daily" data-go="daily"><img class="ap-dimg" src="assets/cars/hero/${esc(carModel() || 'falcon')}.webp" alt="" width="1200" height="675" decoding="async"><span class="ap-k">Today · Daily Grand Prix #${n}</span><b>${dv.flag} ${esc(dv.city)}</b>
        <small>${done ? `You finished P${done.best}. Race it again for fun.` : 'The same race for everyone today. Always free.'}</small><i>${done ? 'Race again' : 'Race'} ›</i></button>
      ${S.lastRace && lr ? `<div class="ap-group">${row('again', 'quick', 'Race again', `${lr.flag} ${esc(lr.city)}, same set-up`)}</div>` : ''}
      <h2 class="ap-sub">Every way to race</h2>
      <div class="ap-group">
        ${row('quick', 'quick', 'New race', `any of ${VENUES.length} circuits${lr ? `, last: ${esc(lr.city)}` : ''}`)}
        ${row('season', 'season', 'Season & career', seasonOver ? 'season over: see the standings' : `round ${S.season.round} of ${CALENDAR.length}: ${sv.flag} ${esc(sv.city)}`)}
        ${row('live', 'live', 'Live Grand Prix', 'ten real teams on one grid')}
        ${row('dailyfull', 'dailyfull', 'Full distance', 'today’s Daily, a whole Grand Prix')}
      </div>
      <div class="ap-group">
        ${row('academy', 'academy', 'Racing Academy', `five short lessons${nAc ? ` · ${nAc}/${LESSONS.length} done` : ''}`)}
        ${row('practice', 'practice', 'Free practice', 'no points, no pressure')}
        ${row('watch', 'live', 'Watch a race', 'sit back and watch the field')}
      </div>
      <div class="ap-group">${row('board', 'board', 'Leaderboard', 'today and the weekly Sora prizes')}${row('standings', 'season', 'Championship standings', `season ${S.season.no || 1}`)}</div>
    </div></main>`;
}

function appTeam() {
  const t = team(), first = firstVisit(), prof = activeProfiles(S), sl = seasonLine(), car = carModel() || 'falcon', cs = careerState(S);
  const drv = (d, k) => {
    const p = prof[SLOTS[k]], c = cs[SLOTS[k]], r = rankOf(c.xp), dials = dialsOf(p);
    return `<article class="ap-card ap-dc" style="--c1:${esc(t.c1 || '#1267f4')}">
      <div class="ap-dch">${portraitSVG(d, t, { size: 72, bg: false })}<div><small>Driver 0${k + 1}${d.num != null ? ` · #${esc(d.num)}` : ''}</small><b>${esc(d.name)}</b><span>${esc(p?.name || 'Balanced')} · ${esc(r.name)}</span></div></div>
      <div class="ap-stats"><div><b>${c.races}</b><small>Races</small></div><div><b>${c.wins}</b><small>Wins</small></div><div><b>${c.podiums}</b><small>Podiums</small></div><div><b>${c.xp}</b><small>XP</small></div></div>
      ${dials.length ? `<ul class="ap-dials">${dials.map(({ q, v }) => `<li><span>${esc(q.label)}</span><i><u style="width:${v}%"></u></i><b>${v}</b></li>`).join('')}</ul>` : ''}
      <div class="ap-acts"><button type="button" class="btn ghost" data-go="driver:car${k + 1}">Career</button><button type="button" class="btn ghost" data-go="dna">Driver DNA</button></div></article>`;
  };
  return `<header class="app-top"><h1 class="ap-title">${esc(first ? 'My team' : t.name)}</h1>${acChip()}</header>
    <main class="app-main"><div class="ap-pad">
      <button type="button" class="ap-car" data-go="garage"><img src="assets/cars/hero/${esc(car)}.webp" alt="" width="1200" height="675" decoding="async"><span><small>Your car</small><b>${esc((MODELS.find((m) => m.id === car) || {}).name || 'Simple car')}</b><em>Garage ›</em></span></button>
      <div class="ap-stats ap-season"><div><b>${sl.pts}</b><small>Points</small></div><div><b>${sl.place ? ordinal(sl.place) : '–'}</b><small>Place</small></div><div><b>${S.stats.starts}</b><small>Starts</small></div><div><b>${S.stats.wins}</b><small>Wins</small></div></div>
      ${first ? `<button type="button" class="ap-cta ap-inline" data-go="build">Build my team<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>` : ''}
      <h2 class="ap-sub">Drivers</h2>
      ${t.drivers.map(drv).join('')}
      <div class="ap-group">
        ${first ? '' : `<button type="button" class="ap-row" data-go="team">${icon('team')}<span><b>Edit team</b><small>name, drivers, colours and numbers</small></span><em>›</em></button>`}
        <button type="button" class="ap-row" data-go="standings">${icon('season')}<span><b>Championship standings</b><small>season ${sl.no}, round ${Math.min(sl.round, CALENDAR.length)} of ${CALENDAR.length}</small></span><em>›</em></button>
        ${S.lastReport ? `<button type="button" class="ap-row" data-go="report">${icon('board')}<span><b>Last race report</b><small>${S.lastReport.venue.flag} ${esc(S.lastReport.venue.city)} · ${esc(S.lastReport.label || '')}</small></span><em>›</em></button>` : ''}
      </div>
    </div></main>`;
}

function appEng() {
  S.agent ||= { since: dayNumber(), playbook: {}, reports: [], unseen: [] };
  const auto = !!S.settings.auto, pb = playbookOf(S), rep = S.lastReport, on = wa.linked;
  const reports = (S.agent.reports || []).slice(-5).reverse();
  return `<header class="app-top"><h1 class="ap-title">Engineer</h1>${acChip()}</header>
    <main class="app-main"><div class="ap-pad">
      <div class="ap-card ap-eh">${ENG_FACE}<div><small>AI race engineer</small><b>${esc(engName())}</b><span>Reads the race, advises on the radio, and runs the team when you hand it over.</span></div>
        <button type="button" class="btn ghost" data-go="voice">Voice</button></div>
      <h2 class="ap-sub">Delegation</h2>
      <div class="ap-seg" role="radiogroup" aria-label="Who makes the calls in your next race">
        <button type="button" role="radio" aria-checked="${!auto}" class="${auto ? '' : 'on'}" data-go="deleg:0"><b>Advisory</b><small>You make the calls. Your engineer advises.</small></button>
        <button type="button" role="radio" aria-checked="${auto}" class="${auto ? 'on' : ''}" data-go="deleg:1"><b>Autonomous</b><small>Your agents make every call. Take it back any time.</small></button></div>
      <p class="ap-note">This is the start for your next race. In a race, Hand to agents and Take it back switch it any time.</p>
      <h2 class="ap-sub">Your AI agent</h2>
      <div class="ap-card ap-wa">
        <button type="button" class="ap-row${on ? ' on' : ''}" data-go="agent"><i class="ap-wai"><svg viewBox="0 0 24 24" aria-hidden="true">${WA_ICON}</svg></i><span><b>${on ? 'WhatsApp linked' : 'Connect WhatsApp'}</b><small>${on ? `${esc(aName())} follows your races and texts you the big calls` : 'your engineer texts you the big calls; takes one minute'}</small></span><em>›</em></button>
        <div class="ap-soon"><span><i style="--c:#2aabee"><svg viewBox="0 0 24 24" aria-hidden="true">${SOCIAL[0][2]}</svg></i>Telegram</span><span><i style="--c:#1d1f24"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="8" width="12" height="9" rx="3" fill="#fff"/><circle cx="10" cy="12.5" r="1.2" fill="#1d1f24"/><circle cx="14" cy="12.5" r="1.2" fill="#1d1f24"/><path d="M12 5v3" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg></i>Your own bot</span><small>coming soon</small></div>
        <p class="ap-note">${on ? 'When your agents run the team, check-in questions come to you on WhatsApp, with a safe default if you don’t answer.' : 'Once linked, check-in questions during races your agents run come to you on WhatsApp.'}</p>
      </div>
      <button type="button" class="ap-row ap-card" data-go="agent">${icon('daily')}<span><b>Missed Dailies</b><small>${pb.on ? `your agent races them at ${pb.cover}:00 if you haven't` : 'off: your agent leaves missed Dailies alone'}</small></span><em>›</em></button>
      ${rep && rep.review && rep.review.length ? `<h2 class="ap-sub">Debrief · ${rep.venue.flag} ${esc(rep.venue.city)}</h2>
        <ul class="ap-card ap-rev">${rep.review.slice(0, 6).map((x) => `<li class="${esc(x.kind)}">${esc(x.text)}</li>`).join('')}</ul>
        <button type="button" class="btn ghost ap-wide" data-go="report">Full race report</button>` : `<h2 class="ap-sub">Debrief</h2><p class="ap-note">After your first race your engineer's review of it shows here: what happened to both cars, and how your calls worked.</p>`}
      ${reports.length ? `<h2 class="ap-sub">Races your agent ran</h2><div class="ap-group">${reports.map((r) => `<button type="button" class="ap-row" data-go="ar:${r.n}"><span><b>${r.report.venue.flag} ${esc(r.report.venue.city)} · Daily #${r.n}</b><small>${r.places.map((p) => (p ? 'P' + p : 'DNF')).join(' · ')} · +${r.pts} pts</small></span><em>›</em></button>`).join('')}</div>` : ''}
    </div></main>`;
}

function appMore() {
  const pr = account.pass.price || { monthly: '0.50', yearly: '5.99' };
  const row = (go, ic, title, sub) => `<button type="button" class="ap-row" data-go="${go}">${icon(ic)}<span><b>${title}</b><small>${sub}</small></span><em>›</em></button>`;
  return `<header class="app-top"><h1 class="ap-title">More</h1>${acChip()}</header>
    <main class="app-main"><div class="ap-pad">
      <div class="ap-group">
        ${row('account', 'account', signedIn() ? 'Profile & wallet' : 'Profile', signedIn() ? 'your account and Sora' : 'sign in so your team follows you')}
        ${row('pass', 'pass', 'Anti-Bot Pass', account.pass.active ? 'active: verified human' : `every mode for $${esc(pr.monthly)} a month`)}
        ${standalone() ? '' : row('install', 'install', 'Get the app', 'full screen, one tap from your home screen')}
      </div>
      <div class="ap-group">
        ${row('help', 'help', 'How to play', 'the pit wall in two minutes')}
        ${row('win', 'season', 'How to win', 'tyres, stops, the battery and rain')}
        <a class="ap-row" href="wiki" target="_blank" rel="noopener">${icon('academy')}<span><b>Racing wiki</b><small>every racing word, explained</small></span><em>›</em></a>
        ${row('settings', 'settings', 'Settings', 'sound, the engineer, the coach and language')}
        ${row('rules', 'help', 'Support & rules', 'fair play, and how to reach us')}
      </div>
      <div class="ap-group ap-langrow"><span>${icon('settings')}<b>Language</b></span>${langPicker(false)}</div>
      ${joinUs('in')}
      <div class="ap-foot">${signedIn() ? '<button type="button" class="btn ghost" data-go="signout">Sign out</button>' : ''}<span>Agent Grand Prix v1.0</span></div>
      ${legalLinks()}
    </div></main>`;
}

// Play: every way to race. A first visit gets the three ways in first; locked modes carry a ★ Pass tag.
const PASS_GATED = new Set(['quick', 'season', 'dailyfull', 'live', 'again']);
const passLocked = (k) => !!(account.pass.sell && !account.pass.active && PASS_GATED.has(k));
const star = (k) => (passLocked(k) ? '<span class="pm-star">★ Pass</span>' : '');
function playMenu() {
  const n = dayNumber(), dv = dailyVenue(n), done = S.daily.days[n], first = firstVisit();
  const sv = CALENDAR[(S.season.round - 1) % CALENDAR.length], seasonOver = S.season.round > CALENDAR.length;
  const lr = S.lastRace && venueById(S.lastRace.venue), nAc = doneCount(S);
  const newcomer = first && !S.stats.starts && !nAc;
  const item = (go, icon, title, sub) => `<button type="button" class="pm-i${passLocked(go) ? ' locked' : ''}" data-go="${go}"><i aria-hidden="true">${icon}</i><span><b>${title}</b><small>${sub}</small></span>${star(go)}</button>`;
  const sh = show(`<div class="pm">
    <div class="pm-head"><button class="link" data-go="home" type="button">‹ Back</button><h2>Play</h2></div>
    ${newcomer ? `<p class="lede">New to the pit wall? Start with one of these.</p>
      <div class="ways">
        <button type="button" data-go="academy" class="way rec"><b>🎓 Racing Academy</b><span>Learn the pit wall in five short lessons. Best if you're new.</span></button>
        <button type="button" data-go="just" class="way"><b>🏁 Jump into a race</b><span>A short race at Sakhir with the coach beside you.</span></button>
        <button type="button" data-go="practice" class="way"><b>🔧 Free practice</b><span>No points, no pressure. Try every call.</span></button>
      </div>
      <p class="small"><button type="button" class="link" data-go="build">Build my team first</button> · name your team and drivers, pick a car and colours</p>
      <h3 class="pm-sub">Every way to race</h3>` : ''}
    <div class="pm-list">
      ${item('daily', '🗓', `Daily Challenge #${n}`, done ? `${dv.flag} ${esc(dv.city)} · you finished P${done.best}. Race it again for fun.` : `${dv.flag} ${esc(dv.city)} · the same race for everyone today. Always free.`)}
      ${item('quick', '🏁', 'New race', lr ? `Any of ${VENUES.length} circuits. Last time: ${lr.flag} ${esc(lr.city)}.` : `Pick any of ${VENUES.length} circuits.`)}
      ${item('season', '🏆', 'Season and career', seasonOver ? 'Season over. See the final standings.' : `Season ${S.season.no}, round ${S.season.round} of ${CALENDAR.length}: ${sv.flag} ${esc(sv.city)}`)}
      ${item('live', '📡', 'Live Grand Prix', 'Up to ten teams of real people on one grid. A race every five minutes.')}
      ${item('dailyfull', '⏱', 'Full distance', 'Today’s Daily over a whole Grand Prix.')}
      ${item('academy', '🎓', 'Racing Academy', `Five short lessons${nAc ? ` · ${nAc} of ${LESSONS.length} done` : ''}. Free.`)}
      ${item('practice', '🔧', 'Free practice', 'No points, no pressure. Free.')}
      ${item('team', '💾', first ? 'Build my team' : 'My team', first ? 'Name your team, pick a car and colours.' : `${esc(team().name)} · ${S.stats.starts} starts, ${S.stats.wins} wins`)}
      ${item('agent', '🤖', 'My agent', 'Your agent races the Dailies you miss, and talks to you on WhatsApp.')}
      ${item('board', '📊', 'Leaderboard', 'Today’s board and the weekly Sora prizes.')}
      ${item('watch', '📺', 'Watch a race', 'Sit back and watch the field.')}
      ${item('account', '👤', 'Profile', signedIn() ? 'Your account and Sora wallet' : 'Sign in so your team follows you')}
      ${item('pass', '★', 'Anti-Bot Pass', account.pass.active ? 'Active: you are a verified human' : 'Verified human, every mode, for a year')}
      ${item('settings', '⚙️', 'Settings', 'Sound, the engineer, the coach and language')}
    </div></div>`, 'pmenu');
  sh.onclick = homeClick;
}

// The Anti-Bot Pass: a subscription, yearly at launch (shown as about $0.50 a month); cancel any time on Stripe's page.
// o.want: the mode they tried to open. Until payments open (sell is false) everything stays free.
const PASS_WANT = { quick: 'New races', season: 'The Championship', live: 'Live Grand Prix', dailyfull: 'Full distance', again: 'Race again' };
function passSheet(back, o = {}) {
  const P_ = account.pass, pr = P_.price || { monthly: '0.50', yearly: '5.99' };
  const until = P_.active && P_.until ? new Date(P_.until).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const sh = show(`<div class="pass">
    <span class="pass-chip">★ Anti-Bot Pass</span>
    <h2>${P_.active ? 'You’re a verified human' : o.want && PASS_WANT[o.want] ? `${PASS_WANT[o.want]} come with the pass` : 'Unlock everything'}</h2>
    <p class="lede">Real people on the pit wall. A small pass keeps bots off the grid and the prize table fair.</p>
    <ul class="pass-list">
      <li>✓ A <b>verified human</b> badge on the leaderboards</li>
      <li>✓ New races on all ${VENUES.length} circuits</li>
      <li>✓ The full Championship season</li>
      <li>✓ Live Grand Prix against people</li>
      <li>✓ Full-distance races</li>
      <li>✓ A share of the weekly Sora prize pot</li>
    </ul>
    <p class="pass-free">Always free: the Daily Grand Prix, and your agent races the Dailies you miss.</p>
    ${P_.active ? `<p class="pass-on">${P_.renews ? 'Renews on' : 'Active until'} <b>${esc(until)}</b>. Thank you for racing.</p>
      ${P_.manage ? '<button class="btn ghost wide" data-p="manage" type="button">Manage or cancel</button>' : ''}`
      : P_.sell ? `<div class="pass-price"><b>$${esc(pr.monthly)}</b><span>per month</span></div>
      <button class="btn big wide pass-buy" data-p="buy" type="button">Unlock everything</button>
      <p class="small pass-fine">Billed $${esc(pr.yearly)} a year. Renews each year; cancel any time. Secure checkout by Stripe.</p>`
      : '<p class="note"><b>The pass opens very soon.</b> Until then every mode is free.</p>'}
    <p class="ac-err" role="alert" hidden></p>
    <div class="actions"><button class="btn ghost" data-p="back" type="button">${P_.active || !P_.sell ? 'Back' : 'Not now'}</button></div></div>`, 'passsheet');
  sh.onclick = async (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    if (b.dataset.p === 'back') return back();
    if (!signedIn()) return accountSheet(back, { gate: true, then: () => passSheet(back, o) });
    const label = b.textContent; b.disabled = true; b.textContent = 'Opening Stripe…';
    const r = b.dataset.p === 'manage' ? await passManage() : await passCheckout();
    if (!r.ok) { b.disabled = false; b.textContent = label; const er = sh.querySelector('.ac-err'); er.textContent = r.error; er.hidden = false; }
  };
}
// back from Stripe: the webhook can land a moment after the page, so ask again a few times
async function passBack(ok) {
  history.replaceState(null, '', location.pathname);
  if (!ok) return toast('Checkout cancelled. Nothing was charged.');
  for (let i = 0; i < 6 && !account.pass.active; i++) { await refreshPass(); if (!account.pass.active) await new Promise((r) => setTimeout(r, 2000)); }
  toast(account.pass.active ? '★ Welcome, verified human. Every mode is open.' : 'Payment received. Your pass turns on in a minute or two.');
  if (G.attract) passSheet(home);
}

// Support and the fair-play rules, in plain words
function rulesSheet(back) {
  const sh = show(`<h2>Support &amp; rules</h2>
    <p class="lede">Agent Grand Prix is a strategy game: your AI drivers drive, you make the calls.</p>
    <ul class="help">
      <li><b>One person, one team.</b> Race with your own account. Bots and scripts that play for you are not allowed.</li>
      <li><b>The Daily.</b> Your first run of each day is the one that counts on the leaderboard. Your agent can race it for you if you miss it.</li>
      <li><b>Weekly prizes.</b> The week's Daily points add up. The top ten people share the Sora pot. Sora is game currency: it is earned, never bought, and can't be cashed out.</li>
      <li><b>The Anti-Bot Pass.</b> A yearly subscription that renews each year. Cancel any time from My account; the pass runs to the end of the year you paid for.</li>
      <li><b>Be kind.</b> Team names and messages must not be rude or pretend to be someone else.</li>
    </ul>
    <p>Need help? Email <a href="mailto:hello@agentgrandprix.com">hello@agentgrandprix.com</a>.</p>
    <p class="small"><a href="terms.html" target="_blank" rel="noopener">Terms</a> · <a href="privacy.html" target="_blank" rel="noopener">Privacy</a> · <a href="credits.html" target="_blank" rel="noopener">Credits</a></p>
    <div class="actions"><button class="btn" id="ruBack" type="button">Got it</button></div>`);
  $('#ruBack').addEventListener('click', back);
}

// Settings: the few things players ask to change, kept on this device
function settingsSheet(back) {
  const sw = (k, on, label, note) => `<div class="set-row"><span><b>${label}</b><small>${note}</small></span><button type="button" class="switch" role="switch" aria-checked="${on}" data-s="${k}" aria-label="${label}"></button></div>`;
  const draw = () => {
    const sh = show(`<h2>Settings</h2>
      ${sw('sound', S.settings.sound !== false, 'Sound', 'Engines, the crowd and the radio')}
      ${sw('voice', S.settings.voice !== false, 'Engineer’s voice', 'Your race engineer speaks the calls')}
      ${sw('coach', S.settings.coach !== false, 'Race coach', 'Tips during your first races and quick races')}
      <div class="set-row"><span><b>Language</b><small>English, Français, Español, Português, العربية, Naijá</small></span>${langPicker(true)}</div>
      ${installItem(true)}
      <div class="actions"><button class="btn" id="seBack" type="button">Done</button></div>`);
    sh.onclick = (e) => {
      if (e.target.closest('[data-go="install"]')) return doInstall(() => settingsSheet(back));
      const b = e.target.closest('[data-s]'); if (!b) return;
      const k = b.dataset.s, on = b.getAttribute('aria-checked') !== 'true';
      if (k === 'sound') S.settings.sound = on;
      if (k === 'voice') S.settings.voice = on ? undefined : false;
      if (k === 'coach') S.settings.coach = on ? undefined : false;
      store.save(); draw();
    };
    sh.onchange = langChange;
    $('#seBack').addEventListener('click', back);
  };
  draw();
}

// Languages (js/i18n.js): the picker saves the choice and reloads the page in that language. Each
// language's name is written in itself, so the picker is never translated.
function langPicker(bare) {
  const sel = `<select class="lang" aria-label="Language" translate="no">${LANGS.map(([k, n]) => `<option value="${k}"${LANG === k ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
  return bare ? sel : `<label class="nb-lang"><i aria-hidden="true">🌐</i>${sel}</label>`;
}
function langChange(e) { if (!e.target.matches('select.lang')) return; S.settings.lang = e.target.value; store.save(); setLang(e.target.value); }
// the first visit in a language we picked from the player's country: one tap back to English
function langNote() {
  if (!langGuessed || G.langNoted) return '';
  return `<div class="lang-note" translate="no"><span>🌐 ${LANGS.find(([k]) => k === LANG)[1]}</span><button type="button" data-go="lang:en">English</button><button type="button" data-go="lang:keep" aria-label="OK">✓</button></div>`;
}

// Join us: the community channels, greyed out until they open
const SOCIAL = [
  ['Telegram', '#2aabee', '<path d="M4 11.5 19 5.5l-2.6 13-4.6-3.6-2.4 2.3.3-3.6 6.6-6-8.3 5z" fill="#fff"/>'],
  ['Discord', '#5865f2', '<path d="M7 8.2c3-1.4 7-1.4 10 0 1 2 1.6 4.2 1.4 7-1.2.9-2.4 1.4-3.6 1.7l-.8-1.3c-2.6.8-4.4.8-7 0l-.8 1.3c-1.2-.3-2.4-.8-3.6-1.7-.2-2.8.4-5 1.4-7z" fill="#fff"/><circle cx="9.6" cy="12.4" r="1.2" fill="#5865f2"/><circle cx="14.4" cy="12.4" r="1.2" fill="#5865f2"/>'],
  ['TikTok', '#111', '<path d="M13.5 4.5c.4 2 1.7 3.3 3.7 3.5v2.4c-1.4 0-2.6-.4-3.7-1.1v5.2a4.3 4.3 0 1 1-4.3-4.3h.5v2.5h-.5a1.8 1.8 0 1 0 1.8 1.8V4.5z" fill="#fff"/>'],
  ['YouTube', '#ff0033', '<rect x="4.5" y="7" width="15" height="10" rx="3" fill="#fff"/><path d="m10.5 9.8 4 2.2-4 2.2z" fill="#ff0033"/>'],
  ['Instagram', '#d62976', '<rect x="6" y="6" width="12" height="12" rx="3.5" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="15.3" cy="8.7" r=".9" fill="#fff"/>'],
];
// Connect your AI agent: the heart of the game. Your race engineer on WhatsApp follows the race and
// texts you the big calls, so a 50-lap Grand Prix doesn't need you glued to the screen.
// Telegram and your own bot come next, for players who can't use WhatsApp.
const WA_ICON = '<path d="M12 4.2a7.8 7.8 0 0 0-6.7 11.8L4.2 19.8l3.9-1a7.8 7.8 0 1 0 3.9-14.6z" fill="#fff"/><path d="M9.4 8.3c.2-.4.4-.4.6-.4h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.5l-.4.5c-.1.1-.2.3 0 .5.5.8 1.1 1.4 2 1.9.2.1.4.1.5 0l.6-.7c.1-.2.3-.2.5-.1l1.6.8c.2.1.3.2.3.4 0 .6-.3 1.2-.8 1.5-.6.3-1.4.4-2.3 0-1.7-.7-3-1.9-3.9-3.4-.6-1.1-.6-2 .1-2.6z" fill="#1267f4"/>';
function agentCard(where = 'out') {
  const on = wa.linked;
  return `<div class="ag ${where}"><h3>Connect your AI agent</h3>
    <p>${on ? `${esc(aName())} is on your pit wall: it follows every race and texts you the big calls.` : 'Your race engineer on WhatsApp. It follows your race and texts you the big calls, so a 50-lap Grand Prix runs while you live your life.'}</p>
    <div class="ag-row"><button type="button" class="ag-wa${on ? ' on' : ''}" data-go="agent"><i><svg viewBox="0 0 24 24" aria-hidden="true">${WA_ICON}</svg></i><span><b>${on ? 'WhatsApp connected' : 'Connect WhatsApp'}</b><small>${on ? `✓ ${esc(aName())} is linked` : 'takes one minute'}</small></span></button>
      <span class="ag-soon" title="Coming soon"><i style="--c:#2aabee"><svg viewBox="0 0 24 24" aria-hidden="true">${SOCIAL[0][2]}</svg></i><span><b>Telegram</b><small>coming soon</small></span></span>
      <span class="ag-soon" title="Coming soon"><i style="--c:#1d1f24"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="8" width="12" height="9" rx="3" fill="#fff"/><circle cx="10" cy="12.5" r="1.2" fill="#1d1f24"/><circle cx="14" cy="12.5" r="1.2" fill="#1d1f24"/><path d="M12 5v3" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg></i><span><b>Your own bot</b><small>coming soon</small></span></span></div></div>`;
}
// Jisste: the one social network where every game's AI agents (and players) talk; the paddock news is there. /jisste is
// redirected to its address by the web server (server/install.sh), so the game needn't know it.
function joinUs(where = 'out') {
  return `<div class="join ${where}" aria-label="Join us"><h3>Join us</h3>
    <a class="novo" href="/jisste" target="_blank" rel="noopener"><b>jisste<em>.</em></b><span>race reports and agent talk, live now</span><i aria-hidden="true">↗</i></a>
    <p>player chats and race videos: coming soon</p>
    <div class="join-i">${SOCIAL.map(([n, c, g]) => `<span title="${n}: coming soon"><i style="--c:${c}"><svg viewBox="0 0 24 24" aria-hidden="true">${g}</svg></i>${n}</span>`).join('')}</div></div>`;
}

// Installing the game as an app: Chrome and Edge (desktop and Android) offer a real install prompt;
// iPhone and iPad have no prompt, so they get the three taps for Add to Home Screen.
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (G.attract && /\bnbhome\b/.test($('#screen').className) && !$('#screen').hidden) home(); });
addEventListener('appinstalled', () => { installEvt = null; toast('Installed. Agent Grand Prix is on your home screen.'); });
const standalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
function installItem(row) {
  if (standalone() || !(installEvt || isIOS)) return '';
  return row ? '<div class="set-row"><span><b>Install the app</b><small>Opens full screen from your home screen</small></span><button class="btn ghost" data-go="install" type="button">Install</button></div>'
    : '<button data-go="install" type="button" class="nb-install"><i aria-hidden="true">📲</i>Install the app</button>';
}
async function doInstall(back, kind = isIOS ? 'ios' : /Android/.test(navigator.userAgent) ? 'android' : 'desk') {
  if (installEvt && kind !== 'ios') { const ev = installEvt; ev.prompt(); const r = await ev.userChoice.catch(() => ({})); installEvt = null; if (r.outcome !== 'accepted') toast('No problem. You can install it any time from the menu.'); return back(); }
  const how = {
    ios: ['Add to your Home Screen', 'On iPhone and iPad, open agentgrandprix.com in <b>Safari</b>, then:', ['Tap the <b>Share</b> button <span class="ios-share" aria-hidden="true">⬆︎</span> (bottom of the screen; top on iPad).', 'Scroll down and tap <b>Add to Home Screen</b>.', 'Tap <b>Add</b>. The game’s icon is now on your Home Screen.']],
    android: ['Install on Android', 'Open agentgrandprix.com in <b>Chrome</b>, then:', ['Tap the <b>⋮</b> menu at the top right.', 'Tap <b>Install app</b> (or <b>Add to Home screen</b>).', 'Tap <b>Install</b>. The game opens full screen from its icon.']],
    desk: ['Install on your computer', 'Open agentgrandprix.com in <b>Chrome</b> or <b>Edge</b>, then:', ['Click the <b>install</b> icon at the right end of the address bar (a screen with a down arrow).', 'Or open the browser menu and choose <b>Install Agent Grand Prix</b> (Edge: Apps › Install).', 'Click <b>Install</b>. The game gets its own window and a shortcut.']],
  }[kind] || [];
  const sh = show(`<h2>${how[0]}</h2><p class="lede">${how[1]}</p>
    <ol class="ios-steps">${how[2].map((x) => `<li>${x}</li>`).join('')}</ol>
    <div class="actions"><button class="btn" id="iosOk" type="button">Got it</button></div>`);
  $('#iosOk').addEventListener('click', back);
  return sh;
}
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});

// the loading screen in index.html: it runs on its own until the first home screen is ready
function bootDone() { const b = document.getElementById('boot'); if (!b || b.dataset.done) return; b.dataset.done = '1'; window.__bootDone?.(); }
// your team on the home page: both drivers' faces, and the last race with its report
function teamStrip() {
  const t = team(), r = S.lastReport, ago = r ? Math.round((Date.now() - r.at) / 864e5) : 0;
  const my = r ? r.rows.filter((x) => r.mine.includes(x.id)) : [];
  return `<div class="tstrip"><div class="ts-team">${t.drivers.map((d, i) => `<button class="pbtn" data-go="driver:car${i + 1}" type="button" title="${esc(d.name)}: career">${portraitSVG(d, t, { size: 48 })}</button>`).join('')}<div><b>${esc(t.name)}</b><span>${t.drivers.map((d) => esc(d.name)).join(' and ')}</span></div></div>
    ${r ? `<div class="ts-last"><span>Last race${ago ? ` · ${ago === 1 ? 'yesterday' : ago + ' days ago'}` : ''}</span><b>${r.venue.flag} ${esc(r.venue.city)} · ${my.map((x) => `${esc(x.d.code)} ${x.dnf ? 'DNF' : 'P' + x.pos}`).join(' · ')}</b></div>
      <button class="btn ghost" data-go="report" type="button">Race report</button>` : '<div class="ts-last"><span>No races yet</span><b>Your first result will show here.</b></div>'}
    <button class="btn ghost" data-go="team" type="button">Edit team</button></div>`;
}
// the championship at a glance: the top three drivers, and where your team stands
function standingsPeek() {
  const done = S.season.round - 1; if (!done) return '';
  const all = [];
  TEAMS.forEach((t, ti) => t.drivers.forEach((d, i) => all.push({ id: `${t.id}-${i}`, d: { ...d, num: TAKEN_NUMS[ti * 2 + i] }, tm: t })));
  team().drivers.forEach((d, i) => all.push({ id: `you-${i}`, d, tm: team(), you: true }));
  all.forEach((x) => (x.pts = S.season.pts[x.id] || 0)); all.sort((a, b) => b.pts - a.pts);
  const teams = Object.entries(S.season.teamPts).sort((a, b) => b[1] - a[1]), tp = teams.findIndex(([k]) => k === 'you') + 1;
  return `<div class="peek">${all.slice(0, 3).map((x, i) => `<span class="${x.you ? 'mine' : ''}">${portraitSVG(x.d, x.tm, { size: 26, bg: false })}<b>${i + 1}</b> ${esc(x.d.code)} <em>${x.pts}</em></span>`).join('')}</div>
    <p class="small">Your team: P${tp || teams.length + 1} of ${TEAMS.length + 1} teams after ${done} round${done > 1 ? 's' : ''}.</p>`;
}
// Watch a race: the menu steps aside and the live race behind it fills the screen
function watchRace() {
  hide();
  let b = $('#watchBack');
  if (!b) { b = document.createElement('button'); b.id = 'watchBack'; b.type = 'button'; b.className = 'chip watch-back'; b.textContent = '← Menu'; b.addEventListener('click', () => { b.hidden = true; home(); }); app.appendChild(b); }
  b.hidden = false;
}
// the last race's report, from the home page
function reportSheet(rep, back, tab = 'result') {
  const r = reportHTML(rep, tab);
  const sh = show(`<div class="sub">${r.title}</div><h2>Race report</h2><p class="lede">${r.mine}</p>${r.tabs}<div class="rbody">${r.body}</div>
    <div class="actions"><button class="btn" data-x="share" type="button">Share result</button><button class="btn ghost" data-x="back" type="button">Back</button></div>`, 'report');
  sh.onclick = (e) => {
    const t = e.target.closest('[data-rt]'); if (t) return reportSheet(rep, back, t.dataset.rt);
    const b = e.target.closest('[data-x]'); if (!b) return;
    if (b.dataset.x === 'share') shareSheet(shareText(rep, location.origin + location.pathname), () => reportSheet(rep, back, tab));
    if (b.dataset.x === 'back') back();
  };
}
// ---------- your agent while you're away (js/agent.js) ----------
// On opening the game, any Daily you missed (past your cover time, up to a week back) is raced by
// your agent in a Web Worker, with your team, car and Driver DNA. Its results keep your streak and
// are marked as the agent's. Only after you have a team, and never for days before the agent started.
let agentWorker = null;
function agentCatchUp() {
  if (firstVisit()) return;
  const today = dayNumber();
  S.agent ||= { since: today, playbook: {}, reports: [], unseen: [] };
  const due = dueDailies(S, today);
  if (!due.length || G.agentBusy) return;
  G.agentBusy = true;
  agentWorker ||= new Worker(new URL('./agent.worker.js', import.meta.url), { type: 'module' });
  const next = () => {
    const n = due.shift(); if (n == null) { G.agentBusy = false; if (G.attract && !$('#screen').hidden && $('#sheet .brand')) home(); return; }
    const v = dailyVenue(n);
    agentWorker.onmessage = (e) => {
      const { out } = e.data;
      if (out && !S.daily.days[n]) {
        S.daily.days[n] = { best: out.best, pts: out.pts, agent: true, share: shareText(out.report, location.origin + location.pathname) + '\n🤖 raced by my agent' };
        S.daily.streak = S.daily.last === n - 1 ? S.daily.streak + 1 : 1; S.daily.last = Math.max(S.daily.last || 0, n);
        S.agent.reports = [{ n, at: Date.now(), report: out.report, places: out.places, pts: out.pts }, ...S.agent.reports.filter((x) => x.n !== n)].slice(0, 7);
        S.agent.unseen = [...new Set([...(S.agent.unseen || []), n])];
        store.save();
        sendToBoard(n, out.rec, true);          // your agent's race stands on the agents' board
      }
      next();
    };
    agentWorker.postMessage({ id: n, args: { venueId: v.id, seed: hashString('daily-' + n), team: structuredClone(team()), dna: raceDNA(S, dnaOn), car: carModel() || 'falcon', laps: raceLaps(trackFor(v), 'short'), playbook: playbookOf(S), label: `Daily #${n} · raced by your agent` } });
  };
  next();
}
// on the home page: what your agent did while you were away
function awayCard() {
  const A = S.agent; if (!A || !A.unseen || !A.unseen.length) return '';
  const list = A.reports.filter((r) => A.unseen.includes(r.n)).sort((a, b) => a.n - b.n);
  if (!list.length) return '';
  const t = team();
  return `<div class="hc away"><span class="k">🤖 While you were away</span><h3>Your agent raced ${list.length === 1 ? "the Daily" : list.length + ' Dailies'}</h3>
    <ul class="away-list">${list.map((r) => `<li><span>${r.report.venue.flag} ${esc(r.report.venue.city)} · Daily #${r.n}</span><b>${t.drivers.map((d, k) => `${esc(d.code || d.name)} ${r.places[k] ? 'P' + r.places[k] : 'DNF'}`).join(' · ')}</b><em>+${r.pts} pts</em><button class="btn ghost" data-go="ar:${r.n}" type="button">Report</button></li>`).join('')}</ul>
    <div class="row"><button class="btn" data-go="awayok" type="button">Got it</button><button class="btn ghost" data-go="agent" type="button">Agent settings</button></div></div>`;
}
// My agent: the playbook your agent follows, and its recent races
function agentSheet(back) {
  S.agent ||= { since: dayNumber(), playbook: {}, reports: [], unseen: [] };
  const pb = playbookOf(S), n = dayNumber(), nv = dailyVenue(S.daily.days[n] ? n + 1 : n);
  const row = (key, title) => `<div class="sub">${title}</div><div class="vpick pb">${PLAYBOOK_CHOICES[key].map(([v, name, note]) => `<button type="button" data-pb="${key}" data-v="${v}" class="${pb[key] === v ? 'on' : ''}"><b>${name}</b><span>${note}</span></button>`).join('')}</div>`;
  const sh = show(`<button type="button" class="sh-x" id="pbX" aria-label="Close">×</button><h2>My agent</h2>
    ${account.on ? '<div class="wa-link"></div>' : ''}
    <div class="sub">Missed Dailies</div>
    <p class="lede">Busy? If you haven't raced the Daily Grand Prix by your cover time, your agent races it for you on Autonomous, with your team, car and Driver DNA, and writes the report. It keeps your streak; its results are marked as the agent's. It can't change your Driver DNA or enter other races.</p>
    <label class="switch-row"><input type="checkbox" id="pbOn" ${pb.on ? 'checked' : ''}><span><b>Race my missed Dailies</b><small>Next: ${nv.flag} ${esc(nv.city)}, at ${pb.cover}:00 your time if you haven't raced it.</small></span></label>
    <div class="sub">Cover time</div><div class="vpick pbt">${[18, 19, 20, 21, 22, 23].map((h) => `<button type="button" data-pb="cover" data-v="${h}" class="${pb.cover === h ? 'on' : ''}"><b>${h}:00</b></button>`).join('')}</div>
    ${row('pit', 'Pit stops')}${row('rain', 'When it rains')}${row('orders', 'Team orders')}${row('risk', 'Risk')}
    ${S.agent.reports.length ? `<div class="sub">Recent agent races</div><ul class="away-list">${S.agent.reports.map((r) => `<li><span>${r.report.venue.flag} ${esc(r.report.venue.city)} · Daily #${r.n}</span><b>${r.places.map((p) => (p ? 'P' + p : 'DNF')).join(' · ')}</b><em>+${r.pts} pts</em><button class="btn ghost" data-ar="${r.n}" type="button">Report</button></li>`).join('')}</ul>` : ''}
    <div class="actions"><button class="btn" id="pbDone" type="button">Done</button></div>`);
  const set = (k, v) => { S.agent.playbook = { ...S.agent.playbook, [k]: v }; store.save(); };
  waPanel($('.wa-link', sh));
  $('#pbOn').addEventListener('change', (e) => set('on', e.target.checked));
  sh.onclick = (e) => {
    const b = e.target.closest('[data-pb]');
    if (b) { const k = b.dataset.pb; set(k, k === 'cover' ? +b.dataset.v : b.dataset.v); $$(`[data-pb="${k}"]`, sh).forEach((x) => x.classList.toggle('on', x === b)); return; }
    const a = e.target.closest('[data-ar]'); if (a) { const r = S.agent.reports.find((x) => String(x.n) === a.dataset.ar); if (r) reportSheet(r.report, () => agentSheet(back)); }
    if (e.target.closest('#pbDone, #pbX')) { back(); agentCatchUp(); }
  };
}
// Connect your AI agent on WhatsApp: a short code you text to it once, then it follows every race
// you run on this account
function waPanel(box, code = null, edit = false) {
  if (!box) return;
  const state = () => JSON.stringify([wa.linked, wa.own]);
  box.dataset.k = state();
  const open = (txt) => wa.wa ? `https://wa.me/${wa.wa}${txt ? '?text=' + encodeURIComponent(txt) : ''}` : null;
  const form = (again) => `<form class="wa-form" autocomplete="off">
      <label><span>Your agent's name</span><input name="name" maxlength="24" required placeholder="Michael, Coach, Sparky…" value="${esc(wa.own ? wa.own.name : '')}"></label>
      <label><span>Its API key</span><input name="token" type="password" required spellcheck="false" autocapitalize="off" placeholder="Paste the key from WhatsApp"></label>
      <div class="actions"><button class="btn" type="submit">${again ? 'Save the new key' : 'Connect my agent'}</button>${again ? '<button class="btn ghost" type="button" data-wa="cancel">Cancel</button>' : ''}</div>
      <p class="note wa-err" hidden></p>
      <p class="note">🔒 The key stays on our server and is only used to run your agent. Don't share it anywhere else.</p></form>`;
  if (wa.own && !edit) {
    const n = esc(wa.own.name);
    box.innerHTML = `<div class="wa-card on"><b>✅ ${n} is your agent</b>
      ${wa.own.chatted ? `<p>${n} follows every race you start here, on any device signed in to this account. When you hand the team to your agents, ${n} texts you the big calls with a pick and a deadline; in Team Principal mode it stays quiet apart from race control.</p>`
        : `<p><b>Last step:</b> open ${n}'s chat in WhatsApp and say hi. ${n} links itself to your team and follows your races from then on.</p>`}
      <p class="small">📖 Send it <b>box</b>, <b>push</b> or <b>defend</b> in a race, or ask about any racing word (“what is an undercut?”). Every word is in the <a href="wiki" target="_blank" rel="noopener">racing wiki</a>.</p>
      <form class="wa-rename"><label><span>Rename</span><input name="name" maxlength="24" value="${n}"></label><button class="btn ghost" type="submit">Save</button></form>
      <div class="actions"><button class="btn ghost" type="button" data-wa="key">New API key</button><button class="btn ghost" type="button" data-wa="remove">Remove</button></div></div>`;
  } else if (wa.own && edit) {
    box.innerHTML = `<div class="wa-card"><b>New API key for ${esc(wa.own.name)}</b>${form(true)}</div>`;
  } else if (wa.linked) {
    box.innerHTML = `<div class="wa-card on"><b>✅ ${esc(aName())} is connected on WhatsApp</b>
      <p>${esc(aName())} follows every race you start here, on any device signed in to this account. When you hand the team to your agents, ${esc(aName())} texts you the big calls with a pick and a deadline; in Team Principal mode it stays quiet apart from race control.</p>
      <div class="actions"><button class="btn ghost" type="button" data-wa="off">Disconnect</button></div></div>`;
  } else if (code) {
    const link = open('link ' + code);
    box.innerHTML = `<div class="wa-card"><b>Send this to your agent on WhatsApp</b>
      <div class="wa-code">link ${esc(code)}</div>
      <p>Open your agent's chat and send the line above. The code works for 30 minutes. This page updates by itself once it's linked.</p>
      <div class="actions">${link ? `<a class="btn" href="${link}" target="_blank" rel="noopener">Open WhatsApp</a>` : ''}<button class="btn ghost" type="button" data-wa="copy">Copy</button></div></div>`;
    const t = setInterval(async () => { if (!box.isConnected) return clearInterval(t); await agentStatus(); if (wa.linked) { clearInterval(t); toast(`📱 ${aName()} is connected`); waPanel(box); } }, 3000);
  } else {
    // no agent yet: make one in WhatsApp, name it anything, paste its key here
    box.innerHTML = `<div class="wa-card"><b>📱 Create your own AI agent</b>
      <p>Your race engineer lives in WhatsApp. You make it, you name it, and it follows every race you run here. It takes about two minutes.</p>
      <button type="button" class="btn ghost wa-watch" data-wa="video">▶ Watch how (45 s)</button>
      <div class="wa-video" hidden></div>
      <ol class="wa-steps">
        <li>Open <b>WhatsApp</b>, go to <b>Settings › Agents › Create an agent</b>.</li>
        <li>Give it any name you like and a picture. It's yours.</li>
        <li>Open your agent's chat, tap its name, then <b>API key</b>. Copy the key.</li>
        <li>Paste the name and key below and tap <b>Connect my agent</b>.</li>
        <li>Say hi to your agent in WhatsApp. It links itself to your team.</li>
      </ol>
      ${form(false)}
      <p class="note">No <b>Agents</b> in your WhatsApp settings? WhatsApp is still rolling agents out, so they aren't on every phone or in every country yet. Update WhatsApp and look again soon; Telegram and other ways are coming.</p></div>`;
  }
  box.onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, err = f.querySelector('.wa-err'), btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    if (f.classList.contains('wa-rename')) {
      const r = await fetch('/api/me/agent/own', { method: 'PATCH', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: f.name.value }) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      btn.disabled = false;
      if (r) { wa.own.name = wa.name = r.name; toast(`Your agent is now ${r.name}`); waPanel(box); } else toast('Could not save the name. Try again in a moment.');
      return;
    }
    const r = await fetch('/api/me/agent/own', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: f.name.value, token: f.token.value.trim() }) }).then((x) => x.json().catch(() => ({}))).catch(() => ({ error: 'Could not reach the server. Try again in a moment.' }));
    btn.disabled = false;
    if (r && r.ok) { await agentStatus(); toast(`📱 ${r.name} is connected. Say hi to it in WhatsApp.`); waPanel(box); }
    else if (err) { err.hidden = false; err.textContent = (r && r.error) || 'That did not work. Try again in a moment.'; }
  };
  box.onclick = async (e) => {
    const b = e.target.closest('[data-wa]'); if (!b) return;
    if (b.dataset.wa === 'video') {
      // the how-to film (assets/video, made from a scripted HTML timeline): loaded only when asked for
      const v = box.querySelector('.wa-video');
      if (!v.firstChild) v.innerHTML = '<video src="/assets/video/create-your-agent.mp4" poster="/assets/video/create-your-agent.jpg" controls playsinline preload="metadata"></video>';
      v.hidden = !v.hidden; b.textContent = v.hidden ? '▶ Watch how (45 s)' : '✕ Hide the video';
      const vid = v.querySelector('video'); if (v.hidden) vid.pause(); else vid.play().catch(() => {});
    }
    if (b.dataset.wa === 'key') waPanel(box, null, true);
    if (b.dataset.wa === 'cancel') waPanel(box);
    if (b.dataset.wa === 'remove') { if (!confirm(`Remove ${aName()}? It stops following your races here. You can connect it again with its key.`)) return; await fetch('/api/me/agent/own', { method: 'DELETE', credentials: 'same-origin' }).catch(() => null); await agentStatus(); waPanel(box); }
    if (b.dataset.wa === 'copy') { try { await navigator.clipboard.writeText('link ' + code); toast('Copied'); } catch (err) { toast('link ' + code); } }
    if (b.dataset.wa === 'off') { await fetch('/api/me/agent', { method: 'DELETE', credentials: 'same-origin' }).catch(() => null); wa.linked = false; waPanel(box); }
  };
  if (!code && !edit) agentStatus().then(() => { if (box.isConnected && !box.querySelector('.wa-code, .wa-form input:focus') && box.dataset.k !== state()) waPanel(box); });
}
// ---------- Live Grand Prix (js/live.js, server/live.mjs): up to ten teams on one grid ----------
// Every browser runs the whole race; the room only seats people and gives every call the engine step
// it lands on. So in a live race the clock is the room's: the race runs at real speed from the room's
// start time, catching up after a slow frame, and your calls go to the room and come back to every
// browser, yours included, to be applied at the same step. A call that arrives late (a dropped
// connection) means the race is built again from the start with every call, in a blink.
function liveLobby(back) {
  if (passLocked('live')) return passSheet(back, { want: 'live' });
  const t = team();
  const sh = show(`<div class="sub">Live Grand Prix</div><h2>Ten teams, one grid</h2>
    <p class="lede">Race people, not just the field: up to ten teams on one grid, everyone making their own calls at the same time. A race starts every five minutes; open seats are raced by the series teams.</p>
    <div class="lbody"><p class="note">Finding the next race…</p></div>
    <div class="actions"><button class="btn" data-l="join" type="button" disabled>Take a seat</button><button class="btn ghost" data-l="back" type="button">Back</button></div>`, 'live');
  const body = $('.lbody', sh), joinB = $('[data-l="join"]', sh);
  let room = null, timer = 0;
  const draw = () => {
    if (!body.isConnected) { clearInterval(timer); return; }
    if (!room) return;
    const v = venueById(room.venue), secs = secondsToStart(room);
    body.innerHTML = `<div class="facts"><div><small>Circuit</small><b>${v.flag} ${esc(v.city)}</b></div><div><small>Lights out</small><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b></div>
      <div><small>Teams</small><b>${room.taken} of ${room.seats_total}</b></div><div><small>Laps</small><b>${room.laps}</b></div></div>
      <ol class="seats">${room.seats.map((x, k) => `<li class="${x ? '' : 'open'}${k === room.you ? ' you' : ''}"><i style="background:${x ? esc(x.team.c1 || '#888') : 'transparent'}"></i><span>${x ? esc(x.team.name) : 'Open seat'}</span>${k === room.you ? '<em>You</em>' : x ? `<em>${x.auto ? 'Autonomous' : 'On the radio'}</em>` : ''}</li>`).join('')}</ol>
      <p class="small">${room.you >= 0 ? 'You have a seat. Stay on this page: the race starts by itself when the lights go out.' : `Your ${esc(t.name)} take the next open seat, with your car and Driver DNA.`} Calls in a live race reach the car about a second after you make them.</p>`;
    joinB.hidden = room.you >= 0;
    if (room.you >= 0 && secs <= 0) { clearInterval(timer); stopListening(); liveStart(room); }
  };
  liveOn().then(async (on) => {
    if (!on) { body.innerHTML = '<p class="note">Live races are not running right now. Every other race works as usual.</p>'; return; }
    room = await readRoom(''); if (!room) { body.innerHTML = '<p class="note">Could not reach the race room. Try again in a moment.</p>'; return; }
    joinB.disabled = false; draw();
    timer = setInterval(draw, 1000);
    listenRoom(room.id, { seats: (r) => { room = { ...room, ...r, you: room.you }; draw(); } });
  });
  sh.onclick = async (e) => {
    const b = e.target.closest('[data-l]'); if (!b) return;
    if (b.dataset.l === 'join') {
      b.disabled = true; b.textContent = 'Taking a seat…';
      const r = await joinLive({ team: t, dna: raceDNA(S, dnaOn), car: carModel() || 'falcon', auto: !!S.settings.auto });
      if (!r || r.error) { b.disabled = false; b.textContent = 'Take a seat'; toast(r && r.error === 'the grid is full' ? 'This grid is full. The next race opens in a few minutes.' : 'Could not take a seat. Try again in a moment.'); return; }
      room = { ...room, ...r }; draw(); return;
    }
    clearInterval(timer); stopListening(); back();
  };
}
function liveStart(room) {
  const v = venueById(room.venue);
  G.room = { id: room.id, startAt: room.startAt, me: room.you, calls: (room.cmds || []).slice(), from: { i: 0 }, stale: false };
  Object.assign(G, { kind: 'live', venue: v, seed: room.seed, laps: room.laps, day: null, round: null });
  hide();
  const seats = room.seats;
  G.nextLesson = null;
  startLive({ seats, me: room.you, laps: room.laps, room: room.id, auto: seats[room.you] && seats[room.you].auto });
  listenRoom(room.id, {
    room: (r) => { for (const c of r.cmds || []) addCall(c); },
    call: (c) => addCall(c),
  });
}
// a call from the room, kept in step order; one for a step already raced means the race is rebuilt
function addCall(c) {
  const L = G.room; if (!L) return;
  if (L.calls.some((x) => x[0] === c[0] && x[1] === c[1] && x[2] === c[2] && JSON.stringify(x[3]) === JSON.stringify(c[3]))) return;
  L.calls.push(c); L.calls.sort((a, b) => a[0] - b[0]);
  if (c[0] < L.n) L.stale = true;
}
function startLive(args) {
  startRace({}, !!args.auto, { kind: 'live', live: true, args, cmds: [], n: 0 });
  G.room.n = 0;
  wireLive(G.race);
}
// your calls go to the room; the room's calls (yours included) are applied when they are due
function wireLive(R) {
  const inner = R.command.bind(R);
  R.command = (id, c, from) => {
    if (G.room && !G.room.applying && /^you-[01]$/.test(id)) { sendCall(G.room.id, +id.slice(4), c); return true; }
    return inner(id, c, from);
  };
}
function liveCatchUp() {
  const L = G.room; let R = G.race;
  if (L.stale) {
    // build the same race again from the start with every call, then carry on from where we were
    L.stale = false;
    const at = L.n;
    R = G.race = G.setup.make(); R.start(); wireLive(R); world.setCars(R.cars);
    L.n = 0; L.from = { i: 0 };
    while (L.n < at && !R.done) { L.applying = true; applyDue(R, L.calls, L.n, L.me, L.from); L.applying = false; R.step(); L.n++; }
    G.evIdx = R.events.length;
  }
  const target = stepAt(L);
  let k = 0;
  while (L.n < target && k++ < 400 && !R.done) {
    L.applying = true; applyDue(R, L.calls, L.n, L.me, L.from); L.applying = false; R.step(); L.n++;
    // the running order every ten seconds, the same in every browser (checked by the live tests)
    if (L.n % 200 === 0) { (L.snaps ||= {})[L.n] = R.order.map((c) => c.team.id + '/' + c.code).join(' '); }
  }
  G.acc = 0;
  if (R.done) { stopListening(); }
}

// ---------- the Daily leaderboard (js/board.js, server/leaders.mjs) ----------
// Your scored run is sent as the race itself: the setup and every call. The server replays it with
// the game's own engine and ranks what it finds, so nothing a browser claims about a result is read.
function sendToBoard(day, rec, agent) {
  if (!rec || (rec.kind !== 'daily' && rec.kind !== 'dailyfull')) return;
  submitDaily({ day, team: team().name, agent, rec }).then((r) => {
    if (!r || !r.you) return;
    G.boardLine = r.len === 'full' ? `<p class="lede">Your full-distance race is on today's full-distance board. <button class="btn ghost small" data-r="board" type="button">Leaderboard</button></p>`
      : `<p class="lede">On today's leaderboard you are <b>P${r.you.place}</b> of ${r.you.agent ? r.agents : r.humans} ${r.you.agent ? 'agents' : 'teams'}. <button class="btn ghost small" data-r="board" type="button">Leaderboard</button></p>`;
    if (G.resFor === G.race && !$('#screen').hidden) resultsView();
  });
}
async function boardSheet(day, back, tab = 'human') {
  const v = dailyVenue(day);
  const sh = show(`<div class="sub">Daily #${day} · ${v.flag} ${esc(v.city)}</div><h2>Leaderboard</h2>
    <p class="lede">Today's race is the same for everyone: the same circuit, grid and weather. Every result here was raced, not claimed: the server runs your race again from your own calls before it ranks you.</p>
    <div class="bbody"><p class="note">Reading today's board…</p></div>
    <div class="actions"><button class="btn" data-b="race" type="button">${S.daily.days[day] ? 'Race it again' : "Race today's GP"}</button><button class="btn ghost" data-b="full" type="button">Race the full distance</button><button class="btn ghost" data-b="back" type="button">Back</button></div>`, 'board');
  const body = $('.bbody', sh);
  const draw = async (t, side = 'human') => {
    const html = t === 'week' ? leagueHTML(await fetchWeek(day), day, side, account.pass.sell) : boardHTML(await fetchBoard(day, t === 'full' ? 'full' : 'short'), t);
    if (body.isConnected) body.innerHTML = html;
  };
  draw(tab);
  sh.onclick = (e) => {
    const t = e.target.closest('[data-bt]'); if (t) return draw(t.dataset.bt);
    const w = e.target.closest('[data-bw]'); if (w) return draw('week', w.dataset.bw);
    const b = e.target.closest('[data-b]'); if (!b) return;
    if (b.dataset.b === 'race') return needTeam(() => pre({ kind: 'daily', venue: v, seed: hashString('daily-' + day), day }));
    if (b.dataset.b === 'full') return needTeam(() => pre({ kind: 'dailyfull', venue: v, seed: hashString('daily-' + day), day }));
    back();
  };
}

// ---------- a driver's career (js/career.js) ----------
// What this driver has actually done: the record the race engine kept, the rank that record earned,
// what it is good at, and what it has been taught. Nothing here is a hidden bonus: every lesson you
// approved moved a Driver DNA slider you can still see and change yourself.
function driverSheet(slot, back) {
  const t = team(), k = slot === 'car2' ? 1 : 0, d = t.drivers[k], c = careerState(S)[slot];
  const prof = activeProfiles(S)[slot], r = rankOf(c.xp), nx = nextLesson(S, slot);
  const span = r.next ? Math.max(1, r.next.at - r.at) : 1, done = r.next ? Math.min(1, (c.xp - r.at) / span) : 1;
  const per = (key) => (c.races ? (c[key] / c.races).toFixed(1) : '0.0');
  const good = strengths(c, prof);
  const sh = show(`<div class="sub">${esc(t.name)} · car ${k + 1}</div><h2>${esc(d.name)}</h2>
    <div class="dprof">${portraitSVG(d, t, { size: 76 })}
      <div><b>${esc(r.name)}</b><span>${esc(r.note)}</span>
        <div class="meter"><i style="width:${Math.round(done * 100)}%"></i></div>
        <small>${c.xp} XP${r.next ? ` · ${Math.max(0, r.next.at - c.xp)} more to ${esc(r.next.name)}` : ' · fully experienced'}</small></div></div>
    ${c.races ? `<div class="facts"><div><small>Races</small><b>${c.races}</b></div><div><small>Wins</small><b>${c.wins}</b></div>
      <div><small>Podiums</small><b>${c.podiums}</b></div><div><small>Laps</small><b>${c.laps}</b></div></div>
    <div class="facts"><div><small>Clean races</small><b>${c.clean}</b></div><div><small>Retirements</small><b>${c.dnfs}</b></div>
      <div><small>Wet races</small><b>${c.wet}</b></div><div><small>Circuits</small><b>${c.tracks.length}</b></div></div>
    <div class="sub">Per race</div>
    <ul class="hist"><li><span>Overtakes</span><b>${per('passes')}</b></li><li><span>Overtaken</span><b>${per('lost')}</b></li>
      <li><span>Small mistakes</span><b>${per('mistakes')}</b></li><li><span>Lock-ups</span><b>${per('lockups')}</b></li>
      <li><span>Contacts</span><b>${per('contacts')}</b></li><li><span>Pit stops</span><b>${per('stops')}</b></li></ul>`
    : '<p class="lede">No races yet. Every race this driver starts, with you on the radio or your agent, becomes experience here.</p>'}
    ${good.length ? `<div class="sub">What ${esc(d.name.split(' ')[0])} is good at</div><div class="tro">${good.map((g) => `<span>${esc(g)}</span>`).join('')}</div>` : ''}
    <div class="sub">What this driver has learned</div>
    ${c.learned.length ? `<ul class="hist lrn">${c.learned.map((id) => `<li><span>${esc(LESSON_TITLES[id] || id)}</span><b>learned</b></li>`).join('')}</ul>`
      : '<p class="note">Nothing yet. After a few races the Team Strategist offers a lesson drawn from this driver\'s whole record, not one bad afternoon. You approve it, and it moves a Driver DNA slider.</p>'}
    ${nx ? `<p class="note">Next up: “${esc(nx.title)}”, once ${esc(d.name.split(' ')[0])} ${nx.rank === r.name ? `has ${nx.races} races` : `is a ${esc(nx.rank)} with ${nx.races} races`}.</p>` : ''}
    <div class="actions"><button class="btn" data-dp="dna" type="button">Driver DNA</button>
      <button class="btn ghost" data-dp="other" type="button">${esc(t.drivers[1 - k].name)}</button>
      <button class="btn ghost" data-dp="back" type="button">Back</button></div>`, 'dprofile');
  sh.onclick = (e) => {
    const b = e.target.closest('[data-dp]'); if (!b) return;
    if (b.dataset.dp === 'dna') return studio(() => driverSheet(slot, back), false, { slot });
    if (b.dataset.dp === 'other') return driverSheet(slot === 'car1' ? 'car2' : 'car1', back);
    back();
  };
}
// Sign in, so your team follows you to another device, all on the game's own screen: Google, or a
// 6-digit code by email. The account itself is kept by the shared account service behind the game;
// players only ever see Agent Grand Prix. Signing in keeps what this device has built.
const canSignIn = () => account.signin;   // until Google or email is switched on, the sheet says sign-in opens soon
const signedIn = () => !!(account.me && !account.me.guest);
// top right of the home screen: Sign in, then your team's badge once you're in
function acChip() {
  if (signedIn()) {
    const t = team(), me = account.me;
    return `<button class="ac-chip in" data-go="account" type="button" aria-label="Your account"><i style="--c1:${esc(t.c1 || '#0f8a4a')};--c2:${esc(t.c2 || '#fff')}">${esc(t.short || 'YOU')}</i><span>${esc(firstVisit() ? me.name || 'My account' : t.name)}</span>${account.pass.active ? '<u class="vh" title="Verified human">✓</u>' : ''}</button>`;
  }
  if (!canSignIn()) return '';
  return '<button class="ac-chip" data-go="account" type="button"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="7" r="3.6"/><path d="M3.2 17.4c.9-3.4 3.6-5.2 6.8-5.2s5.9 1.8 6.8 5.2"/></svg><span>Sign in</span></button>';
}
// o.gate: they tried to race, and racing needs an account; o.then runs once they're signed in
// Team memory on the account screen: what your agent and your drivers remember (server/memory.mjs), each line
// forgettable on its own, and Forget me (asked twice) for all of it
async function memoryBox() {
  const r = await fetchMemories(), el = $('#acMem'); if (!el) return;
  const items = r && r.on ? r.items || [] : null, n = items ? items.length : 0;
  const fail = () => toast('Could not reach the game server. Try again in a minute.');
  el.innerHTML = '<span class="k">Team memory</span>' + (!items ? '<p class="small">Soon your agent and your drivers will remember you from race to race: your name, how you like to race, your rivals and results.</p>'
    : !n ? '<p class="small">Your agent and your drivers remember your name, how you like to race, your rivals and how your races went, and bring it up when it fits. Nothing yet: chat with them and race.</p>'
    : `<p class="small">Your agent and your drivers remember ${n} thing${n === 1 ? '' : 's'} about you, and bring them up when it fits.</p>
      <ul class="m-lines">${items.slice(0, 8).map((x) => `<li><span>${esc(x.text)}</span><button class="link m-x" data-id="${esc(x.id)}" type="button">Forget</button></li>`).join('')}</ul>
      ${n > 8 ? `<p class="small">…and ${n - 8} more.</p>` : ''}
      <button class="btn ghost" id="acForget" type="button">Forget me</button>`);
  el.querySelectorAll('.m-x').forEach((b) => b.addEventListener('click', async () => { b.disabled = true; const x = await forget(b.dataset.id); if (x && x.forgot != null) memoryBox(); else { b.disabled = false; fail(); } }));
  const all = $('#acForget');
  all?.addEventListener('click', async () => {
    if (!all.dataset.sure) { all.dataset.sure = '1'; all.textContent = 'Tap again to forget everything'; return; }
    all.disabled = true;
    const x = await forget();
    if (x && x.forgot != null) { toast('Done. Your team has forgotten everything it remembered about you.'); memoryBox(); } else { all.disabled = false; fail(); }
  });
}
function accountSheet(back, o = {}) {
  const done = async () => { toast(`Signed in${account.me && account.me.name ? ' as ' + account.me.name : ''}. Your team follows you to any device.`); agentStatus(); await refreshPass(); if (o.then) o.then(); else back(); };
  const after = (r) => {   // what Core asks next after the code or a merge
    if (r.save && (r.save.stats || {}).starts > (S.stats.starts || 0)) store.adopt(r.save); else store.save();
    if (r.needs_profile) return accountSheet(back, { ...o, step: 'profile', error: null });
    done();
  };
  const step = o.step || (signedIn() ? 'me' : 'choose'), me = account.me || {};
  const err = o.error ? `<p class="ac-err" role="alert">${esc(o.error)}</p>` : '';
  const shell = (body) => show(`<div class="ac">${body}</div>`, 'acsheet');
  if (step === 'me') {
    const sh = shell(`<h2>Your account</h2>
      <p class="lede">Signed in as <b>${esc(me.name || 'you')}</b>${me.handle ? ` · @${esc(me.handle)}` : ''}. Your team, season, Academy progress and agent settings follow you to any device you sign in on.</p>
      ${account.pass.active ? `<p class="pass-on"><span class="pass-chip">★ Verified human</span> Anti-Bot Pass ${account.pass.renews ? 'renews on' : 'until'} <b>${esc(new Date(account.pass.until).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }))}</b> <button class="link" id="acPass" type="button">Manage</button></p>`
        : account.pass.sell ? '<p><button class="btn ghost" id="acPass" type="button">★ Get the Anti-Bot Pass</button></p>' : ''}
      <div class="wallet" id="acWallet"><span class="k">Sora wallet</span><p class="small">Loading…</p></div>
      <div class="wallet mem" id="acMem"><span class="k">Team memory</span><p class="small">Loading…</p></div>
      <div class="actions"><button class="btn ghost" id="acOut" type="button">Sign out of this device</button><button class="btn ghost" id="acBack" type="button">Back</button></div>`);
    $('#acOut').addEventListener('click', async () => { await signOut(); toast('Signed out on this device. Your progress stays with your account.'); back(); });
    $('#acBack').addEventListener('click', back);
    $('#acPass')?.addEventListener('click', () => passSheet(() => accountSheet(back)));
    memoryBox();
    fetchWallet().then((w) => {
      const el = $('#acWallet'); if (!el) return;
      const when = (t) => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
      el.innerHTML = !w || !w.on ? '<span class="k">Sora wallet</span><p class="small">Your Sora wallet opens soon. Weekly prizes land here.</p>'
        : `<span class="k">Sora wallet</span><b class="w-bal">${(w.sora || 0).toLocaleString('en')} Sora</b>
          ${w.lines && w.lines.length ? `<ul class="w-lines">${w.lines.slice(0, 6).map((l) => `<li><span>${esc(l.memo || 'Prize')}</span><em>${when(l.at)}</em><b>${l.amount > 0 ? '+' : ''}${(l.amount || 0).toLocaleString('en')}</b></li>`).join('')}</ul>`
            : '<p class="small">Finish in the top ten of a week’s Dailies and your prize lands here.</p>'}
          <p class="small">Sora is earned in the game. It can’t be bought or cashed out.</p>`;
    });
    return sh;
  }
  if (step === 'choose') {
    const w = account.ways;
    const sh = shell(`<h2>${o.gate ? 'Sign in to race' : 'Sign in to Agent Grand Prix'}</h2>
      <p class="lede">${o.gate ? 'Racing is free. Sign in first, so your team, results and agent follow you to any device.' : 'It’s free. Your team, season, Academy progress and agent follow you to any device, and nothing you’ve built here is lost.'}</p>
      ${err}
      ${w.google ? '<button class="btn ac-google" id="acG" type="button"><svg viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.7H9v3.3h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z"/><path fill="#34A853" d="M9 18c2.4 0 4.5-.8 5.9-2.2l-2.9-2.2c-.8.5-1.8.9-3 .9-2.3 0-4.3-1.6-5-3.7H1v2.3A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M4 10.8a5.4 5.4 0 0 1 0-3.5V5H1a9 9 0 0 0 0 8.1l3-2.3z"/><path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 1 5l3 2.3c.7-2.1 2.7-3.7 5-3.7z"/></svg>Continue with Google</button>' : ''}
      ${w.google && w.email ? '<div class="ac-or"><span>or</span></div>' : ''}
      ${w.email ? `<form id="acMail" class="ac-form"><label for="acEmail">Email</label><input id="acEmail" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" required value="${esc(o.email || '')}"><button class="btn${w.google ? ' ghost' : ''}" type="submit">Email me a code</button></form>` : ''}
      ${!w.google && !w.email ? '<p class="note"><b>Sign-in opens very soon</b> with Google or your email. Until then your team and progress are saved on this device.</p>' : ''}
      ${w.google || w.email ? '<p class="small ac-fine">We only use your email to sign you in and to tell you about your account. No spam. By signing in you agree to the <a href="terms.html" target="_blank" rel="noopener">Terms</a> and <a href="privacy.html" target="_blank" rel="noopener">Privacy</a>.</p>' : ''}
      <div class="actions"><button class="btn ghost" id="acBack" type="button">${o.gate ? 'Not now' : 'Back'}</button></div>`);
    const g = $('#acG'); if (g) g.addEventListener('click', async () => { g.disabled = true; g.lastChild.textContent = 'Opening Google…'; if (!(await signIn())) { g.disabled = false; g.lastChild.textContent = 'Continue with Google'; toast('Could not reach the game server. Your progress is safe on this device.'); } });
    const f = $('#acMail'); if (f) f.addEventListener('submit', async (e) => {
      e.preventDefault(); const email = $('#acEmail').value.trim(), btn = f.querySelector('button');
      btn.disabled = true; btn.textContent = 'Sending…';
      const r = await emailStart(email);
      if (!r.ok) return accountSheet(back, { ...o, email, error: r.error });
      accountSheet(back, { ...o, step: 'code', email, masked: r.masked });
    });
    $('#acBack').addEventListener('click', back);
    return sh;
  }
  if (step === 'code') {
    const sh = shell(`<h2>Check your email</h2>
      <p class="lede">We sent a 6-digit code to <b>${esc(o.masked || o.email)}</b>. It works for 10 minutes.</p>
      ${err}
      <form id="acCode" class="ac-form"><label for="acNum">Code</label><input id="acNum" class="ac-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]*" maxlength="7" placeholder="123456" required><button class="btn" type="submit">Sign in</button></form>
      <p class="small"><button type="button" class="link" id="acAgain">Send a new code</button> · <button type="button" class="link" id="acOther">Use a different email</button></p>
      <div class="actions"><button class="btn ghost" id="acBack" type="button">Back</button></div>`);
    const num = $('#acNum'); num.focus();
    let busy = false;
    const go = async () => {
      if (busy) return; busy = true;
      const r = await emailVerify(o.email, num.value);
      if (!r.ok) return accountSheet(back, { ...o, error: r.error });
      if (r.merge) return accountSheet(back, { ...o, step: 'merge', who: r.who, error: null });
      after(r);
    };
    num.addEventListener('input', () => { if (num.value.replace(/\D/g, '').length === 6) go(); });
    $('#acCode').addEventListener('submit', (e) => { e.preventDefault(); go(); });
    $('#acAgain').addEventListener('click', async () => { const r = await emailStart(o.email); accountSheet(back, { ...o, error: r.ok ? null : r.error, masked: r.masked || o.masked }); if (r.ok) toast('A new code is on its way.'); });
    $('#acOther').addEventListener('click', () => accountSheet(back, { ...o, step: 'choose', error: null }));
    $('#acBack').addEventListener('click', () => accountSheet(back, { ...o, step: 'choose', error: null }));
    return sh;
  }
  if (step === 'merge') {
    const sh = shell(`<h2>You already have a team</h2>
      <p class="lede">${o.who ? `<b>${esc(o.who)}</b> already` : 'This account already'} has an Agent Grand Prix team. Add what you've done on this device to it?</p>
      <p class="note">Your races, trophies and Academy lessons from this device join the account. Where both have the same thing, the one that has raced more is kept.</p>
      ${err}
      <div class="actions"><button class="btn" id="acYes" type="button">Yes, add it</button><button class="btn ghost" id="acNo" type="button">Not now</button></div>`);
    $('#acYes').addEventListener('click', async (e) => { e.target.disabled = true; const r = await mergeAnswer(true); if (!r.ok) return accountSheet(back, { ...o, step: 'choose', error: r.error }); after(r); });
    $('#acNo').addEventListener('click', async () => { await mergeAnswer(false); toast('Nothing changed. You’re still playing on this device only.'); back(); });
    return sh;
  }
  if (step === 'profile') {
    const t = team(), guess = (me.name || (firstVisit() ? '' : t.name) || '').slice(0, 40);
    const sh = shell(`<h2>Pick your name</h2>
      <p class="lede">This is how other players see you on leaderboards and live races. Your @handle is yours across the game.</p>
      ${err}
      <form id="acProf" class="ac-form"><label for="acName">Your name</label><input id="acName" autocomplete="nickname" maxlength="40" required value="${esc(o.name ?? guess)}">
        <label for="acHandle">@handle</label><div class="ac-at"><span>@</span><input id="acHandle" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" placeholder="speedking" required value="${esc(o.handle || '')}"></div>
        <p class="small">3 to 24 letters, numbers or _. You can change it once a month.</p>
        <button class="btn" type="submit">Save and continue</button></form>`);
    $('#acProf').addEventListener('submit', async (e) => {
      e.preventDefault(); const name = $('#acName').value.trim(), handle = $('#acHandle').value.trim().replace(/^@/, '');
      e.target.querySelector('button[type=submit]').disabled = true;
      const r = await saveProfile(name, handle);
      if (!r.ok) return accountSheet(back, { ...o, name, handle, error: r.error });
      done();
    });
    return sh;
  }
}
// racing needs an account when the server says so (a guest can still watch and read everything)
const GATED = new Set(['daily', 'dailyfull', 'season', 'quick', 'just', 'practice', 'again', 'live', 'academy', 'build', 'team']);
function homeClick(e) {
  if (e.target.closest?.('a[href]')) return;   // the small print links open on their own
  const b = e.target.closest('[data-go]'); if (!b) return;
  const go = b.dataset.go, n = dayNumber(), back = b.closest('.pm') ? playMenu : home;   // sheets opened from Play return to Play
  if (account.ways.need && !signedIn() && (GATED.has(go) || go.startsWith('v:'))) return accountSheet(back, { gate: true, then: () => homeClick({ target: b }) });
  if (passLocked(go.startsWith('v:') ? 'quick' : go)) return passSheet(back, { want: go.startsWith('v:') ? 'quick' : go });
  if (go === 'play' || go === 'menu') return playMenu();
  if (go === 'home' || go === 'glance') return home();
  if (go === 'pass') return passSheet(back);
  if (go === 'rules') return rulesSheet(back);
  if (go === 'settings') return settingsSheet(back);
  if (go === 'install') return doInstall(back);
  if (go.startsWith('install:')) return doInstall(home, go.slice(8));
  if (go === 'lang:en') { S.settings.lang = 'en'; store.save(); return setLang('en'); }
  if (go === 'lang:keep') { keepLang(); G.langNoted = true; return b.closest('.lang-note')?.remove(); }
  if (go === 'peek') return setPeek(true);
  if (go === 'unpeek') return setPeek(false);
  if (go === 'tuck') return setTuck(true);
  if (go === 'untuck') return setTuck(false);
  if (go === 'signout') return signOut().then(() => { toast('Signed out on this device. Your progress stays with your account.'); home(); });
  if (go === 'noturn') { S.settings.noTurn = true; store.save(); return b.remove(); }
  if (go === 'nodesk') { S.settings.noDesk = true; store.save(); return b.remove(); }
  if (go === 'daily') needTeam(() => pre({ kind: 'daily', venue: dailyVenue(n), seed: hashString('daily-' + n), day: n }));
  if (go === 'dailyfull') needTeam(() => pre({ kind: 'dailyfull', venue: dailyVenue(n), seed: hashString('daily-' + n), day: n }));
  if (go === 'season') {
    if (S.season.round > CALENDAR.length) return standings(true);
    const v = CALENDAR[S.season.round - 1];
    needTeam(() => pre({ kind: 'season', venue: v, seed: hashString(`season-${S.season.no}-${S.season.round}`), round: S.season.round }));
  }
  if (go === 'standings') standings();
  if (go === 'watch') watchRace();
  if (go.startsWith('driver:')) needTeam(() => driverSheet(go.slice(7), back));
  if (go === 'board') boardSheet(dayNumber(), back);
  if (go === 'live') needTeam(() => liveLobby(back));
  if (go === 'agent') agentSheet(back);
  if (go === 'account') accountSheet(back);
  if (go === 'awayok') { S.agent.unseen = []; store.save(); home(); }
  if (go.startsWith('ar:')) { const a = S.agent.reports.find((x) => String(x.n) === go.slice(3)); if (a) reportSheet(a.report, back); }
  if (go === 'report' && S.lastReport) reportSheet(S.lastReport, back);
  if (go === 'quick') quickPick();
  if (go === 'team') { if (firstVisit()) onboard('team', null); else teamSheet(back); }
  if (go === 'build') onboard('team', null);
  if (go === 'just') justRace();
  if (go === 'academy') academyHome();
  if (go === 'practice') freePractice();
  if (go === 'again') raceAgain();
  if (go.startsWith('v:')) needTeam(() => pre(quickO(venueById(go.slice(2))), 'car'));
  if (go === 'garage') showroom(back);
  if (go === 'dna') studio(back);
  if (go === 'help') helpSheet(back);
  if (go === 'win') winSheet(back);
  if (go === 'share') shareSheet(S.daily.days[n].share, back);
}

// Driver DNA Studio (js/studio.js); during a race the race keeps the DNA it started with
function studio(back, locked = false, o = {}) { openStudio({ S, show, save: store.save, toast, team }, { back, locked, ...o }); }

// first visit: no team yet, or a team still being built in the onboarding
const firstVisit = () => !S.team || !!S.team.draft;
function needTeam(next) { if (firstVisit()) onboard('team', next); else next(); }

// driver codes and numbers: three letters from the name; numbers 1-99 that no AI driver uses
const codeOf = (s) => s.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
function driverCodes(a, b) { let c1 = codeOf(a), c2 = codeOf(b); if (c1 === c2) c2 = c2.slice(0, 2) + '2'; return [c1, c2]; }
// callsigns you type yourself: three letters, different from each other and from every rival driver's
const TAKEN_CODES = TEAMS.flatMap((t) => t.drivers.map((d) => d.code));
function codeProblem(c, other) {
  if (!/^[A-Z]{3}$/.test(c)) return 'A callsign is three letters, like NOV.';
  if (TAKEN_CODES.includes(c)) return `${c} belongs to another team's driver.`;
  if (c === other) return 'Your two drivers need different callsigns.';
  return '';
}
function numProblem(n, other) {
  if (!Number.isInteger(n) || n < 1 || n > 99) return 'Pick a number from 1 to 99.';
  if (TAKEN_NUMS.includes(n)) return `Number ${n} belongs to another team's driver.`;
  if (n === other) return 'Your two drivers need different numbers.';
  return '';
}
const TEAM_IDEAS = ['Savanna Racing', 'Kora Motorsport', 'Sahel Speed', 'Ember GP', 'Zenith Racing', 'Baobab Racing', 'Comet GP', 'Nomad Racing',
  'Delta Works', 'Lumen Racing', 'Equator GP', 'Highveld Racing', 'Tidewater GP', 'Ironwood Racing', 'Blue Nile Motorsport', 'Dune Velocity'];
const DRIVER_IDEAS = ['Kofi', 'Tunde', 'Kwame', 'Jabari', 'Femi', 'Malik', 'Ayo', 'Chidi', 'Emeka', 'Sipho', 'Tariq', 'Kai', 'Rio', 'Mateo', 'Idris',
  'Bayo', 'Kalu', 'Obi', 'Thabo', 'Zane', 'Dayo', 'Nico', 'Omar', 'Jonah', 'Ezra', 'Ade', 'Leon', 'Musa'];
const pickIdea = (list, not = []) => { const l = list.filter((x) => !not.includes(x)); return l[Math.floor(Math.random() * l.length)]; };

// your driver's look: the face and helmet side by side, and behind "Change look" the choices for
// each. The look is fixed on first sight (it would otherwise follow the name as it is typed).
const LOOK_NAMES = { shortCombover: 'Combover', curlyHighTop: 'High top', bobCut: 'Bob', curly: 'Curls', curlyBun: 'Curly bun', buzzcut: 'Buzz cut',
  bobBangs: 'Bangs', bald: 'Bald', balding: 'Balding', bunUndercut: 'Undercut bun', fade: 'Fade', straightBun: 'Bun', extraLong: 'Extra long',
  shortComboverChops: 'Sideburns', sideShave: 'Side shave', long: 'Long', mohawk: 'Mohawk', pigtails: 'Pigtails', none: 'None', shadow: 'Stubble',
  goatee: 'Goatee', beardMustache: 'Full beard', pyramid: 'Moustache', walrus: 'Walrus', soulPatch: 'Soul patch', open: 'Open', happy: 'Happy',
  glasses: 'Glasses', sunglasses: 'Shades' };
function lookHTML(d, tm, k) {
  d.helmet ||= helmetOf({ ...d, code: (d.code || '') + k });
  d.face ||= faceOf({ ...d, code: (d.code || '') + k });
  const f = d.face, cyc = (key, list) => `<div class="lk-cyc" data-cyc="${key}"><span>${{ hair: 'Hair', beard: 'Beard', eyes: 'Eyes' }[key]}</span><button type="button" data-step="-1" aria-label="Previous">‹</button><b>${LOOK_NAMES[f[key]] || f[key]}</b><button type="button" data-step="1" aria-label="Next">›</button></div>`;
  return `<div class="hm" data-hm="${k}"><div class="hm-pics"><span class="hm-f">${portraitSVG(d, tm, { size: 76 })}</span><span class="hm-p">${helmetSVG(d, tm, { size: 76 })}</span>
    <button type="button" class="link lk-open">Change look</button><button type="button" class="btn ghost dice lk-dice" aria-label="Random look">🎲</button></div>
    <div class="hm-o" hidden>
    <div class="lk-sub">Skin</div>
    <div class="hm-vis" data-row="skin">${SKINS.map((c) => `<button type="button" data-v="${c}" class="${f.skin === c ? 'on' : ''}" aria-label="Skin tone"><i style="background:#${c}"></i></button>`).join('')}</div>
    <div class="lk-sub">Hair colour</div>
    <div class="hm-vis" data-row="hairColor">${HAIR_COLOURS.map((c) => `<button type="button" data-v="${c}" class="${f.hairColor === c ? 'on' : ''}" aria-label="Hair colour"><i style="background:#${c}"></i></button>`).join('')}</div>
    <div class="lk-cycs">${cyc('hair', HAIRS)}${cyc('beard', BEARDS)}${cyc('eyes', EYES)}</div>
    <div class="lk-sub">Helmet</div>
    <div class="hm-pat">${HELMET_PATTERNS.map((p) => `<button type="button" data-pat="${p.id}" class="${d.helmet.pat === p.id ? 'on' : ''}">${p.name}</button>`).join('')}</div>
    <div class="hm-vis">${VISORS.map((v) => `<button type="button" data-vis="${v.id}" class="${d.helmet.visor === v.id ? 'on' : ''}" aria-label="${v.name} visor" title="${v.name} visor"><i style="background:linear-gradient(135deg,${v.b},${v.a})"></i></button>`).join('')}</div></div></div>`;
}
function lookWire(root, d, k, paint, extra) {
  const box = $(`[data-hm="${k}"]`, root), LISTS = { hair: HAIRS, beard: BEARDS, eyes: EYES };
  const draw = () => {
    const x = { ...d, ...extra() };
    $('.hm-f', box).innerHTML = portraitSVG(x, paint(), { size: 76 }); $('.hm-p', box).innerHTML = helmetSVG(x, paint(), { size: 76 });
    $$('[data-row]', box).forEach((r) => $$('[data-v]', r).forEach((b) => b.classList.toggle('on', b.dataset.v === d.face[r.dataset.row])));
    $$('[data-cyc]', box).forEach((r) => { $('b', r).textContent = LOOK_NAMES[d.face[r.dataset.cyc]] || d.face[r.dataset.cyc]; });
    $$('[data-pat]', box).forEach((b) => b.classList.toggle('on', b.dataset.pat === d.helmet.pat));
    $$('[data-vis]', box).forEach((b) => b.classList.toggle('on', b.dataset.vis === d.helmet.visor));
  };
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('lk-open')) { const o = $('.hm-o', box); o.hidden = !o.hidden; b.textContent = o.hidden ? 'Change look' : 'Done'; return; }
    if (b.classList.contains('lk-dice')) { const r = String(Math.random()); d.face = faceOf({ code: r }); d.helmet = helmetOf({ code: r }); }
    else if (b.dataset.pat) d.helmet = { ...d.helmet, pat: b.dataset.pat };
    else if (b.dataset.vis) d.helmet = { ...d.helmet, visor: b.dataset.vis };
    else if (b.dataset.v) d.face = { ...d.face, [b.closest('[data-row]').dataset.row]: b.dataset.v };
    else if (b.dataset.step) { const key = b.closest('[data-cyc]').dataset.cyc, L = LISTS[key]; d.face = { ...d.face, [key]: L[(L.indexOf(d.face[key]) + +b.dataset.step + L.length) % L.length] }; }
    else return;
    draw();
  });
  box._draw = draw;
}
const helmetsRedraw = (root, drivers) => drivers.forEach((d, k) => { const b = $(`[data-hm="${k}"]`, root); if (b && b._draw) b._draw(); });

// Edit team: names, numbers and colours, any time
function teamSheet(next) {
  const t = structuredClone(team());
  let liv = Math.max(0, LIVERIES.findIndex((l) => l.c1 === t.c1));
  const nums = t.drivers.map((d, i) => d.num || (i ? 77 : 7));
  const sh = show(`
    <h2>Edit team</h2>
    <p class="lede">Change names, numbers and colours any time.</p>
    <div class="grid2">
      <label class="field"><span>Team name</span><input id="tName" maxlength="22" value="${esc(t.name)}"></label>
      <label class="field"><span>Short code</span><input id="tShort" maxlength="3" value="${esc(t.short)}"></label>
      ${t.drivers.map((d, i) => `<label class="field"><span>Driver ${i + 1}</span><input id="d${i + 1}" maxlength="14" value="${esc(d.name)}"></label>
      <div class="grid2 tight"><label class="field"><span>Callsign</span><input id="k${i + 1}" maxlength="3" value="${esc(d.code || '')}" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
      <label class="field"><span>Race number</span><input id="n${i + 1}" type="number" inputmode="numeric" min="1" max="99" value="${nums[i]}"></label></div>`).join('')}
    </div>
    <p class="note">The callsign is the three letters on the timing tower. The race number is painted on the car.</p>
    <div class="sub" style="margin-top:14px">Faces and helmets</div>
    ${t.drivers.map((d, i) => lookHTML(d, t, i)).join('')}
    <p class="err" id="tErr" hidden></p>
    <div class="sub" style="margin-top:14px">Colours</div>
    <div class="swatches">${LIVERIES.map((l, i) => `<button type="button" data-l="${i}" class="${i === liv ? 'on' : ''}" aria-label="${l.name}" title="${l.name}"><i style="background:${l.c1}"></i><i style="background:${l.c2}"></i></button>`).join('')}</div>
    <p class="note"><button type="button" class="link" id="tPaint">Mix your own colours and finish in the showroom</button></p>
    <div class="actions"><button class="btn" id="tSave" type="button">Save</button><button class="btn ghost" id="tSkip" type="button">Cancel</button></div>`);
  let picked = false;
  const paintNow = () => (picked ? LIVERIES[liv] : t);
  t.drivers.forEach((d, i) => lookWire(sh, d, i, () => paintNow(), () => ({ num: +$('#n' + (i + 1)).value })));
  $$('[data-l]', sh).forEach((b) => b.addEventListener('click', () => { liv = +b.dataset.l; picked = true; $$('[data-l]', sh).forEach((x) => x.classList.toggle('on', x === b)); helmetsRedraw(sh, t.drivers, paintNow()); }));
  $('#tPaint').addEventListener('click', () => openShowroom({ S, show, save: store.save, team }, { id: carModel() || 'falcon', lite, back: () => teamSheet(next), pick: (id) => { S.settings.car = id; store.save(); } }));
  // a callsign follows the name until you type one yourself
  [1, 2].forEach((i) => { const k = $('#k' + i), d = $('#d' + i); let own = false; k.addEventListener('input', () => { own = true; k.value = k.value.toUpperCase().replace(/[^A-Z]/g, ''); }); d.addEventListener('input', () => { if (!own) k.value = codeOf(d.value); }); });
  $('#tSave').addEventListener('click', () => {
    const d1 = $('#d1').value.trim() || t.drivers[0].name, d2 = $('#d2').value.trim() || t.drivers[1].name;
    const n1 = +$('#n1').value, n2 = +$('#n2').value, bad = numProblem(n1, n2) || numProblem(n2, n1);
    if (bad) { $('#tErr').textContent = bad; $('#tErr').hidden = false; return; }
    const auto = driverCodes(d1, d2), k1 = $('#k1').value.trim().toUpperCase() || auto[0], k2 = $('#k2').value.trim().toUpperCase() || auto[1];
    const badK = codeProblem(k1, k2) || codeProblem(k2, k1);
    if (badK) { $('#tErr').textContent = badK; $('#tErr').hidden = false; return; }
    const L = LIVERIES[liv], paint = picked ? { c1: L.c1, c2: L.c2, glow: L.glow, finish: L.finish } : { c1: S.team.c1, c2: S.team.c2, glow: S.team.glow, finish: S.team.finish };
    S.team = { name: $('#tName').value.trim() || t.name, short: codeOf($('#tShort').value || $('#tName').value), ...paint,
      drivers: [{ name: d1, code: k1, num: n1, helmet: t.drivers[0].helmet, face: t.drivers[0].face }, { name: d2, code: k2, num: n2, helmet: t.drivers[1].helmet, face: t.drivers[1].face }] };
    store.save(); next();
  });
  $('#tSkip').addEventListener('click', next);
}

// ---------- onboarding: build your team, one decision per screen ----------
const OB_STEPS = ['team', 'car', 'colours', 'drivers', 'engineer', 'mode'];
const OB_STYLES = ['balanced', 'attacker', 'technician'];
let obThen = null;
function dots(i, n) { return `<div class="wiz-dots" aria-label="Step ${i + 1} of ${n}">${Array.from({ length: n }, (_, k) => `<i class="${k < i ? 'done' : k === i ? 'on' : ''}"></i>`).join('')}<span>${i + 1} of ${n}</span></div>`; }
const wizFoot = (next, back = 'Back') => `</div><div class="actions wiz-foot"><button class="btn" data-wiz="next" type="button">${next}</button>${back ? `<button class="btn ghost" data-wiz="back" type="button">${back}</button>` : ''}</div>`;
function wizWire(sh, next, back) {
  $('[data-wiz="next"]', sh).addEventListener('click', next);
  const b = $('[data-wiz="back"]', sh); if (b) b.addEventListener('click', back);
}
function onboard(step = 'team', then) {
  if (then !== undefined) obThen = then;
  if (!S.team || S.team.fresh) { S.team = { ...structuredClone(DEFAULT_TEAM), ...(S.team ? { c1: S.team.c1, c2: S.team.c2, glow: S.team.glow } : {}), name: '', short: '', draft: true, drivers: [{ name: '', code: '', num: 7 }, { name: '', code: '', num: 77 }] }; store.save(); }
  const t = S.team, i = OB_STEPS.indexOf(step), go = (k) => onboard(OB_STEPS[i + k]);
  const back = () => (i ? go(-1) : home());
  // header on the left in landscape, the choice on the right; wizFoot closes the body
  const hdr = (title, lede) => `<header class="wiz-head">${dots(i, OB_STEPS.length)}<h2>${title}</h2><p class="lede">${lede}</p></header>`;
  const head = (title, lede) => hdr(title, lede) + '<div class="wiz-body">';
  if (step === 'team') {
    let codeSet = !!t.short;
    const sh = show(`${head('Name your team', 'You are the team principal. What is your team called?')}
      <div class="grid2 ob-team">
        <label class="field"><span>Team name</span><input id="obName" maxlength="22" value="${esc(t.name)}" placeholder="Savanna Racing" autocomplete="off"></label>
        <label class="field"><span>Short code</span><input id="obShort" maxlength="3" value="${esc(t.short)}" placeholder="SAV" autocomplete="off"></label>
      </div>
      <button class="btn ghost dice" id="obDice" type="button">🎲 Suggest a name</button>
      <p class="note">The code shows on the timing tower next to your drivers.</p>
      <p class="err" id="obErr" hidden></p>
      ${wizFoot('Next')}`, 'wizp');
    const nm = $('#obName'), sc = $('#obShort');
    nm.addEventListener('input', () => { if (!codeSet) sc.value = nm.value.trim() ? codeOf(nm.value) : ''; });
    sc.addEventListener('input', () => { codeSet = !!sc.value; });
    $('#obDice').addEventListener('click', () => { $('#obErr').hidden = true; nm.value = pickIdea(TEAM_IDEAS, [nm.value]); codeSet = false; sc.value = codeOf(nm.value); });
    wizWire(sh, () => {
      if (!nm.value.trim()) { $('#obErr').textContent = 'Give your team a name, or tap the dice for one.'; $('#obErr').hidden = false; nm.focus(); return; }
      t.name = nm.value.trim(); t.short = codeOf(sc.value || t.name); store.save(); go(1);
    }, back);
  }
  if (step === 'car') {
    const sh = show(`${head('Pick your car', 'Every car has the same overall pace. Some are quicker in the corners, some under braking, some on the straights. Pick one, then paint it in 3D on the next screen.')}
      ${carTiles()}${wizFoot('Choose this car')}`, 'wizp');
    wireCarTiles(sh);
    wizWire(sh, () => go(1), back);
  }
  if (step === 'colours') {
    // the showroom, with your car turning while you paint it: main, accent and the colour of the lights
    openShowroom({ S, show, save: store.save, team }, { id: carModel() || 'falcon', lite, back,
      wizard: { head: hdr('Your colours', 'Pick a set, or mix your own main, accent and light colours. Drag to turn the car.'), nextLabel: 'Save', next: () => go(1) } });
  }
  if (step === 'drivers') {
    const prof = activeProfiles(S), style = SLOTS.map((sl) => { const o = (prof[sl] && prof[sl].origin || '').replace('preset:', ''); return OB_STYLES.includes(o) ? o : 'balanced'; });
    const sh = show(`${head('Your drivers', 'Name your two AI drivers, give them race numbers and pick how they drive.')}
      ${t.drivers.map((d, k) => `<div class="ob-driver" data-d="${k}">${lookHTML(d, t, k)}
        <div class="ob-drow"><label class="field"><span>Driver ${k + 1}</span><input class="obN" maxlength="14" value="${esc(d.name)}" placeholder="${k ? 'Echo' : 'Nova'}" autocomplete="off"></label>
          <button class="btn ghost dice" data-dice="${k}" type="button" aria-label="Suggest a name">🎲</button>
          <label class="field num"><span>Number</span><input class="obNum" type="number" inputmode="numeric" min="1" max="99" value="${d.num || (k ? 77 : 7)}"></label></div>
        <div class="ob-style">${OB_STYLES.map((s) => { const p = PRESETS.find((x) => x.id === s); return `<button type="button" data-style="${s}" class="${style[k] === s ? 'on' : ''}"><b>${s === 'technician' ? 'Smooth' : p.name}</b><span>${esc(p.blurb)}</span></button>`; }).join('')}</div></div>`).join('')}
      <p class="note">More styles and every setting are in Driver DNA, any time.</p>
      <p class="err" id="obErr" hidden></p>
      ${wizFoot('Next')}`, 'wizp');
    $$('.ob-driver', sh).forEach((row) => {
      const k = +row.dataset.d;
      lookWire(row, t.drivers[k], k, () => t, () => ({ num: +$('.obNum', row).value }));
      $$('[data-style]', row).forEach((b) => b.addEventListener('click', () => { style[k] = b.dataset.style; $$('[data-style]', row).forEach((x) => x.classList.toggle('on', x === b)); }));
      $('[data-dice]', row).addEventListener('click', () => { $('.obN', row).value = pickIdea(DRIVER_IDEAS, $$('.obN', sh).map((x) => x.value)); });
    });
    wizWire(sh, () => {
      const names = $$('.obN', sh).map((x) => x.value.trim()), nums = $$('.obNum', sh).map((x) => +x.value);
      const err = (m) => { $('#obErr').textContent = m; $('#obErr').hidden = false; };
      if (!names[0] || !names[1]) return err('Give both drivers a name, or tap the dice.');
      const bad = numProblem(nums[0], nums[1]) || numProblem(nums[1], nums[0]); if (bad) return err(bad);
      const codes = driverCodes(names[0], names[1]);
      t.drivers = names.map((n, k) => ({ name: n, code: codes[k], num: nums[k], helmet: t.drivers[k].helmet, face: t.drivers[k].face }));
      SLOTS.forEach((sl, k) => { if (style[k] !== (prof[sl] && prof[sl].origin || '').replace('preset:', '')) setProfile(S, fromPreset(sl, style[k]), 'you', 'picked when building the team'); });
      store.save(); go(1);
    }, back);
  }
  if (step === 'engineer') {
    const sh = show(`${head('Your race engineer', 'Your engineer runs the radio when you hand the cars to the AI, and answers when you ask for advice. When you are Team Principal, only you and your drivers talk. Tap a voice to hear a call.')}
      ${vpickHTML()}
      <label class="coachopt"><input type="checkbox" id="replyOpt" ${S.settings.replies !== false ? 'checked' : ''}><span><b>Drivers answer</b> Your drivers reply in their own voices: "Copy. Boxing."</span></label>
      ${radioSupported() ? `<label class="coachopt"><input type="checkbox" id="freeOpt" ${S.settings.handsfree ? 'checked' : ''}><span><b>Hands-free radio</b> The mic stays on during your races. Say "Radio", then the call: "Radio, box box, softs". It goes quiet while your team is talking. Best with headphones.</span></label>` : ''}
      ${wizFoot('Next')}`, 'wizp');
    vpickWire(sh);
    $('#replyOpt').addEventListener('change', (e) => { S.settings.replies = e.target.checked; store.save(); });
    $('#freeOpt')?.addEventListener('change', (e) => { S.settings.handsfree = e.target.checked; store.save(); if (G.race) talkBtn(G.race); });
    wizWire(sh, () => go(1), back);
  }
  if (step === 'mode') {
    let auto = !!S.settings.auto;
    const sh = show(`${head("How you'll run it", 'Who makes the calls in the race? You can change this before every race, and take over at any time.')}
      ${modeHTML(auto)}
      <label class="coachopt"><input type="checkbox" id="coachOpt" ${S.settings.coach !== false ? 'checked' : ''}><span><b>Race coach</b> Tips at the right moment, with a button to act on them in one tap: your first box call, your first Push, your first BOOST.</span></label>
      ${wizFoot(obThen ? 'Done' : 'Start my first race')}`, 'wizp');
    $$('[data-m]', sh).forEach((b) => b.addEventListener('click', () => { auto = b.dataset.m === '1'; $$('[data-m]', sh).forEach((x) => x.classList.toggle('on', x === b)); }));
    wizWire(sh, () => {
      S.settings.auto = auto; S.settings.coach = $('#coachOpt').checked;
      delete t.draft; store.save(); toast(`Welcome to the paddock, ${t.name}.`);
      const then = obThen; obThen = null;
      if (then) then();
      else pre({ kind: 'quick', venue: VENUES.find((v) => v.id === 'sakhir'), seed: hashString('first-' + Date.now()), first: true, length: 'short' }, 'tyres');
    }, back);
  }
}

// ---------- Racing Academy ----------
// Five short lessons on a real race (js/academy.js). The engineer explains one thing at a time on a
// card over the race, points at the control, and the step finishes when you do it: by button or on
// the radio, through the same cmd() path as any other call. Progress is saved with the rest (S.academy).
const names = () => { const t = team(); return { A: t.drivers[0].name || 'Nova', B: t.drivers[1].name || 'Echo' }; };
const acSay = (k) => { if (voiceId()) say(['@' + voiceId() + '-academy/' + k]); };
function startLesson(id) {
  const def = lessonById(id);
  if (!def || def.soon) return academyHome();
  const t0 = performance.now(), v = venueById(def.race.venue);
  G.nextLesson = new Lesson(def, { mic: radioSupported() }, (st, i, n) => lessonShow(st, i, n));
  G.nextLesson.t0 = t0;
  G.lessonId = id;
  live.clear();
  Object.assign(G, { kind: 'academy', venue: v, seed: hashString('academy-' + def.id), round: null, day: null, laps: def.race.laps || raceLaps(trackFor(v), 'short') });
  G.coach = !!def.race.coach;
  // the full-race lesson starts on the engineer's plan, like a real race weekend
  let picks = {};
  G.lessonPlan = '';
  if (def.id === 'gp') {
    const probe = setupRace({ venue: v, seed: G.seed, team: team(), dna: raceDNA(S, dnaOn), car: carModel() || 'falcon', laps: G.laps });
    const st = planFor(v, probe).start, nm = names();
    picks = { 'you-0': st[0], 'you-1': st[1] };
    G.lessonPlan = `${esc(nm.A)} on <b>${COMPOUNDS[st[0]].name}s</b>, ${esc(nm.B)} on <b>${COMPOUNDS[st[1]].name}s</b>, one stop each`;
  }
  startRace(picks, false);
}
function lessonStart() {
  G.lessonSeen = { pit: new Set(), stops: { 'you-0': 0, 'you-1': 0 }, ev: G.race.events.length };
  G.lesson.start();
}
function lessonEvent(e) { if (G.lesson && !G.attract) G.lesson.event(e); }
function lessonShow(st, i, n) {
  if (!st) return lessonCard(null);
  const L = G.lesson || G.nextLesson, def = L.def;
  const R = G.race;
  if (st.go === 'lights' && !R.started) lightsSequence();
  if (st.sel) { G.mineSel = st.sel; select(st.sel); }
  // scenes the lesson calls for: a safety car, a shower, a look at Driver DNA
  if (st.go === 'sc' && !R.sc) { R.emit('flag', 'Debris on the track.', null); R.deploy('SC', null); }
  if (st.go === 'rain') R.weather.showers.push({ start: R.t + 6, end: R.t + 600, peak: 0.6 });
  if (st.go === 'dna') studio(() => { hide(); lessonEvent({ type: 'next' }); }, true);
  if (st.go2 === 'cam:live') setCam('live');
  if (st.go === 'tab:wall') setTab('wall');
  if (st.go && st.go.startsWith('cam:')) setCam(st.go.slice(4) === 'pit' && G.race.byId.get(G.mineSel || 'you-0').pit ? 'pit' : st.go.slice(4) === 'live' ? 'live' : cams.mode);
  if (st.go === 'cam:pit') G.lessonPitCam = true;
  (st.say || []).forEach(acSay);
  lessonCard({ def, st, i, n });
  if (st.end) lessonDone();
}
const lessonNames = () => ({ ...Object.fromEntries(Object.entries(names()).map(([k, v]) => [k, esc(v)])), PLAN: G.lessonPlan || '' });
function lessonCard(o) {
  const el = $('#lesson');
  $$('.hl').forEach((x) => x.classList.remove('hl'));
  G.lessonHl = null; G.lessonHlShown = null;
  if (!o) { el.hidden = true; return; }
  const { def, st, i, n } = o;
  G.lessonHl = st.hl || null;
  // a panel the lesson opened closes again once the step is about the race, not a control in it
  if (G.lessonSheet && !$$(st.hl || '#none').some((x) => x.closest('.wall, .tower'))) { G.lessonSheet = false; sheet('peek'); }
  el.innerHTML = `<div class="ch"><span>🎓 Lesson ${def.n} · ${esc(def.title)}</span><span class="stp">${Math.min(i + 1, n)} / ${n}</span></div>
    <div class="bar"><i style="width:${Math.round((i + (st.end ? 1 : 0)) / n * 100)}%"></i></div>
    <p>${fill(st.text, lessonNames())}</p>
    <div class="acts">${st.act ? `<button type="button" class="go" data-l="next">${st.act}</button>` : ''}${st.end ? '' : '<button type="button" class="no" data-l="leave">Leave lesson</button>'}</div>`;
  el.classList.toggle('min', !!st.min);
  el.hidden = false;
  lessonHl();
}
// the control the step is about gets a pulsing outline (the pit wall redraws, so this runs each tick)
function lessonHl() {
  const sel = G.lessonHl;
  if (!sel) return;
  const t = $$(sel).find((x) => x.getClientRects().length) || (phoneUp() ? $(sel) : null);
  // on an upright phone the control may be in the closed panel: open it on the right tab
  if (t && phoneUp() && t.closest('.wall, .tower') && (app.dataset.sheet === 'peek' || !t.getClientRects().length)) { setTab(t.closest('.tower') ? 'order' : 'wall'); if (app.dataset.sheet === 'peek') { sheet('half'); G.lessonSheet = true; } }
  if (t && !t.classList.contains('hl')) {
    $$('.hl').forEach((x) => x.classList.remove('hl')); t.classList.add('hl');
    // bring it into view once, when the step starts (the pit wall scrolls on phones)
    if (G.lessonHlShown !== sel) { G.lessonHlShown = sel; if (t.closest('.wall, .tower')) t.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  }
}
$('#lesson').addEventListener('click', (e) => {
  const b = e.target.closest('[data-l]'); if (!b) return;
  if (b.dataset.l === 'next') lessonEvent({ type: 'next' });
  if (b.dataset.l === 'leave') { G.lesson = null; lessonCard(null); if (!G.race.started) lightsSequence(); toast('Lesson left. Keep racing, or open the Academy from the menu.'); }
  if (b.dataset.l === 'academy') academyHome();
  if (b.dataset.l === 'nextlesson') startLesson(b.dataset.id);
  if (b.dataset.l === 'keep') lessonCard(null);
  if (b.dataset.l === 'results') { lessonCard(null); G.lesson = null; results(); }
});
let lessonLast = 0;
function lessonTick() {
  const L = G.lesson, R = G.race;
  if (!L || G.attract || !R) return;
  const now = performance.now(), dt = lessonLast ? Math.min(0.5, (now - lessonLast) / 1000) : 0; lessonLast = now;
  if (!G.paused && $('#screen').hidden) L.tick(dt);
  // what the race did: a car of yours entering the pit lane, and finishing its stop
  const seen = G.lessonSeen;
  if (seen) for (const id of ['you-0', 'you-1']) {
    const c = R.byId.get(id);
    if (c.pit && !seen.pit.has(id)) { seen.pit.add(id); G.mineSel = id; select(id); lessonEvent({ type: 'pitIn', id }); }
    if (c.pit && c.pit.phase === 'stop' && G.lessonPitCam && cams.mode !== 'pit' && G.mineSel === id) setCam('pit');
    if (c.stops > seen.stops[id]) { seen.stops[id] = c.stops; seen.pit.delete(id); G.lessonPitCam = false; lessonEvent({ type: 'stopDone', id }); }
  }
  // the race itself: your cars' moments, and states a step can wait for (they hold, so a step that
  // starts while it's already raining moves straight on)
  if (seen) {
    for (; seen.ev < R.events.length; seen.ev++) { const ev = R.events[seen.ev]; if (ev.car === 'you-0' || ev.car === 'you-1') lessonEvent({ type: 'race', ev }); }
    if (R.wet > 0.2) lessonEvent({ type: 'wet' });
    if (R.started && R.leaderLap() >= R.laps) lessonEvent({ type: 'lastlap' });
    const mine = ['you-0', 'you-1'].map((id) => R.byId.get(id));
    if (R.done || mine.every((c) => c.finished || c.dnf)) lessonEvent({ type: 'finish' });
  }
  lessonHl();
  // the coach and the lesson can both be up in the full race lesson: the lesson card moves below
  const lc = $('#lesson'), cc = $('#coach');
  let top = '';
  if (!lc.hidden && !cc.hidden) {
    lc.style.top = '';
    const a = cc.getBoundingClientRect(), b = lc.getBoundingClientRect();
    if (a.left < b.right && b.left < a.right && a.top <= b.top + 20 && a.bottom > b.top) top = (a.bottom - lc.offsetParent.getBoundingClientRect().top + 8) + 'px';
  }
  if (lc.style.top !== top) lc.style.top = top;
}
function lessonDone() {
  const L = G.lesson; if (!L || L.saved) return;
  L.saved = true;
  const secs = (performance.now() - L.t0) / 1000;
  complete(S, L.def.id, secs); store.save();
  setTimeout(() => { if (G.lesson === L) lessonSummary(L, secs); }, 3200);
}
function lessonOver() {
  const L = G.lesson, el = $('#lesson');
  el.innerHTML = `<div class="ch"><span>🎓 Lesson ${L.def.n} · ${esc(L.def.title)}</span></div>
    <p>The chequered flag came out before we finished. Run the lesson again to pick up where we stopped.</p>
    <div class="acts"><button type="button" class="go" data-l="nextlesson" data-id="${L.def.id}">Run it again</button><button type="button" data-l="results">Results</button><button type="button" data-l="academy">Academy</button></div>`;
  el.classList.remove('min'); el.hidden = false;
  $$('.hl').forEach((x) => x.classList.remove('hl')); G.lessonHl = null;
}
function lessonSummary(L, secs) {
  L.summed = secs;
  const def = L.def, n = doneCount(S), next = LESSONS.find((l) => l.n === def.n + 1 && !progress(S).lessons[l.id]?.done) || LESSONS.find((l) => !progress(S).lessons[l.id]?.done);
  const el = $('#lesson');
  // all five: the Academy badge, once
  const grad = n === LESSONS.length && !S.trophies.academy;
  if (grad) { S.trophies.academy = Date.now(); store.save(); setTimeout(() => acSay('a_grad'), 600); }
  el.innerHTML = `<div class="ch"><span>🎓 Lesson ${def.n} complete</span><span class="stp">${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}</span></div>
    <ul class="learned">${def.learn.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <div class="badge-row">${LESSONS.map((l) => `<i class="${progress(S).lessons[l.id]?.done ? 'on' : ''}" title="${esc(l.title)}">${l.n}</i>`).join('')}<span>${n === LESSONS.length ? 'Academy graduate' : `${n} of ${LESSONS.length} for the Academy badge`}</span></div>
    ${grad ? '<p class="grad">🎓 <b>Academy graduate.</b> All five lessons done. The badge is on your team page.</p>' : ''}
    <div class="acts">${next && !next.soon ? `<button type="button" class="go" data-l="nextlesson" data-id="${next.id}">Lesson ${next.n}: ${esc(next.title)}</button>` : ''}${G.race.done ? '<button type="button" data-l="results">Results</button>' : `<button type="button" class="${next && !next.soon ? '' : 'go'}" data-l="keep">Keep racing</button>`}<button type="button" data-l="academy">Academy</button></div>`;
  el.classList.remove('min'); el.hidden = false;
}
function academyHome(back = home) {
  const A = progress(S), n = doneCount(S);
  const sh = show(`<h2>Racing Academy</h2>
    <p class="lede">Five short lessons on a real race. Your engineer explains one thing at a time and you try it straight away. ${n ? `${n} of ${LESSONS.length} done.` : 'About three minutes each.'}</p>
    <ol class="lessons">${LESSONS.map((l) => { const d = A.lessons[l.id]?.done; return `<li class="${d ? 'done' : ''}${l.soon ? ' soon' : ''}"><span class="ln">${d ? '✓' : l.n}</span><div><b>${esc(l.title)}</b><span>${esc(l.goal)}</span></div>
      <button type="button" class="btn ${d ? 'ghost' : ''}" data-lesson="${l.id}" ${l.soon ? 'disabled' : ''}>${l.soon ? 'Soon' : d ? 'Again' : `Start · ${l.mins} min`}</button></li>`; }).join('')}</ol>
    <div class="guide"><b>Race guide</b><span>Ten ways to win, from the undercut to the first car on slicks. Read it any time.</span><button type="button" class="btn ghost" data-ac="guide">Open</button></div>
    ${S.trophies.academy ? '<p class="grad">🎓 <b>Academy graduate.</b> Run any lesson again whenever you like.</p>' : ''}
    <div class="actions"><button class="btn ghost" data-ac="back" type="button">Back</button></div>`);
  sh.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.lesson) startLesson(b.dataset.lesson);
    if (b.dataset.ac === 'guide') winSheet(() => academyHome(back));
    if (b.dataset.ac === 'back') back();
  };
}

function helpSheet(back) {
  const sh = show(`
    <h2>How to play</h2>
    <p class="lede">Your two AI drivers do the driving. You make the calls from the pit wall.</p>
    <ul class="help">
      <li><b>Tyres.</b> Softs are fastest but wear out quickest. Mediums and Hards last longer. In a dry race you must use two different dry compounds.</li>
      <li><b>Rain.</b> Watch the radar in the top bar. On a damp track switch to Inters (green); on a soaked track, Wets (blue). Back to slicks when it dries.</li>
      <li><b>Pit stop.</b> Tap a tyre under <i>Box this lap</i>. Your driver pits the next time past the pit entry. A stop costs about 8 seconds (a quarter of a lap).</li>
      <li><b>ERS (battery).</b> Deploy for speed on the straights, Harvest to recharge.</li>
      <li><b>Battle.</b> Attack to go for gaps, Defend to hold position. Both cost a little.</li>
      <li><b>Autonomous.</b> Flip the switch and your AI makes every call. Races you run fully autonomous are marked that way.</li>
      <li><b>Boost.</b> The green BOOST button on the race view fires the battery for 12 seconds. Use it when you're within a second of the car ahead.</li>
      <li><b>Racing words.</b> Not sure what an undercut is? The <a href="wiki" target="_blank" rel="noopener">racing wiki</a> has every term and command. On the radio, ask “what does dirty air mean?”</li>
      <li><b>Cameras.</b> Tap any car to follow it. Live (the TV director), Overview, Chase, Cockpit, TV and Pit views. Keys 1–6 on a keyboard, space to pause.</li>
    </ul>
    <div class="actions"><button class="btn" id="hBack" type="button">Got it</button><button class="btn ghost" id="hWin" type="button">Race guide</button></div>`);
  $('#hBack').addEventListener('click', back);
  $('#hWin').addEventListener('click', () => winSheet(() => helpSheet(back)));
}

// the engineer's plan for this race: start tyres for each driver and when to stop
// the briefing's projection runs in a worker (js/briefing.worker.js); results paint in as they land
const BRIEF_N = () => (lite ? 3 : 5);
let briefWorker = null;
function briefRun(o, key) {
  try { briefWorker?.terminate(); } catch { /* gone */ }
  briefWorker = null;
  const args = { venueId: o.venue.id, seed: o.seed, team: team(), dna: raceDNA(S, dnaOn), car: carModel() || 'falcon', laps: G.laps, ...(G.quali ? { quali: G.quali } : {}) };
  const done = (r) => {
    if (P.briefKey !== key) return;
    if (r.done) { P.projDone = true; recommend(); } else { P.proj = r.out; P.projI = r.i; P.projN = r.n; }
    if ($('.briefs')) P.paint?.();
  };
  // the better plan becomes the pick, unless you already chose
  const recommend = () => {
    if (P.touched || !P.proj) return;
    for (const id of ['you-0', 'you-1']) { const [a, b] = P.proj[id]; P.choice[id] = b.mid < a.mid || (b.mid === a.mid && b.beats > 0.5) ? 1 : 0; if (P.picks) P.picks[id] = P.plans[id][P.choice[id]].start; }
  };
  try {
    briefWorker = new Worker(new URL('./briefing.worker.js', import.meta.url), { type: 'module' });
    briefWorker.onmessage = (e) => done(e.data);
    briefWorker.onerror = () => { briefWorker = null; };
    briefWorker.postMessage({ args, plans: P.plans, n: BRIEF_N() });
  } catch { briefWorker = null; }
}
function planFor(v, probe) {
  const laps = probe.laps, wm = v.wear || 1, W = probe.weather, lines = [];
  const life = (c) => LIFE[c] * tyreLife(laps) / wm;
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
    <h2>Race guide</h2>
    <p class="lede">From the Racing Academy: the fastest car doesn't always win. The best calls do.</p>
    <ul class="help">
      <li><b>Pick a plan before the start.</b> Use the engineer's plan, then adjust as the race unfolds. Mediums to start is the safe one-stop. Softs gain places early but wear out fast.</li>
      <li><b>Split your two cars.</b> Put them on different tyres or stop on different laps. If the weather or a safety car goes against one, the other benefits.</li>
      <li><b>The undercut.</b> Stuck behind someone? Box a lap before they do. Fresh tyres are about a second a lap faster, so you can come out ahead when they stop.</li>
      <li><b>Watch tyre life.</b> Under 25%, grip falls off a cliff. Near 0% a tyre can puncture, and a puncture can end your race.</li>
      <li><b>Safety car means a cheap stop.</b> A normal stop costs about 8 seconds (a quarter of a lap). Under the safety car it costs about half. If your stop was due in the next few laps, box now.</li>
      <li><b>Rain.</b> Damp track: Inters. Soaked: Wets. When it dries, the first car on slicks gains the most. The radar in the top bar warns you a few laps ahead.</li>
      <li><b>ERS (battery).</b> Harvest when you're alone so you have charge for a fight. Then hit BOOST or Deploy when you're within a second of the car ahead, or to defend.</li>
      <li><b>Pace.</b> Save tyres on a long stint and Push in the last two laps. Attack makes passes more likely but risks contact. Defend makes you harder to pass.</li>
      <li><b>Two compounds.</b> In a dry race you must use two different dry tyres, or you get a 20-second penalty.</li>
      <li><b>New to the words?</b> The <a href="wiki" target="_blank" rel="noopener">racing wiki</a> explains every term and command in a sentence.</li>
      <li><b>Pit-exit fights.</b> Coming out just ahead of a rival? Defend and BOOST for the first lap while your new tyres warm up.</li>
    </ul>
    <div class="actions"><button class="btn" id="wBack" type="button">Back</button></div>`);
  $('#wBack').addEventListener('click', back);
}


const FEATURED = ['monaco', 'singapore'];
const venueById = (id) => VENUES.find((v) => v.id === id);
const quickO = (v) => ({ kind: 'quick', venue: v, seed: hashString('quick-' + v.id + '-' + Date.now()) });
function quickPick() { pre({ kind: 'quick' }, 'circuit'); }
// Race again: last quick race's circuit, tyres and calls, straight to the grid
function raceAgain() {
  const L = S.lastRace, v = L && venueById(L.venue); if (!v) return quickPick();
  needTeam(() => {
    live.clear();
    Object.assign(G, { ...quickO(v), round: null, day: null });
    G.laps = raceLaps(trackFor(v), S.settings.length || 'short');
    G.coach = !!L.coach && !L.auto;
    startRace({ ...L.picks }, !!L.auto);
  });
}

// Just race: a short race at Sakhir with a ready-made team, the coach on and the engineer's plan
function justRace() {
  const v = venueById('sakhir');
  live.clear();
  Object.assign(G, { ...quickO(v), round: null, day: null });
  G.laps = raceLaps(trackFor(v), 'short');
  const probe = setupRace({ venue: v, seed: G.seed, team: team(), dna: raceDNA(S, dnaOn), car: carModel() || 'falcon', laps: G.laps });
  const st = planFor(v, probe).start;
  G.coach = true;
  startRace({ 'you-0': st[0], 'you-1': st[1] }, false);
}

// Free practice: your two cars in a medium-length race at Sakhir with the coach on, every speed
// allowed and nothing at stake (no points, starts or trophies)
function freePractice() {
  const v = venueById('sakhir');
  live.clear();
  Object.assign(G, { kind: 'practice', venue: v, seed: hashString('practice-' + Date.now()), round: null, day: null });
  G.laps = raceLaps(trackFor(v), 'medium');
  G.coach = true;
  startRace({}, false);
}

// the garage tiles: tap a name to race that car, the picture for the 3D showroom
function wireCarTiles(sh) {
  $$('[data-car-model]', sh).forEach((b) => b.addEventListener('click', () => {
    S.settings.car = b.dataset.carModel || null; store.save();
    $$('[data-car-model]', sh).forEach((x) => { x.closest('.car-tile').classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    if (world) world.setModel(carModel());
  }));
  // the picture picks the car too; Next then opens it in 3D to paint
  $$('[data-show]', sh).forEach((b) => b.addEventListener('click', () => $(`[data-car-model="${b.dataset.show}"]`, sh)?.click()));
}
const modeHTML = (auto) => `<div class="mode">
      <button type="button" data-m="0" class="${auto ? '' : 'on'}"><b>Team Principal</b><span>You call pit stops, tyres and tactics. Your engineer advises.</span></button>
      <button type="button" data-m="1" class="${auto ? 'on' : ''}"><b>Autonomous</b><span>Your AI makes every call. Sit back and watch. You can take over any time.</span></button>
    </div>`;

// the garage: every car in the series, as rendered pictures with their strengths. Tap a car to race
// it; 3D opens it in the showroom.
function carTiles() {
  const cur = carModel() || '';
  // tap the picture to spin the car round in 3D; tap its name to race it
  const tile = (c) => `<div class="car-tile ${cur === c.id ? 'on' : ''}">
    <button type="button" class="ct-img" data-show="${c.id}" aria-label="Pick the ${c.name}"><img src="assets/cars/${c.id}.webp" alt="" width="320" height="180" loading="lazy" decoding="async"><span class="ct-3d">360°</span></button>
    <button type="button" class="ct-pick" data-car-model="${c.id}" aria-pressed="${cur === c.id}"><b>${c.name}</b><span>${esc(c.line)}</span>
      <span class="ct-bars">${strengthBars(c.id).map(([k, v]) => `<i title="${k}"><u style="width:${v}%"></u><small>${k}</small></i>`).join('')}</span></button></div>`;
  return `<div class="garage">${MODELS.map(tile).join('')}
    <div class="car-tile simple ${cur === '' ? 'on' : ''}"><button type="button" class="ct-pick" data-car-model="" aria-pressed="${cur === ''}"><b>Simple cars</b><span>Plain blocky cars from the first version. Pick these only if the race stutters on your phone.</span></button></div></div>`;
}
function showroom(back, id, onward) {
  openShowroom({ S, show, save: store.save, team }, { id: id || carModel() || 'falcon', lite, back, onward,
    pick: (cid) => { S.settings.car = cid; store.save(); if (world) world.setModel(carModel()); } });
}
// what each tyre does at this track: speed, and roughly how many laps before it fades
function tyreGuide(v) {
  const wm = v.wear || 1, laps = (c) => Math.max(1, Math.round(LIFE[c] * tyreLife(G.laps || 0) / wm * 0.8));
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

// race setup, one screen at a time: circuit (Quick race only), car, tyres, then race settings
let P = null;
function pre(o, step = o.venue ? 'car' : 'circuit') {
  if ((!P || P.o !== o) && !o.first && passLocked(o.kind)) return passSheet(G.attract ? home : results, { want: o.kind });
  if (!P || P.o !== o) { P = { o, picks: null, auto: !!S.settings.auto, coachOn: coachDefault(o.kind) }; live.clear(); G.quali = null; }
  const steps = [...(o.kind === 'quick' ? ['circuit'] : []), 'car', ...(o.first ? [] : ['quali']), 'tyres', 'settings'];
  const i = steps.indexOf(step), go = (k) => pre(o, steps[i + k]);
  const back = () => (i ? go(-1) : home());
  const label = o.first ? 'Your first race' : o.kind === 'daily' ? `Daily Grand Prix #${o.day}` : o.kind === 'dailyfull' ? `Daily #${o.day} · Full distance` : o.kind === 'season' ? `Season ${S.season.no} · Round ${o.round}` : 'Quick race';
  const head = (title) => `<header class="wiz-head">${dots(i, steps.length)}<div class="sub">${label}</div>${o.venue && step !== 'circuit' ? `<h2>${o.venue.flag} ${esc(o.venue.city)} Grand Prix</h2>` : ''}${title}</header><div class="wiz-body">`;

  if (step === 'circuit') {
    const vb = (v) => `<button type="button" data-v="${v.id}" class="${v.id === (o.venue && o.venue.id) ? 'next' : ''}"><b>${v.flag} ${esc(v.city)}</b><span>${esc(v.country)} · ${esc(v.circuit)}</span><span>${tempTxt(v.temp).split(' /')[0]} · ${v.rain > 0.35 ? 'Rain likely' : v.rain > 0.15 ? 'Rain possible' : 'Usually dry'}${v.time === 'night' ? ' · Night' : ''}</span></button>`;
    const sh = show(`${head('<h2>Pick a circuit</h2><p class="lede">No points, just racing. Good for practice.</p>')}
      <div class="sub">Featured</div>
      <div class="venues feat">${FEATURED.map((id) => vb(venueById(id))).join('')}</div>
      <input class="vsearch" id="vSearch" type="search" placeholder="Search a city or country" aria-label="Search circuits" autocomplete="off">
      <div class="venues" id="vAll">${VENUES.filter((v) => !FEATURED.includes(v.id)).map(vb).join('')}</div>
      <p class="note" id="vNone" hidden>No circuit matches that.</p>
      </div><div class="actions wiz-foot"><button class="btn ghost" data-wiz="back" type="button">Back</button></div>`, 'wizp');
    $$('[data-v]', sh).forEach((b) => b.addEventListener('click', () => {
      o.venue = venueById(b.dataset.v); o.seed = hashString('quick-' + o.venue.id + '-' + Date.now()); P.picks = null;
      needTeam(() => pre(o, 'car'));
    }));
    $('#vSearch').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase(); let n = 0;
      $$('#vAll [data-v]', sh).forEach((b) => { const hit = !q || b.textContent.toLowerCase().includes(q); b.hidden = !hit; n += hit; });
      $('#vNone').hidden = n > 0;
    });
    $('[data-wiz="back"]', sh).addEventListener('click', home);
    return;
  }
  Object.assign(G, { kind: o.kind, venue: o.venue, seed: o.seed, round: o.round || null, day: o.day || null });
  const length = o.kind === 'daily' ? 'short' : o.kind === 'dailyfull' ? 'full' : o.length || S.settings.length || 'short';
  G.laps = raceLaps(trackFor(o.venue), length);

  if (step === 'car') {
    const sh = show(`${head('<p class="lede">Pick your car, then tap Next to paint it in 3D.</p>')}
      ${carTiles()}${wizFoot('Next')}`, 'wizp');
    wireCarTiles(sh);
    // Next opens the chosen car in the showroom; Save there moves on to qualifying (simple cars skip it)
    wizWire(sh, () => (carModel() ? showroom(() => pre(o, 'car'), carModel(), { label: 'Save', go: () => go(1) }) : go(1)), back);
    return;
  }
  if (step === 'quali') {
    const res = P.qres;
    const sh = show(`${head('<p class="lede">Qualifying sets where you start: one flying lap each, and the fastest lap starts at the front.</p>')}
      ${res ? `<div class="sub">Your grid${P.qskip ? ' (qualifying skipped)' : ''}</div>${qualiTable(res, true)}` : `<div class="qintro"><div><b>🏁 Do it yourself</b><span>Your calls: tyre, timing, push. Best shot at pole</span></div><div><b>🤖 Your agents</b><span>They qualify for you. A well-trained team does well</span></div><div><b>⏭️ Skip</b><span>No lap set. You start P12 to P20</span></div></div>`}
      </div><div class="actions wiz-foot">${res ? `<button class="btn" data-wiz="next" type="button">Next: race briefing</button><button class="btn ghost" id="qWatch" type="button">${P.qskip ? 'Qualify after all' : 'Run it again'}</button>` : '<button class="btn" id="qWatch" type="button">Qualify myself</button><button class="btn ghost" id="qAgents" type="button">Let my agents qualify</button><button class="btn ghost" id="qSkip" type="button">Skip</button>'}<button class="btn ghost" data-wiz="back" type="button">Back</button></div>`, 'wizp');
    if (res) $('[data-wiz="next"]', sh).addEventListener('click', () => go(1));
    $('[data-wiz="back"]', sh).addEventListener('click', back);
    $('#qWatch', sh).addEventListener('click', () => qualiWatch(o, () => pre(o, 'quali')));
    const ag = $('#qAgents', sh);
    if (ag) ag.addEventListener('click', () => { const Q = qualiSession(o, {}); while (!Q.done) Q.step(DT); qualiKeep(Q); P.qskip = false; pre(o, 'quali'); });
    const sk = $('#qSkip', sh);
    if (sk) sk.addEventListener('click', () => { qualiSkip(o); pre(o, 'quali'); });
    return;
  }
  if (step === 'tyres') {
    // the pre-race briefing: Plan A and Plan B per driver, priced by the real engine in the background
    const probe = setupRace({ venue: o.venue, seed: o.seed, team: team(), dna: raceDNA(S, dnaOn), car: carModel() || 'falcon', laps: G.laps, quali: G.quali });
    const T = probe.track, W = probe.weather, wetStart = W.wet0 > 0.17;
    const grid = (id) => probe.grid.findIndex((e) => e.id === id) + 1;
    const rainTxt = wetStart ? 'Wet track at the start' : W.showers.length ? `${Math.round(clamp(o.venue.rain + 0.25, 0.3, 0.9) * 100)}% chance of rain` : o.venue.rain > 0.2 ? `${Math.round(o.venue.rain * 60)}% chance of rain` : 'Dry';
    const key = [o.seed, G.laps, carModel(), JSON.stringify(raceDNA(S, dnaOn) && Object.values(raceDNA(S, dnaOn)).map((p) => p.hash)), JSON.stringify(G.quali || {})].join('|');
    if (P.briefKey !== key) {
      P.briefKey = key; P.proj = null; P.projDone = false; P.touched = false;
      P.plans = briefPlans({ laps: probe.laps, wear: o.venue.wear || 1, wet0: W.wet0, showers: W.showers.length });
      P.choice = { 'you-0': 0, 'you-1': 0 }; P.custom = false; P.picks = null;
      briefRun(o, key);
    }
    const picks = P.picks ||= { 'you-0': P.plans['you-0'][0].start, 'you-1': P.plans['you-1'][0].start };
    const sh = show(`${head(`<p class="lede">${esc(o.venue.circuit)}, ${esc(o.venue.country)}. ${esc(o.venue.note)}</p>`)}
      <div class="facts">
        <div><small>Laps</small><b>${probe.laps}</b></div>
        <div><small>Lap length</small><b>${(T.L / 1000).toFixed(2)} km</b></div>
        <div><small>Weather · simulated</small><b>${tempTxt(o.venue.temp)} · ${rainTxt}</b></div>
        <div><small>Tyre wear</small><b>${o.venue.wear >= 1.15 ? 'High' : o.venue.wear <= 0.85 ? 'Low' : 'Medium'}</b></div>
      </div>
      ${o.kind === 'daily' || o.kind === 'dailyfull' || o.first ? '' : `<div class="sub">Race length</div>
      <div class="vpick lengths">${LENGTHS.map((l) => `<button type="button" data-len="${l.id}" class="${length === l.id ? 'on' : ''}"><b>${l.name}</b><span>${raceLaps(T, l.id)} laps · ${l.note}</span></button>`).join('')}</div>`}
      <div class="sub">Pre-race briefing</div>
      <p class="note">Your engineer's two plans for each driver. The race engine runs this race ${BRIEF_N() * 2} times in the background, with the same grid and forecast, to see where each plan finishes.</p>
      <div class="briefs">${team().drivers.map((d, k) => `<div class="brief" data-car="you-${k}"><div class="who"><span class="sw" style="width:5px;height:16px;border-radius:2px;background:${team().c1}"></span><span class="dn">${esc(d.name)}</span><button type="button" class="rn" data-rename="${k}" aria-label="Rename ${esc(d.name)}" title="Rename">✏️</button> · starts P${grid('you-' + k)}</div>
        ${[0, 1].map((j) => `<button type="button" class="pl" data-plan="${j}" aria-pressed="false"><span class="pn">Plan ${'AB'[j]}<i class="rec" hidden>Best here</i></span><span class="pd">${tyreHTML(P.plans['you-' + k][j].start)}${esc(P.plans['you-' + k][j].note)}</span><span class="pj">Running the race…</span></button>`).join('')}</div>`).join('')}</div>
      <p class="note" id="briefProg"></p>
      <div class="custom" id="custom" ${P.custom ? '' : 'hidden'}><div class="sub">Customize: starting tyres</div>
      <p class="note">Your own start. You call the stops yourself in the race; the pit wall shows when the window opens.</p>
      <div class="pick">${team().drivers.map((d, k) => `<div><div class="who">${esc(d.name)}</div>
        <div class="box-row" data-car="you-${k}">${Object.keys(COMPOUNDS).map((c) => `<button type="button" data-c="${c}" class="${picks['you-' + k] === c ? 'on' : ''}">${tyreHTML(c)}${COMPOUNDS[c].name}</button>`).join('')}</div></div>`).join('')}</div></div>
      <details class="tg"${o.first ? ' open' : ''}><summary class="${S.settings.tyresSeen ? '' : 'glow'}"><span class="tg-dots"><i class="s"></i><i class="m"></i><i class="h"></i><i class="w"></i></span><span><b>Learn about tyres</b><small>Which rubber, when to stop, and the race guide</small></span></summary>${tyreGuide(o.venue)}<p><button class="btn ghost" id="howWin" type="button">Race guide</button></p></details>
      </div><div class="actions wiz-foot"><button class="btn" data-wiz="next" type="button">Accept plan</button><button class="btn ghost${S.settings.customSeen ? '' : ' invite'}" id="customBtn" type="button">${P.custom ? 'Use the plans' : 'Customize'}</button><button class="btn ghost" data-wiz="back" type="button">Back</button></div>`, 'wizp');
    const paint = () => {
      for (const id of ['you-0', 'you-1']) {
        const box = $(`.brief[data-car="${id}"]`, sh); if (!box) continue;
        $$('.pl', box).forEach((b, j) => {
          const on = !P.custom && P.choice[id] === j; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
          const r = P.proj && P.proj[id][j];
          b.querySelector('.pj').innerHTML = !r || !r.n ? 'Running the race…' : `Projected <b>P${r.mid}</b> · range P${r.best}–P${r.worst}${r.dnf ? ` · out in ${r.dnf} of ${r.n}` : ''} · ahead of Plan ${'BA'[j]} in <b>${Math.round(r.beats * r.n)} of ${r.n}</b>`;
          const best = P.projDone && P.proj && (r.mid < P.proj[id][1 - j].mid || (r.mid === P.proj[id][1 - j].mid && r.beats > 0.5));
          b.querySelector('.rec').hidden = !best;
        });
      }
      const pr = $('#briefProg', sh); if (pr) pr.textContent = P.projDone ? '' : P.projI ? `Simulating: ${P.projI} of ${P.projN} races done.` : '';
    };
    P.paint = paint; paint();
    $$('.brief', sh).forEach((box) => $$('.pl', box).forEach((b) => b.addEventListener('click', () => {
      const id = box.dataset.car, j = +b.dataset.plan; P.choice[id] = j; P.touched = true; P.custom = false; picks[id] = P.plans[id][j].start;
      $('#custom').hidden = true; $('#customBtn').textContent = 'Customize'; paint();
    })));
    $$('.box-row', sh).forEach((row) => $$('button', row).forEach((b) => b.addEventListener('click', () => {
      picks[row.dataset.car] = b.dataset.c; $$('button', row).forEach((x) => x.classList.toggle('on', x === b));
    })));
    $('#customBtn').addEventListener('click', () => {
      if (!S.settings.customSeen) { S.settings.customSeen = true; store.save(); $('#customBtn').classList.remove('invite'); }
      P.custom = !P.custom; $('#custom').hidden = !P.custom; $('#customBtn').textContent = P.custom ? 'Use the plans' : 'Customize';
      if (!P.custom) for (const id of ['you-0', 'you-1']) picks[id] = P.plans[id][P.choice[id]].start;
      $$('.box-row', sh).forEach((row) => $$('button', row).forEach((x) => x.classList.toggle('on', x.dataset.c === picks[row.dataset.car])));
      paint(); if (P.custom) $('#custom').scrollIntoView({ block: 'nearest' });
    });
    $$('[data-len]', sh).forEach((b) => b.addEventListener('click', () => { S.settings.length = b.dataset.len; store.save(); const y = $('#sheet').scrollTop; pre(o, 'tyres'); $('#sheet').scrollTop = y; }));
    $('#howWin').addEventListener('click', () => winSheet(() => pre(o, 'tyres')));
    // rename a driver right here: tap the pencil, type, Enter (or tap away) to keep it
    sh.addEventListener('click', (e) => {
      const rb = e.target.closest('[data-rename]'); if (!rb) return;
      const k = +rb.dataset.rename, span = rb.previousElementSibling, d = S.team.drivers[k];
      const inp = document.createElement('input'); inp.className = 'rn-in'; inp.value = d.name; inp.maxLength = 18; inp.setAttribute('aria-label', 'Driver name');
      span.replaceWith(inp); rb.hidden = true; inp.focus(); inp.select();
      let shut = false;
      const done = (keep) => {
        if (shut || !inp.isConnected) return; shut = true; // swapping the input out fires blur again
        const v = inp.value.replace(/\s+/g, ' ').trim();
        if (keep && v && v !== d.name) { d.name = v; const c = codeOf(v), other = S.team.drivers[1 - k].code; if (!codeProblem(c, other)) d.code = c; store.save(); }
        const ns = document.createElement('span'); ns.className = 'dn'; ns.textContent = d.name; inp.replaceWith(ns); rb.hidden = false; rb.setAttribute('aria-label', 'Rename ' + d.name);
        $$('.pick .who', sh)[k] && ($$('.pick .who', sh)[k].textContent = d.name);
      };
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); });
      inp.addEventListener('blur', () => done(true));
    });
    $('details.tg', sh).addEventListener('toggle', (e) => { if (e.target.open && !S.settings.tyresSeen) { S.settings.tyresSeen = true; store.save(); $('summary', e.target).classList.remove('glow'); } });
    wizWire(sh, () => {
      // the accepted plans ride into the race: start tyres, and the stops the pit wall reminds you of
      G.stops = P.custom ? null : { 'you-0': P.plans['you-0'][P.choice['you-0']].stops, 'you-1': P.plans['you-1'][P.choice['you-1']].stops };
      G.planNotes = P.custom ? null : { 'you-0': P.plans['you-0'][P.choice['you-0']].note, 'you-1': P.plans['you-1'][P.choice['you-1']].note };
      if (!P.custom) toast('Plan accepted: ' + ['you-0', 'you-1'].map((id) => `${team().drivers[+id.slice(-1)].name} Plan ${'AB'[P.choice[id]]}`).join(', ') + '.');
      go(1);
    }, back);
    return;
  }
  // race settings
  const sh = show(`${head('<p class="lede">Last checks before the grid.</p>')}
    <div class="sub">Who makes the calls?</div>
    ${modeHTML(P.auto)}
    <label class="coachopt"><input type="checkbox" id="coachOpt" ${P.coachOn ? 'checked' : ''}><span><b>Race coach</b> Tips at the right moment during the race, with a button to act on them in one tap. Good for your first races.</span></label>
    <div class="sub">Radio voice</div>
    ${vpickHTML()}
    <label class="coachopt"><input type="checkbox" id="replyOpt" ${S.settings.replies !== false ? 'checked' : ''}><span><b>Drivers answer</b> Your drivers reply on the radio in their own voices.</span></label>
    ${radioSupported() ? `<label class="coachopt"><input type="checkbox" id="freeOpt" ${S.settings.handsfree ? 'checked' : ''}><span><b>Hands-free radio</b> The mic stays on during your races. Say "Radio", then the call: "Radio, box box, softs". It goes quiet while your team is talking. Best with headphones.</span></label>` : ''}
    <div class="sub">Driver DNA</div>
    <div class="dna-pre">${dnaLine(S, team())}<button class="btn ghost" id="preDna" type="button">Tune</button></div>
    <label class="statsopt"><input type="checkbox" id="statsOpt" ${statsEl.hidden ? '' : 'checked'}> Show frame rate (for testing on your phone)</label>
    </div><div class="actions wiz-foot"><button class="btn go" id="goGrid" type="button">Go to the grid</button><button class="btn ghost" data-wiz="back" type="button">Back</button></div>`, 'wizp');
  $$('[data-m]', sh).forEach((b) => b.addEventListener('click', () => { P.auto = b.dataset.m === '1'; $$('[data-m]', sh).forEach((x) => x.classList.toggle('on', x === b)); }));
  vpickWire(sh);
  $('#coachOpt').addEventListener('change', (e) => { P.coachOn = e.target.checked; S.settings.coach = P.coachOn; store.save(); });
  $('#replyOpt').addEventListener('change', (e) => { S.settings.replies = e.target.checked; store.save(); });
  $('#freeOpt')?.addEventListener('change', (e) => { S.settings.handsfree = e.target.checked; store.save(); if (G.race) talkBtn(G.race); });
  $('#statsOpt').addEventListener('change', (e) => { S.settings.stats = e.target.checked; store.save(); statsEl.hidden = !e.target.checked; });
  $('#preDna').addEventListener('click', () => studio(() => pre(o, 'settings')));
  $('[data-wiz="back"]', sh).addEventListener('click', back);
  $('#goGrid').addEventListener('click', () => {
    const picks = P.picks || { 'you-0': 'M', 'you-1': 'M' };
    S.settings.auto = P.auto;
    if (o.kind === 'quick') S.lastRace = { venue: o.venue.id, picks: { ...picks }, auto: P.auto, coach: P.coachOn };
    store.save(); G.coach = P.coachOn && !P.auto; startRace(picks, P.auto);
  });
}

// ---------- qualifying (js/quali.js) ----------
function qualiSession(o, choices) {
  const probe = setupRace({ venue: o.venue, seed: o.seed, team: team(), dna: raceDNA(S, dnaOn), car: carModel() || 'falcon', laps: G.laps });
  return new QualiSession({ entries: probe.entries, venue: o.venue, seed: o.seed, track: probe.track, weather: probe.weather, choices, mine: ['you-0', 'you-1'] });
}
// the session's result becomes the grid: its calls go on the race's record so a leaderboard rebuilds it
function qualiKeep(Q) {
  G.quali = Q.result().choices; P.qskip = false;
  P.qres = Q.order.map((c) => ({ id: c.id, code: c.code, name: c.name, c1: c.team.c1, best: c.best, mine: c.id.startsWith('you-'), tyre: Q.plan.runs.get(c.id).tyre }));
}
// skipping: your cars set no lap and start from P12 to P20 (js/quali.js); the grid is the plan's own
function qualiSkip(o) {
  const choices = { 'you-0': { skip: true }, 'you-1': { skip: true } }, Q = qualiSession(o, choices);
  G.quali = choices; P.qskip = true;
  P.qres = Q.plan.order.map((e) => { const c = Q.byId.get(e.id), r = Q.plan.runs.get(e.id); return { id: c.id, code: c.code, name: c.name, c1: c.team.c1, best: r.time, mine: c.id.startsWith('you-'), tyre: r.tyre }; });
}
function qualiTable(rows, short) {
  const pole = rows[0] && rows[0].best;
  const list = short ? rows.filter((r, k) => k < 5 || r.mine) : rows;
  return `<ol class="qtab">${list.map((r) => { const k = rows.indexOf(r); return `<li class="${r.mine ? 'mine' : ''}"><span class="p">P${k + 1}</span><i style="background:${r.c1}"></i><b>${esc(r.code)}</b><span class="n">${esc(r.name)}</span>${tyreHTML(r.tyre)}<span class="t">${k === 0 || !Number.isFinite(r.best) ? fmtQ(r.best) : '+' + (r.best - pole).toFixed(3)}</span></li>`; }).join('')}</ol>`;
}
function qualiWatch(o, done) {
  hide(); loadVenue(o.venue);
  const Q = G.qs = qualiSession(o, {});
  Q.acc = 0; G.qsSpeed = reduce ? 1 : 4; G.qsDone = done; G.qsFollow = null; G.qsCard = 'you-0';
  world.setCars(Q.cars);
  setCam('live'); $('#hud').hidden = true;
  const el = $('#qpanel') || app.appendChild(Object.assign(document.createElement('div'), { id: 'qpanel', className: 'qpanel' }));
  el.hidden = false; el.innerHTML = '';
  el.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const id = b.dataset.car;
    if (b.dataset.go) Q.call(id, { go: true });
    else if (b.dataset.tyre) Q.call(id, { tyre: b.dataset.tyre });
    else if (b.dataset.push) Q.call(id, { push: b.dataset.push });
    else if (b.dataset.qspeed) G.qsSpeed = +b.dataset.qspeed;
    else if (b.dataset.follow) G.qsFollow = b.dataset.follow;
    else if (b.dataset.show) G.qsCard = G.qsFollow = b.dataset.show;
    else if (b.id === 'qSkip') { while (!Q.done) Q.step(DT); }
    else if (b.id === 'qDone') { qualiEnd(); return; }
    qualiUI(true);
  };
  qualiUI(true);
}
function qualiEnd() {
  const Q = G.qs; if (!Q) return;
  qualiKeep(Q); G.qs = null;
  $('#qpanel').hidden = true;
  const done = G.qsDone; G.qsDone = null;
  // the home race comes back behind the menus; the grid is kept for the briefing
  if (G.race && G.race.venue && G.race.venue.id === world.venue.id) { world.setCars(G.race.cars); setCam('live'); } else attract();
  done && done();
}
function qualiFrame(dt) {
  const Q = G.qs;
  if (!Q.done) { Q.acc += dt * G.qsSpeed; let n = 0; while (Q.acc >= DT && n < 400) { Q.step(DT); Q.acc -= DT; n++; } }
  // the camera: the car you picked, else yours when it is out, else whoever is on a flying lap
  const out = (c) => c && !c.dnf;
  let sel = out(Q.byId.get(G.qsFollow)) ? G.qsFollow : null;
  sel ||= ['you-0', 'you-1'].find((id) => Q.byId.get(id).status === 'flying') || ['you-0', 'you-1'].find((id) => out(Q.byId.get(id)));
  sel ||= (Q.cars.filter((c) => c.status === 'flying').sort((a, b) => b.dist - a.dist)[0] || Q.cars.find(out) || {}).id;
  if (sel && sel !== G.sel) { G.sel = sel; }
  world.update(Q, Q.done ? 1 : clamp(Q.acc / DT, 0, 1), dt, camera, G.sel, ['you-0', 'you-1'], true, { speed: G.qsSpeed, focus: cams.look, showRing: !!G.sel });
  cams.update(dt, G.sel);
  renderer.render(world.scene, camera);
  G.qsUI = (G.qsUI || 0) + dt; if (G.qsUI > 0.2) { G.qsUI = 0; qualiUI(); }
}
const Q_STATUS = { garage: 'In the garage', out: 'Out lap', flying: 'Flying lap', in: 'In lap', done: 'Lap done' };
function qualiUI(force) {
  const Q = G.qs, el = $('#qpanel'); if (!Q || !el) return;
  const left = Math.max(0, Q_LEN - Q.t), pole = Q.order[0] && Q.order[0].best;
  const clock = Q.done ? 'Session over' : left > 0 ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} left` : 'Chequered flag';
  const rows = Q.order.map((c, k) => `<li class="${c.player ? 'mine' : ''}${c.status === 'flying' ? ' fly' : ''}"><span class="p">${k + 1}</span><i style="background:${c.team.c1}"></i><b>${esc(c.code)}</b><span class="t">${Number.isFinite(c.best) ? (k === 0 ? fmtQ(c.best) : '+' + (c.best - pole).toFixed(3)) : c.status === 'garage' ? '' : Q_STATUS[c.status]}</span></li>`).join('');
  const noteOf = (c, run) => c.status === 'garage' ? (Q.t < Q_LEN ? `Goes out in ${Math.max(0, Math.ceil(run.go - Q.t))} s, or send ${c.code} now` : 'Stayed in the garage') :
    c.status === 'out' ? 'Out lap: warming the tyres' : c.status === 'flying' ? `Flying lap${c.sectors.length ? ` · sector ${c.sectors.length} done` : ''}` :
    Number.isFinite(c.best) ? `P${c.pos} · ${fmtQ(c.best)}${run.spoiled ? ' · locked up' : ''}` : run.noTime ? 'No time: the flag fell first' : Q_STATUS[c.status];
  // the buttons are only rebuilt when what they can do changes, so a tap never lands on a button
  // that is being replaced; the clock, the timing tower and the notes update in place
  const mineCard = (id) => {
    const c = Q.byId.get(id), run = Q.plan.runs.get(id), inG = c.status === 'garage', canPush = inG || c.status === 'out';
    const tyres = Q.plan.wet ? ['I', 'W', 'S'] : ['S', 'M', 'H'];
    return `<div class="qcar" data-id="${id}"><div class="qwho"><i style="background:${c.team.c1}"></i><b>${esc(c.name)}</b><button type="button" class="link" data-follow="${id}">Watch</button></div>
      <div class="qnote" data-note="${id}"></div>
      <div class="qrow"><span>Tyre</span>${tyres.map((t) => `<button type="button" data-car="${id}" data-tyre="${t}" class="${run.tyre === t ? 'on' : ''}" ${inG ? '' : 'disabled'}>${tyreHTML(t)}${COMPOUNDS[t].name}</button>`).join('')}</div>
      <div class="qrow"><span>Lap</span>${[['push', 'Push'], ['normal', 'Normal'], ['steady', 'Steady']].map(([k, n]) => `<button type="button" data-car="${id}" data-push="${k}" class="${run.push === k ? 'on' : ''}" ${canPush ? '' : 'disabled'}>${n}</button>`).join('')}</div>
      ${inG && Q.t < Q_LEN ? `<button type="button" class="btn small" data-car="${id}" data-go="1">Send ${esc(c.code)} out now</button>` : ''}</div>`;
  };
  const key = JSON.stringify([Q.done, G.qsSpeed, G.qsCard, ...['you-0', 'you-1'].map((id) => { const c = Q.byId.get(id), r = Q.plan.runs.get(id); return [c.status, r.tyre, r.push, Q.t < Q_LEN]; })]);
  if (force || el.dataset.k !== key) {
    el.dataset.k = key;
    el.innerHTML = `<header><b>Qualifying</b><span class="qclock"></span></header>
    <ol class="qtower"></ol><ul class="qfeed"></ul>
    <div class="qpick">${['you-0', 'you-1'].map((id) => `<button type="button" data-show="${id}" class="${G.qsCard === id ? 'on' : ''}">${esc(Q.byId.get(id).name)}</button>`).join('')}</div>
    <div class="qmine" data-show="${G.qsCard}">${mineCard('you-0')}${mineCard('you-1')}</div>
    <p class="qhelp">Push finds time but can lock up the lap. Later laps are quicker, but start your lap before the flag.</p>
    <div class="qfoot">${Q.done ? '<button type="button" class="btn" id="qDone">See the grid</button>' : `<span class="qspd">${[1, 4, 10].map((x) => `<button type="button" data-qspeed="${x}" class="${G.qsSpeed === x ? 'on' : ''}">${x}×</button>`).join('')}</span><button type="button" class="btn ghost small" id="qSkip">Skip to the result</button>`}</div>`;
  }
  $('.qclock', el).textContent = clock;
  const tw = $('.qtower', el); if (tw.dataset.h !== rows) { tw.dataset.h = rows; tw.innerHTML = rows; }
  const feed = Q.events.slice(-3).reverse().map((e) => `<li class="${e.mine ? 'mine' : ''}">${esc(e.text)}</li>`).join('');
  const fd = $('.qfeed', el); if (fd.dataset.h !== feed) { fd.dataset.h = feed; fd.innerHTML = feed; }
  for (const id of ['you-0', 'you-1']) { const n = $(`[data-note="${id}"]`, el); if (n) n.textContent = noteOf(Q.byId.get(id), Q.plan.runs.get(id)); }
}

function startRace(picks, auto, saved = null) {
  hide();
  if (!(saved && saved.live)) { G.room = null; stopListening(); }
  // a Racing Academy lesson rides on this race when startLesson() asked for one
  G.lesson = saved ? null : G.nextLesson || null; G.nextLesson = null;
  G.stage = G.lesson ? G.lesson.def.race.stage : null; lessonCard(null);
  G.attract = false; G.ended = false; G.paused = false; G.acc = 0; G.evIdx = 0; G.assisted = false; G.forecastSaid = new Set();
  speedUI();
  app.classList.remove('attract');
  loadVenue(G.venue);
  // everything the race is built from is kept, so a refresh can build the same race again
  const args = saved ? saved.args : { team: team(), startCompounds: picks, auto, dna: raceDNA(S, dnaOn), car: carModel() || 'falcon', laps: G.laps || undefined, ...(G.quali && !G.lesson ? { quali: G.quali } : {}), ...(G.stops && !G.lesson ? { stops: G.stops } : {}), ...(G.stage ? { stage: G.stage } : {}), ...(G.lesson && G.lesson.def.race.dna ? { dna: { car1: fromPreset('car1', G.lesson.def.race.dna.car1), car2: fromPreset('car2', G.lesson.def.race.dna.car2) } } : {}) };
  // a briefing plan belongs to the race it was made for: used once, then gone
  G.stops = null; G.quali = null; try { briefWorker?.terminate(); } catch { /* gone */ } briefWorker = null;
  const setup = setupRace({ venue: G.venue, seed: G.seed, ...args });
  G.setup = setup; G.race = setup.make(); G.auto0 = auto;
  // each driver's own brain, its manner from the Driver DNA it races with
  G.brains = { 'you-0': new Brain('you-0', args.dna?.car1?.params), 'you-1': new Brain('you-1', args.dna?.car2?.params) };
  live.track(G.race, args, saved);
  if (!saved && !auto && S.settings.assist && G.kind !== 'academy' && G.kind !== 'live') ['you-0', 'you-1'].forEach((id) => G.race.command(id, { assist: true }));
  world.setCars(G.race.cars);
  G.sel = 'you-0'; G.mineSel = 'you-0'; G.coachState = null; G.eng = null; G.boxPicks = {}; coachHide(); G.suggest = null; $('#suggest').hidden = true;
  $('#radio').innerHTML = '';
  buildTower(); buildCard(); renderControls(true);
  $('#hud').hidden = false; $('#camPill').hidden = false;
  setCam('live');
  if (S.settings.sound !== false) sound.start(lite);
  voice.use(voiceId(), sound.ctx);
  // your drivers' own lines (js/brain.js), fetched now so the first answer isn't waiting on a download
  if (S.settings.replies !== false && voiceId()) mine().forEach((id) => voice.pack(driverVoice(id) + '-brain'));
  addRadio({ from: 'engineer', chat: true, text: auto ? 'Autonomous mode. I\'ll make the calls; take over whenever you like.' : `Radio check. You have the calls. ${G.setup.weather.showers.length || G.setup.weather.wet0 ? 'Keep an eye on the sky today.' : 'It looks dry: we need one stop for a second compound.'}` });
  if (!auto) for (const id of ['you-0', 'you-1']) {
    const c = G.race.byId.get(id);
    if (!c.plan.lap) continue;
    const st = [{ lap: c.plan.lap, tyre: c.plan.next }, ...(c.stopsLeft || [])];
    addRadio({ from: 'engineer', text: `${c.code} plan: ${st.length > 1 ? `${st.length} stops, around laps ${st.map((x) => x.lap + 1).join(' and ')}, onto ${st.map((x) => COMPOUNDS[x.tyre].name + 's').join(' then ')}` : `one stop around lap ${c.plan.lap + 1}, then ${COMPOUNDS[c.plan.next].name}s`}. The pit wall will show you when the window opens.` });
  }
  if (saved && saved.live) lightsSequence(true);   // a live race's lights are the room's clock
  else if (saved) { live.replay(G.race, saved); G.evIdx = G.race.events.length; lightsSequence(true); addRadio({ from: 'engineer', text: `We're back. Lap ${G.race.leaderLap()} of ${G.race.laps}.` }); toast('Race resumed where you left it'); }
  tick();
  // a lesson starts the lights itself, once the engineer has said hello
  if (G.lesson) lessonStart();
  else if (!saved) lightsSequence();
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

// the radio voice: picked before the race, and changeable during it (Team radio panel, pause menu)
function vpickHTML() {
  return `<div class="vpick">${[...VOICES, { id: '', name: 'Off', note: 'Text only' }].map((v) => `<button type="button" data-voice="${v.id}" class="${(voiceId() || '') === v.id ? 'on' : ''}"><b>${v.name}</b><span>${v.note}</span></button>`).join('')}</div>`;
}
function vpickWire(sh) {
  $$('[data-voice]', sh).forEach((b) => b.addEventListener('click', () => {
    S.settings.voice = b.dataset.voice || null; store.save();
    $$('[data-voice]', sh).forEach((x) => x.classList.toggle('on', x === b));
    voice.use(voiceId(), sound.ctx);
    voiceName();
    if (voiceId()) { voice.say(['car1', 'bb_M'], true); if (S.settings.replies !== false) voice.say(['@' + driverVoice('you-0') + '/r_box']); }
  }));
}
function voiceName() { const v = VOICES.find((x) => x.id === voiceId()); $('#voiceName').textContent = v ? `${v.name} · ${v.note}` : 'Off'; }
voiceName();
$('#voiceBtn').addEventListener('click', () => voiceSheet(G.paused ? pauseMenu : resume));
function voiceSheet(back) {
  if (!G.attract) G.paused = true;
  const sh = show(`<h2>Radio voices</h2>
    <p class="lede">Pick your race engineer's voice. Tap one to hear a call.</p>
    ${vpickHTML()}
    <label class="coachopt"><input type="checkbox" id="replyOpt" ${S.settings.replies !== false ? 'checked' : ''}><span><b>Drivers answer</b> Your two drivers reply on the radio in their own voices: "Copy. Boxing."</span></label>
    ${radioSupported() ? `<label class="coachopt"><input type="checkbox" id="freeOpt" ${S.settings.handsfree ? 'checked' : ''}><span><b>Hands-free radio</b> The mic stays on during your races. Say "Radio", then the call: "Radio, box box, softs". It goes quiet while your team is talking. Best with headphones.</span></label>` : ''}
    <div class="actions"><button class="btn" id="vDone" type="button">Done</button></div>`);
  vpickWire(sh);
  $('#replyOpt').addEventListener('change', (e) => { S.settings.replies = e.target.checked; store.save(); });
  $('#freeOpt')?.addEventListener('change', (e) => { S.settings.handsfree = e.target.checked; store.save(); if (G.race) talkBtn(G.race); });
  $('#vDone').addEventListener('click', back);
}
function pauseMenu() {
  if (G.attract) return;
  G.paused = true;
  const sh = show(`<h2>Paused</h2><p class="lede">${G.venue.flag} ${esc(G.venue.city)} · lap ${G.race.leaderLap()} of ${G.race.laps}</p>
    <div class="actions" style="flex-direction:column">
      <button class="btn wide" id="pResume" type="button">Resume</button>
      ${appOn() && !fairRace() ? `<div class="seg pspeed" role="group" aria-label="Race speed">${[1, 2, 4, 8, 16].map((v) => `<button type="button" data-ps="${v}" class="${G.speed === v ? 'on' : ''}">${v}×</button>`).join('')}</div>` : ''}
      <button class="btn ghost wide" id="pVoice" type="button">Radio voices</button>
      <button class="btn ghost wide" id="pDna" type="button">Driver DNA</button>
      <button class="btn ghost wide" id="pHelp" type="button">How to play</button>
      <button class="btn ghost wide" id="pAcademy" type="button">Racing Academy</button>
      ${G.kind !== 'academy' && !G.race.done ? `<button class="btn ghost wide" id="pAgents" type="button">${agentsOn() ? 'Take the team back' : 'Hand the team to my agents'}</button>` : ''}
      ${canFinish() ? '<button class="btn ghost wide" id="pFinish" type="button">Finish the race now</button>' : ''}
      <button class="btn ghost wide" id="pRestart" type="button">${G.kind === 'academy' ? 'Restart lesson' : 'Restart race'}</button>
      <button class="btn ghost wide" id="pQuit" type="button">Quit to home</button></div>`);
  $('#pResume').addEventListener('click', resume);
  $$('[data-ps]', sh).forEach((x) => x.addEventListener('click', () => { $(`.hud [data-speed="${x.dataset.ps}"]`)?.click(); $$('[data-ps]', sh).forEach((y) => y.classList.toggle('on', y === x)); }));
  $('#pHelp').addEventListener('click', () => helpSheet(pauseMenu));
  $('#pVoice').addEventListener('click', () => voiceSheet(pauseMenu));
  $('#pDna').addEventListener('click', () => studio(pauseMenu, true));
  $('#pRestart').addEventListener('click', () => (G.kind === 'academy' && G.lessonId ? startLesson(G.lessonId) : G.kind === 'practice' ? freePractice() : pre({ kind: G.kind, venue: G.venue, seed: G.seed, round: G.round, day: G.day }, 'tyres')));
  $('#pAcademy').addEventListener('click', () => academyHome(pauseMenu));
  $('#pAgents')?.addEventListener('click', () => { handTeam(!agentsOn()); resume(); });
  $('#pFinish')?.addEventListener('click', finishNow);
  $('#pQuit').addEventListener('click', () => { lightsTimers.forEach(clearTimeout); $('#lights').hidden = true; attract(); });
}
function resume() { hide(); G.paused = false; }

// Hand the team to my agents: both your cars go Autonomous at once, so the AI strategists make every
// call, and Take it back gives both cars to you again. It works in any race; a live race with other
// people keeps running in real time either way.
const myRunning = () => (G.race ? mine().map((id) => G.race.byId.get(id)).filter((c) => c && !c.dnf && !c.finished) : []);
function agentsOn() { const m = myRunning(); return m.length > 0 && m.every((c) => c.auto); }
function handTeam(on) {
  const R = G.race; if (!R || G.attract || R.done) return;
  for (const c of myRunning()) if (!!c.auto !== on) { R.command(c.id, { auto: on }); handover(c, !on); }
  const text = on ? 'Your agents run the team now: both cars, every call. Take it back any time.' : 'You run the team again: both cars answer to you.';
  toast(text, true); addRadio({ from: 'race', text });
  agentsUI(true);
}
function agentsUI(force) {
  const b = $('#agentsBtn'); if (!b) return;
  const R = G.race, show = !!R && !G.attract && !R.done && G.kind !== 'academy' && myRunning().length > 0;
  const on = show && agentsOn(), key = `${show}|${on}`;
  if (!force && b.dataset.k === key) return;
  b.dataset.k = key; b.hidden = !show;
  b.classList.toggle('on', on);
  b.textContent = on ? `Agents racing · ${appOn() ? 'Take control' : 'Take back'}` : 'Hand to agents';
  b.setAttribute('aria-label', on ? 'Your agents run the team. Tap to take it back.' : 'Hand the team to your AI agents');
  engPane();
}
// phones: the Engineer panel in a race. Who is making the calls comes from the cars themselves (each
// car's auto flag in the race engine), so it never says the agents are racing when they aren't.
function engPane() {
  const el = $('#engPane'); if (!el || !appOn()) return;
  const R = G.race, show = !!R && !G.attract && !R.done && G.kind !== 'academy' && myRunning().length > 0, on = show && agentsOn();
  el.innerHTML = `<div class="ep-h">${ENG_FACE}<div><small>AI race engineer</small><b>${esc(engName())}</b>
      <span class="ap-st"><i class="${on ? 'on' : ''}"></i>${on ? 'Agents racing: your engineer makes every call' : 'Advisory: you make the calls'}</span></div></div>
    ${show ? `<button type="button" class="btn ep-go${on ? ' ghost' : ''}" data-ep="hand">${on ? 'Take control' : 'Hand the team to my agents'}</button>` : ''}
    <p class="ep-wa">${wa.linked ? `WhatsApp: ${esc(aName())} is linked to your account` : 'WhatsApp: not linked. Connect it from the Engineer tab at home.'}</p>`;
}
$('#engPane').addEventListener('click', (e) => { if (e.target.closest('[data-ep="hand"]')) handTeam(!agentsOn()); });
$('#agentsBtn').addEventListener('click', () => handTeam(!agentsOn()));

// Finish the race now: only when you race the AI alone (never the Daily, a season round, a lesson or
// a live race with other people). Your agents take both cars and the race runs to the flag in a blink.
const canFinish = () => !!G.race && !G.race.done && !fairRace() && !G.room;
function finishNow() {
  const R = G.race; if (!canFinish()) return;
  handTeam(true); hide();
  G.paused = true;
  const go = () => {
    if (G.race !== R) return;
    let k = 0; while (!R.done && k < 2500) { R.step(); k++; }
    G.evIdx = R.events.length;   // the race's chatter on the way to the flag is skipped, not read out
    if (R.done) { G.paused = false; return; }
    toast(`Your agents are racing it out: lap ${R.leaderLap()} of ${R.laps}…`);
    setTimeout(go, 0);
  };
  go();
}

// ---------- results ----------
const TROPHIES = {
  first: '🏁 First race', points: '🔟 First points', podium: '🥉 First podium', win: '🥇 First win',
  fastest: '⏱ Fastest lap', double: '👯 Both cars in the points', rain: '🌧️ Rain master', comeback: '🚀 Comeback (+8 places)',
  academy: '🎓 Academy graduate', abuja: '🇳🇬 Home win in Abuja', midnight: '🌅 Midnight sun', aloha: '🌺 Aloha', streak3: '🔥 3-day streak', champion: '🏆 Season champion',
};
const TYRE_EMOJI = { S: '🔴', M: '🟡', H: '⚪', I: '🟢', W: '🔵' };

function results() {
  // the record of the race just run, kept before it is cleared: the leaderboard checks a Daily by
  // replaying it on the server, so it is sent the race itself rather than a finishing place
  const ran = live.rec && !live.rec.lesson ? { kind: live.rec.kind, venue: live.rec.venue, seed: live.rec.seed, args: live.rec.args, cmds: live.rec.cmds.slice(), n: live.rec.n } : null;
  live.clear();
  if (G.resFor === G.race) return resultsView();
  G.resFor = G.race;
  const R = G.race, res = R.result, my = res.filter((x) => x.car.team.you);
  const best = Math.min(...my.map((x) => x.pos));
  const pts = my.reduce((s, x) => s + x.points, 0);
  say(['flag', 'p' + best, best === 1 ? 'won' : best <= 3 ? 'podium' : pts > 0 ? 'points' : 'nopoints'], true);
  const wet = R.weather.showers.length > 0 || R.weather.wet0 > 0;
  const assisted = G.assisted || !G.auto0;
  const earned = [];
  // lessons and free practice count for nothing: no starts, points or trophies
  const counts = G.kind !== 'academy' && G.kind !== 'practice';
  const give = (k) => { if (counts && !S.trophies[k]) { S.trophies[k] = Date.now(); earned.push(TROPHIES[k]); } };
  if (counts) {
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
  if (G.kind === 'dailyfull') {
    // the full-distance Daily: a board of its own, one scored run a day there; no streak, no week
    const n = G.day, F = (S.dailyFull ||= { days: {} });
    if (!F.days[n]) { F.days[n] = { best, pts }; dailyLine = 'Your full-distance result is saved and goes on today\'s full-distance board.'; sendToBoard(n, ran, false); }
    else dailyLine = `Replay only: your scored full-distance run today was P${F.days[n].best}.`;
  }
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
      const nv = dailyVenue(n + 1), pb = playbookOf(S);
      dailyLine = `Today's result is saved. ${S.daily.streak > 1 ? `🔥 ${S.daily.streak}-day streak.` : ''} Tomorrow's Daily is ${nv.flag} ${esc(nv.city)}.${pb.on ? ` If you're busy, your agent races it at ${pb.cover}:00 and tells you how it went.` : ''}`;
      // your scored run goes to the day's leaderboard, where the server replays it and ranks it
      sendToBoard(n, ran, false);
    } else {
      dailyLine = rec.agent ? `Replay only: your agent already raced today's Daily (P${rec.best}).` : `Replay only: your scored run today was P${rec.best}.`;
      if (best < rec.best) { rec.best = best; rec.pts = pts; rec.share = share; dailyLine = `New best today: P${best}.`; }
    }
  }
  // every race is experience for your drivers, whoever made the calls (js/career.js)
  G.boardLine = '';
  G.xp = null;
  if (G.kind !== 'academy' && G.kind !== 'practice') {
    G.xp = { car1: recordRace(S, 'car1', carMetrics(R, 'you-0'), G.venue.id), car2: recordRace(S, 'car2', carMetrics(R, 'you-1'), G.venue.id) };
    const c = careerState(S);
    G.xpRank = { car1: rankOf(c.car1.xp), car2: rankOf(c.car2.xp) };
    G.xpUp = ['car1', 'car2'].filter((k) => rankOf(c[k].xp - G.xp[k].total).i < G.xpRank[k].i);
  }
  G.props = strategistAfterRace(R);
  if (G.props.length) say(['d_notes']);
  store.save();
  const label = G.kind === 'daily' ? 'Daily #' + G.day : G.kind === 'dailyfull' ? 'Daily #' + G.day + ' · Full distance' : G.kind === 'season' ? 'Round ' + G.round : G.kind === 'academy' ? 'Racing Academy' : G.kind === 'practice' ? 'Free practice' : G.kind === 'live' ? 'Live Grand Prix' : 'Quick race';
  G.report = buildReport(R, { venue: G.venue, label, mine: ['you-0', 'you-1'] });
  if (G.kind !== 'academy') { S.lastReport = G.report; store.save(); }
  // the team remembers how it went, so your agent and the drivers can bring it up next time (signed-in players;
  // the server writes the sentence from these fields)
  if (signedIn() && G.kind !== 'academy' && G.kind !== 'practice') {
    const lead = my.filter((x) => !x.dnf).sort((a, b) => a.pos - b.pos)[0], front = lead && res.find((x) => x.pos === lead.pos - 1);
    rememberRace({ venue: G.venue.city, label, won: !!res[0].car.team.you, winner: res[0].car.team.name, ahead: front && !front.car.team.you ? front.car.team.name : '',
      auto: !G.assisted, calls: G.report.calls.filter((c) => c.from === 'principal').length,
      cars: my.map((x) => ({ name: x.car.name, pos: x.pos, grid: x.car.grid, dnf: !!x.dnf, tyres: (x.used || []).join('') })) });
  }
  G.resShare = share || shareText(G.report, location.origin + location.pathname);
  G.resTab = 'result';
  G.resHead = `
    <div class="sub">${G.venue.flag} ${esc(G.venue.city)} Grand Prix · ${label}</div>
    <h2>${best === 1 ? 'You won!' : best <= 3 ? 'Podium!' : best <= 10 ? 'In the points' : 'Tough day'}</h2>
    <p class="lede">${my.map((x) => `${esc(x.car.name)} ${x.dnf ? 'retired' : 'finished P' + x.pos}${x.penalty ? ' (with a 20 s penalty: one compound only)' : ''}`).join(', ')}. +${pts} points.${assisted ? '' : ' Fully autonomous.'}</p>`;
  G.resMore = `${xpHTML()}${earned.length ? `<div class="tro">${earned.map((t) => `<span>${t}</span>`).join('')}</div>` : ''}
    ${seasonLine || dailyLine ? `<p class="lede">${seasonLine} ${dailyLine}</p>` : ''}`;
  G.resActs = `
    <div class="actions">
      ${G.kind === 'season' && S.season.round <= CALENDAR.length ? '<button class="btn" data-r="next" type="button">Next round</button>' : ''}
      <button class="btn${G.kind === 'season' && S.season.round <= CALENDAR.length ? ' ghost' : ''}" data-r="share" type="button">Share result</button>
      <button class="btn ghost" data-r="again" type="button">Race again</button>
      ${G.kind === 'season' ? '<button class="btn ghost" data-r="standings" type="button">Standings</button>' : ''}
      <button class="btn ghost" data-r="home" type="button">Home</button>
    </div>`;
  resultsView();
  setCam('overview');
}
// ---------- the Team Strategist after a race (js/coach.js): suggestions you approve or not ----------
// what this race taught your drivers: the experience earned, and any new rank
function xpHTML() {
  if (!G.xp) return '';
  const t = team(), c = careerState(S);
  return `<div class="xp">${['car1', 'car2'].map((slot, k) => {
    const d = t.drivers[k], g = G.xp[slot], r = G.xpRank[slot], up = G.xpUp.includes(slot);
    const span = r.next ? Math.max(1, r.next.at - r.at) : 1, done = r.next ? Math.min(1, (c[slot].xp - r.at) / span) : 1;
    return `<button class="xp-row${up ? ' up' : ''}" data-r="dp:${slot}" type="button">${portraitSVG(d, t, { size: 34, bg: false })}
      <div><b>${esc(d.name)}</b><span>${up ? `🎖️ Now a ${esc(r.name)}` : esc(r.name)}${r.next ? ` · ${Math.max(0, r.next.at - c[slot].xp)} to ${esc(r.next.name)}` : ' · fully experienced'}</span>
        <div class="meter"><i style="width:${Math.round(done * 100)}%"></i></div></div>
      <em>+${g.total} XP</em><small>${g.parts.map((x) => esc(x.label)).join(' · ')}</small></button>`;
  }).join('')}</div>`;
}
function strategistAfterRace(R) {
  if (!dnaOn) return [];
  const d = dnaState(S), names = { car1: team().drivers[0].name, car2: team().drivers[1].name };
  const cars = { car1: carMetrics(R, 'you-0'), car2: carMetrics(R, 'you-1') };
  const props = STRATEGISTS.rules.propose({ cars, profiles: activeProfiles(S), names });
  // a career lesson (js/career.js) comes from the whole record, so it outranks one race's advice
  const profs = activeProfiles(S);
  for (const slot of ['car1', 'car2']) {
    const L = lessonFor(S, slot, names[slot], profs[slot]);
    if (L) { props.unshift({ ...L, source: 'career' }); break; }
  }
  d.pending = [...props, ...(d.pending || []).filter((p) => p.status === 'proposed' && !props.some((q) => q.slot === p.slot))].slice(0, 4);
  return props;
}
function strategistHTML() {
  if (!dnaOn) return '';
  const props = G.props || [];
  return `<div class="strat"><div class="sub">Team Strategist</div>${props.length ? props.map(proposalHTML).join('')
    : '<p class="note">No changes to suggest: neither driver had a pattern of lock-ups, collisions, worn tyres or missed chances this race. Tune them yourself in Driver DNA any time.</p>'}</div>`;
}
function stratClick(e) {
  const b = e.target.closest('[data-sp]'); if (!b) return;
  const p = (G.props || []).find((x) => x.id === b.closest('[data-prop]').dataset.prop); if (!p) return;
  const d = dnaState(S);
  if (b.dataset.sp === 'test') {
    const cur = d.slots[p.slot].active, next = { ...cur.params };
    for (const [k, [, to]] of Object.entries(p.diff)) next[k] = to;
    return studio(resultsView, false, { slot: p.slot, view: 'test', venue: G.venue, draft: { params: next, name: cur.name, origin: 'strategist' } });
  }
  const yes = b.dataset.sp === 'yes';
  decide(S, p, yes);
  if (yes && p.lesson && p.status === 'applied') learned(S, p.slot, p.lesson);
  d.pending = (d.pending || []).filter((x) => x.id !== p.id);
  store.save();
  resultsView();
}

function resultsView() {
  const share = G.resShare, r = reportHTML(G.report, G.resTab, G.resMore);
  const sh = show(`${G.resHead}${G.boardLine || ''}${r.tabs}<div class="rbody">${r.body}${G.resTab === 'review' ? strategistHTML() : ''}</div>${G.resActs}`, 'report');
  sh.onclick = (e) => {
    stratClick(e);
    const t = e.target.closest('[data-rt]'); if (t) { G.resTab = t.dataset.rt; resultsView(); return; }
    const b = e.target.closest('[data-r]'); if (!b) return;
    const r = b.dataset.r;
    if (r === 'next') { const v = CALENDAR[S.season.round - 1]; pre({ kind: 'season', venue: v, seed: hashString(`season-${S.season.no}-${S.season.round}`), round: S.season.round }); }
    if (r === 'share') shareSheet(share, results);
    if (r === 'again') pre({ kind: G.kind === 'season' ? 'quick' : G.kind, venue: G.venue, seed: G.kind === 'daily' || G.kind === 'dailyfull' ? G.seed : hashString('quick-' + Date.now()), day: G.day }, 'tyres');
    if (r === 'standings') standings();
    if (r.startsWith('dp:')) driverSheet(r.slice(3), resultsView);
    if (r === 'board') boardSheet(G.day || dayNumber(), resultsView, G.kind === 'dailyfull' ? 'full' : 'human');
    if (r === 'home') attract();
  };
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
  TEAMS.forEach((t, ti) => t.drivers.forEach((d, i) => drivers.push({ id: `${t.id}-${i}`, d: { ...d, num: TAKEN_NUMS[ti * 2 + i] }, tm: t, name: d.name, team: t.short, c: t.c1 })));
  team().drivers.forEach((d, i) => drivers.push({ id: `you-${i}`, d, tm: team(), name: d.name, team: team().short, c: team().c1, you: true }));
  drivers.forEach((d) => (d.pts = S.season.pts[d.id] || 0));
  drivers.sort((a, b) => b.pts - a.pts);
  const teams = [...TEAMS.map((t) => ({ id: t.id, name: t.name, c: t.c1 })), { id: 'you', name: team().name, c: team().c1, you: true }]
    .map((t) => ({ ...t, pts: S.season.teamPts[t.id] || 0 })).sort((a, b) => b.pts - a.pts);
  const done = S.season.round - 1;
  const sh = show(`<h2>Season ${S.season.no}</h2><p class="lede">${done ? `After ${done} of ${CALENDAR.length} rounds.` : 'The season starts in Abu Dhabi.'}</p>
    <div class="grid2">
      <div><div class="sub">Drivers</div><table class="res"><tbody>${drivers.map((d, i) => `<tr class="${d.you ? 'mine' : ''}"><td>${i + 1}</td><td class="pn">${portraitSVG(d.d, d.tm, { size: 26, bg: false })}${esc(d.name)}</td><td class="m">${esc(d.team)}</td><td class="r">${d.pts}</td></tr>`).join('')}</tbody></table></div>
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
  start(kind = 'daily', id, length) {
    S.team ||= DEFAULT_TEAM;
    const n = dayNumber(), v = id ? VENUES.find((x) => x.id === id) : dailyVenue(n);
    Object.assign(G, { kind, venue: v, seed: hashString((kind === 'daily' ? 'daily-' : 'quick-') + (kind === 'daily' ? n : v.id)), day: n, round: kind === 'season' ? S.season.round : null });
    G.laps = length ? raceLaps(trackFor(v), length) : null; startRace({}, false); lightsSequence(true);
  },
  get room() { const L = G.room; return L ? { id: L.id, n: L.n, me: L.me, calls: L.calls.length, snaps: L.snaps || {} } : null; },
  cam: setCam, tab: setTab, select, results, pre, academy: startLesson, practice: freePractice,
  get lesson() { const L = G.lesson; return L ? { step: L.step && L.step.id, i: L.i, n: L.steps.length, done: L.done } : null; }, crew: (up = true, big = false) => crewReact(G.race.byId.get('you-0'), up, big),
  // team radio without a mic: radio('Nova, push') runs a transcript through the same path as speech
  radio(text) { const r = understand(text); talk.m = { t0: performance.now(), id: ++talk.n }; if (r) radioDo(r, text); else { talk.m = null; interpret(text); } radioPlans(G.race); return r; },
  get talk() { return talk; },
  voice, engineer: (id = 'you-0', kind = 'lap') => engUpdate(G.race, G.race.byId.get(id), kind, engState()),
  car(id) { S.settings.car = id || null; if (world) world.setModel(carModel()); },
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, dpr }),
  get race() { return G.race; }, get world() { return world; }, renderer, camera, cams, THREE,
};

{ const saved = live.load(); if (!(saved && resumeRace(saved))) attract(); agentCatchUp(); bootDone(); }
// an account, when the service is running: a guest at first, so nothing is asked of a new player
accountStart(S).then((fromServer) => {
  if (account.on) agentStatus();
  if (fromServer) { store.adopt(fromServer); if (G.attract && !$('#screen').hidden) home(); }
  else if (account.on && G.attract && !$('#screen').hidden) home();
  // back from Google: done, or one more step on the game's own screen
  const q = new URLSearchParams(location.search), sq = q.get('signin');
  if (q.get('signedin') || sq) history.replaceState(null, '', location.pathname);
  if (q.get('signedin')) toast(`Signed in${account.me && account.me.name ? ' as ' + account.me.name : ''}. Your team follows you to any device.`);
  if (sq === 'profile' && G.attract) accountSheet(home, { step: 'profile' });
  if (sq === 'merge' && G.attract) accountSheet(home, { step: 'merge', who: q.get('who') || '' });
  const pq = q.get('pass'); if (pq) passBack(pq === 'ok');
  if (sq === 'cancelled') toast('Google sign-in was cancelled. Your progress is safe on this device.');
  if (sq === 'failed' && G.attract) accountSheet(home, { error: 'Google sign-in did not work. Please try again.' });
});
// who is online and where, for the owner's screen (js/here.js)
startHere(() => ({
  name: team().name || '',
  screen: G.qs ? 'quali' : G.lesson && !G.attract ? 'academy' : G.race && !G.attract && !G.ended ? (G.kind === 'live' ? 'live' : 'race') : 'home',
}));
requestAnimationFrame(frame);
