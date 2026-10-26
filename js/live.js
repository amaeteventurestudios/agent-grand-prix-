// Live Grand Prix in the browser: up to ten teams on one grid, racing at the same time.
//
// Your browser runs the whole race, as it always does. The room service (server/live.mjs) agrees on
// two things only: who is in the room, and which engine step each call lands on. Your own calls are
// sent up and come back with a step a little ahead of the room's clock, so every browser applies
// every call at the same moment and the ten races stay one race. If the connection drops, the race
// you are watching carries on; you simply stop hearing other teams' calls, and the room can be read
// again from the start with /api/live/room.
const API = '/api/live';
const TIMEOUT = 6000;

async function ask(route, opts) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), TIMEOUT);
  try { const r = await fetch(API + route, { credentials: 'same-origin', signal: c.signal, ...opts }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}
const post = (route, body) => ask(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const live = { on: null, room: null, you: -1, es: null };

export async function liveOn() {
  if (live.on === null) { const h = await ask('/health'); live.on = !!(h && h.live); live.next = h && h.next; }
  return live.on;
}
// take a seat in the room that is filling. Your team, your car and your Driver DNA go with you,
// because every browser builds the same twenty cars from the same room.
export async function joinLive({ team, dna, car, auto }) {
  if (!(await liveOn())) return null;
  let r = await post('/join', { team, dna, car, auto });
  // no session yet (the account check timed out on a slow start): ask for one, then once more
  if (!r) { await fetch('/api/me', { credentials: 'same-origin' }).catch(() => null); r = await post('/join', { team, dna, car, auto }); }
  if (r && !r.error) { live.room = r; live.you = r.you; }
  return r;
}
export const readRoom = (id) => ask(`/room?id=${encodeURIComponent(id)}`);
export const sendCall = (id, car, cmd) => post('/call', { id, car, cmd });

// Listen to the room. `on.seats` is called as teams take their places, `on.call` for every call made
// by anyone (yours included, so every browser applies it the same way), `on.room` once at the start.
export function listen(id, on = {}) {
  stop();
  const es = live.es = new EventSource(`${API}/stream?id=${encodeURIComponent(id)}`);
  const hear = (kind) => es.addEventListener(kind, (e) => { try { on[kind] && on[kind](JSON.parse(e.data)); } catch { /* a line we don't understand is ignored */ } });
  hear('room'); hear('seats'); hear('call');
  es.onerror = () => { if (on.drop) on.drop(); };
  return es;
}
export function stop() { if (live.es) { try { live.es.close(); } catch { /* already gone */ } live.es = null; } }

// the room's clock, in engine steps since the lights: the same number in every browser
export const stepAt = (room, now = Date.now()) => Math.floor((now - room.startAt) / 50);
export const secondsToStart = (room, now = Date.now()) => Math.max(0, Math.round((room.startAt - now) / 1000));

// a call from the room names a seat and a car; in this browser your own seat's cars are you-0 and you-1
export const carIdFor = (seat, car, me) => (seat === me ? `you-${car}` : `seat${seat}-${car}`);
// apply every call due by this engine step, in the order the room gave them, exactly once
export function applyDue(R, calls, step, me, from = { i: 0 }) {
  while (from.i < calls.length && calls[from.i][0] <= step) {
    const [, seat, car, cmd] = calls[from.i++];
    try { R.command(carIdFor(seat, car, me), cmd, 'principal'); } catch { /* a call the engine refuses is simply not made */ }
  }
  return from;
}
