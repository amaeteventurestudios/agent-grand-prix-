// Your account in the browser. The game works with no account at all: everything is saved on this
// device (js/store.js). When the account service is running, this also keeps a copy on the server
// under whoever you are, so signing in on another phone brings your team with you. Nothing here
// holds a password or a token: the session is an httpOnly cookie the browser sends on its own.
const API = '/api/me';
const TIMEOUT = 4000;

async function ask(route, opts) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), TIMEOUT);
  try { const r = await fetch(API + route, { credentials: 'same-origin', signal: c.signal, ...opts }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}

export const account = { on: false, me: null, signin: false };   // signin: Novenique Core is connected

// Called once at startup. Answers with the server's save when it is further along than this
// device's, so a new phone picks up where you left off; otherwise this device's save is sent up.
export async function start(local) {
  const h = await ask('/health'); if (!h || !(h.accounts || h.sessions)) return null;
  const r = await ask(''); if (!r) return null;
  account.on = true; account.me = r.me; account.signin = !!h.accounts;
  const mine = (x) => (x && x.stats && x.stats.starts) || 0;
  if (r.save && mine(r.save) > mine(local)) return r.save;
  if (mine(local)) push(local);
  return null;
}

let waiting = null, last = 0;
// the save goes up at most once every 10 seconds, and once more when the page is hidden
export function push(save) {
  if (!account.on) return;
  clearTimeout(waiting);
  const wait = Math.max(0, 10000 - (Date.now() - last));
  waiting = setTimeout(() => { last = Date.now(); ask('/save', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(save) }); }, wait);
}
export function pushNow(save) {
  if (!account.on) return;
  clearTimeout(waiting); last = Date.now();
  const body = JSON.stringify(save);
  // a page being closed may not finish a fetch, so hand it to the browser to send
  if (navigator.sendBeacon) navigator.sendBeacon(API + '/save', new Blob([body], { type: 'application/json' }));
  else ask('/save', { method: 'PUT', headers: { 'content-type': 'application/json' }, body });
}

export async function signIn(back = location.pathname) {
  const r = await ask('/signin?back=' + encodeURIComponent(back));
  if (r && r.url) location.href = r.url; else return false;
  return true;
}
export async function signOut() {
  const r = await ask('/signout', { method: 'POST' });
  if (r) account.me = r.me;
  return !!r;
}
