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
    const ok = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/health') return ok({ ok: true, google: true, email: true });
    assert.equal(req.headers.authorization, 'Basic ' + Buffer.from('agp:s3cret').toString('base64'), 'client secret is sent');
    if (u.pathname === '/v1/guests') { const n = ++guestN; return ok({ user: { id: 'g' + n, display_name: null }, guest_token: 'gt' + n }); }
    if (u.pathname === '/v1/guests/resume') return ok({ user: { id: j.guest_token.replace('gt', 'g') } });
    if (u.pathname === '/v1/link-intents') return ok({ link: 'li-' + j.guest_token });
    if (u.pathname === '/v1/signin/email/start') return j.email.includes('@') ? ok({ masked: 'k•••@x.com' }) : ok({ error: { code: 'BAD_EMAIL', message: 'Enter a valid email address' } }, 400);
    if (u.pathname === '/v1/signin/email/verify') {
      if (j.code !== '123456') return ok({ error: { code: 'WRONG_CODE', message: 'That code is not right' } }, 400);
      if (j.email === 'old@x.com') return ok({ merge_needed: true, who: '@old', ticket: 'MT-' + j.guest_token });
      return ok({ user: { id: j.guest_token.replace('gt', 'g'), display_name: null, kind: 'member' }, roles: [], merged_from: [], needs_profile: true, ticket: 'PT' });
    }
    if (u.pathname === '/v1/signin/profile') return j.ticket === 'PT' && j.handle.length > 2 ? ok({ user: { id: 'g2', display_name: j.display_name, handle: j.handle }, roles: [], merged_from: [], needs_profile: false }) : ok({ error: { code: 'BAD_PROFILE', message: 'Pick a longer @handle' } }, 400);
    if (u.pathname === '/v1/signin/merge') return ok({ user: { id: 'u7', display_name: 'Old' }, roles: [], merged_from: [j.ticket.replace('MT-gt', 'g')], needs_profile: false });
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
await t('in-game email sign-in: code, then a name; a wrong code says why', async () => {
  const post = (r, b) => call('/api/me/signin/' + r, { method: 'POST', body: JSON.stringify(b) });
  assert.deepEqual((await call('/api/me/signin/ways')).body, { google: true, email: true, need: false });
  assert.equal((await post('email/start', { email: 'nope' })).body.error, 'Enter a valid email address');
  assert.equal((await post('email/start', { email: 'kai@x.com' })).body.masked, 'k•••@x.com');
  const wrong = await post('email/verify', { email: 'kai@x.com', code: '000000' });
  assert.equal(wrong.status, 400); assert.equal(wrong.body.code, 'WRONG_CODE');
  const v = await post('email/verify', { email: 'kai@x.com', code: '123456' });
  assert.equal(v.body.needs_profile, true); assert.equal(v.body.me.guest, false); assert.equal(v.body.me.id, 'g2', 'the guest became the account');
  assert.ok(jar['agp.here'], 'the name step waits in a cookie');
  assert.equal((await post('profile', { display_name: 'Kai', handle: 'k' })).body.error, 'Pick a longer @handle');
  const p = await post('profile', { display_name: 'Kai', handle: 'kai_racing' });
  assert.equal(p.body.me.name, 'Kai'); assert.equal(p.body.me.handle, 'kai_racing');
  assert.equal((await call('/api/me')).body.me.name, 'Kai');
});
await t('in-game sign-in into an account that exists: asked first, then the guest\'s save moves in', async () => {
  const post = (r, b) => call('/api/me/signin/' + r, { method: 'POST', body: JSON.stringify(b) });
  await call('/api/me/signout', { method: 'POST' });
  const g = (await call('/api/me')).body.me.id;
  await call('/api/me/save', { method: 'PUT', body: JSON.stringify({ stats: { starts: 2 }, team: { name: 'Harmattan' } }) });
  const v = await post('email/verify', { email: 'old@x.com', code: '123456' });
  assert.equal(v.body.merge, true); assert.equal(v.body.who, '@old');
  assert.equal((await call('/api/me')).body.me.guest, true, 'nothing changes before the yes');
  const yes = await post('merge', { choice: 'merge' });
  assert.equal(yes.body.me.id, 'u7'); assert.equal(yes.body.save.team.name, 'Harmattan');
  assert.ok(!fs.existsSync(path.join(DIR, g + '.json')));
  assert.equal((await post('merge', { choice: 'merge' })).status, 400, 'a merge is agreed once');
});
await t('Google from the game: straight to Google, and Google\'s answer is passed on to Core', async () => {
  const r = await call('/api/me/signin?via=google&back=/');
  assert.equal(new URL(r.body.url).searchParams.get('via'), 'google');
  const g = await call('/auth/google/callback?code=abc&state=xyz');
  assert.equal(g.loc, process.env.NOVENIQUE_URL + '/google/callback?code=abc&state=xyz');
  const st = new URL(r.body.url).searchParams.get('state');
  const m = await call('/auth/novenique/callback?merge=MT&who=%40old&state=' + encodeURIComponent(st));
  assert.equal(m.loc, '/?signin=merge&who=%40old');
});
await t("a player's own WhatsApp agent: key checked, kept off the page, first chat binds it", async () => {
  A.setWaCheck(async (tok) => tok === 'good-key');
  assert.equal((await A.ownAgentSet('p1', 'bad-key', 'Ada')).ok, undefined, 'a key WhatsApp refuses is not kept');
  assert.ok((await A.ownAgentSet('p1', 'with space', 'Ada')).error, 'junk is refused');
  assert.ok((await A.ownAgentSet('p1', 'good-key', '')).error, 'a name is needed');
  const r = await A.ownAgentSet('p1', 'good-key', '  *Ada*  <b>');
  assert.equal(r.name, 'Ada b', 'the name is cleaned');
  assert.equal(A.ownAgentBind('p1', 'p2|user:9'), false, 'only its own chats');
  assert.equal(A.ownAgentBind('p1', 'p1|user:1'), true);
  assert.equal(A.ownAgentBind('p1', 'p1|user:2'), false, 'a second person is not its owner');
  assert.equal(A.ownAgentName('p1', 'Sparky'), true);
  const f = JSON.parse(fs.readFileSync(path.join(DIR, 'agent-tokens.json'), 'utf8'));
  assert.equal(f.byId.p1.name, 'Sparky'); assert.equal(f.byId.p1.token, 'good-key');
  assert.equal(fs.statSync(path.join(DIR, 'agent-tokens.json')).mode & 0o077, 0, 'only the server can read the keys');
  A.ownAgentOff('p1');
  assert.equal(JSON.parse(fs.readFileSync(path.join(DIR, 'agent-tokens.json'), 'utf8')).byId.p1, undefined);
  assert.equal(A.ownAgentBind('p1', 'p1|user:1'), false, 'removed: nothing to bind');
});
srv.close(); core.close(); fs.rmSync(DIR, { recursive: true, force: true });
console.log(`accounts: ${ok} checks passed`);
