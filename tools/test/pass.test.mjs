// The Anti-Bot Pass: Stripe's signed webhooks start, renew and end a subscription, each event counts once,
// and an unsigned or stale webhook is refused. No Stripe account needed: the events are made here.
// Run: node tools/test/pass.test.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SAVE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agp-pass-'));
const { passEvent, passOf, stripeVerify, PLANS } = await import('../../server/accounts.mjs');
const uid = 'abcdefghijklmno', day = 864e5, now = Date.now();

// signatures
const secret = 'whsec_test', raw = '{"id":"evt_1"}', t = Math.floor(now / 1000);
const sig = (ts) => `t=${ts},v1=${crypto.createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex')}`;
assert.ok(stripeVerify(raw, sig(t), secret, now), 'a fresh signature passes');
assert.ok(!stripeVerify(raw, sig(t - 600), secret, now), 'a stale signature is refused');
assert.ok(!stripeVerify(raw + ' ', sig(t), secret, now), 'a changed body is refused');
assert.ok(!stripeVerify(raw, '', secret, now), 'no signature is refused');

// only the yearly plan is on at launch
assert.deepEqual(Object.entries(PLANS).filter(([, p]) => p.on).map(([k]) => k), ['year']);

// checkout: the pass starts
assert.equal(passOf(uid), null);
const start = passEvent({ id: 'evt_a', type: 'checkout.session.completed', data: { object: { mode: 'subscription', payment_status: 'paid', metadata: { uid, plan: 'year' }, subscription: 'sub_1', customer: 'cus_1' } } }, now);
assert.ok(start && start.until > now + 360 * day, 'a year from now');
assert.ok(passOf(uid) && passOf(uid).renews);
assert.equal(passEvent({ id: 'evt_a', type: 'checkout.session.completed', data: { object: {} } }, now), null, 'the same event twice does nothing');

// the yearly renewal invoice moves the end date to the new period's end (plus a little grace)
const end2 = Math.floor((now + 730 * day) / 1000);
const renew = passEvent({ id: 'evt_b', type: 'invoice.paid', data: { object: { subscription: 'sub_1', amount_paid: 599, lines: { data: [{ period: { end: end2 } }] } } } }, now);
assert.ok(renew.until >= end2 * 1000 && renew.until <= end2 * 1000 + 3 * day);

// cancelling at the period end: still active, no longer renews
passEvent({ id: 'evt_c', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'active', cancel_at_period_end: true } } }, now);
assert.ok(passOf(uid) && !passOf(uid).renews);
// the subscription ends: the pass stops
passEvent({ id: 'evt_d', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', status: 'canceled' } } }, now);
assert.equal(passOf(uid), null);

// an event for nobody we know is ignored
assert.equal(passEvent({ id: 'evt_e', type: 'invoice.paid', data: { object: { subscription: 'sub_x', lines: { data: [{}] } } } }, now), null);
console.log('pass: ok');
