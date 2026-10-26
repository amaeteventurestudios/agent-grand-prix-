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
//   POST /api/board/daily          submit the race you ran: { day, team, agent, rec }
// Identity is the same session cookie the accounts service sets (server/accounts.mjs); nothing here
// reads a password or a token, and a player who has never signed in is a guest with an id of their own.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { open as openSession } from './accounts.mjs';
import { setupRace, dailyVenue, raceLaps, trackFor } from '../js/game.js';
import { lockForRace } from '../js/dna.js';
import { hashString } from '../js/rng.js';

const PORT = +(process.env.BOARD_PORT || 8142);
const DIR = process.env.BOARD_DIR || '/var/lib/agp-board';
const MAX = 512 * 1024;        // a replay record is a few KB of calls
const CMDS = 4000;             // more calls than any human makes in one short race
const TOP = 25;                // how many of each board a page shows
const DAYS = 2;                // yesterday's board still accepts a late agent run, nothing older

const ids = ['you-0', 'you-1'];
const file = (day) => path.join(DIR, `day-${day}.json`);
const read = (day) => { try { return JSON.parse(fs.readFileSync(file(day), 'utf8')); } catch { return { day, entries: {} }; } };
function write(day, board) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = file(day) + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(board)); fs.renameSync(tmp, file(day));
}

// the one thing that matters: run the race the player says they ran, and read its finish
export function verify(day, rec) {
  const venue = dailyVenue(day);
  if (!rec || rec.kind !== 'daily' || rec.venue !== venue.id) throw new Error('not today\'s Daily');
  if (rec.seed !== hashString('daily-' + day)) throw new Error('wrong seed');
  const cmds = Array.isArray(rec.cmds) ? rec.cmds : [];
  if (cmds.length > CMDS) throw new Error('too many calls');
  const a = rec.args || {};
  if (a.stage) throw new Error('not a real Daily');
  const laps = raceLaps(trackFor(venue), 'short');
  if (a.laps && a.laps !== laps) throw new Error('wrong race length');
  // the Driver DNA is put through the same bounds the game races under, whatever was sent
  const R = setupRace({ venue, seed: rec.seed, team: a.team, startCompounds: a.startCompounds || {}, auto: !!a.auto,
    dna: a.dna ? lockForRace(a.dna) : null, car: a.car, laps, ...(a.stops ? { stops: a.stops } : {}) }).make();
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
    places: my.map((x) => (x.dnf ? null : x.pos)), codes: my.map((x) => (x.car && x.car.code) || x.code), laps: R.laps, auto: !!a.auto };
}

const clean = (s, n) => String(s == null ? '' : s).replace(/[^\p{L}\p{N} '°.-]/gu, '').trim().slice(0, n);
const rank = (board, agent) => Object.entries(board.entries).filter(([, e]) => !!e.agent === agent)
  .map(([id, e]) => ({ id, ...e })).sort((a, b) => a.best - b.best || b.pts - a.pts || a.at - b.at);
const row = (e, i) => ({ place: i + 1, team: e.team, codes: e.codes, best: e.best, pts: e.pts, places: e.places, agent: !!e.agent });

const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
const cookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((s) => { const i = s.indexOf('='); return i < 0 ? ['', ''] : [s.slice(0, i).trim(), decodeURIComponent(s.slice(i + 1))]; }));
const who = (req) => { const s = openSession(cookies(req)['agp.sid']); const id = s && ((s.user && (s.user.id || s.user.user_id)) || s.uid); return id || null; };
const body = (req) => new Promise((ok, no) => { let b = ''; req.on('data', (d) => { b += d; if (b.length > MAX) { req.destroy(); no(new Error('too big')); } }); req.on('end', () => { try { ok(JSON.parse(b)); } catch { no(new Error('bad body')); } }); });

export function boards(day, me) {
  const b = read(day), human = rank(b, false), agent = rank(b, true);
  const mine = me && b.entries[me] ? { ...row(b.entries[me], (b.entries[me].agent ? agent : human).findIndex((x) => x.id === me)), you: true } : null;
  return { day, venue: { id: dailyVenue(day).id, city: dailyVenue(day).city, flag: dailyVenue(day).flag },
    human: human.slice(0, TOP).map(row), agent: agent.slice(0, TOP).map(row), you: mine, humans: human.length, agents: agent.length };
}

export function serve(port = PORT, today = () => Math.floor(Date.now() / 864e5)) {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/board/health') return send(res, 200, { board: true });
    const me = who(req);
    try {
      if (u.pathname === '/api/board/daily' && req.method === 'GET') {
        const day = +u.searchParams.get('day') || 0;
        if (!day) return send(res, 400, { error: 'which day' });
        return send(res, 200, boards(day, me));
      }
      if (u.pathname === '/api/board/daily' && req.method === 'POST') {
        if (!me) return send(res, 401, { error: 'no session' });
        const j = await body(req), day = +j.day;
        if (!Number.isInteger(day) || day <= 0) return send(res, 400, { error: 'which day' });
        const b = read(day);
        // one scored run a day, the same rule the game itself keeps: your first race is the one that counts
        if (b.entries[me]) return send(res, 200, { ok: false, already: true, ...boards(day, me) });
        let out; try { out = verify(day, j.rec); } catch (e) { return send(res, 400, { error: String(e.message || e).slice(0, 80) }); }
        b.entries[me] = { team: clean(j.team, 24) || 'A team', codes: out.codes.map((c) => clean(c, 4)), best: out.best,
          pts: out.pts, places: out.places, agent: !!j.agent, at: Date.now() };
        write(day, b);
        return send(res, 200, { ok: true, ...boards(day, me) });
      }
    } catch (e) { return send(res, 400, { error: String(e.message || e).slice(0, 80) }); }
    return send(res, 404, {});
  }).listen(port, '127.0.0.1');
}

if (import.meta.url === `file://${process.argv[1]}`) { serve(); console.log(`leaderboards on 127.0.0.1:${PORT}, saving to ${DIR}`); }
