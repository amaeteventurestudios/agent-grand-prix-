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
//   GET  /api/me/signin          start signing in: answers with the Novenique address to open
//   GET  /api/me/callback        Novenique sends the player back here; finishes and goes home
//   POST /api/me/signout         back to a guest on this device
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

const basic = 'Basic ' + Buffer.from(`${ID}:${SECRET}`).toString('base64');
async function core(route, body, method = 'POST') {
  const r = await fetch(CORE + route, { method, headers: { authorization: basic, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
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
const SIGN = crypto.createHash('sha256').update(SECRET || 'dev').digest();
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

const send = (res, code, body, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(body)); };
const S256 = (v) => crypto.createHash('sha256').update(v).digest('base64url');

// a guest is made on demand, so a first race never asks for anything
async function whoever(req) {
  const s = open(cookies(req)['agp.sid']);
  if (s && s.uid) return { sess: s, fresh: false };
  if (s && s.guest) {
    try { const r = await core('/v1/guests/resume', { guest_token: s.guest }); return { sess: { ...s, uid: null, user: r.user }, fresh: false }; } catch {}
  }
  const r = await core('/v1/guests', {});
  return { sess: { guest: r.guest_token, user: r.user }, fresh: true };
}
const me = (s) => ({ id: (s.user && (s.user.id || s.user.user_id)) || s.uid, name: (s.user && s.user.display_name) || null, guest: !s.uid });

export function serve(port = PORT) {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/me/health') return send(res, 200, { accounts: on() });
    if (!on()) return send(res, 503, { error: 'off' });
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
      if (u.pathname === '/api/me/signin') {
        const { sess } = await whoever(req);
        const verifier = crypto.randomBytes(32).toString('base64url'), state = crypto.randomBytes(16).toString('base64url');
        let link = null;
        if (sess.guest) { try { link = (await core('/v1/link-intents', { guest_token: sess.guest })).link; } catch {} }
        const q = new URLSearchParams({ response_type: 'code', client_id: ID, redirect_uri: SITE + '/auth/novenique/callback', state, code_challenge: S256(verifier), code_challenge_method: 'S256' });
        if (link) q.set('link', link);
        const flow = seal({ v: verifier, state, back: u.searchParams.get('back') || '/' });
        return send(res, 200, { url: CORE + '/authorize?' + q }, { 'set-cookie': [setCookie('agp.sid', seal(sess), 400 * 86400), setCookie('agp.flow', flow, 600)] });
      }
      if (u.pathname === '/auth/novenique/callback') {
        const f = open(cookies(req)['agp.flow']), code = u.searchParams.get('code');
        const home = (q) => { res.writeHead(302, { location: (f && f.back) || '/', 'set-cookie': setCookie('agp.flow', '', 0) }); res.end(); return q; };
        if (!f || !code || u.searchParams.get('state') !== f.state) return home();
        const r = await core('/token', { grant_type: 'authorization_code', code, client_id: ID, redirect_uri: SITE + '/auth/novenique/callback', code_verifier: f.v });
        const uid = r.user && (r.user.id || r.user.user_id);
        for (const g of r.merged_from || []) mergeSaves(uid, g);
        res.writeHead(302, { location: (f.back || '/') + '?signedin=1', 'set-cookie': [setCookie('agp.sid', seal({ uid, user: r.user, roles: r.roles || [] }), 400 * 86400), setCookie('agp.flow', '', 0)] });
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
  console.log(`accounts on 127.0.0.1:${PORT}, ${on() ? 'live against ' + CORE : 'off (no NOVENIQUE_URL, client secret or SITE_URL)'}`);
}
