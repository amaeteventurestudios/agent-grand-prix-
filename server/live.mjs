// Live Grand Prix: up to ten teams on one grid, racing at the same time.
//
// The race engine is deterministic, so a live race needs no race server: every browser runs the same
// race from the same room (circuit, seed, the ten teams and their Driver DNA), and this service only
// agrees on two things — who is in the room, and which engine step each call lands on. A call you
// make is given a step a little ahead of the room's clock and sent to everyone, so every browser
// applies it at the same moment and all ten races stay the same race. Nothing about the racing is
// decided here, and nothing a browser claims about the result is read: the day's board checks a
// finished race by replaying it (server/leaders.mjs).
//
// Browser endpoints, all under /api/live/*:
//   GET  /api/live/health        is live racing on
//   POST /api/live/join          take a seat in the room that is filling, with your team
//   GET  /api/live/room?id=      the room as it stands (also the way to rejoin after a refresh)
//   GET  /api/live/stream?id=    server-sent events: seats taken, the lights, every call, the end
//   POST /api/live/call          one call for one of your own cars: { id, car, cmd }
// Identity is the session cookie the accounts service sets (server/accounts.mjs), so a seat belongs
// to a player, not to a tab. Rooms live in memory: a room is one race, and it is over in minutes.
import http from 'node:http';
import { open as openSession } from './accounts.mjs';
import { dailyVenue, raceLaps, trackFor } from '../js/game.js';
import { hashString } from '../js/rng.js';

const PORT = +(process.env.LIVE_PORT || 8143);
const SEATS = 10;                 // ten teams, twenty cars: a full grid
const EVERY = +(process.env.LIVE_EVERY_MS || 5 * 60e3);   // a race starts every five minutes
const DOORS = +(process.env.LIVE_DOORS_MS || 90e3);      // the doors close ninety seconds before the lights
const LAG = 20;                   // calls land one second (20 engine steps) ahead of the room's clock
const KEEP = 30 * 60e3;           // a finished room is kept half an hour, for a refresh
const MAXCMD = 2000;

const rooms = new Map();          // id -> room
export const slotOf = (now = Date.now()) => Math.ceil((now + DOORS) / EVERY) * EVERY;

function roomFor(now = Date.now()) {
  const startAt = slotOf(now), id = 'r' + startAt;
  if (!rooms.has(id)) {
    const day = Math.floor(startAt / 864e5), venue = dailyVenue(day);
    rooms.set(id, { id, startAt, venue: venue.id, seed: hashString('live-' + startAt),
      laps: raceLaps(trackFor(venue), 'short'), seats: new Array(SEATS).fill(null), cmds: [], subs: new Set() });
  }
  return rooms.get(id);
}
const tidy = (now = Date.now()) => { for (const [id, r] of rooms) if (now - r.startAt > KEEP) { for (const s of r.subs) { try { s.end(); } catch { /* gone */ } } rooms.delete(id); } };
// what a browser is told about a room: the seats, the clock, and nothing about anyone's account
export const view = (r, me) => ({ id: r.id, startAt: r.startAt, venue: r.venue, seed: r.seed, laps: r.laps,
  seats: r.seats.map((s) => (s ? { team: s.team, dna: s.dna, car: s.car, auto: !!s.auto } : null)),
  you: r.seats.findIndex((s) => s && s.uid === me), taken: r.seats.filter(Boolean).length, seats_total: SEATS });

const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
const cookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((s) => { const i = s.indexOf('='); return i < 0 ? ['', ''] : [s.slice(0, i).trim(), decodeURIComponent(s.slice(i + 1))]; }));
const who = (req) => { const s = openSession(cookies(req)['agp.sid']); return (s && ((s.user && (s.user.id || s.user.user_id)) || s.uid)) || null; };
const body = (req) => new Promise((ok, no) => { let b = ''; req.on('data', (d) => { b += d; if (b.length > 64 * 1024) { req.destroy(); no(new Error('too big')); } }); req.on('end', () => { try { ok(JSON.parse(b)); } catch { no(new Error('bad body')); } }); });
function tell(room, kind, data) {
  const line = `event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const s of room.subs) { try { s.write(line); } catch { room.subs.delete(s); } }
}
// a call lands a little ahead of the room's clock, so every browser has it before it is needed
const stepNow = (room, now = Date.now()) => Math.max(0, Math.floor((now - room.startAt) / 50));

export function serve(port = PORT) {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/live/health') return send(res, 200, { live: true, every: EVERY, seats: SEATS, next: slotOf() });
    const me = who(req);
    tidy();
    try {
      if (u.pathname === '/api/live/join' && req.method === 'POST') {
        if (!me) return send(res, 401, { error: 'no session' });
        const j = await body(req), room = roomFor();
        let k = room.seats.findIndex((s) => s && s.uid === me);
        if (k < 0) k = room.seats.findIndex((s) => !s);
        if (k < 0) return send(res, 409, { error: 'the grid is full', ...view(room, me) });
        room.seats[k] = { uid: me, team: j.team, dna: j.dna || null, car: j.car || 'falcon', auto: !!j.auto };
        tell(room, 'seats', view(room, null));
        return send(res, 200, view(room, me));
      }
      if (u.pathname === '/api/live/room') {
        const room = rooms.get(u.searchParams.get('id')) || roomFor();
        return send(res, 200, { ...view(room, me), cmds: room.cmds });
      }
      if (u.pathname === '/api/live/call' && req.method === 'POST') {
        if (!me) return send(res, 401, { error: 'no session' });
        const j = await body(req), room = rooms.get(j.id);
        if (!room) return send(res, 404, { error: 'no such race' });
        const k = room.seats.findIndex((s) => s && s.uid === me);
        if (k < 0) return send(res, 403, { error: 'not in this race' });
        if (j.car !== 0 && j.car !== 1) return send(res, 400, { error: 'which car' });
        if (room.cmds.length >= MAXCMD) return send(res, 429, { error: 'too many calls' });
        const at = stepNow(room) + LAG, call = [at, k, j.car, j.cmd];
        room.cmds.push(call); tell(room, 'call', call);
        return send(res, 200, { at });
      }
      if (u.pathname === '/api/live/stream') {
        const room = rooms.get(u.searchParams.get('id')) || roomFor();
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`event: room\ndata: ${JSON.stringify({ ...view(room, me), cmds: room.cmds })}\n\n`);
        room.subs.add(res);
        const beat = setInterval(() => { try { res.write(': still here\n\n'); } catch { /* gone */ } }, 15000);
        req.on('close', () => { clearInterval(beat); room.subs.delete(res); });
        return;
      }
    } catch (e) { return send(res, 400, { error: String(e.message || e).slice(0, 80) }); }
    return send(res, 404, {});
  }).listen(port, '127.0.0.1');
}

if (import.meta.url === `file://${process.argv[1]}`) { serve(); console.log(`live racing on 127.0.0.1:${PORT}, a race every ${EVERY / 60e3} minutes`); }
