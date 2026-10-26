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
import { fileURLToPath } from 'node:url';
import { CALENDAR, VENUES, COMPOUNDS } from '../js/data.js';
import { hashString } from '../js/rng.js';
import { setupRace, dayNumber, dailyVenue, DEFAULT_TEAM } from '../js/game.js';
import { DT, fmtTime } from '../js/sim.js';

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

// ---------- WhatsApp Agent Platform client ----------
async function call(method, path, body, timeoutMs = 40000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(API + path, {
      method, signal: ctl.signal,
      headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(`${method} ${path}: ${res.status} ${json.error?.message || ''}`); e.status = res.status; e.code = json.error?.code; throw e; }
    return json;
  } finally { clearTimeout(t); }
}

// Outbound queue: the platform allows 12 messages a minute per agent, so keep to 10.
const queue = [];
let sentAt = [];
function send(to, text) { if (text) queue.push({ to, text: text.slice(0, 4096) }); }
async function pump() {
  for (;;) {
    sentAt = sentAt.filter((t) => Date.now() - t < 60000);
    if (queue.length && sentAt.length < 10) {
      const m = queue[0];
      try {
        await call('POST', '/messages', { messaging_product: 'whatsapp', to: m.to, type: 'text', text: { body: m.text, preview_url: true } });
        queue.shift(); sentAt.push(Date.now());
      } catch (e) {
        log('send failed', e.message);
        if (e.status === 429 || e.status >= 500) await sleep(5000); else queue.shift(); // a 400 will never succeed
      }
    }
    // when the queue backs up during a race, merge waiting lines for the same person
    if (queue.length > 4) {
      const a = queue[1], b = queue[2];
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

function startRace(to, p, kind, venue) {
  const n = dayNumber();
  const v = venue || dailyVenue(n);
  const seed = hashString(kind === 'daily' ? 'daily-' + n : 'quick-' + v.id + '-' + Date.now());
  const setup = setupRace({ venue: v, seed, team: p.team || DEFAULT_TEAM, auto: p.auto });
  const R = setup.make();
  const mine = ['you-0', 'you-1'];
  const live = { R, setup, venue: v, kind, day: n, mine, evIdx: 0, lastLap: 0, acc: 0, to, lastSummary: 0 };
  races.set(to, live);
  const grid = mine.map((id) => R.byId.get(id));
  const W = setup.weather;
  send(to, [
    `🏁 *${v.flag} ${v.city} Grand Prix*${kind === 'daily' ? ` · Daily #${n}` : ''}`,
    `${v.circuit}, ${v.country} · ${setup.laps} laps · ${tempTxt(v.temp)}${W.wet0 > 0.17 ? ' · wet track' : W.showers.length ? ' · rain likely' : ''}`,
    '',
    ...grid.map((c) => `${c.code} starts P${c.grid} on ${tyre(c.tyre.c)}`),
    '',
    p.auto ? 'Autonomous: your AI makes the calls. Say *take over* any time.' : 'You make the calls. Reply *box softs*, *boost*, *push*, *save*, *attack*, *defend*, or *status*.',
    'Lights out in 5 seconds…',
  ].join('\n'));
  setTimeout(() => { if (races.get(to) === live) { R.start(); live.t0 = Date.now(); } }, 5000);
}

function tickRaces(dtReal) {
  for (const [to, L] of races) {
    const R = L.R; if (!R.started) continue;
    L.acc += dtReal * SPEED;
    let n = 0;
    while (L.acc >= DT && n < 2000 && !R.done) { R.step(); L.acc -= DT; n++; }
    report(L);
    if (R.done) finish(L);
  }
}

// what's worth a message: your cars' radio, safety cars, rain, big moments, and a line each lap
function report(L) {
  const R = L.R, out = [];
  while (L.evIdx < R.events.length) {
    const e = R.events[L.evIdx++];
    const isMine = e.car && L.mine.includes(e.car), car = e.car && R.byId.get(e.car);
    if (e.type === 'advice' && isMine) {
      const a = e.action || {};
      out.push(`📻 *${car.code}* engineer: ${e.text}${a.box ? `\nReply *box ${COMPOUNDS[a.box].name.toLowerCase()}* to do it.` : a.ers ? `\nReply *${a.ers}* to do it.` : ''}`);
    } else if ((e.type === 'radio' || e.type === 'pit') && isMine) out.push(`📻 ${e.text.startsWith(car.code) ? e.text : car.code + ': ' + e.text}`);
    else if (e.type === 'sc') out.push((e.phase === 'green' ? '🟢 ' : '🟡 ') + e.text);
    else if (e.type === 'weather') out.push('🌧️ ' + e.text);
    else if (e.type === 'dnf' || (e.type === 'incident' && (isMine || (car && car.pos <= 5)))) out.push('⚠️ ' + e.text);
    else if (e.type === 'battle' && (isMine || (e.other && L.mine.includes(e.other)) || e.forPos === 1)) out.push('🔥 ' + e.text);
    else if (e.type === 'pass' && (isMine || (e.other && L.mine.includes(e.other)) || /for P1\b/.test(e.text))) out.push('↗️ ' + e.text);
    else if (e.type === 'lap' && /Final/.test(e.text)) out.push('🏁 Final lap!');
  }
  const lap = R.leaderLap();
  if (lap > L.lastLap && R.started && !R.done) {
    L.lastLap = lap;
    if (lap > 1) out.push(summary(L, `*Lap ${lap}/${R.laps}*`));
  }
  if (out.length) send(L.to, out.join('\n'));
}

function summary(L, head) {
  const R = L.R, lead = R.order[0];
  const lines = L.mine.map((id) => {
    const c = R.byId.get(id);
    if (c.dnf) return `${c.code}: out`;
    const life = Math.round((1 - Math.min(1, c.tyre.wear)) * 100);
    return `${c.code} P${c.pos} · ${c.pos === 1 ? 'leading' : '+' + c.gap.toFixed(1) + 's'} · ${COMPOUNDS[c.tyre.c].name} ${life}% · ⚡${Math.round(c.ers * 100)}%${c.pit ? ' · in the pits' : ''}`;
  });
  return [head + (lead && !L.mine.includes(lead.id) ? ` · ${lead.code} leads` : ''), ...lines].join('\n');
}

function finish(L) {
  races.delete(L.to);
  const R = L.R, res = R.result, my = res.filter((x) => L.mine.includes(x.id));
  const top = res.slice(0, 3).map((x, k) => `${['🥇', '🥈', '🥉'][k]} ${x.car.code} ${x.gapText}`);
  const pts = my.reduce((a, x) => a + x.points, 0);
  const p = player(L.to);
  p.results.push({ day: L.kind === 'daily' ? L.day : null, venue: L.venue.id, pos: my.map((x) => (x.dnf ? 'DNF' : x.pos)), pts });
  p.results = p.results.slice(-50);
  save();
  send(L.to, [
    `🏁 *Chequered flag in ${L.venue.city}!*`,
    ...top, '',
    ...my.map((x) => `${x.car.code}: ${x.dnf ? 'DNF' : 'P' + x.pos}${x.penalty ? ' (+20s penalty)' : ''} · ${x.stops} stop${x.stops === 1 ? '' : 's'}`),
    `+${pts} points`,
    '',
    L.kind === 'daily' ? `Daily Grand Prix #${L.day} done. Race it in 3D: ${SITE || 'the web game'}` : 'Reply *race* for another.',
  ].join('\n'));
}

// ---------- chat commands ----------
const HELP = [
  '🏎️ *Agent Grand Prix*',
  'Your AI drivers race. You run the team.',
  '',
  '*today* · race the Daily Grand Prix',
  '*race <city>* · quick race anywhere (e.g. race kingston)',
  '*auto* / *take over* · let your AI make the calls, or make them yourself',
  '*team <name>* · name your team',
  '*results* · your last races',
  '*circuits* · all 40 venues',
  '',
  'During a race: *box softs* (or mediums, hards, inters, wets), *stay out*, *boost*, *push*, *save*, *normal*, *attack*, *defend*, *status*, *stop*.',
].join('\n');

function handle(from, text, name) {
  const p = player(from, name);
  const t = text.trim().toLowerCase().replace(/[!.?]+$/, '');
  const L = races.get(from);
  const R = L && L.R;
  const car = L && (L.sel ? R.byId.get(L.sel) : R.byId.get('you-0'));
  const cmd = (c, id = car && car.id) => { R.command(id, c); if (R.byId.get(id).auto && !('auto' in c)) R.command(id, { auto: false }); };
  let m;

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
  if (L && /^(stop|quit|abandon)$/.test(t)) { races.delete(from); return send(from, 'Race stopped. Reply *today* or *race* for another.'); }
  if (/^(auto|autonomous)$/.test(t)) { p.auto = true; save(); if (L) for (const id of L.mine) R.command(id, { auto: true }); return send(from, '🤖 Autonomous: your AI makes every call. Say *take over* to make them yourself.'); }
  if (/^(take over|manual|principal)$/.test(t)) { p.auto = false; save(); if (L) for (const id of L.mine) R.command(id, { auto: false }); return send(from, '🎧 You have the calls. Your engineer will advise.'); }
  if ((m = t.match(/^team\s+(.{2,24})$/))) {
    const nm = text.trim().slice(5).trim().slice(0, 24);
    p.team = { ...DEFAULT_TEAM, name: nm, short: nm.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'YOU' }; save();
    return send(from, `Your team is now *${nm}*.`);
  }
  if (/^(results|history)$/.test(t)) {
    const r = p.results.slice(-5).reverse();
    return send(from, r.length ? '*Your last races*\n' + r.map((x) => `${VENUES.find((v) => v.id === x.venue)?.city}: ${x.pos.map((q) => (q === 'DNF' ? 'DNF' : 'P' + q)).join(', ')} · +${x.pts}`).join('\n') : 'No races yet. Reply *today*.');
  }
  if (/^(circuits|venues|calendar)$/.test(t)) return send(from, '*Circuits*\n' + VENUES.map((v) => `${v.flag} ${v.city}`).join(' · ') + '\n\nReply *race <city>*.');
  if (/^(today|daily|race today)$/.test(t) || (/^(race|go|start)$/.test(t))) {
    if (L) return send(from, 'You are already racing. Reply *stop* to end it.');
    return startRace(from, p, 'daily');
  }
  if ((m = t.match(/^race\s+(.+)$/))) {
    if (L) return send(from, 'You are already racing. Reply *stop* to end it.');
    const q = m[1].replace(/[^a-z ]/g, '');
    const v = VENUES.find((x) => x.id === q.replace(/ /g, '') || x.city.toLowerCase() === q || x.country.toLowerCase().startsWith(q));
    if (!v) return send(from, `I don't know a circuit called "${m[1]}". Reply *circuits* for the list.`);
    return startRace(from, p, 'quick', v);
  }
  if (L) return send(from, 'During the race: *box softs*, *boost*, *push*, *save*, *attack*, *defend*, *status* or *stop*.');
  const n = dayNumber(), v = dailyVenue(n);
  return send(from, `${HELP}\n\nToday: ${v.flag} *${v.city}* (Daily #${n}). Reply *today* to race it.`);
}

function pickCar(L, w) {
  if (!w) return null;
  if (w === '1') return L.R.byId.get('you-0');
  if (w === '2') return L.R.byId.get('you-1');
  return L.mine.map((id) => L.R.byId.get(id)).find((c) => c.code.toLowerCase() === w || c.name.toLowerCase() === w) || null;
}

// ---------- the poll loop ----------
async function poll() {
  for (;;) {
    try {
      // no offset until WhatsApp hands us one (a quiet first poll returns none, and "null" is refused)
      const q = state.offset == null ? '?limit=50&timeout=25' : `?offset=${state.offset}&limit=50&timeout=25`;
      const up = await call('GET', '/updates' + q);
      if (!up) continue; // 204: nothing new
      const val = up.entry?.[0]?.changes?.[0]?.value || {};
      const names = Object.fromEntries((val.contacts || []).filter((c) => c.profile).map((c) => [c.wa_id, c.profile.name]));
      for (const msg of val.messages || []) {
        if (state.seen.includes(msg.id)) continue;
        state.seen.push(msg.id);
        if (msg.type === 'text') { try { handle(msg.from, msg.text.body, names[msg.from]); } catch (e) { log('handle failed', e); send(msg.from, 'Sorry, something went wrong there. Try again?'); } }
        else if (msg.type !== 'reaction') send(msg.from, 'I only read text for now. Reply *help*.');
      }
      if (up.next_offset != null) state.offset = up.next_offset;
      save();
    } catch (e) {
      if (e.status === 401 || e.code === 190 || e.code === 100) { log('The API key was rejected. Generate a new one in WhatsApp and update WHATSAPP_AGENT_TOKEN.'); await sleep(60000); }
      else if (e.status === 409) await sleep(1000); // another poll replaced this one
      else if (e.status === 400 && /offset/i.test(e.message)) { log('Offset refused, starting fresh.'); state.offset = null; save(); }
      else { log('poll failed', e.message); await sleep(e.status === 429 ? 10000 : 4000); }
    }
    await sleep(4100); // at most 15 polls a minute
  }
}

// ---------- go ----------
export function main() {
  if (!TOKEN) { console.error('Set WHATSAPP_AGENT_TOKEN to the agent API key from WhatsApp (Chat info > API key).'); process.exit(1); }
  log(`Agent Grand Prix agent running. ${CALENDAR.length}-round season, ${VENUES.length} circuits. Speed ${SPEED}x.`);
  let last = Date.now();
  setInterval(() => { const now = Date.now(); tickRaces(Math.min(5, (now - last) / 1000)); last = now; }, 250);
  pump(); poll();
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
export { handle, races, queue };
