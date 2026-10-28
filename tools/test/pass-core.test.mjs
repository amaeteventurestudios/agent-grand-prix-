// The pass once it lives in Novenique Core (PASS_VIA_CORE=1): this game asks Core, passes Stripe's webhook on to Core
// unchanged, and copies the passes it sold before the move to Core once. A small stand-in for Core answers here.
// Run: node tools/test/pass-core.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const seen = [];
const core = http.createServer((req, res) => {
  let b = ''; req.on('data', (d) => { b += d; });
  req.on('end', () => {
    seen.push({ url: req.url, method: req.method, auth: req.headers.authorization, sig: req.headers['stripe-signature'], body: b });
    const j = (o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url.startsWith('/v1/pass?user_id=abcdefghijklmno')) return j({ active: true, until: 9e12, renews: true, manage: true, sell: true, plans: [{ id: 'year' }], price: { monthly: '0.50', yearly: '5.99' } });
    if (req.url.startsWith('/v1/pass?')) return j({ active: false, sell: true, plans: [], price: null });
    if (req.url === '/v1/passes') return j({ passes: [{ id: 'abcdefghijklmno', active: true }] });
    if (req.url === '/v1/pass/import') return j({ imported: JSON.parse(b).passes.length, events: 0 });
    if (req.url === '/stripe/webhook') return j({ received: true });
    j({}, 404);
  });
});
await new Promise((ok) => core.listen(0, '127.0.0.1', ok));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agp-pass-core-'));
fs.writeFileSync(path.join(dir, 'passes.json'), JSON.stringify({ byId: { abcdefghijklmno: { plan: 'year', until: Date.now() + 864e5, sub: 'sub_1', customer: 'cus_1' } }, subs: { sub_1: 'abcdefghijklmno' }, events: ['evt_1'] }));
Object.assign(process.env, { SAVE_DIR: dir, NOVENIQUE_URL: `http://127.0.0.1:${core.address().port}`, NOVENIQUE_CLIENT_SECRET: 's3cret', SITE_URL: 'https://agp.test', PASS_VIA_CORE: '1', ACCOUNTS_PORT: '0' });
const A = await import('../../server/accounts.mjs');

// the passes sold here are copied once
assert.equal(await A.importPasses(), true);
const imp = seen.find((x) => x.url === '/v1/pass/import');
assert.deepEqual(JSON.parse(imp.body).passes.map((p) => p.id), ['abcdefghijklmno']);
assert.match(imp.auth, /^Basic /, 'the game signs in to Core with its client secret');
assert.equal(await A.importPasses(), false, 'and only once');

const srv = A.serve(0);
await new Promise((ok) => srv.once('listening', ok));
const base = `http://127.0.0.1:${srv.address().port}`;
let r = await (await fetch(base + '/agent/pass?id=abcdefghijklmno')).json();
assert.deepEqual(r, { active: true, sell: true });
r = await (await fetch(base + '/agent/pass?id=zzzzzzzzzzzzzzz')).json();
assert.deepEqual(r, { active: false, sell: true });
r = await (await fetch(base + '/agent/passes')).json();
assert.equal(r.passes[0].id, 'abcdefghijklmno');
// Stripe's webhook goes on to Core unchanged, signature and all
const raw = '{"id":"evt_9","type":"invoice.paid"}';
const w = await fetch(base + '/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=abc' }, body: raw });
assert.equal(w.status, 200);
const fwd = seen.find((x) => x.url === '/stripe/webhook');
assert.equal(fwd.body, raw); assert.equal(fwd.sig, 't=1,v1=abc');
// a guest's pass screen still answers, with Core's prices
r = await (await fetch(base + '/api/me/pass')).json();
assert.equal(r.active, false); assert.equal(r.sell, true);
srv.close(); core.close();
console.log('pass via Core: ok');
