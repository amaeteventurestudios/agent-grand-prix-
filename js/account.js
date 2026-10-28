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

export const account = { on: false, me: null, signin: false, ways: { google: false, email: false, need: false },
  pass: { active: false, sell: false, until: null, renews: false, manage: false, plans: [], price: { monthly: '0.50', yearly: '5.99' } } };   // the Anti-Bot Pass; sell is false until payments open   // signin: the account service is connected

// Called once at startup. Answers with the server's save when it is further along than this
// device's, so a new phone picks up where you left off; otherwise this device's save is sent up.
export async function start(local) {
  const h = await ask('/health'); if (!h || !(h.accounts || h.sessions)) return null;
  const r = await ask(''); if (!r) return null;
  account.on = true; account.me = r.me; account.signin = !!h.accounts;
  if (account.signin) { const w = await ask('/signin/ways'); if (w) account.ways = w; }
  await refreshPass();
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

// Google: the page goes to Google and comes straight back to the game
export async function signIn(back = location.pathname, via = 'google') {
  const r = await ask('/signin?via=' + via + '&back=' + encodeURIComponent(back));
  if (r && r.url) location.href = r.url; else return false;
  return true;
}
export async function signOut() {
  const r = await ask('/signout', { method: 'POST' });
  if (r) account.me = r.me;
  return !!r;
}

// The email code and the steps after it stay on the game's own screen. Each answers { ok, ...body } or
// { ok: false, error } with a message that can be shown as it is.
async function step(route, body) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), 20000);
  try {
    const r = await fetch(API + '/signin/' + route, { method: 'POST', credentials: 'same-origin', signal: c.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.me) account.me = j.me;
    return r.ok ? { ok: true, ...j } : { ok: false, error: j.error || 'Something went wrong. Please try again.' };
  } catch { return { ok: false, error: 'Could not reach the game server. Check your connection and try again.' }; }
  finally { clearTimeout(t); }
}
export const emailStart = (email) => step('email/start', { email });
export const emailVerify = (email, code) => step('email/verify', { email, code });
export const mergeAnswer = (yes) => step('merge', { choice: yes ? 'merge' : 'cancel' });
export const setProfile = (display_name, handle) => step('profile', { display_name, handle });

// The Anti-Bot Pass: a subscription (yearly at launch) taken on Stripe's own page, which comes back to ?pass=ok
export async function refreshPass() { const p = await ask('/pass'); if (p) account.pass = p; return account.pass; }
export const passCheckout = (plan = 'year') => stripeGo('/pass/checkout', { plan });
export const passManage = () => stripeGo('/pass/manage', {});   // Stripe's own page: card, receipts, cancel
async function stripeGo(route, body) {
  try {
    const r = await fetch(API + route, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.url) { location.href = j.url; return { ok: true }; }
    return { ok: false, error: j.error || 'Payments are not available right now. Please try again soon.' };
  } catch { return { ok: false, error: 'Could not reach the game server. Check your connection and try again.' }; }
}
// your Sora: weekly prizes land here
export const wallet = () => ask('/wallet');
// what your agent and your drivers remember about you (signed-in players): see it, forget one thing or everything
export const memories = () => ask('/memory');
export const forget = (id) => ask('/memory' + (id ? '?id=' + encodeURIComponent(id) : ''), { method: 'DELETE' });
// how a race went, so the team can bring it up next time (the server writes the sentence from these fields)
export const rememberRace = (r) => ask('/memory/race', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) });
