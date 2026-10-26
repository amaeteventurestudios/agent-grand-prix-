// Accounts: a guest is made on the first visit and keeps its save, signing in keeps the guest's
// progress (Core attaches it to the same id, or merges and tells us), the session cookie is signed
// and httpOnly, and a save that isn't ours can't be read or written.
// Runs against a stand-in for Novenique Core, so it needs no server and no keys.
// Run: node tools/test/accounts.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agp-acc-'));
// a stand-in Core: guests, a link intent, authorize and token, with one account already signed up
const codes = new Map(); let guestN = 0;
const core = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const j = body ? JSON.parse(body) : {};
    const ok = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    assert.equal(req.headers.authorization, 'Basic ' + Buffer.from('agp:s3cret').toString('base64'), 'client secret is sent');
    if (u.pathname === '/v1/guests') { const n = ++guestN; return ok({ user: { id: 'g' + n, display_name: null }, guest_token: 'gt' + n }); }
    if (u.pathname === '/v1/guests/resume') return ok({ user: { id: j.guest_token.replace('gt', 'g') } });
    if (u.pathname === '/v1/link-intents') return ok({ link: 'li-' + j.guest_token });
    if (u.pathname === '/token') { const c = codes.get(j.code); return ok(c); }
    res.writeHead(404); res.end('{}');
  });
});
await new Promise((r) => core.listen(0, '127.0.0.1', r));
process.env.NOVENIQUE_URL = 'http://127.0.0.1:' + core.address().port;
process.env.NOVENIQUE_CLIENT_ID = 'agp';
process.env.NOVENIQUE_CLIENT_SECRET = 's3cret';
process.env.SITE_URL = 'https://agentgrandprix.com';
process.env.SAVE_DIR = DIR;
const A = await import('../../js/../server/accounts.mjs');
const srv = A.serve(0); await new Promise((r) => srv.once('listening', r));
const base = 'http://127.0.0.1:' + srv.address().port;
const jar = {};
const call = async (route, opts = {}) => {
  const r = await fetch(base + route, { redirect: 'manual', ...opts, headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(opts.headers || {}) } });
  for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Lax/); }
  const t = await r.text();
  return { status: r.status, loc: r.headers.get('location'), body: t && t[0] === '{' ? JSON.parse(t) : t };
};
let ok = 0;
const t = async (name, fn) => { await fn(); ok++; console.log('  ok', name); };

await t('a guest is made on the first visit, with no save yet', async () => {
  const r = await call('/api/me');
  assert.equal(r.body.me.guest, true); assert.equal(r.body.me.id, 'g1'); assert.equal(r.body.save, null);
  assert.ok(jar['agp.sid'], 'session cookie set');
});
await t('the save is kept, and comes back on the next visit', async () => {
  await call('/api/me/save', { method: 'PUT', body: JSON.stringify({ stats: { starts: 3 }, team: { name: 'Savanna' } }) });
  const r = await call('/api/me');
  assert.equal(r.body.save.team.name, 'Savanna'); assert.equal(r.body.me.id, 'g1');
});
await t('signing in asks Core for a link, so the guest keeps its progress', async () => {
  const r = await call('/api/me/signin?back=/');
  const u = new URL(r.body.url);
  assert.equal(u.searchParams.get('link'), 'li-gt1');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://agentgrandprix.com/auth/novenique/callback');
  assert.ok(u.searchParams.get('state') && u.searchParams.get('code_challenge'));
  // Core signs the guest in to an account that already exists and merges the guest into it
  codes.set('CODE1', { user: { id: 'u9', display_name: 'Amaete' }, roles: [], merged_from: ['g1'] });
  const back = await call('/auth/novenique/callback?code=CODE1&state=' + encodeURIComponent(u.searchParams.get('state')));
  assert.equal(back.status, 302);
  const now = await call('/api/me');
  assert.equal(now.body.me.guest, false); assert.equal(now.body.me.id, 'u9'); assert.equal(now.body.me.name, 'Amaete');
  assert.equal(now.body.save.team.name, 'Savanna', 'the guest\'s progress moved to the account');
  assert.ok(!fs.existsSync(path.join(DIR, 'g1.json')), 'the merged guest\'s file is gone');
});
await t('a wrong state, a tampered cookie or a missing session changes nothing', async () => {
  const bad = await call('/auth/novenique/callback?code=CODE1&state=nope');
  assert.equal(bad.status, 302);
  assert.equal((await call('/api/me')).body.me.id, 'u9');
  const sid = jar['agp.sid']; jar['agp.sid'] = sid.slice(0, -2) + 'xx';
  const r = await call('/api/me/save', { method: 'PUT', body: '{"stats":{"starts":99}}' });
  assert.equal(r.status, 401);
  jar['agp.sid'] = sid;
  assert.equal(A.readSave('../../etc/passwd'), null);
  assert.equal(A.writeSave('bad/id', {}), false);
});
await t('signing out gives this device a new guest, and the account keeps its save', async () => {
  await call('/api/me/signout', { method: 'POST' });
  const r = await call('/api/me');
  assert.equal(r.body.me.guest, true); assert.notEqual(r.body.me.id, 'u9'); assert.equal(r.body.save, null);
  assert.equal(A.readSave('u9').team.name, 'Savanna');
});
srv.close(); core.close(); fs.rmSync(DIR, { recursive: true, force: true });
console.log(`accounts: ${ok} checks passed`);
