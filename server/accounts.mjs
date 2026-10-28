// Accounts: sign in once, and your team, season and Academy progress follow you to any device.
// Identity belongs to Novenique Core (one account across Novenique's games); this service only
// holds the game's own save under that account's user id, and keeps the client secret on the
// server. Everyone starts as a guest, so a first race needs no sign-up, and signing in later keeps
// the guest's progress: Core attaches the email or Google account to the same user id, or merges
// the guest into an account that already exists and tells us which ids were merged.
//
// Browser endpoints, all under /api/me/*:
//   GET  /api/me                 who you are now (a guest is made on the first visit) + your save
//   PUT  /api/me/save            store this device's save (last write wins; the game sends it)
//   GET  /api/me/signin          start signing in: answers with the address to open (?via=google goes
//                                straight to Google; Google comes back to /auth/google/callback, which is
//                                passed on to Core, then Core comes back to /auth/novenique/callback)
//   GET  /api/me/signin/ways     which ways in are open now: { google, email, need } (need: racing needs an account)
//   POST /api/me/signin/email/start  { email }        sends a 6-digit code
//   POST /api/me/signin/email/verify { email, code }  signs in; this device's guest comes along
//   POST /api/me/signin/merge    { choice }           yes or no to moving a guest's progress into an account
//   POST /api/me/signin/profile  { display_name, handle }  a new player's name and @handle
// Signing in never leaves the game's own screen: the player sees Agent Grand Prix, never Novenique. A
// half-finished sign-in (a name to pick, a merge to agree to) waits in the short-lived agp.here cookie.
//   POST /api/me/signout         back to a guest on this device
//   POST /api/me/here            "I'm here, on this screen": passed on to the game's SpacetimeDB, so the
//                                owner's screen shows who is online and racing (works with accounts off)
// The session cookie is httpOnly, Secure and SameSite=Lax; nothing but the cookie identifies a
// player, and the guest token never reaches the browser's JavaScript.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PORT = +(process.env.ACCOUNTS_PORT || 8141);
const CORE = (process.env.NOVENIQUE_URL || '').replace(/\/$/, '');
const ID = process.env.NOVENIQUE_CLIENT_ID || 'agp';
const SECRET = process.env.NOVENIQUE_CLIENT_SECRET || '';
const SITE = (process.env.SITE_URL || '').replace(/\/$/, '');
const DIR = process.env.SAVE_DIR || '/var/lib/agp-accounts';
const MAX = 256 * 1024;            // a save is a few KB; this is a generous ceiling
export const on = () => !!(CORE && SECRET && SITE);
// The session cookie is signed with this server's own key (made once by install.sh), so the
// leaderboard and live races know who you are even before Novenique Core is connected. Until then a
// player is a guest of this game alone: same save on the server, nothing to sign in to.
const KEY = process.env.SESSION_SECRET || '';
export const sessions = () => !!(KEY || SECRET);

const basic = 'Basic ' + Buffer.from(`${ID}:${SECRET}`).toString('base64');
// on the same server Core is reached directly; the public address is only for the browser's redirects
const CORE_IN = (process.env.NOVENIQUE_INTERNAL_URL || '').replace(/\/$/, '') || CORE;
// like core(), but answers { status, body } so the player can be shown Core's own message
async function coreTry(route, body) {
  try {
    const r = await fetch(CORE_IN + route, { method: 'POST', headers: { authorization: basic, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    let j = null; try { j = await r.json(); } catch {}
    return { status: r.status, body: j || {} };
  } catch { return { status: 502, body: { error: { code: 'UNAVAILABLE', message: 'Sign-in is not available right now. Please try again soon.' } } }; }
}
let ways = { at: 0, google: false, email: false };
async function signinWays() {
  if (Date.now() - ways.at > 60000) {
    try { const h = await (await fetch(CORE_IN + '/health', { signal: AbortSignal.timeout(3000) })).json(); ways = { at: Date.now(), google: !!h.google, email: !!h.email }; }
    catch { ways = { ...ways, at: Date.now() - 50000 }; }
  }
  return { google: ways.google, email: ways.email, need: process.env.SIGNIN_REQUIRED === '1' && (ways.google || ways.email) };
}
async function core(route, body, method = 'POST') {
  const r = await fetch(CORE_IN + route, { method, headers: { authorization: basic, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let j = null; try { j = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error(`core ${route} ${r.status} ${text.slice(0, 120)}`);
  return j;
}

// ---------- saves on disk, one small JSON file per user ----------
const safe = (id) => /^[A-Za-z0-9_-]{1,64}$/.test(String(id || ''));
const file = (id) => path.join(DIR, id + '.json');
export function readSave(id) {
  if (!safe(id)) return null;
  try { return JSON.parse(fs.readFileSync(file(id), 'utf8')); } catch { return null; }
}
export function writeSave(id, save) {
  if (!safe(id)) return false;
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = file(id) + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(save)); fs.renameSync(tmp, file(id));
  return true;
}
// a merged guest's progress moves to the account, and only fills gaps it doesn't already have
export function mergeSaves(into, from) {
  const a = readSave(into), b = readSave(from);
  if (!b) return a;
  if (!a) { writeSave(into, b); try { fs.unlinkSync(file(from)); } catch {} return b; }
  const starts = (x) => (x && x.stats && x.stats.starts) || 0;
  const out = starts(b) > starts(a) ? b : a;             // the save that has raced more wins
  const other = out === a ? b : a;
  out.daily = { ...other.daily, ...out.daily, days: { ...(other.daily || {}).days, ...(out.daily || {}).days } };
  out.trophies = { ...other.trophies, ...out.trophies };
  out.academy = out.academy || other.academy;
  writeSave(into, out); try { fs.unlinkSync(file(from)); } catch {}
  return out;
}

// ---------- sessions: a signed cookie holding the guest token or the account's user id ----------
const SIGN = crypto.createHash('sha256').update(KEY || SECRET || 'dev').digest();
export const seal = (o) => { const b = Buffer.from(JSON.stringify(o)).toString('base64url'); return b + '.' + crypto.createHmac('sha256', SIGN).update(b).digest('base64url'); };
export function open(c) {
  const [b, sig] = String(c || '').split('.');
  if (!b || !sig) return null;
  const want = crypto.createHmac('sha256', SIGN).update(b).digest('base64url');
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try { return JSON.parse(Buffer.from(b, 'base64url').toString()); } catch { return null; }
}
const cookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((s) => { const i = s.indexOf('='); return i < 0 ? ['', ''] : [s.slice(0, i).trim(), decodeURIComponent(s.slice(i + 1))]; }));
const setCookie = (name, value, maxAge) => `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

// Presence: the browser sends a random id it keeps on the device; SpacetimeDB only ever sees a keyed
// hash of it, the team name and the screen. At most one write per device every 30 s (sooner when the
// screen changes), and nothing at all when this server has no SpacetimeDB login.
const STDB = (process.env.STDB_URL || 'http://127.0.0.1:3010').replace(/\/$/, '');
const STDB_TOKEN = process.env.STDB_TOKEN || '';
const herePeers = new Map();
let tidied = 0;
async function stdbCall(reducer, args) {
  const r = await fetch(`${STDB}/v1/database/agp/call/${reducer}`, { method: 'POST', headers: { authorization: `Bearer ${STDB_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`${reducer}: ${r.status}`);
}
export async function here(body) {
  if (!STDB_TOKEN) return false;
  const dev = String(body && body.k || '').slice(0, 64), screen = String(body && body.screen || 'home').slice(0, 12);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(dev)) return false;
  const key = crypto.createHmac('sha256', KEY || SECRET || 'agp-presence').update(dev).digest('base64url').slice(0, 24);
  const name = String(body.name || '').replace(/[^\p{L}\p{N} '°.&-]/gu, '').trim().slice(0, 32);
  const now = Date.now(), last = herePeers.get(key);
  if (last && last.screen === screen && last.name === name && now - last.at < 30000) return true;
  herePeers.set(key, { screen, name, at: now });
  if (herePeers.size > 5000) for (const [k, v] of herePeers) if (now - v.at > 120000) herePeers.delete(k);
  await stdbCall('seen', [key, name, screen]);
  if (now - tidied > 3600e3) { tidied = now; stdbCall('tidy', []).catch(() => {}); }
  return true;
}

// ---------- your AI agent on WhatsApp follows the races you run here ----------
// The page asks for a short code (POST /api/me/agent/code) and you text "link CODE" to the agent;
// the agent claims it over the local-only /agent/* routes (Caddy only passes /api/me/* through).
// While a race runs, the page sends its race record every couple of seconds (PUT /api/me/race):
// the setup and every call with the engine step it landed on, the same record that resumes a race
// after a refresh. The agent rebuilds the same race from it, so it sees exactly what you see, and
// its calls come back to the page through the same request. Races live in memory only.
const LINKS = path.join(DIR, 'agent-links.json');
function links() { try { return { codes: {}, byId: {}, ...JSON.parse(fs.readFileSync(LINKS, 'utf8')) }; } catch { return { codes: {}, byId: {} }; } }
function saveLinks(l) {
  fs.mkdirSync(DIR, { recursive: true });
  const now = Date.now();
  for (const [c, x] of Object.entries(l.codes)) if (x.exp < now) delete l.codes[c];
  const tmp = LINKS + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(l)); fs.renameSync(tmp, LINKS);
}
export function moveLink(into, from) { const l = links(); if (l.byId[from] && !l.byId[into]) { l.byId[into] = l.byId[from]; delete l.byId[from]; saveLinks(l); } }
// ---------- the team's long-term memory (server/memory.mjs): what Teague and your drivers remember ----------
// Signed-in players only. The page can list it, forget one thing or everything, and tell it how a race went;
// the race is written here from checked fields, so a page can't put words in the team's mouth.
const MEMORY = (process.env.MEMORY_URL || 'http://127.0.0.1:8144').replace(/\/$/, '');
async function memory(method, route, b) {
  const r = await fetch(MEMORY + route, { method, headers: b ? { 'content-type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error('memory ' + r.status);
  return r.json();
}
const word = (s, n) => String(s ?? '').replace(/[^\p{L}\p{N} .'&°#-]/gu, '').trim().slice(0, n);
// { venue, label, cars: [{ name, pos, grid, dnf, tyres }], winner, ahead, auto, calls } -> one sentence
export function raceLine(b, when = new Date()) {
  if (!b || typeof b !== 'object') return null;
  const city = word(b.venue, 30); if (!city) return null;
  const cars = (Array.isArray(b.cars) ? b.cars : []).slice(0, 2).map((c) => {
    const name = word(c && c.name, 30) || 'A driver', pos = Math.round(+c.pos), grid = Math.round(+c.grid), tyres = String((c && c.tyres) || '').toUpperCase().replace(/[^SMHIW]/g, '').slice(0, 6).split('').join(' → ');
    if (c && c.dnf) return `${name} retired`;
    if (!(pos >= 1 && pos <= 30)) return null;
    return `${name} P${pos}${grid >= 1 && grid <= 30 ? ` from P${grid}` : ''}${tyres ? ` (${tyres})` : ''}`;
  }).filter(Boolean);
  if (!cars.length) return null;
  const day = when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const label = word(b.label, 40), winner = word(b.winner, 40), ahead = word(b.ahead, 40);
  return [`${city} Grand Prix${label ? ` (${label})` : ''} on ${day}: ${cars.join(', ')}.`,
    b.won ? 'The player\'s team won.' : winner ? `Won by ${winner}.` : '', ahead && ahead !== winner ? `Finished just behind ${ahead}.` : '',
    b.auto ? 'The agents made every call.' : +b.calls > 0 ? `The player made ${Math.min(99, Math.round(+b.calls))} call${+b.calls === 1 ? '' : 's'}.` : ''].filter(Boolean).join(' ');
}
const RACE_MAX = 512 * 1024;
const races = new Map();   // account id -> { rec, at, cmds: [{ seq, car, cmd }], seq, agentAt }
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function agentCode(id) {
  const l = links();
  for (const [c, x] of Object.entries(l.codes)) if (x.id === id) delete l.codes[c];
  let code = '';
  for (const b of crypto.randomBytes(6)) code += CODE_CHARS[b % CODE_CHARS.length];
  l.codes[code] = { id, exp: Date.now() + 30 * 60000 };
  saveLinks(l);
  return code;
}
export function agentClaim(code, phone) {
  const l = links(), x = l.codes[String(code || '').toUpperCase()];
  if (!x || x.exp < Date.now() || !/^\+?[0-9]{6,16}$/.test(String(phone || ''))) return null;
  delete l.codes[String(code).toUpperCase()];
  l.byId[x.id] = String(phone);
  saveLinks(l);
  return { id: x.id, save: readSave(x.id) };
}
export function agentUnlink(id, phone) {
  const l = links(); let n = 0;
  for (const [k, v] of Object.entries(l.byId)) if ((id && k === id) || (!id && phone && v === phone)) { delete l.byId[k]; n++; }
  saveLinks(l); return n;
}
export function racePut(id, rec, after) {
  const r = races.get(id) || { cmds: [], seq: 0, agentAt: 0 };
  // a new race (another record id) starts with an empty inbox
  if (!r.rec || r.rec.id !== rec.id) { r.cmds = []; }
  r.rec = rec; r.at = Date.now();
  races.set(id, r);
  r.cmds = r.cmds.filter((c) => c.seq > after);
  return { follow: !!links().byId[id] && Date.now() - r.agentAt < 15000, cmds: r.cmds, seq: r.seq };
}
export function raceFor(phone) {
  const l = links(), ids = Object.keys(l.byId).filter((k) => l.byId[k] === phone);
  let best = null;
  for (const id of ids) {
    const r = races.get(id);
    if (r && Date.now() - r.at > 6 * 3600e3) { races.delete(id); continue; }   // a race left open for hours is over
    if (r && r.rec && (!best || r.at > best.r.at)) best = { id, r };
  }
  if (!best) return { linked: ids.length > 0 };
  best.r.agentAt = Date.now();
  return { linked: true, id: best.id, rec: best.r.rec, at: best.r.at, age: Date.now() - best.r.at, team: (readSave(best.id) || {}).team || null };
}
export function raceCmd(id, car, cmd) {
  const r = races.get(id); if (!r || !/^you-[01]$/.test(car) || !cmd || typeof cmd !== 'object') return false;
  r.cmds.push({ seq: ++r.seq, car, cmd }); if (r.cmds.length > 200) r.cmds.shift();
  return true;
}
setInterval(() => { const now = Date.now(); for (const [id, r] of races) if (now - r.at > 6 * 3600e3) races.delete(id); }, 600000).unref();
const body = (req, max) => new Promise((ok, no) => { let b = ''; req.on('data', (d) => { b += d; if (b.length > max) { no(new Error('too big')); req.destroy(); } }); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { no(e); } }); });

const send = (res, code, body, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(body)); };
const S256 = (v) => crypto.createHash('sha256').update(v).digest('base64url');

// a guest is made on demand, so a first race never asks for anything
async function whoever(req) {
  const s = open(cookies(req)['agp.sid']);
  if (s && s.uid) return { sess: s, fresh: false };
  // no Core yet: a guest of this game only, kept by the signed cookie alone
  if (!on()) {
    if (s && s.local) return { sess: s, fresh: false };
    const id = 'l' + crypto.randomBytes(12).toString('base64url').replace(/[^A-Za-z0-9]/g, '');
    return { sess: { local: id, user: { id } }, fresh: true };
  }
  if (s && s.guest) {
    try { const r = await core('/v1/guests/resume', { guest_token: s.guest }); return { sess: { ...s, uid: null, user: r.user }, fresh: false }; } catch {}
  }
  const r = await core('/v1/guests', {});
  return { sess: { guest: r.guest_token, user: r.user }, fresh: true };
}
const me = (s) => ({ id: (s.user && (s.user.id || s.user.user_id)) || s.uid, name: (s.user && s.user.display_name) || null, handle: (s.user && s.user.handle) || null, guest: !s.uid });
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
// Core has said who this is: the session becomes the account, a merged guest's save and agent link move into it,
// and a name still to pick (or a merge still to agree to) waits in agp.here
function signedInAs(req, r) {
  const uid = r.user && (r.user.id || r.user.user_id);
  for (const g of r.merged_from || []) { mergeSaves(uid, g); moveLink(uid, g); }
  const was = open(cookies(req)['agp.sid']); if (was && was.user && me(was).id !== uid) moveLink(uid, me(was).id);
  const sess = { uid, user: r.user, roles: r.roles || [] };
  return { sess, cookies: [setCookie('agp.sid', seal(sess), 400 * 86400), setCookie('agp.here', r.needs_profile && r.ticket ? seal({ t: r.ticket }) : '', r.needs_profile ? 1800 : 0)] };
}
// ---------- the Anti-Bot Pass (a subscription through Stripe) and the Sora wallet ----------
// A subscription that unlocks every mode. The plans below are the whole price list: only the yearly plan is on at
// launch, shown as about $0.50 a month; monthly and quarterly turn on by setting on: true (and a price). Stripe
// Checkout takes the payment and Stripe renews it; its signed webhooks are what grant and extend the pass, never the
// browser. Players manage or cancel on Stripe's own billing page. Passes live in this service's state directory;
// the leaderboards and the Command Center ask over local-only routes.
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '', STRIPE_HOOK = process.env.STRIPE_WEBHOOK_SECRET || '';
export const PLANS = {
  year: { cents: 599, interval: 'year', count: 1, name: 'Yearly', on: true, price: process.env.STRIPE_PRICE_YEAR || '' },   // price: the Stripe Price ID of the product in the catalog
  quarter: { cents: 199, interval: 'month', count: 3, name: 'Quarterly', on: false, price: process.env.STRIPE_PRICE_QUARTER || '' },
  month: { cents: 99, interval: 'month', count: 1, name: 'Monthly', on: false, price: process.env.STRIPE_PRICE_MONTH || '' },
};
const months = (pl) => (pl.interval === 'year' ? 12 : 1) * pl.count;
const usd = (c) => (c / 100).toFixed(2);
const planList = () => Object.entries(PLANS).filter(([, pl]) => pl.on).map(([id, pl]) => ({ id, name: pl.name, price: usd(pl.cents), months: months(pl), monthly: usd(Math.round(pl.cents / months(pl))) }));
const GRACE = 2 * 864e5;   // a renewal that is a day or two late doesn't lock anyone out
const passFile = () => path.join(DIR, 'passes.json');
const passes = () => { try { return { byId: {}, subs: {}, events: [], ...JSON.parse(fs.readFileSync(passFile(), 'utf8')) }; } catch { return { byId: {}, subs: {}, events: [] }; } };
const keep = (all) => { all.events = all.events.slice(-500); fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(passFile(), JSON.stringify(all)); };
export function passOf(id) { const p = passes().byId[id]; return p && p.until > Date.now() ? p : null; }
// one Stripe event: started, renewed, changed or ended. Each event is used once.
export function passEvent(ev, now = Date.now()) {
  const all = passes(), o = (ev.data && ev.data.object) || {};
  if (all.events.includes(ev.id)) return null;
  const metaUid = (m) => m && m.uid;
  let id = null, p = null;
  if (ev.type === 'checkout.session.completed' && o.mode === 'subscription' && o.payment_status === 'paid') {
    id = metaUid(o.metadata) || o.client_reference_id; if (!safe(id)) return null;
    const pl = PLANS[(o.metadata && o.metadata.plan) || 'year'] || PLANS.year, cur = all.byId[id] || {};
    // until the first invoice lands, the pass runs one plan period from now
    p = { ...cur, since: cur.since || now, plan: (o.metadata && o.metadata.plan) || 'year', sub: o.subscription, customer: o.customer, renews: true,
      until: Math.max(cur.until || 0, now + months(pl) * 30.44 * 864e5) };
    if (o.subscription) all.subs[o.subscription] = id;
  } else if (ev.type === 'invoice.paid' || ev.type === 'invoice.payment_succeeded') {
    const sub = o.subscription || (o.parent && o.parent.subscription_details && o.parent.subscription_details.subscription);
    const line = (o.lines && o.lines.data && o.lines.data[0]) || {};
    id = all.subs[sub] || metaUid(o.subscription_details && o.subscription_details.metadata) || metaUid(o.parent && o.parent.subscription_details && o.parent.subscription_details.metadata) || metaUid(line.metadata);
    if (!safe(id)) return null;
    const end = (line.period && line.period.end) || o.period_end, cur = all.byId[id] || {};
    p = { ...cur, since: cur.since || now, sub: sub || cur.sub, customer: o.customer || cur.customer, paid: (cur.paid || 0) + (o.amount_paid || 0),
      until: Math.max(cur.until || 0, end ? end * 1000 + GRACE : now + 365 * 864e5) };
    if (sub) all.subs[sub] = id;
  } else if (ev.type === 'customer.subscription.updated' || ev.type === 'customer.subscription.deleted') {
    id = all.subs[o.id] || metaUid(o.metadata); if (!safe(id) || !all.byId[id]) return null;
    const cur = all.byId[id];
    if (cur.sub && cur.sub !== o.id) return null;   // an older subscription ending doesn't touch the current one
    p = { ...cur, renews: ev.type === 'customer.subscription.updated' && !o.cancel_at_period_end && o.status !== 'canceled' };
    if (ev.type === 'customer.subscription.deleted' || o.status === 'canceled' || o.status === 'unpaid') p.until = Math.min(cur.until || 0, now);
  } else return null;
  all.byId[id] = p; all.events.push(ev.id); keep(all);
  return { id, ...p };
}
const stripe = async (route, form) => {
  const r = await fetch('https://api.stripe.com/v1/' + route, { method: 'POST', headers: { authorization: `Bearer ${STRIPE_KEY}`, 'content-type': 'application/x-www-form-urlencoded' }, body: form, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new Error((j.error && j.error.message) || route + ' failed');
  return j.url;
};
function stripeCheckout(id, email, planId = 'year') {
  const pl = PLANS[planId]; if (!pl || !pl.on) throw new Error('no such plan');
  const cur = passes().byId[id];
  const f = new URLSearchParams({ mode: 'subscription', client_reference_id: id, 'metadata[uid]': id, 'metadata[plan]': planId, 'metadata[game]': 'agp',
    'subscription_data[metadata][uid]': id, 'subscription_data[metadata][plan]': planId, 'subscription_data[metadata][game]': 'agp',
    'line_items[0][quantity]': '1',
    success_url: `${SITE}/?pass=ok`, cancel_url: `${SITE}/?pass=cancel` });
  // the product made in Stripe's catalog when its Price ID is set; otherwise the same plan described inline
  if (pl.price) f.set('line_items[0][price]', pl.price);
  else for (const [k, v] of Object.entries({ currency: 'usd', unit_amount: String(pl.cents), 'recurring][interval': pl.interval, 'recurring][interval_count': String(pl.count),
    'product_data][name': `Agent Grand Prix Anti-Bot Pass (${pl.name.toLowerCase()})`, 'product_data][metadata][game': 'agp' })) f.set(`line_items[0][price_data][${k}]`, v);
  if (cur && cur.customer) f.set('customer', cur.customer); else if (email) f.set('customer_email', email);
  return stripe('checkout/sessions', f);
}
// Stripe's own page for changing the card, seeing receipts or cancelling
function stripePortal(id) {
  const cur = passes().byId[id]; if (!cur || !cur.customer) throw new Error('no subscription');
  return stripe('billing_portal/sessions', new URLSearchParams({ customer: cur.customer, return_url: `${SITE}/` }));
}
// Stripe signs each webhook: "t=<time>,v1=<hmac of 't.body'>"; anything older than five minutes or unsigned is refused
export function stripeVerify(raw, header, secret = STRIPE_HOOK, now = Date.now()) {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(String(header).split(',').map((x) => x.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k, v]));
  const sigs = String(header).split(',').filter((x) => x.startsWith('v1=')).map((x) => x.slice(3));
  const t = +parts.t; if (!t || Math.abs(now / 1000 - t) > 300) return false;
  const want = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return sigs.some((s) => s.length === want.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want)));
}
// The pass lives in Novenique Core once PASS_VIA_CORE=1: one Stripe account and one pass system for every Novenique game.
// This service then asks Core, and passes Stripe's webhook on to it unchanged (Core checks the same signature), so the
// webhook address in Stripe stays as it is. The passes sold here before the move are copied to Core once.
const viaCore = () => on() && process.env.PASS_VIA_CORE === '1';
export async function importPasses() {
  const all = passes();
  if (!viaCore() || all.imported) return false;
  const list = Object.entries(all.byId).map(([id, p]) => ({ id, plan: p.plan, sub: p.sub, customer: p.customer, since: p.since, until: p.until, renews: p.renews, paid: p.paid }));
  for (let i = 0; i < Math.max(list.length, 1); i += 100) await core('/v1/pass/import', { passes: list.slice(i, i + 100), events: i ? [] : all.events.slice(-200) });
  all.imported = Date.now(); keep(all);
  console.log(`passes copied to Novenique Core: ${list.length}`);
  return true;
}
const corePass = (id) => core('/v1/pass?user_id=' + encodeURIComponent(id), null, 'GET');
const ECONOMY = (process.env.ECONOMY_URL || '').replace(/\/$/, ''), ECON_TOKEN = process.env.EDITORIAL_SERVICE_TOKEN || '';
async function wallet(id) {
  if (!ECONOMY || !ECON_TOKEN) return { on: false };
  const r = await fetch(`${ECONOMY}/economy/humans/${encodeURIComponent(id)}/account`, { method: 'POST', headers: { 'x-service-token': ECON_TOKEN, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(5000) });
  if (!r.ok) return { on: false };
  const a = await r.json();
  return { on: true, sora: (a.balance && a.balance.available) || 0, lines: (a.history || []).slice(0, 30).map((l) => ({ amount: l.amount, memo: l.memo || l.label || l.rule, at: l.created_at })) };
}

const fail = (res, r) => send(res, r.status >= 400 && r.status < 500 ? r.status : 502, { error: (r.body && r.body.error && r.body.error.message) || 'Sign-in is not available right now. Please try again soon.', code: r.body && r.body.error && r.body.error.code });

export function serve(port = PORT) {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/me/health') return send(res, 200, { accounts: on(), sessions: sessions(), presence: !!STDB_TOKEN });
    if (u.pathname === '/api/me/here' && req.method === 'POST') {
      let body = ''; req.on('data', (d) => { body += d; if (body.length > 1024) req.destroy(); });
      return req.on('end', async () => {
        try { send(res, 200, { ok: await here(JSON.parse(body || '{}')) }); } catch { send(res, 200, { ok: false }); }
      });
    }
    // the agent's own routes: only from this machine (anything through Caddy carries x-forwarded-for)
    if (u.pathname.startsWith('/agent/')) {
      if (req.headers['x-forwarded-for'] || req.headers['x-forwarded-host']) return send(res, 404, {});
      try {
        if (u.pathname === '/agent/claim' && req.method === 'POST') { const b = await body(req, 2048), r = agentClaim(b.code, b.phone); return send(res, r ? 200 : 404, r ? { id: r.id, team: (r.save || {}).team || null } : { error: 'unknown or expired code' }); }
        if (u.pathname === '/agent/unlink' && req.method === 'POST') { const b = await body(req, 2048); return send(res, 200, { n: agentUnlink(null, String(b.phone || '')) }); }
        if (u.pathname === '/agent/race' && req.method === 'GET') return send(res, 200, raceFor(u.searchParams.get('phone') || ''));
        if (u.pathname === '/agent/who' && req.method === 'GET') { const ph = u.searchParams.get('phone') || '', l = links(); return send(res, 200, { id: Object.keys(l.byId).find((k) => l.byId[k] === ph) || null }); }
        if (u.pathname === '/agent/pass' && req.method === 'GET') {
          const id = String(u.searchParams.get('id') || '');
          if (viaCore()) { const p = safe(id) ? await corePass(id) : { active: false }; return send(res, 200, { active: !!p.active, sell: !!p.sell }); }
          return send(res, 200, { active: !!passOf(id), sell: !!(STRIPE_KEY && STRIPE_HOOK) });
        }
        if (u.pathname === '/agent/passes' && req.method === 'GET') {
          if (viaCore()) return send(res, 200, { passes: (await core('/v1/passes', null, 'GET')).passes });
          const p = passes(); return send(res, 200, { passes: Object.entries(p.byId).map(([id, x]) => ({ id, ...x, active: x.until > Date.now() })) });
        }
        // the owner's screen: signed-up players with their emails (Core answers only this game's own)
        if (u.pathname === '/agent/players' && req.method === 'GET') return send(res, 200, on() ? await core('/v1/players', null, 'GET') : { players: [] });
        if (u.pathname === '/agent/cmd' && req.method === 'POST') { const b = await body(req, 4096); return send(res, raceCmd(String(b.id || ''), String(b.car || ''), b.cmd) ? 200 : 404, {}); }
      } catch { return send(res, 400, { error: 'bad request' }); }
      return send(res, 404, {});
    }
    if (u.pathname === '/api/stripe/webhook' && req.method === 'POST') {
      let raw = ''; req.on('data', (d) => { raw += d; if (raw.length > 256 * 1024) req.destroy(); });
      return req.on('end', async () => {
        if (viaCore()) {
          try {
            const r = await fetch(CORE_IN + '/stripe/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': String(req.headers['stripe-signature'] || '') }, body: raw, signal: AbortSignal.timeout(15000) });
            return send(res, r.status, await r.json().catch(() => ({})));
          } catch { return send(res, 502, { error: 'try again' }); }   // Stripe retries
        }
        if (!stripeVerify(raw, req.headers['stripe-signature'])) return send(res, 400, { error: 'bad signature' });
        try {
          const r = passEvent(JSON.parse(raw));
          if (r) console.log(`pass ${r.id}: until ${new Date(r.until).toISOString().slice(0, 10)}${r.renews ? ', renews' : ''}`);
        } catch { return send(res, 400, { error: 'bad event' }); }
        return send(res, 200, { received: true });
      });
    }
    if (u.pathname === '/api/me/memory' || u.pathname === '/api/me/memory/race') {
      const s = open(cookies(req)['agp.sid']), who = s && me(s);
      if (!who || who.guest || !safe(who.id)) return send(res, 200, { on: false, signin: true, items: [] });
      try {
        if (u.pathname === '/api/me/memory' && req.method === 'GET') return send(res, 200, { on: true, items: (await memory('GET', '/memory/list?uid=' + who.id)).items.map((x) => ({ id: x.id, text: x.text, at: x.at, kind: x.kind })) });
        if (u.pathname === '/api/me/memory' && req.method === 'DELETE') { const id = u.searchParams.get('id'); return send(res, 200, await memory('DELETE', '/memory?uid=' + who.id + (id ? '&id=' + encodeURIComponent(id.slice(0, 64)) : ''))); }
        if (u.pathname === '/api/me/memory/race' && req.method === 'POST') { const text = raceLine(await body(req, 4096)); return send(res, text ? 200 : 400, text ? await memory('POST', '/memory/fact', { uid: who.id, text, kind: 'race' }) : { error: 'bad race' }); }
      } catch { return send(res, 200, { on: false, items: [] }); }
      return send(res, 404, {});
    }
    if (u.pathname === '/api/me/pass' || u.pathname === '/api/me/pass/checkout' || u.pathname === '/api/me/pass/manage' || u.pathname === '/api/me/wallet') {
      const s = open(cookies(req)['agp.sid']); const who = s && me(s);
      if (u.pathname === '/api/me/pass' && req.method === 'GET' && viaCore()) {
        try {
          const p = await corePass(who && !who.guest && safe(who.id) ? who.id : 'nobody');
          return send(res, 200, { active: !!p.active, until: p.until, renews: !!p.renews, manage: !!p.manage, sell: !!p.sell, plans: p.plans, price: p.price });
        } catch { return send(res, 200, { active: false, sell: false, plans: [], price: null }); }
      }
      if (u.pathname === '/api/me/pass' && req.method === 'GET') {
        const p = who && passOf(who.id), plans = planList(), y = plans.find((x) => x.id === 'year') || plans[0];
        return send(res, 200, { active: !!p, until: p ? p.until : null, renews: !!(p && p.renews), manage: !!(p && p.customer), sell: !!(STRIPE_KEY && STRIPE_HOOK && plans.length), plans,
          price: y ? { monthly: y.monthly, yearly: y.price } : null });
      }
      if (!who || who.guest) return send(res, 401, { error: 'Sign in first' });
      try {
        if (u.pathname === '/api/me/pass/checkout' && req.method === 'POST' && viaCore()) {
          const b = await body(req, 1024).catch(() => ({}));
          const r = await coreTry('/v1/pass/checkout', { user_id: who.id, email: s.user && s.user.email, plan: String((b && b.plan) || 'year') });
          return r.status === 200 ? send(res, 200, { url: r.body.url }) : send(res, r.status === 503 ? 503 : 502, { error: r.status === 503 ? 'The pass opens very soon.' : 'Payments are not available right now. Please try again soon.' });
        }
        if (u.pathname === '/api/me/pass/manage' && req.method === 'POST' && viaCore()) return send(res, 200, { url: (await core('/v1/pass/manage', { user_id: who.id })).url });
        if (u.pathname === '/api/me/pass/checkout' && req.method === 'POST') {
          if (!STRIPE_KEY || !STRIPE_HOOK) return send(res, 503, { error: 'The pass opens very soon.' });
          const b = await body(req, 1024).catch(() => ({}));
          return send(res, 200, { url: await stripeCheckout(who.id, s.user && s.user.email, String((b && b.plan) || 'year')) });
        }
        if (u.pathname === '/api/me/pass/manage' && req.method === 'POST') return send(res, 200, { url: await stripePortal(who.id) });
        if (u.pathname === '/api/me/wallet' && req.method === 'GET') return send(res, 200, await wallet(who.id));
      } catch (e) { return send(res, 502, { error: 'Payments are not available right now. Please try again soon.' }); }
      return send(res, 404, {});
    }
    const agentPath = u.pathname === '/api/me/agent' || u.pathname === '/api/me/agent/code' || u.pathname === '/api/me/race';
    if (!on() && !(sessions() && (u.pathname === '/api/me' || u.pathname === '/api/me/save' || agentPath))) return send(res, 503, { error: 'off' });
    if (agentPath) {
      const s = open(cookies(req)['agp.sid']); if (!s) return send(res, 401, { error: 'no session' });
      const id = me(s).id; if (!safe(id)) return send(res, 401, { error: 'no session' });
      try {
        if (u.pathname === '/api/me/agent' && req.method === 'GET') return send(res, 200, { linked: !!links().byId[id], name: process.env.AGENT_NAME || 'Teague', wa: (process.env.AGENT_WA_NUMBER || '').replace(/[^0-9]/g, '') || null });
        if (u.pathname === '/api/me/agent' && req.method === 'DELETE') { agentUnlink(id); return send(res, 200, { linked: false }); }
        if (u.pathname === '/api/me/agent/code' && req.method === 'POST') return send(res, 200, { code: agentCode(id) });
        if (u.pathname === '/api/me/race' && req.method === 'PUT') { const rec = await body(req, RACE_MAX); if (!rec || typeof rec.id !== 'string') return send(res, 400, {}); return send(res, 200, racePut(id, rec, +u.searchParams.get('after') || 0)); }
        if (u.pathname === '/api/me/race' && req.method === 'DELETE') { races.delete(id); return send(res, 200, { ok: true }); }
      } catch { return send(res, 400, { error: 'bad request' }); }
      return send(res, 404, {});
    }
    try {
      if (u.pathname === '/api/me' && req.method === 'GET') {
        const { sess, fresh } = await whoever(req), who = me(sess);
        return send(res, 200, { me: who, save: readSave(who.id) }, fresh || true ? { 'set-cookie': setCookie('agp.sid', seal(sess), 400 * 86400) } : {});
      }
      if (u.pathname === '/api/me/save' && req.method === 'PUT') {
        const s = open(cookies(req)['agp.sid']); if (!s) return send(res, 401, { error: 'no session' });
        let body = ''; req.on('data', (d) => { body += d; if (body.length > MAX) req.destroy(); });
        return req.on('end', () => {
          try { const j = JSON.parse(body); writeSave(me(s).id, j); send(res, 200, { ok: true }); }
          catch { send(res, 400, { error: 'bad save' }); }
        });
      }
      if (u.pathname === '/api/me/signin/ways') return send(res, 200, await signinWays());
      if (u.pathname.startsWith('/api/me/signin/') && req.method === 'POST') {
        const b = await body(req, 2048) || {}, ip = ipOf(req);
        if (u.pathname === '/api/me/signin/email/start') {
          const r = await coreTry('/v1/signin/email/start', { email: String(b.email || '').slice(0, 200), ip });
          return r.status === 200 ? send(res, 200, { masked: r.body.masked }) : fail(res, r);
        }
        if (u.pathname === '/api/me/signin/email/verify') {
          const s = open(cookies(req)['agp.sid']);
          const r = await coreTry('/v1/signin/email/verify', { email: String(b.email || '').slice(0, 200), code: String(b.code || '').slice(0, 12), ip, ...(s && s.guest ? { guest_token: s.guest } : {}) });
          if (r.status !== 200) return fail(res, r);
          if (r.body.merge_needed) return send(res, 200, { merge: true, who: r.body.who }, { 'set-cookie': setCookie('agp.here', seal({ m: r.body.ticket }), 1800) });
          const d = signedInAs(req, r.body);
          return send(res, 200, { me: me(d.sess), needs_profile: !!r.body.needs_profile, save: readSave(me(d.sess).id) }, { 'set-cookie': d.cookies });
        }
        const h = open(cookies(req)['agp.here']);
        if (u.pathname === '/api/me/signin/merge') {
          if (!h || !h.m) return send(res, 400, { error: 'That sign-in expired. Please start again.' });
          if (b.choice !== 'merge') return send(res, 200, { merged: false }, { 'set-cookie': setCookie('agp.here', '', 0) });
          const r = await coreTry('/v1/signin/merge', { ticket: h.m, choice: 'merge' });
          if (r.status !== 200) return fail(res, r);
          const d = signedInAs(req, r.body);
          return send(res, 200, { me: me(d.sess), needs_profile: !!r.body.needs_profile, save: readSave(me(d.sess).id) }, { 'set-cookie': d.cookies });
        }
        if (u.pathname === '/api/me/signin/profile') {
          if (!h || !h.t) return send(res, 400, { error: 'That sign-in expired. Please start again.' });
          const r = await coreTry('/v1/signin/profile', { ticket: h.t, display_name: String(b.display_name || '').slice(0, 40), handle: String(b.handle || '').slice(0, 40) });
          if (r.status !== 200) return fail(res, r);
          const d = signedInAs(req, r.body);
          return send(res, 200, { me: me(d.sess), needs_profile: false }, { 'set-cookie': d.cookies });
        }
        return send(res, 404, {});
      }
      // Google comes back to the game's own address; Core finishes it (its cookie is on its own address)
      if (u.pathname === '/auth/google/callback') { res.writeHead(302, { location: CORE + '/google/callback' + u.search }); return res.end(); }
      if (u.pathname === '/api/me/signin') {
        const { sess } = await whoever(req);
        const verifier = crypto.randomBytes(32).toString('base64url'), state = crypto.randomBytes(16).toString('base64url');
        let link = null;
        if (sess.guest) { try { link = (await core('/v1/link-intents', { guest_token: sess.guest })).link; } catch {} }
        const q = new URLSearchParams({ response_type: 'code', client_id: ID, redirect_uri: SITE + '/auth/novenique/callback', state, code_challenge: S256(verifier), code_challenge_method: 'S256' });
        if (link) q.set('link', link);
        if (u.searchParams.get('via') === 'google') q.set('via', 'google');
        const flow = seal({ v: verifier, state, back: u.searchParams.get('back') || '/' });
        return send(res, 200, { url: CORE + '/authorize?' + q }, { 'set-cookie': [setCookie('agp.sid', seal(sess), 400 * 86400), setCookie('agp.flow', flow, 600)] });
      }
      if (u.pathname === '/auth/novenique/callback') {
        const f = open(cookies(req)['agp.flow']), code = u.searchParams.get('code');
        const home = (q) => { res.writeHead(302, { location: (f && f.back) || '/', 'set-cookie': setCookie('agp.flow', '', 0) }); res.end(); return q; };
        const back = (f && f.back) || '/';
        if (f && u.searchParams.get('merge') && u.searchParams.get('state') === f.state) {
          // this Google account already has a team: the game asks before the guest's progress moves into it
          res.writeHead(302, { location: back + '?signin=merge&who=' + encodeURIComponent(u.searchParams.get('who') || ''), 'set-cookie': [setCookie('agp.flow', '', 0), setCookie('agp.here', seal({ m: u.searchParams.get('merge') }), 1800)] });
          return res.end();
        }
        if (f && u.searchParams.get('error') && u.searchParams.get('state') === f.state) {
          res.writeHead(302, { location: back + '?signin=' + (u.searchParams.get('error') === 'access_denied' ? 'cancelled' : 'failed'), 'set-cookie': setCookie('agp.flow', '', 0) });
          return res.end();
        }
        if (!f || !code || u.searchParams.get('state') !== f.state) return home();
        const r = await core('/token', { grant_type: 'authorization_code', code, client_id: ID, redirect_uri: SITE + '/auth/novenique/callback', code_verifier: f.v });
        const d = signedInAs(req, r);
        res.writeHead(302, { location: back + (r.needs_profile ? '?signin=profile' : '?signedin=1'), 'set-cookie': [...d.cookies, setCookie('agp.flow', '', 0)] });
        return res.end();
      }
      if (u.pathname === '/api/me/signout' && req.method === 'POST') {
        const r = await core('/v1/guests', {});
        return send(res, 200, { me: me({ user: r.user }) }, { 'set-cookie': setCookie('agp.sid', seal({ guest: r.guest_token, user: r.user }), 400 * 86400) });
      }
    } catch (e) { return send(res, 502, { error: String(e.message || e).slice(0, 120) }); }
    return send(res, 404, {});
  }).listen(port, '127.0.0.1');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  serve();
  console.log(`accounts on 127.0.0.1:${PORT}, ${on() ? 'live against ' + CORE : 'off (no NOVENIQUE_URL, client secret or SITE_URL)'}${viaCore() ? ', pass in Novenique Core' : ''}`);
  const copy = (n) => importPasses().catch((e) => { console.error('copying passes to Core:', e.message); if (n < 20) setTimeout(() => copy(n + 1), 30000); });
  copy(0);
}
