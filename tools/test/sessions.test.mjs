// Before Novenique Core is connected, a player is still someone: the accounts service hands out a
// guest of this game alone, kept by a cookie signed with this server's own key, so the Daily
// leaderboard and live races know who you are, and your save is still kept on the server. There is
// nothing to sign in to until Core is connected. Run: node tools/test/sessions.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agp-ses-'));
Object.assign(process.env, { SESSION_SECRET: 'server-key', SAVE_DIR: DIR, NOVENIQUE_URL: '', NOVENIQUE_CLIENT_SECRET: '', SITE_URL: 'https://example.test' });
const { serve, open, on, sessions } = await import('../../server/accounts.mjs');

let ok = 0;
const ta = async (name, fn) => { await fn(); ok++; console.log('  ok', name); };
const srv = serve(0); await new Promise((r) => srv.once('listening', r));
const base = `http://127.0.0.1:${srv.address().port}/api/me`;

await ta('with no Core, sessions are on and sign-in is off', async () => {
  assert.equal(on(), false); assert.equal(sessions(), true);
  assert.deepEqual(await (await fetch(base + '/health')).json(), { accounts: false, sessions: true });
  assert.equal((await fetch(base + '/signin')).status, 503, 'nothing to sign in to yet');
});

let cookie = '';
await ta('a first visit gets a guest of this game, kept by a signed cookie', async () => {
  const r = await fetch(base);
  const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.me.guest, true); assert.match(j.me.id, /^l[A-Za-z0-9]+$/);
  cookie = r.headers.get('set-cookie').split(';')[0];
  const s = open(decodeURIComponent(cookie.split('=')[1]));
  assert.equal(s.user.id, j.me.id, 'the cookie names the guest, and only this server could have signed it');
  const again = await (await fetch(base, { headers: { cookie } })).json();
  assert.equal(again.me.id, j.me.id, 'the same guest on the next visit');
});

await ta('the save is still kept on the server', async () => {
  const put = await fetch(base + '/save', { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ stats: { starts: 3 } }) });
  assert.equal(put.status, 200);
  const back = await (await fetch(base, { headers: { cookie } })).json();
  assert.equal(back.save.stats.starts, 3);
});

await ta('a forged cookie is nobody', async () => {
  const fake = 'agp.sid=' + Buffer.from(JSON.stringify({ local: 'lX', user: { id: 'lX' } })).toString('base64url') + '.bad';
  const j = await (await fetch(base, { headers: { cookie: fake } })).json();
  assert.notEqual(j.me.id, 'lX');
});

srv.close(); fs.rmSync(DIR, { recursive: true, force: true });
console.log(`sessions: ${ok} checks passed`);
