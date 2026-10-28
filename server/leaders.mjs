// Leaderboards for the Daily Grand Prix, checked rather than trusted.
//
// The race engine is deterministic: the same circuit, seed, car, Driver DNA and the same calls at
// the same engine steps always give the same race. So a browser doesn't send its finishing place; it
// sends the race it ran — the setup and every call, with the step each was made on, the record the
// game already keeps so a race survives a refresh (`live` in js/main.js). This service rebuilds that
// race with the game's own engine (js/sim.js, through js/game.js) and reads the finish from its own
// run. A made-up result cannot be submitted, because nothing a browser says about the finish is read.
//
// Humans and agents are ranked apart: your agent racing a Daily you missed (js/agent.js) keeps your
// streak, and its result stands on the agent board, never against people on the radio. A board shows
// team names and driver codes, never account names.
//
// Browser endpoints, all under /api/board/*:
//   GET  /api/board/health         is the board on
//   GET  /api/board/daily?day=N    the day's board: top of each list, and where you are
//        (&len=full: the full-distance Daily, a board of its own with the same circuit, grid and weather)
//   POST /api/board/daily          submit the race you ran: { day, team, agent, rec } (rec.kind says which board)
// Identity is the same session cookie the accounts service sets (server/accounts.mjs); nothing here
// reads a password or a token, and a player who has never signed in is a guest with an id of their own.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { open as openSession } from './accounts.mjs';
import { setupRace, dailyVenue, raceLaps, trackFor, dayNumber } from '../js/game.js';
import { lockForRace } from '../js/dna.js';
import { hashString } from '../js/rng.js';

const PORT = +(process.env.BOARD_PORT || 8142);
const DIR = process.env.BOARD_DIR || '/var/lib/agp-board';
const MAX = 512 * 1024;        // a replay record is a few KB of calls
const CMDS = 4000;             // more calls than any human makes in one short race
const TOP = 25;                // how many of each board a page shows
const DAYS = 2;                // yesterday's board still accepts a late agent run, nothing older

const ids = ['you-0', 'you-1'];
const CMDS_FULL = 20000;        // a full Grand Prix is about seven short races long
const file = (day, len = 'short') => path.join(DIR, `${len === 'full' ? 'full' : 'day'}-${day}.json`);
const read = (day, len) => { try { return JSON.parse(fs.readFileSync(file(day, len), 'utf8')); } catch { return { day, entries: {} }; } };
function write(day, board, len) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = file(day, len) + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(board)); fs.renameSync(tmp, file(day, len));
}

// the one thing that matters: run the race the player says they ran, and read its finish
export function verify(day, rec) {
  const venue = dailyVenue(day);
  if (!rec || (rec.kind !== 'daily' && rec.kind !== 'dailyfull') || rec.venue !== venue.id) throw new Error('not today\'s Daily');
  const len = rec.kind === 'dailyfull' ? 'full' : 'short';
  if (rec.seed !== hashString('daily-' + day)) throw new Error('wrong seed');
  const cmds = Array.isArray(rec.cmds) ? rec.cmds : [];
  if (cmds.length > (len === 'full' ? CMDS_FULL : CMDS)) throw new Error('too many calls');
  const a = rec.args || {};
  if (a.stage) throw new Error('not a real Daily');
  const laps = raceLaps(trackFor(venue), len);
  if (a.laps && a.laps !== laps) throw new Error('wrong race length');
  // the Driver DNA is put through the same bounds the game races under, whatever was sent
  const R = setupRace({ venue, seed: rec.seed, team: a.team, startCompounds: a.startCompounds || {}, auto: !!a.auto,
    dna: a.dna ? lockForRace(a.dna) : null, car: a.car, laps, ...(a.stops ? { stops: a.stops } : {}),
    ...(a.quali && typeof a.quali === 'object' ? { quali: a.quali } : {}) }).make();
  // a standing team order set before the start (an agent's playbook rule, js/agent.js) is part of the setup
  if (a.orders === 'hold') for (const id of ids) { const c = R.byId.get(id); if (c) c.order = 'hold'; }
  R.start();
  let k = 0, n = 0, guard = 0;
  while (!R.done && guard++ < 400000) {
    while (k < cmds.length && cmds[k][0] <= n) { const c = cmds[k++]; try { R.command(c[1], c[2], c[3]); } catch { /* a call the engine refuses is simply not made */ } }
    R.step(); n++;
  }
  if (!R.done) throw new Error('race did not finish');
  const my = R.result.filter((x) => ids.includes(x.id));
  if (my.length !== 2) throw new Error('no cars of yours in the result');
  return { best: Math.min(...my.map((x) => x.pos)), pts: my.reduce((s, x) => s + x.points, 0),
    places: my.map((x) => (x.dnf ? null : x.pos)), codes: my.map((x) => (x.car && x.car.code) || x.code), laps: R.laps, auto: !!a.auto, len };
}

const clean = (s, n) => String(s == null ? '' : s).replace(/[^\p{L}\p{N} '°.-]/gu, '').trim().slice(0, n);
const rank = (board, agent) => Object.entries(board.entries).filter(([, e]) => !!e.agent === agent)
  .map(([id, e]) => ({ id, ...e })).sort((a, b) => a.best - b.best || b.pts - a.pts || a.at - b.at);
const row = (e, i) => ({ place: i + 1, team: e.team, codes: e.codes, best: e.best, pts: e.pts, places: e.places, agent: !!e.agent });

const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
const cookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((s) => { const i = s.indexOf('='); return i < 0 ? ['', ''] : [s.slice(0, i).trim(), decodeURIComponent(s.slice(i + 1))]; }));
const who = (req) => { const s = openSession(cookies(req)['agp.sid']); const id = s && ((s.user && (s.user.id || s.user.user_id)) || s.uid); return id || null; };
const body = (req) => new Promise((ok, no) => { let b = ''; req.on('data', (d) => { b += d; if (b.length > MAX) { req.destroy(); no(new Error('too big')); } }); req.on('end', () => { try { ok(JSON.parse(b)); } catch { no(new Error('bad body')); } }); });

export function boards(day, me, len = 'short') {
  const b = read(day, len), human = rank(b, false), agent = rank(b, true);
  const mine = me && b.entries[me] ? { ...row(b.entries[me], (b.entries[me].agent ? agent : human).findIndex((x) => x.id === me)), you: true } : null;
  return { day, venue: { id: dailyVenue(day).id, city: dailyVenue(day).city, flag: dailyVenue(day).flag },
    human: human.slice(0, TOP).map(row), agent: agent.slice(0, TOP).map(row), you: mine, humans: human.length, agents: agent.length, len };
}

// ---------- the weekly league: the week's Daily results added up ----------
// A week is seven Dailies (#1-#7, #8-#14, ...). Each team's points from its checked Daily runs are
// added up, people and agents apart, and the top of the people's table shares the week's prize pot.
// The pot is a fixed number set on the server (WEEKLY_POT, in Sora); with none set the table still
// runs and says prizes come later. Nothing here pays anything: payouts are made by Novenique's
// wallet once it is connected, from the final table of a finished week.
export const POT = Math.max(0, Math.floor(+(process.env.WEEKLY_POT || 0)));
export const SHARES = [25, 18, 13, 10, 8, 7, 6, 5, 4, 4];         // percent of the pot, places 1 to 10
export const weekOf = (day) => Math.floor((day - 1) / 7) + 1;
export const daysOf = (week) => Array.from({ length: 7 }, (_, i) => (week - 1) * 7 + 1 + i);
export function league(week, me, today = Infinity) {
  const tot = new Map();
  for (const day of daysOf(week)) {
    if (day > today) break;
    for (const [id, e] of Object.entries(read(day).entries)) {
      const t = tot.get(id) || { id, team: e.team, codes: e.codes, pts: 0, races: 0, best: 99, agent: !!e.agent };
      t.pts += e.pts; t.races++; t.best = Math.min(t.best, e.best); t.team = e.team; t.codes = e.codes;
      tot.set(id, t);
    }
  }
  const order = (agent) => [...tot.values()].filter((t) => t.agent === agent).sort((a, b) => b.pts - a.pts || a.best - b.best || b.races - a.races);
  const human = order(false), agent = order(true);
  const prize = (i) => (POT && i < SHARES.length ? Math.floor((POT * SHARES[i]) / 100) : 0);
  const row = (t, i, prizes) => ({ place: i + 1, team: t.team, codes: t.codes, pts: t.pts, races: t.races, best: t.best, ...(prizes ? { prize: prize(i) } : {}) });
  const hi = human.findIndex((t) => t.id === me), ai = agent.findIndex((t) => t.id === me);
  const you = hi >= 0 ? { ...row(human[hi], hi, true), you: true } : ai >= 0 ? { ...row(agent[ai], ai, false), you: true, agent: true } : null;
  const days = daysOf(week);
  return { week, from: days[0], to: days[6], done: today > days[6], pot: POT, shares: SHARES,
    human: human.slice(0, TOP).map((t, i) => row(t, i, true)), agent: agent.slice(0, TOP).map((t, i) => row(t, i, false)), you, humans: human.length, agents: agent.length };
}

// ---------- paying a finished week ----------
// Once a week's seventh Daily is over, the people's final table is sent to the Sora ledger (Palasora's economy service,
// on this same server). It pays each place once into the winner's own Sora account and never more than the week's pot,
// so sending a week twice is harmless. Only signed-in accounts are paid; an entry from before accounts has no wallet.
const ECONOMY = (process.env.ECONOMY_URL || '').replace(/\/$/, ''), ECON_TOKEN = process.env.EDITORIAL_SERVICE_TOKEN || '';
const paidFile = () => path.join(DIR, 'paid.json');
// while the Anti-Bot Pass is on sale, the pot is shared among pass holders: places are counted among them only
const ACCOUNTS = process.env.AGP_ACCOUNTS_URL || 'http://127.0.0.1:8141';
async function eligible(id) {
  try { const j = await (await fetch(`${ACCOUNTS}/agent/pass?id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(5000) })).json(); return !j.sell || !!j.active; }
  catch { return null; }
}
export async function payouts(week, ok = eligible) {
  const tot = new Map();
  for (const day of daysOf(week)) for (const [id, e] of Object.entries(read(day).entries)) {
    if (e.agent) continue;
    const t = tot.get(id) || { id, pts: 0, races: 0, best: 99 };
    t.pts += e.pts; t.races++; t.best = Math.min(t.best, e.best); tot.set(id, t);
  }
  const order = [...tot.values()].sort((a, b) => b.pts - a.pts || a.best - b.best || b.races - a.races).filter((t) => /^[a-z0-9]{15}$/.test(t.id));
  const winners = [];
  for (const t of order) {
    if (winners.length >= SHARES.length) break;
    const e = await ok(t.id); if (e === null) throw new Error('accounts service not answering');
    if (e) winners.push(t);
  }
  return winners.map((t, i) => ({ user_id: t.id, place: i + 1, amount: Math.floor((POT * SHARES[i]) / 100) })).filter((p) => p.amount > 0);
}
export async function payFinishedWeeks(today = dayNumber()) {
  if (!ECONOMY || !ECON_TOKEN || !POT) return [];
  let done = {}; try { done = JSON.parse(fs.readFileSync(paidFile(), 'utf8')); } catch {}
  const out = [];
  for (let week = 1; week < weekOf(today); week++) {
    if (done[week]) continue;
    try {
      const lines = await payouts(week);
      const r = await fetch(`${ECONOMY}/economy/prizes/agp/week`, { method: 'POST', headers: { 'x-service-token': ECON_TOKEN, 'content-type': 'application/json' },
        body: JSON.stringify({ week, payouts: lines }), signal: AbortSignal.timeout(15000) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { console.error(`week ${week} payout refused: ${r.status} ${JSON.stringify(j).slice(0, 200)}`); continue; }
      done[week] = { at: Date.now(), paid: j.paid, lines: lines.length };
      fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(paidFile(), JSON.stringify(done));
      out.push(week);
    } catch (e) { console.error(`week ${week} payout failed: ${e.message}`); }
  }
  return out;
}

export function serve(port = PORT, today = () => Math.floor(Date.now() / 864e5)) {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/board/health') return send(res, 200, { board: true });
    const me = who(req);
    try {
      if (u.pathname === '/api/board/week' && req.method === 'GET') {
        const week = +u.searchParams.get('week') || 0, today = +u.searchParams.get('today') || Infinity;
        if (!week) return send(res, 400, { error: 'which week' });
        return send(res, 200, league(week, me, today));
      }
      if (u.pathname === '/api/board/daily' && req.method === 'GET') {
        const day = +u.searchParams.get('day') || 0;
        if (!day) return send(res, 400, { error: 'which day' });
        return send(res, 200, boards(day, me, u.searchParams.get('len') === 'full' ? 'full' : 'short'));
      }
      if (u.pathname === '/api/board/daily' && req.method === 'POST') {
        if (!me) return send(res, 401, { error: 'no session' });
        const j = await body(req), day = +j.day;
        if (!Number.isInteger(day) || day <= 0) return send(res, 400, { error: 'which day' });
        const len = j.rec && j.rec.kind === 'dailyfull' ? 'full' : 'short', b = read(day, len);
        // one scored run a day on each board, the same rule the game itself keeps: your first race is the one that counts
        if (b.entries[me]) return send(res, 200, { ok: false, already: true, ...boards(day, me, len) });
        let out; try { out = verify(day, j.rec); } catch (e) { return send(res, 400, { error: String(e.message || e).slice(0, 80) }); }
        b.entries[me] = { team: clean(j.team, 24) || 'A team', codes: out.codes.map((c) => clean(c, 4)), best: out.best,
          pts: out.pts, places: out.places, agent: !!j.agent, at: Date.now() };
        write(day, b, len);
        return send(res, 200, { ok: true, ...boards(day, me, len) });
      }
    } catch (e) { return send(res, 400, { error: String(e.message || e).slice(0, 80) }); }
    return send(res, 404, {});
  }).listen(port, '127.0.0.1');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  serve(); console.log(`leaderboards on 127.0.0.1:${PORT}, saving to ${DIR}; weekly prizes ${ECONOMY && ECON_TOKEN && POT ? 'paid in Sora' : 'not connected'}`);
  const pay = () => payFinishedWeeks().then((w) => w.length && console.log(`paid weeks ${w.join(', ')}`));
  setTimeout(pay, 30_000); setInterval(pay, 3600_000);
}
