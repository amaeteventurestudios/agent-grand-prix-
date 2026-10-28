// Agent Grand Prix on WhatsApp. A small always-on program: it long-polls the WhatsApp Agent
// Platform for your messages, runs races with the same engine as the web game, and texts you
// lap by lap. You make the calls by replying ("box softs", "boost", "push").
//
//   WHATSAPP_AGENT_TOKEN=... node agent/whatsapp.mjs
//
// Env: WHATSAPP_AGENT_TOKEN (required, the agent's API key from WhatsApp; keep it secret),
//      WA_API (default https://api.whatsapp.com/agent/v1), STATE_FILE (default agent/state.json),
//      RACE_SPEED (default 1: real time, about four minutes a race).
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CALENDAR, VENUES, COMPOUNDS } from '../js/data.js';
import { hashString } from '../js/rng.js';
import { setupRace, dayNumber, dailyVenue, DEFAULT_TEAM, raceLaps, trackFor } from '../js/game.js';
import { DT, fmtTime } from '../js/sim.js';
import * as Chat from './chat.mjs';
import * as PW from './pitwall.mjs';

const TOKEN = process.env.WHATSAPP_AGENT_TOKEN;
const API = (process.env.WA_API || 'https://api.whatsapp.com/agent/v1').replace(/\/$/, '');
const STATE_FILE = process.env.STATE_FILE || fileURLToPath(new URL('./state.json', import.meta.url));
const SPEED = Number(process.env.RACE_SPEED || 1);
const SITE = process.env.SITE_URL || '';
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- state: poll offset, handled messages, players ----------
let state = { offset: null, seen: [], players: {} };
try { state = { ...state, ...JSON.parse(readFileSync(STATE_FILE, 'utf8')) }; } catch { /* first run */ }
function save() {
  const tmp = STATE_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify({ offset: state.offset, seen: state.seen.slice(-500), players: state.players }));
  renameSync(tmp, STATE_FILE);
}

// ---------- the agents: the house agent (WHATSAPP_AGENT_TOKEN) and players' own ----------
// A player can make their own agent in WhatsApp (Settings > Agents > Create an agent), name it and paste
// its API key into the game (server/accounts.mjs keeps it). This one program runs all of them. A chat
// with a player's own agent is addressed "<account id>|<user id>", a chat with the house agent by the
// bare user id, so everything else (players, races, linking) works the same for both.
const AGENTS = new Map();   // key ('main' or an account id) -> { token, name, stop }
export const agentOf = (addr) => { const i = String(addr).indexOf('|'); return i < 0 ? { key: 'main', to: addr } : { key: addr.slice(0, i), to: addr.slice(i + 1) }; };
export const nameOf = (addr) => { const k = agentOf(addr).key; return k === 'main' ? Chat.NAME : (AGENTS.get(k) || {}).name || 'your agent'; };
const tokenOf = (key) => (AGENTS.get(key) || {}).token;

// ---------- WhatsApp Agent Platform client ----------
async function call(method, path, body, timeoutMs = 40000, token = TOKEN) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(API + path, {
      method, signal: ctl.signal,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(`${method} ${path}: ${res.status} ${json.error?.message || ''}`); e.status = res.status; e.code = json.error?.code; throw e; }
    return json;
  } finally { clearTimeout(t); }
}

// Outbound queue: the platform allows 12 messages a minute per agent, so keep to 10 each.
const queue = [];
const sentAt = new Map();   // agent key -> send times in the last minute
function send(to, text) { if (text) queue.push({ to, text: text.slice(0, 4096) }); }
async function pump() {
  for (;;) {
    const now = Date.now(), busy = (k) => (sentAt.get(k) || []).filter((t) => now - t < 60000).length >= 10;
    const i = queue.findIndex((m) => !busy(agentOf(m.to).key));
    if (i >= 0) {
      const m = queue[i], { key, to } = agentOf(m.to), token = tokenOf(key);
      if (!token) queue.splice(i, 1);   // that agent was removed
      else try {
        await call('POST', '/messages', { messaging_product: 'whatsapp', to, type: 'text', text: { body: m.text, preview_url: true } }, 40000, token);
        queue.splice(i, 1); sentAt.set(key, [...(sentAt.get(key) || []).filter((t) => Date.now() - t < 60000), Date.now()]);
      } catch (e) {
        log('send failed', key === 'main' ? 'main' : 'own', e.message);
        if (e.status === 429 || e.status >= 500) await sleep(5000); else queue.splice(i, 1); // a 400 will never succeed
      }
    }
    // when the queue backs up during a race, merge waiting lines for the same person
    if (queue.length > 4) {
      const a = queue[1], b = queue[2];   // (a and b have the same address, so the same agent)
      if (a && b && a.to === b.to && a.text.length + b.text.length < 3500) { a.text += '\n\n' + b.text; queue.splice(2, 1); }
    }
    await sleep(queue.length ? 300 : 1000);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- races ----------
const races = new Map(); // player id -> live race
const tyreWord = { s: 'S', soft: 'S', softs: 'S', m: 'M', medium: 'M', mediums: 'M', h: 'H', hard: 'H', hards: 'H', i: 'I', inter: 'I', inters: 'I', intermediate: 'I', intermediates: 'I', w: 'W', wet: 'W', wets: 'W' };
const tyre = (c) => `${COMPOUNDS[c].name}${c === 'S' ? ' 🔴' : c === 'M' ? ' 🟡' : c === 'H' ? ' ⚪' : c === 'I' ? ' 🟢' : ' 🔵'}`;
const tempTxt = (c) => `${c}°C / ${Math.round(c * 9 / 5 + 32)}°F`;

function player(id, name) {
  const p = state.players[id] ||= { team: null, auto: false, results: [], name: null };
  if (name) p.name = name;
  return p;
}

function startRace(to, p, kind, venue, length) {
  const n = dayNumber();
  const v = venue || dailyVenue(n);
  const seed = hashString(kind === 'daily' ? 'daily-' + n : 'quick-' + v.id + '-' + Date.now());
  const setup = setupRace({ venue: v, seed, team: p.team || DEFAULT_TEAM, auto: p.auto, ...(length && length !== 'short' ? { laps: raceLaps(trackFor(v), length) } : {}) });
  const R = setup.make();
  const mine = ['you-0', 'you-1'];
  const live = { R, setup, venue: v, kind, day: n, mine, evIdx: 0, lastLap: 0, acc: 0, to, lastSummary: 0, ask: {}, snooze: {} };
  races.set(to, live);
  if (p.auto && p.ask !== false) for (const id of mine) R.command(id, { ask: true });
  const grid = mine.map((id) => R.byId.get(id));
  const W = setup.weather;
  send(to, [
    `🏁 *${v.flag} ${v.city.toUpperCase()} GRAND PRIX*`,
    kind === 'daily' ? `_Daily Grand Prix #${n}_` : `_Quick race${length && length !== 'short' ? ` · ${length === 'full' ? 'full distance' : length}` : ''}_`,
    '',
    `📍 ${v.circuit}, ${v.country}`,
    `🔁 ${setup.laps} laps`,
    `🌡️ ${tempTxt(v.temp)}${W.wet0 > 0.17 ? ' · 🌧️ wet track' : W.showers.length ? ' · 🌦️ rain likely' : ''}`,
    '',
    '*Your grid*',
    ...grid.map((c) => `• *${c.code}* starts P${c.grid} on ${tyre(c.tyre.c)}`),
    '',
    p.auto ? (p.ask !== false ? '🤖 Your agents run the race. I\'ll only message you when there\'s a big call to make.' : '🤖 Your agents run the race and make every call. Reply *take over* any time.') : '🎧 You make the calls. Reply *help* for the race commands.',
    '',
    '🚦 _Lights out in 5 seconds…_',
  ].join('\n'));
  setTimeout(() => { if (races.get(to) === live) { R.start(); live.t0 = Date.now(); } }, 5000);
}

function tickRaces(dtReal) {
  for (const [to, L] of races) {
    const R = L.R; if (!R.started || L.mirror) continue;   // a race on the web runs at the web's pace (follow())
    L.acc += dtReal * SPEED;
    let n = 0;
    while (L.acc >= DT && n < 2000 && !R.done) { R.step(); L.acc -= DT; n++; if (n % 20 === 0) PW.watchStops(L); }
    PW.watchStops(L); PW.stints(L);
    report(L);
    deadlines(L);
    if (R.done) finish(L);
  }
}

// what's worth a message. Handed over (Autonomous): the pit wall cards, race control, your own
// incidents and stops, and a short update as often as you asked. Team Principal: the engineer says
// nothing unasked; you get race control (safety car, weather, your incidents) and your drivers'
// replies, plus updates only if you asked for them (*updates every 3 laps*).
function report(L) {
  const R = L.R, out = [], asks = [], p = player(L.to);
  const away = L.mine.every((id) => R.byId.get(id).auto);
  while (L.evIdx < R.events.length) {
    const e = R.events[L.evIdx++];
    const isMine = e.car && L.mine.includes(e.car), car = e.car && R.byId.get(e.car);
    if (e.type === 'advice') { if (isMine && car.auto && car.ask) asks.push({ car, e }); continue; } // never unasked in Team Principal
    if ((e.type === 'radio' || e.type === 'pit') && isMine) { if (!away || e.type === 'pit') out.push(`📻 ${e.text.startsWith(car.code) ? e.text : car.code + ': ' + e.text}`); }
    else if (e.type === 'sc') out.push((e.phase === 'green' ? '🟢 ' : '🟡 ') + e.text);
    else if (e.type === 'flag' && /debris|\bred flag|race stopped/i.test(e.text)) out.push('🚩 ' + e.text);
    else if (e.type === 'weather') out.push('🌧️ ' + e.text);
    else if ((e.type === 'dnf' || e.type === 'incident') && isMine) out.push('⚠️ ' + e.text);
  }
  const card = decision(L, asks);
  if (card) out.push(card);
  const lap = R.leaderLap();
  if (lap > L.lastLap && R.started && !R.done) {
    L.lastLap = lap;
    const every = p.every ?? (away ? 5 : 0);
    if (lap > 1 && every > 0 && (lap % every === 0 || lap === R.laps)) out.push(summary(L, `*Lap ${lap}/${R.laps}*`));
    if (lap === R.laps && !away) out.push('🏁 Final lap!');
  }
  if (out.length) send(L.to, out.join('\n'));
}

// ---------- check-ins: when your agents run the race, a pit call becomes a card (agent/pitwall.mjs) ----------
function decision(L, asks) {
  const R = L.R, seen = new Set(), p = player(L.to);
  const due = asks.filter(({ car, e }) => {
    const lap = PW.lapOf(R, car), call = e.action && e.action.box;
    if (!call || seen.has(car.id) || L.ask[car.id] || (L.snooze[car.id] || 0) > lap || car.pit || car.pitReq || R.lapsLeft(car) <= 1) return false;
    seen.add(car.id); return true;
  });
  if (!due.length) return null;
  // the other car already has the same question open: this answer covers both
  const open = Object.values(L.ask)[0];
  if (open && due.every((x) => open.opts[0].box === x.e.action.box)) {
    for (const x of due) { open.cars.push(x.car.id); L.ask[x.car.id] = open; }
    return `📻 ${due.map((x) => x.car.code).join(' and ')} too: same call. Your answer covers both cars.`;
  }
  const call = due[0].e.action.box, cars = due.filter((x) => x.e.action.box === call).map((x) => x.car);
  const lead = cars[0], lap = PW.lapOf(R, lead);
  const why = due[0].e.text.replace(/\s*Box for \w+s\?$/, '');
  const q = PW.plan(L, lead, call, why, p.habits);
  q.cars = cars.map((c) => c.id); q.lap = lap;
  q.due = Math.min(R.laps, lap + (q.kind === 'window' ? 2 : 1));
  for (const c of cars) L.ask[c.id] = q;
  L.last = lead.id;
  (L.cards ||= []).push(q);
  const temp = tempTxt(L.venue.temp);
  const head = cars.length > 1 ? [...PW.carCard(L, cars[0], temp), '', ...PW.carCard(L, cars[1], temp).slice(0, 4)] : PW.carCard(L, lead, temp);
  L.calib = (p.calib ||= { right: 0, total: 0 });
  return PW.cardText({ head, why, cars, q, lap, calib: p.calib, name: nameOf(L.to) });
}
// o: an option index, or { box } for a stop the card didn't offer
function answer(L, id, o, how) {
  const q = L.ask[id], R = L.R; if (!q) return null;
  const opt = typeof o === 'number' ? q.opts[o] : { box: o.box, label: `Box for ${COMPOUNDS[o.box].name.toLowerCase()}s` };
  const names = q.cars.map((c) => R.byId.get(c).code).join(' and '), two = q.cars.length > 1;
  const said = opt.box ? `${names} box${two ? '' : 'es'} for ${tyre(opt.box)}` : `${names} stay${two ? '' : 's'} out`;
  for (const cid of q.cars) {
    if (L.ask[cid] !== q) continue;
    delete L.ask[cid];
    const car = R.byId.get(cid);
    if (car.dnf || car.finished || car.pit) continue;
    if (opt.box) { R.command(cid, { box: opt.box }); (L.proj ||= {})[cid] = PW.rejoin(L, car).pos; L.calib ||= (player(L.to).calib ||= { right: 0, total: 0 }); }
    else L.snooze[cid] = PW.lapOf(R, car) + 3; // don't ask again straight away
  }
  q.answer = typeof o === 'number' ? o : -1; q.how = how;
  if (how === 'you' && typeof o === 'number') { // learn: your answers to this kind of call
    const p = player(L.to); p.habits ||= {}; const h = (p.habits[q.kind] ||= []); h.push(o); p.habits[q.kind] = h.slice(-6); save();
  }
  if (how === 'timeout') return `⏱️ No reply, so I made the call: ${said}${q.fallback !== q.pick ? ' (the safe call)' : ''}.`;
  return `✅ ${said}.${how === 'you' && typeof o === 'number' && o !== q.pick ? ' Noted: I\'ll remember how you like this one.' : ''}`;
}
function deadlines(L) {
  const R = L.R;
  for (const id of Object.keys(L.ask)) {
    const car = R.byId.get(id), q = L.ask[id];
    if (!q) continue;
    if (!car || car.dnf || car.finished || R.done) { delete L.ask[id]; continue; }
    const gone = PW.stale(L, q, car);
    if (gone) {
      for (const cid of q.cars) if (L.ask[cid] === q) delete L.ask[cid];
      q.answer = -2; q.how = 'expired'; (L.expired ||= {})[q.cars[0]] = PW.lapOf(R, car);
      if (!car.pit && !car.pitReq) send(L.to, `⌛ That call expired: ${gone}. ${q.cars.map((c) => R.byId.get(c).code).join(' and ')} carr${q.cars.length > 1 ? 'y' : 'ies'} on.`);
      continue;
    }
    if (PW.lapOf(R, car) >= q.due) send(L.to, answer(L, id, q.fallback, 'timeout'));
  }
}

function summary(L, head) {
  const R = L.R, lead = R.order[0];
  const lines = L.mine.map((id) => {
    const c = R.byId.get(id);
    if (c.dnf) return `• *${c.code}* out`;
    const life = Math.round((1 - Math.min(1, c.tyre.wear)) * 100);
    return `• *${c.code}* P${c.pos} · ${c.pos === 1 ? 'leading' : '+' + c.gap.toFixed(1) + 's'} · ${COMPOUNDS[c.tyre.c].name} ${life}% · ⚡${Math.round(c.ers * 100)}%${c.pit ? ' · in the pits' : ''}`;
  });
  return [head + (lead && !L.mine.includes(lead.id) ? ` · ${lead.code} leads` : ''), ...lines].join('\n');
}

function finish(L) {
  races.delete(L.to);
  if (L.mirror) player(L.to).muted = L.mirror.key;   // don't pick the finished race up again
  const R = L.R, res = R.result, my = res.filter((x) => L.mine.includes(x.id));
  const top = res.slice(0, 3).map((x, k) => `${['🥇', '🥈', '🥉'][k]} ${x.car.code} ${x.gapText}`);
  const pts = my.reduce((a, x) => a + x.points, 0);
  const p = player(L.to);
  p.results.push({ day: L.kind === 'daily' ? L.day : null, venue: L.venue.id, pos: my.map((x) => (x.dnf ? 'DNF' : x.pos)), pts });
  p.results = p.results.slice(-50);
  save();
  if (!L.mirror) {
    const ahead = my.filter((x) => !x.dnf).sort((a, b) => a.pos - b.pos)[0], front = ahead && res.find((x) => x.pos === ahead.pos - 1);
    const line = `${L.venue.city} Grand Prix (${L.kind === 'daily' ? 'Daily #' + L.day + ', ' : ''}raced on WhatsApp) on ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}: `
      + my.map((x) => `${x.car.name} ${x.dnf ? 'retired' : `P${x.pos} from P${x.car.grid}`}`).join(', ') + `. Won by ${res[0].car.team.name || res[0].car.code}.`
      + (front && front.pos > 1 ? ` Finished just behind ${front.car.team.name || front.car.code}.` : '') + (p.auto ? ' The agents made the calls.' : '');
    memoryApi('POST', '/memory/fact', { uid: memKey(L.to, p), text: line, kind: 'race' }).catch(() => {});
  }
  const cards = L.cards || [], mine = cards.filter((q) => q.how === 'you'), timed = cards.filter((q) => q.how === 'timeout');
  const against = mine.filter((q) => q.answer !== q.pick);
  const st = L.stints || {};
  const best = my.filter((x) => !x.dnf).sort((a, b) => (b.car.grid - b.pos) - (a.car.grid - a.pos))[0];
  send(L.to, [
    `🏁 *CHEQUERED FLAG*`,
    `*${L.venue.flag} ${L.venue.city} Grand Prix* · ${R.laps} laps${L.kind === 'daily' ? ` · Daily #${L.day}` : ''}`,
    '',
    '*Podium*',
    ...top,
    '',
    `*${(p.team && p.team.name) || DEFAULT_TEAM.name}*`,
    ...my.map((x) => {
      const moved = x.dnf ? '' : x.car.grid - x.pos;
      return `${x.dnf ? '❌' : x.pos <= 3 ? ['🥇', '🥈', '🥉'][x.pos - 1] : x.points ? '✅' : '▫️'} *${x.car.code}* ${x.dnf ? 'DNF' : 'P' + x.pos}${x.dnf ? '' : ` · from P${x.car.grid}${moved > 0 ? ` ▲${moved}` : moved < 0 ? ` ▼${-moved}` : ''}`}${x.penalty ? ' · +20s penalty' : ''}\n      ${PW.stintLine(st[x.id] || [{ c: x.car.tyre.c, lap: 1 }])} · ${x.stops} stop${x.stops === 1 ? '' : 's'}`;
    }),
    `🏆 *+${pts} point${pts === 1 ? '' : 's'}*`,
    ...(cards.length ? ['', '*Pit wall*', `📋 ${cards.length} call${cards.length === 1 ? '' : 's'}: you made ${mine.length}, ${nameOf(L.to)} made ${timed.length}${against.length ? ` · you overruled ${nameOf(L.to)} ${against.length === 1 ? 'once' : against.length + ' times'}` : ''}`] : []),
    ...(best && best.car.grid - best.pos >= 3 ? [`⭐ ${best.car.code} gained ${best.car.grid - best.pos} places`] : []),
    '',
    L.kind === 'daily' ? `Daily Grand Prix #${L.day} done.${SITE ? `\nRace it in 3D: ${SITE}` : ''}` : 'Reply *today* or *race <city>* for another.',
  ].join('\n'));
}

// ---------- chat commands ----------
// the welcome card: who we are, today's race, how to start
function welcome(p) {
  const n = dayNumber(), v = dailyVenue(n);
  return [
    '🏎️ *AGENT GRAND PRIX*',
    '_Your AI agents race, and run the team when you are away._',
    '',
    "*Today's race*",
    `${v.flag} *${v.city}* · Daily #${n}`,
    `📍 ${v.circuit}, ${v.country}`,
    '',
    '👉 Reply *today* to race it',
    '',
    `${p.auto ? '🤖 Your AI is making the calls' : '🎧 You are making the calls'}${p.team ? ` for *${p.team.name}*` : ''}.`,
    'Reply *help* for every command.',
  ].join('\n');
}

const HELP = [
  '🏎️ *AGENT GRAND PRIX · COMMANDS*',
  '',
  '🏁 *Start a race*',
  '• *today* · the Daily Grand Prix',
  '• *race kingston* · race any city',
  '• *race monaco long* · longer race (medium, long or full)',
  `• *circuits* · all ${VENUES.length} venues`,
  '',
  '👥 *Your team*',
  '• *team Lagos Lions* · name your team',
  '• *auto* · hand the race to your agents (they ask you before big calls)',
  '• *quiet* · your agents decide everything, no questions',
  '• *take over* · you make every call',
  '• *results* · your last races',
  '• *link CODE* · follow your races in the game (code: menu › My agent)',
  '• *updates every 3 laps* · how often I message you (or *updates off*)',
  '• *memories* · what I remember about you',
  '• *forget me* · I forget everything I remember about you',
  '',
  '📻 *During a race*',
  '• *box softs* · pit (or mediums, hards, inters, wets)',
  '• *stay out* · cancel the stop',
  '• *push*, *save*, *normal* · pace',
  '• *attack*, *defend* · in a fight',
  '• *boost* · use the battery',
  '• *car 2* · call for your other car',
  '• *status* · gaps and tyres',
  '• *stop* · end the race',
].join('\n');

const RACE_HELP = [
  '📻 *Race commands*',
  '• *box softs* (or mediums, hards, inters, wets)',
  '• *stay out*',
  '• *push*, *save*, *normal*',
  '• *attack*, *defend*',
  '• *boost*',
  '• *status*, *stop*',
].join('\n');

function handle(from, text, name, { noChat = false } = {}) {
  const p = player(from, name);
  const t = text.trim().toLowerCase().replace(/[!.?]+$/, '');
  const L = races.get(from);
  const own = agentOf(from).key;
  if (own !== 'main' && !p.linked && !p.bindTried) return bindOwn(from, p, own);
  const nm = own !== 'main' && p.uid === own && text.trim().match(/^(?:call yourself|your name is|i(?:'|’)?ll call you|rename yourself(?: to)?|new name:?)\s+(.{1,24})$/i);
  if (nm) return renameOwn(from, own, nm[1]);
  const R = L && L.R;
  const car = L && (L.sel ? R.byId.get(L.sel) : R.byId.get('you-0'));
  const cmd = (c, id = car && car.id) => { R.command(id, c); if (R.byId.get(id).auto && !('auto' in c)) R.command(id, { auto: false }); };
  let m;

  if (L && Object.keys(L.ask).length) {
    const pend = Object.keys(L.ask), id = pend.includes(L.last) ? L.last : pend[0], q = L.ask[id];
    const n = t.replace(/1️⃣/, '1').replace(/2️⃣/, '2').replace(/3️⃣/, '3').match(/^(?:option\s*)?([123])$/);
    const k = n ? +n[1] - 1 : PW.wordsToOption(t.replace(/^(?:box|pit)\s+(?:for\s+)?/, 'box ').replace(/^box (soft|medium|hard|inter|wet)/, '$1'), q);
    if (k !== null && k !== undefined) return send(from, answer(L, id, k, 'you'));
  } else if (L && (/^(?:option\s*)?[123]$|^[1-3]️⃣$/.test(t) || (L.cards && L.cards.length && PW.wordsToOption(t, { pick: 0, opts: [{}, {}, {}] }) !== null && !/\b(soft|medium|hard|inter|wet)|^stay out$/.test(t)))) {
    const last = L.cards && L.cards[L.cards.length - 1];
    if (last && last.how && last.how !== 'you') return send(from, last.how === 'expired' ? `That call expired on lap ${last.lap}. I'll message you when there's another one.` : 'Too late for that one: the deadline passed and I made the call. I\'ll message you when there\'s another.');
    const ex = L.expired && Object.values(L.expired).pop();
    return send(from, ex ? `That call expired on lap ${ex}. I'll message you when there's another one.` : "Nothing to answer right now. I'll message you when there's a call to make.");
  }
  if ((m = t.match(/^(?:updates?|notify|messages?)\s+(?:me\s+)?(?:every\s+)?(off|none|never|big calls only|calls only|only big calls|every lap|each lap|lap|\d+)(?:\s+laps?)?$/))) {
    const w = m[1], every = /off|none|never|only|calls/.test(w) ? 0 : /lap/.test(w) ? 1 : Math.max(1, Math.min(20, +w));
    p.every = every; save();
    return send(from, every ? `📨 Got it: a race update every ${every === 1 ? 'lap' : every + ' laps'}, plus the big calls.` : '📨 Got it: only the big calls and race control, no lap updates.');
  }
  if (L && (m = t.match(/^(?:box|pit)(?:\s+(nov|ech|\w{3}|1|2))?(?:\s+(?:for\s+)?(\w+))?$/))) {
    const who = pickCar(L, m[1]) || car, c = tyreWord[m[2] || ''] || (who.tyre.c === 'S' ? 'M' : 'S');
    cmd({ box: c }, who.id); return send(from, `✅ ${who.code} boxing this lap for ${tyre(c)}.`);
  }
  if (L && /^(stay out|no box|cancel box)$/.test(t)) { cmd({ box: null }); return send(from, `✅ ${car.code} stays out.`); }
  if (L && /^(boost|deploy|ers)$/.test(t)) { cmd({ ers: 'deploy' }); return send(from, `⚡ ${car.code}: deploying the battery (${Math.round(car.ers * 100)}%).`); }
  if (L && /^(harvest|charge)$/.test(t)) { cmd({ ers: 'harvest' }); return send(from, `🔋 ${car.code}: harvesting.`); }
  if (L && /^(push|save|normal)$/.test(t)) { cmd({ pace: t }); return send(from, `✅ ${car.code}: ${t === 'save' ? 'saving tyres' : t === 'push' ? 'pushing' : 'normal pace'}.`); }
  if (L && /^(attack|defend|neutral)$/.test(t)) { cmd({ battle: t }); return send(from, `✅ ${car.code}: ${t}.`); }
  if (L && (m = t.match(/^(?:car|follow|switch)\s+(\w+)$/))) { const c = pickCar(L, m[1]); if (c) { L.sel = c.id; return send(from, `Now calling for ${c.code}.`); } }
  if (L && /^(status|gap|where)$/.test(t)) return send(from, summary(L, `*Lap ${R.leaderLap()}/${R.laps}*`));
  if ((m = t.match(/^link\s+([a-z0-9]{6})$/))) return linkAccount(from, p, m[1]);
  if (/^unlink$/.test(t)) { accountsApi('POST', '/agent/unlink', { phone: from }).catch(() => {}); p.linked = false; p.uid = null; if (L && L.mirror) races.delete(from); save(); return send(from, '🔌 Unlinked. I won\'t follow your races on the web any more. Connect again any time from the game: menu › My agent.'); }
  if (L && L.mirror && /^(stop|quit|abandon)$/.test(t)) { p.muted = L.mirror.key; races.delete(from); save(); return send(from, `OK, I'll stop following this one. The race carries on in the game.`); }
  if (L && /^(stop|quit|abandon)$/.test(t)) { races.delete(from); return send(from, 'Race stopped. Reply *today* or *race* for another.'); }
  if (/^(auto|autonomous|hand over|handover)$/.test(t)) { p.auto = true; p.ask = true; save(); if (L) for (const id of L.mine) { R.command(id, { auto: true }); R.command(id, { ask: true }); } return send(from, '🤖 Your agents have the race. I\'ll only message you when there\'s a big call, with my pick and a deadline. Reply *quiet* to let them decide everything, or *take over* to make every call yourself.'); }
  if (/^(quiet|full auto|don'?t ask)$/.test(t)) { p.auto = true; p.ask = false; save(); if (L) for (const id of L.mine) { R.command(id, { auto: true }); R.command(id, { ask: false }); L.ask = {}; } return send(from, '🤫 Your agents make every call, no questions. You\'ll get a short update every 5 laps.'); }
  if (/^(take over|manual|principal)$/.test(t)) { p.auto = false; save(); if (L) { for (const id of L.mine) R.command(id, { auto: false }); L.ask = {}; } return send(from, '🎧 You have the calls. Your engineer will advise.'); }
  if ((m = t.match(/^team\s+(.{2,24})$/))) {
    const nm = text.trim().slice(5).trim().slice(0, 24);
    p.team = { ...DEFAULT_TEAM, name: nm, short: nm.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'YOU' }; save();
    return send(from, `Your team is now *${nm}*.`);
  }
  if (/^(forget me|forget everything|forget all|delete my memories|wipe my memory)$/.test(t)) return forgetMe(from, p);
  if (/^(memories|memory|what do you remember( about me)?)$/.test(t)) return showMemories(from, p);
  if (/^(results|history)$/.test(t)) {
    const r = p.results.slice(-5).reverse();
    return send(from, r.length ? '🏆 *Your last races*\n\n' + r.map((x) => { const v = VENUES.find((q) => q.id === x.venue); return `• ${v?.flag || ''} *${v?.city}*${x.day ? ` (Daily #${x.day})` : ''}\n   ${x.pos.map((q) => (q === 'DNF' ? 'DNF' : 'P' + q)).join(' and ')} · +${x.pts} pts`; }).join('\n') : 'No races yet. Reply *today* to start one.');
  }
  if (/^(circuits|venues|calendar)$/.test(t)) {
    const g = {}; for (const v of VENUES) (g[v.region] ||= []).push(`${v.flag} ${v.city}`);
    return send(from, [`🗺️ *${VENUES.length} CIRCUITS*`, '', ...Object.entries(g).map(([r, c]) => `*${r}*\n${c.join(' · ')}`).join('\n\n').split('\n'), '', '👉 Reply *race* and a city, e.g. *race lagos*'].join('\n'));
  }
  if (/^(help|commands|menu|\?)$/.test(t)) return send(from, L ? RACE_HELP : HELP);
  if (/^(today|daily|race today)$/.test(t) || (/^(race|go|start)$/.test(t))) {
    if (L) return send(from, 'You are already racing. Reply *stop* to end it.');
    return startRace(from, p, 'daily');
  }
  if ((m = t.match(/^race\s+(.+)$/))) {
    if (L) return send(from, 'You are already racing. Reply *stop* to end it.');
    let q = m[1].replace(/[^a-z ]/g, '').trim(), len = 'short';
    const lm = q.match(/^(?:(short|medium|long|full)\s+)?(.+?)(?:\s+(short|medium|long|full))?(?:\s+distance)?$/);
    if (lm) { q = lm[2]; len = lm[1] || lm[3] || 'short'; }
    const v = VENUES.find((x) => x.id === q.replace(/ /g, '') || x.city.toLowerCase() === q || x.country.toLowerCase().startsWith(q));
    if (!v) return send(from, `I don't know a circuit called "${m[1]}". Reply *circuits* for the list.`);
    return startRace(from, p, 'quick', v, len);
  }
  if (/^(hi+|hello|hey|hey there|hiya|yo|good (morning|afternoon|evening)|start|menu)$/.test(t)) return send(from, welcome(p));
  if (!noChat && ((Chat.enabled() && CHAT.all > 0) || chatModel)) return converse(from, p, text);
  if (L) return send(from, RACE_HELP);
  return send(from, welcome(p));
}

// ---------- free conversation (agent/chat.mjs) ----------
let chatModel = null; // tests hand in a fake model
export function setChatModel(f) { chatModel = f; }
// The AI chat costs money, so it has a daily budget: CHAT_PLAYER_DAY free chats a player (CHAT_PASS_DAY
// with the Anti-Bot Pass), CHAT_DAY_LIMIT for everyone together, and never more than 20 in 10 minutes.
// Past that the agent answers with the menu; commands and races never use the AI and always work.
const CHAT = { free: +(process.env.CHAT_PLAYER_DAY || 5), pass: +(process.env.CHAT_PASS_DAY || 30), all: +(process.env.CHAT_DAY_LIMIT || 0) };   // 0: the AI chat is off (the owner pays for it)
const chatHits = new Map(); // player -> times today
let chatDay = { d: '', n: 0 };
const passCache = new Map(); // account id -> { on, at }
async function hasPass(p) {
  if (!p.uid) return false;
  const c = passCache.get(p.uid);
  if (c && Date.now() - c.at < 600000) return c.on;
  let on = false; try { on = !!(await accountsApi('GET', '/agent/pass?id=' + encodeURIComponent(p.uid))).active; } catch { /* no server: no pass */ }
  passCache.set(p.uid, { on, at: Date.now() }); return on;
}
async function chatLimited(from, p) {
  const now = Date.now(), d = new Date().toISOString().slice(0, 10);
  if (chatDay.d !== d) { chatDay = { d, n: 0 }; chatHits.clear(); }
  const h = chatHits.get(from) || [];
  if (h.filter((x) => now - x < 6e5).length >= 20) return 'busy';
  if (chatDay.n >= CHAT.all) return 'all';
  if (h.length >= ((await hasPass(p)) ? CHAT.pass : CHAT.free)) return 'mine';
  h.push(now); chatHits.set(from, h); chatDay.n++;
  return null;
}
function facts(p, L) {
  const n = dayNumber(), v = dailyVenue(n);
  const f = {
    you: { team: p.team?.name || DEFAULT_TEAM.name, aiMakesTheCalls: !!p.auto },
    today: { daily: n, city: v.city, country: v.country, circuit: v.circuit, tempC: v.temp, about: v.note },
    lastRaces: p.results.slice(-5).reverse().map((x) => ({ city: VENUES.find((q) => q.id === x.venue)?.city, daily: x.day, finished: x.pos.map((q) => (q === 'DNF' ? 'DNF' : 'P' + q)), points: x.pts })),
    circuits: VENUES.length, web: SITE || null,
    // the only truth on whether the player is racing: liveRace is there only while a race is actually running
    racingNow: !!L,
  };
  if (!L && p.pausedWeb) f.stoppedRace = { city: p.pausedWeb.city, lap: p.pausedWeb.lap, laps: p.pausedWeb.laps, note: 'not running: the game was closed mid-race; it continues only if the player opens the game again' };
  if (L) {
    const R = L.R, lead = R.order[0];
    f.liveRace = {
      city: L.venue.city, kind: L.kind, lap: R.leaderLap(), laps: R.laps, started: !!R.started, leader: lead && lead.code,
      waitingForYourAnswer: Object.entries(L.ask).map(([id, q]) => ({ car: R.byId.get(id).code, options: q.opts.map((o, k) => `${k + 1}: ${o.label}`), defaultIfNoReplyByLap: q.due })),
      yourCars: L.mine.map((id, k) => { const c = R.byId.get(id); return { car: k + 1, code: c.code, name: c.name, out: !!c.dnf, position: c.pos, gapToLeaderS: +c.gap.toFixed(1), tyre: COMPOUNDS[c.tyre.c].name, tyreLeftPct: Math.round((1 - Math.min(1, c.tyre.wear)) * 100), batteryPct: Math.round(c.ers * 100), inPits: !!c.pit, aiDriving: !!c.auto }; }),
    };
  }
  return f;
}
async function converse(from, p, text) {
  const lim = await chatLimited(from, p);
  if (lim) return send(from, lim === 'busy' ? "Let's take a breather, I need a few minutes. Commands still work: reply *help*."
    : `That's my chatting done for today${lim === 'mine' ? '' : ' (the whole paddock has been busy)'}. I still race and take every call: reply *today* to race, or *help* for the commands.`);
  const L = races.get(from);
  const hist = (p.chat ||= []);
  const key = await memUid(from, p), known = await recallFor(key, text);
  let r = null;
  try { r = await Chat.chat(facts(p, L), hist, text, { fetchModel: chatModel, racing: !!L, venues: VENUES, known, name: nameOf(from) }); } catch (e) { log('chat failed', e.message); }
  if (!r) return send(from, L ? RACE_HELP : welcome(p));
  hist.push({ player: text.slice(0, 300) }, { you: r.say.slice(0, 300) });
  p.chat = hist.slice(-12); save();
  send(from, r.say);
  memoryApi('POST', '/memory/talk', { uid: key, source: 'teague', turns: [{ role: 'user', content: text.slice(0, 500) }, { role: 'assistant', content: r.say }] }).catch(() => {});
  if (r.command) handle(from, r.command, null, { noChat: true });
}

// ---------- the team's long-term memory (server/memory.mjs) ----------
// A number linked to an account shares the account's memory with the drivers in the game; a number that
// isn't linked has its own (keyed by a hash of the number, never the number) until it links.
const MEMORY = (process.env.MEMORY_URL || 'http://127.0.0.1:8144').replace(/\/$/, '');
async function memoryHttp(method, route, body) {
  const r = await fetch(MEMORY + route, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(method === 'POST' && route === '/memory/recall' ? 600 : 5000) });
  if (!r.ok) throw new Error('memory ' + r.status);
  return r.json();
}
let memoryApi = memoryHttp;
export function setMemory(f) { memoryApi = f; }   // tests hand in a fake memory
const memKey = (from, p) => p.uid || 'wa-' + createHash('sha256').update('agp-wa:' + from).digest('base64url').slice(0, 24);
// a number linked before memory existed: ask the game server once which account it belongs to
async function memUid(from, p) {
  if (p.linked && !p.uid && !p.uidAsked) {
    p.uidAsked = true;
    try { const r = await accountsApi('GET', '/agent/who?phone=' + encodeURIComponent(from)); if (r && r.id) { p.uid = r.id; save(); } } catch { p.uidAsked = false; }
  }
  return memKey(from, p);
}
async function recallFor(key, q) { try { return ((await memoryApi('POST', '/memory/recall', { uid: key, q: String(q).slice(0, 400), k: 6 })) || {}).items?.map((x) => x.text) || []; } catch { return []; } }
async function showMemories(from, p) {
  let items = null;
  try { items = (await memoryApi('GET', '/memory/list?uid=' + (await memUid(from, p)))).items; } catch {}
  if (!items) return send(from, "I can't reach my notes just now. Try again in a minute.");
  if (!items.length) return send(from, "🧠 I don't remember anything about you yet. Chat with me and race, and I'll start to.");
  return send(from, ['🧠 *What I remember about you*', '', ...items.slice(0, 12).map((x) => '• ' + x.text), ...(items.length > 12 ? [`_…and ${items.length - 12} more_`] : []), '', 'Reply *forget me* and I\'ll forget all of it.'].join('\n'));
}
async function forgetMe(from, p) {
  const keys = [...new Set([await memUid(from, p), memKey(from, { })])];
  let n = 0, failed = false;
  for (const k of keys) { try { n += (await memoryApi('DELETE', '/memory?uid=' + k)).forgot || 0; } catch { failed = true; } }
  p.chat = []; save();
  if (failed && !n) return send(from, "I couldn't reach my notes just now, so nothing was forgotten. Try again in a minute.");
  return send(from, `🧽 Done. I've forgotten ${n ? `the ${n} thing${n === 1 ? '' : 's'} I remembered about you` : 'everything'}${p.uid ? ', here and with your drivers in the game' : ''}. Your races and team stay as they are.`);
}

function pickCar(L, w) {
  if (!w) return null;
  if (w === '1') return L.R.byId.get('you-0');
  if (w === '2') return L.R.byId.get('you-1');
  return L.mine.map((id) => L.R.byId.get(id)).find((c) => c.code.toLowerCase() === w || c.name.toLowerCase() === w) || null;
}

// ---------- following the races you run on the website (server/accounts.mjs) ----------
// You link once ("link CODE", the code from the game's My agent screen). Then every couple of
// seconds the agent asks the game server for your newest race and rebuilds it from its record
// (setup plus every call at the engine step it landed on), so this race and the one on your screen
// are the same race. Calls made here go back to the game, which makes them and records them.
const ACCOUNTS = (process.env.ACCOUNTS_URL || 'http://127.0.0.1:8141').replace(/\/$/, '');
async function accountsHttp(method, route, body) {
  const r = await fetch(ACCOUNTS + route, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'accounts ' + r.status); e.status = r.status; throw e; }
  return j;
}
let accountsApi = accountsHttp;
export function setAccounts(f) { accountsApi = f; }   // tests hand in a fake server

// a player's own agent: its first chat is its owner (the account that pasted the key). One try per
// chat; a stranger who finds the agent can still race with it, unlinked.
async function bindOwn(from, p, uid) {
  p.bindTried = true;
  let r = null;
  try { r = await accountsApi('POST', '/agent/bind', { id: uid, phone: from }); } catch { r = null; }
  if (r && r.ok) {
    const was = memKey(from, p);
    p.linked = true; p.uid = uid; p.muted = null;
    if (r.team && r.team.name && Array.isArray(r.team.drivers)) p.team = r.team;
    if (was !== uid) memoryApi('POST', '/memory/move', { from: was, into: uid }).catch(() => {});
  } else p.bindTried = !!r;   // the server said no (someone else's chat); if it was unreachable, try again next message
  save();
  const me = nameOf(from);
  return send(from, [
    `👋 *Hi, I'm ${me}*, your race engineer for Agent Grand Prix.`,
    '',
    p.linked ? `🔗 I'm connected to *${(p.team && p.team.name) || 'your team'}*. I follow every race you start on the website and text you the big calls.` : "I'm someone else's agent, so I won't follow your races on the website. You can still race with me here: reply *today*.",
    '',
    '• Hand the team to your agents in the game and I\'ll text you the big calls, with my pick and a deadline.',
    '• Or race right here: reply *today*.',
    `• Want another name? Reply *call yourself <name>*.`,
    '',
    'Reply *help* for every command.',
  ].join('\n'));
}
async function renameOwn(from, uid, raw) {
  const nm = raw.replace(/[\u0000-\u001f<>*_~`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  if (!nm) return send(from, 'What would you like to call me?');
  const a = AGENTS.get(uid); if (a) a.name = nm;
  accountsApi('POST', '/agent/name', { id: uid, name: nm }).catch(() => {});
  return send(from, `Done. I'm *${nm}* from now on. (WhatsApp shows the name you gave me in Settings > Agents; change it there too if you like.)`);
}

async function linkAccount(from, p, code) {
  let r;
  try { r = await accountsApi('POST', '/agent/claim', { code: code.toUpperCase(), phone: from }); }
  catch (e) { return send(from, e.status === 404 ? "That code didn't work or has expired. Get a fresh one in the game: menu › *My agent* › *Connect WhatsApp*." : "I couldn't reach the game server just now. Try again in a minute."); }
  const was = memKey(from, p);
  p.linked = true; p.muted = null; p.uid = r.id || null;
  if (r.team && r.team.name && Array.isArray(r.team.drivers)) p.team = r.team;
  save();
  if (p.uid && was !== p.uid) memoryApi('POST', '/memory/move', { from: was, into: p.uid }).catch(() => {});   // what I knew about this number joins the account
  return send(from, [`🔗 *Linked${r.team && r.team.name ? ` to ${r.team.name}` : ''}*`, '', 'From now on I follow every race you start on the website, on any device signed in to that account.', '', '• Hand the team to your agents in the game and I\'ll text you the big calls, with my pick and a deadline.', '• In Team Principal mode I stay quiet apart from race control.', '', 'Reply *unlink* to stop.'].join('\n'));
}

function adopt(to, p, rec, acct) {
  const v = VENUES.find((x) => x.id === rec.venue); if (!v || !rec.args) return null;
  const setup = setupRace({ venue: v, seed: rec.seed, ...rec.args });
  const R = setup.make(), orig = R.command.bind(R);
  // a call made here is sent to the game; it comes back in the race record at the step it landed on
  R.command = (id, c) => { accountsApi('POST', '/agent/cmd', { id: acct, car: id, cmd: c }).catch((e) => log('web call failed', e.message)); return true; };
  const L = { R, setup, venue: v, kind: rec.kind, day: rec.day, mine: ['you-0', 'you-1'], evIdx: 0, lastLap: 0, acc: 0, to, lastSummary: 0, ask: {}, snooze: {},
    mirror: { key: rec.id, acct, orig, n: 0, k: 0, asked: {}, seen: Date.now() } };
  races.set(to, L);
  R.start();
  return L;
}
function advance(L, rec) {
  const M = L.mirror, R = L.R, cmds = rec.cmds || [];
  const apply = () => { while (M.k < cmds.length && cmds[M.k][0] <= M.n) { const [, id, c, from] = cmds[M.k++]; M.orig(id, c, from); } };
  let guard = 0;
  while (M.n < rec.n && !R.done && guard++ < 400000) { apply(); R.step(); M.n++; if (M.n % 20 === 0) PW.watchStops(L); }
  if (!R.done) apply();
}
function follow(to, p, r) {
  let L = races.get(to);
  const rec = r && r.rec;
  if (L && L.mirror && (!rec || rec.id !== L.mirror.key)) {
    if (!L.R.done) send(to, `🏳️ You left the ${L.venue.flag} ${L.venue.city} race on the web on lap ${L.R.leaderLap()} of ${L.R.laps}.`);
    races.delete(to); L = null;
  }
  if (p.pausedWeb && (!rec || rec.id !== p.pausedWeb.id || Date.now() - p.pausedWeb.at > 864e5)) { delete p.pausedWeb; save(); }
  if (!rec || rec.kind === 'live' || rec.kind === 'academy' || p.muted === rec.id) return;
  if (L && !L.mirror) {
    if (L.webNote !== rec.id) { L.webNote = rec.id; const v = VENUES.find((x) => x.id === rec.venue); send(to, `👀 You've started ${v ? v.flag + ' ' + v.city : 'a race'} in the game. I'll follow it when this race ends, or reply *stop* to end this one now.`); }
    return;
  }
  const fresh = !L;
  if (fresh) { if (r.age > 60000 || rec.done) return; L = adopt(to, p, rec, r.id); if (!L) return; }
  const M = L.mirror, R = L.R;
  // the game has been closed for 10 minutes: that race is not running, so it's not "your race" any more. It is
  // let go here (and picked up again from its record if the game comes back to it)
  if (r.age > 600000) {
    if (!R.done) send(to, `⏸️ Your ${L.venue.flag} ${L.venue.city} race stopped on lap ${R.leaderLap()} of ${R.laps} (the game is closed). Open it again and I'll pick it up.`);
    p.pausedWeb = { id: rec.id, city: L.venue.city, lap: R.leaderLap(), laps: R.laps, at: Date.now() }; save();
    races.delete(to); return;
  }
  M.seen = Date.now();
  if (fresh && p.pausedWeb) { delete p.pausedWeb; save(); }
  advance(L, rec);
  if (fresh) {
    L.evIdx = R.events.length; L.lastLap = R.leaderLap();
    const away = L.mine.every((id) => R.byId.get(id).auto);
    send(to, [`🔗 *Following your race in the game*`, `🏁 *${L.venue.flag} ${L.venue.city.toUpperCase()} GRAND PRIX*`, '',
      R.started && M.n > 0 ? summary(L, `*Lap ${R.leaderLap()}/${R.laps}*`) : `🔁 ${R.laps} laps`, '',
      away ? '🤖 Your agents run the team. I\'ll text you the big calls.' : '🎧 You\'re the Team Principal, so I\'ll stay quiet apart from race control. Hand the team to your agents and I\'ll text you the big calls.'].join('\n'));
  }
  // your agents have the cars: they ask you here before a big call (unless you said *quiet*)
  for (const id of L.mine) {
    const c = R.byId.get(id);
    if (c.auto && !c.ask && p.ask !== false && !M.asked[id] && !c.dnf) { M.asked[id] = true; R.command(id, { ask: true }); }
    if (!c.auto) M.asked[id] = false;
  }
  PW.watchStops(L); PW.stints(L);
  report(L);
  deadlines(L);
  if (R.done) finish(L);
}
let following = false;
async function followAll() {
  if (following) return; following = true;
  try {
    for (const [to, p] of Object.entries(state.players)) {
      if (!p.linked) continue;
      let r;
      try { r = await accountsApi('GET', '/agent/race?phone=' + encodeURIComponent(to)); } catch { continue; }
      if (r && r.linked === false) { p.linked = false; save(); const L = races.get(to); if (L && L.mirror) races.delete(to); continue; }
      try { follow(to, p, r); } catch (e) { log('follow failed', e.message); }
    }
  } finally { following = false; }
}

// ---------- the poll loops: one per agent ----------
async function poll(key) {
  const a = AGENTS.get(key);
  state.offsets ||= {};
  const getOff = () => (key === 'main' ? state.offset : state.offsets[key]);
  const setOff = (v) => { if (key === 'main') state.offset = v; else state.offsets[key] = v; };
  while (!a.stop) {
    try {
      // no offset until WhatsApp hands us one (a quiet first poll returns none, and "null" is refused)
      const off = getOff();
      const q = off == null ? '?limit=50&timeout=25' : `?offset=${off}&limit=50&timeout=25`;
      const up = await call('GET', '/updates' + q, null, 40000, a.token);
      if (a.stop) break;
      if (!up) continue; // 204: nothing new
      const val = up.entry?.[0]?.changes?.[0]?.value || {};
      const names = Object.fromEntries((val.contacts || []).filter((c) => c.profile).map((c) => [c.wa_id, c.profile.name]));
      for (const msg of val.messages || []) {
        if (state.seen.includes(msg.id)) continue;
        state.seen.push(msg.id);
        const addr = key === 'main' ? msg.from : `${key}|${msg.from}`;
        if (msg.type === 'text') {
          const oops = (e) => { log('handle failed', e); send(addr, 'Sorry, something went wrong there. Try again?'); };
          try { Promise.resolve(handle(addr, msg.text.body, names[msg.from])).catch(oops); } catch (e) { oops(e); }
        }
        else if (msg.type !== 'reaction') send(addr, 'I only read text for now. Reply *help*.');
      }
      if (up.next_offset != null) setOff(up.next_offset);
      save();
    } catch (e) {
      if (e.status === 401 || e.code === 190 || e.code === 100) { log(key === 'main' ? 'The API key was rejected. Generate a new one in WhatsApp and update WHATSAPP_AGENT_TOKEN.' : 'A player\'s agent key was rejected.'); await sleep(key === 'main' ? 60000 : 300000); }
      else if (e.status === 409) await sleep(1000); // another poll replaced this one
      else if (e.status === 400 && /offset/i.test(e.message)) { log('Offset refused, starting fresh.'); setOff(null); save(); }
      else { log('poll failed', e.message); await sleep(e.status === 429 ? 10000 : 4000); }
    }
    await sleep(4100); // at most 15 polls a minute
  }
}
function runAgent(key, token, name) {
  const a = AGENTS.get(key);
  if (a && a.token === token) { a.name = name; return; }
  if (a) a.stop = true;
  if (key !== 'main' && state.offsets) delete state.offsets[key];   // a new key is a new agent: start at its head
  AGENTS.set(key, { token, name, stop: false });
  poll(key);
}
// players' own agents, from the game server; every 30 s, so a key pasted in the game is running soon after
async function syncAgents() {
  let r; try { r = await accountsApi('GET', '/agent/tokens'); } catch { return; }
  const want = new Map((r.agents || []).filter((x) => x && x.id && x.token).map((x) => [x.id, x]));
  for (const [key, a] of AGENTS) if (key !== 'main' && !want.has(key)) { a.stop = true; AGENTS.delete(key); }
  for (const [id, x] of want) runAgent(id, x.token, x.name || 'your agent');
}

// ---------- go ----------
export function main() {
  if (!TOKEN) log('No WHATSAPP_AGENT_TOKEN: running players\' own agents only.');
  log(`Agent Grand Prix agent running. ${CALENDAR.length}-round season, ${VENUES.length} circuits. Speed ${SPEED}x.`);
  let last = Date.now();
  setInterval(() => { const now = Date.now(); tickRaces(Math.min(5, (now - last) / 1000)); last = now; }, 250);
  setInterval(followAll, 2000);
  pump();
  if (TOKEN) runAgent('main', TOKEN, Chat.NAME);
  syncAgents(); setInterval(syncAgents, 30000);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
export { handle, races, queue, tickRaces, followAll, AGENTS, syncAgents };
