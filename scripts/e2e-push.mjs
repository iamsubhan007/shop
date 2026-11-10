// E2E for push notifications. The app is started with MODE-specific env (see below) and this script plays both the
// customers/staff AND the browser vendors' push service: an HTTPS mock that receives the app's encrypted Web Push
// messages, decrypts them with the (fake) device keys exactly like a browser would (RFC 8291) and verifies the VAPID
// signature (RFC 8292).
//   MODE=push    app started with VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT and NODE_TLS_REJECT_UNAUTHORIZED=0
//                (the mock uses a throw-away self-signed certificate)
//   MODE=nopush  app started with no VAPID keys: everything must stay quiet and orders must still work
// Usage: MODE=push BASE=http://localhost:3000 SCR=<temp dir> node --env-file=.env.local scripts/e2e-push.mjs
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';
import { startMailSink } from './mail-sink.mjs';

const BASE = process.env.BASE || 'http://localhost:3000';
const MODE = process.env.MODE || 'push';
const PUB = process.env.VAPID_PUBLIC_KEY;
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const sink = await startMailSink(2525);
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  ' + x}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64u = (b) => Buffer.from(b).toString('base64url');

// ---------- fake devices (a browser's push keys) ----------
const mkDevice = (name) => {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const authSecret = crypto.randomBytes(16);
  return { name, ecdh, authSecret, sub: { endpoint: `https://127.0.0.1:2828/push/${name}`, keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(authSecret) } } };
};
const stamp = Date.now();
const dev = { owner: mkDevice(`owner-${stamp}`), admin: mkDevice(`admin-${stamp}`), kitchen: mkDevice(`kitchen-${stamp}`), spare: mkDevice(`spare-${stamp}`) };

// RFC 8291 (aes128gcm) decrypt, as the user agent does it
function decrypt(body, d) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const cipher = body.subarray(21 + idlen);
  const secret = d.ecdh.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), d.ecdh.getPublicKey(), asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, d.authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const dec = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  dec.setAuthTag(cipher.subarray(cipher.length - 16));
  let pt = Buffer.concat([dec.update(cipher.subarray(0, cipher.length - 16)), dec.final()]);
  let end = pt.length; while (end > 0 && pt[end - 1] === 0) end--; // padding, then the 0x02 delimiter
  return JSON.parse(pt.subarray(0, end - 1).toString('utf8'));
}

// RFC 8292: Authorization: vapid t=<jwt>, k=<public key>
function checkVapid(auth) {
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(auth || '');
  if (!m) return { ok: false, why: `unexpected header: ${String(auth).slice(0, 60)}` };
  const [, h, p, s, k] = m;
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  const pk = Buffer.from(PUB, 'base64url'); // 0x04 || X || Y
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pk.subarray(1, 33)), y: b64u(pk.subarray(33, 65)) }, format: 'jwk' });
  const sigOk = crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
  return { ok: sigOk && k === PUB && claims.aud === 'https://127.0.0.1:2828' && claims.exp > Date.now() / 1000 && /^(mailto:|https:)/.test(claims.sub), claims, sigOk, keyMatches: k === PUB };
}

// ---------- mock push service (HTTPS, self-signed) ----------
const received = [];
const behavior = {}; // device name -> status code to answer with (default 201)
let mock;
if (MODE === 'push') {
  const dir = fs.mkdtempSync(path.join(process.env.SCR || os.tmpdir(), 'hbt-push-cert-'));
  const gen = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  if (gen.status !== 0) { console.error('openssl failed:', gen.stderr); process.exit(2); }
  mock = https.createServer({ key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem')) }, (req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const name = req.url.replace('/push/', '');
      received.push({ name, headers: req.headers, body: Buffer.concat(chunks), at: Date.now() });
      res.writeHead(behavior[name] || 201); res.end();
    });
  });
  await new Promise((r) => mock.listen(2828, '127.0.0.1', r));
}
const messagesFor = (d) => received.filter((x) => x.name === d.name).map((x) => ({ ...x, msg: decrypt(x.body, d) }));
const forOrder = (d, id) => messagesFor(d).filter((x) => x.msg.orderId === id);
const waitFor = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(250); } return false; };

// ---------- clients ----------
class Client {
  jar = {};
  async req(method, p, body) {
    const res = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v === '') delete this.jar[k]; else this.jar[k] = v; }
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  }
}
async function customer(email) {
  const c = new Client();
  await c.req('POST', '/api/auth/otp/request', { email });
  await c.req('POST', '/api/auth/otp/verify', { email, code: await sink.codeFor(email) });
  await c.req('PATCH', '/api/auth/me', { fullName: 'Push Tester', phone: '03001234567' });
  return c;
}
async function staff(email) {
  const c = new Client();
  await c.req('POST', '/api/auth/staff/otp/request', { email });
  const r = await c.req('POST', '/api/auth/staff/otp/verify', { email, code: await sink.codeFor(email) });
  if (r.status !== 200) throw new Error(`staff login failed for ${email}: ${r.text}`);
  return c;
}

const adminEmail = `pushadmin${stamp}@example.com`, kitchenEmail = `pushkitchen${stamp}@example.com`;
await sql`insert into profiles (email, full_name, role) values (${adminEmail}, 'Push Admin', 'admin'), (${kitchenEmail}, 'Push Kitchen', 'kitchen')`;
const anon = new Client();
const cust = await customer(`pushc${stamp}@example.com`);
const owner = await staff(process.env.OWNER_EMAIL);
const adminC = await staff(adminEmail);
const kitchenC = await staff(kitchenEmail);

const S = { lat: 31.4766319, lng: 74.3147178 };
const menu = (await anon.req('GET', '/api/menu')).json;
const prod = menu.products.find((p) => p.available);
const codOrder = async () => (await cust.req('POST', '/api/checkout', { customerName: 'Push Tester', customerPhone: '03001234567', items: [{ type: 'product', id: prod.id, quantity: 2 }], orderType: 'delivery', paymentMethod: 'cod', deliveryAddress: 'House 1, N Block', deliveryLat: S.lat + 0.0085, deliveryLng: S.lng, idempotencyKey: `push-${Date.now()}-${Math.random()}` })).json;

console.log(`\n=== push notifications, MODE=${MODE} ===`);
let r;
try {
  if (MODE === 'nopush') {
    r = await owner.req('GET', '/api/admin/push/key');
    check('not configured: key endpoint says so, with no key', r.status === 200 && r.json.configured === false && r.json.publicKey === null, r.text);
    r = await owner.req('POST', '/api/admin/push/subscribe', { subscription: dev.owner.sub });
    check('not configured: subscribing is refused with a clear message (409)', r.status === 409 && /not set up/i.test(r.json?.error || ''), r.text);
    r = await owner.req('POST', '/api/admin/push/test');
    check('not configured: test button is refused (409)', r.status === 409);
    const o = await codOrder();
    check('not configured: orders still work normally', !!o.orderId && o.status === 'Placed', JSON.stringify(o));
    await sleep(1500);
    await cleanup();
    done();
    await new Promise(() => {}); // done() ends the process
  }

  // ---- access control + validation
  r = await anon.req('GET', '/api/admin/push/key');
  check('key: anonymous refused', r.status === 403);
  r = await cust.req('GET', '/api/admin/push/key');
  check('key: a customer session is refused', r.status === 403);
  r = await kitchenC.req('GET', '/api/admin/push/key');
  check('key: configured, and the public key is the one in the environment', r.status === 200 && r.json.configured === true && r.json.publicKey === PUB, r.text);
  r = await anon.req('POST', '/api/admin/push/subscribe', { subscription: dev.owner.sub });
  check('subscribe: anonymous refused', r.status === 403);
  r = await cust.req('POST', '/api/admin/push/subscribe', { subscription: dev.owner.sub });
  check('subscribe: a customer cannot subscribe', r.status === 403);
  r = await owner.req('POST', '/api/admin/push/subscribe', { subscription: { endpoint: 'http://insecure.example/x', keys: dev.owner.sub.keys } });
  check('subscribe: a non-https endpoint is rejected', r.status === 400);
  r = await owner.req('POST', '/api/admin/push/subscribe', { subscription: { endpoint: dev.owner.sub.endpoint } });
  check('subscribe: missing keys are rejected', r.status === 400);
  r = await owner.req('POST', '/api/admin/push/subscribe', {});
  check('subscribe: an empty body is rejected', r.status === 400);

  // ---- subscribe the three staff devices
  for (const [d, c, who] of [[dev.owner, owner, 'owner'], [dev.admin, adminC, 'admin'], [dev.kitchen, kitchenC, 'kitchen']]) {
    r = await c.req('POST', '/api/admin/push/subscribe', { subscription: d.sub });
    check(`${who} turns on alerts on a device`, r.status === 200 && r.json.success === true, r.text);
  }
  r = await owner.req('POST', '/api/admin/push/subscribe', { subscription: dev.owner.sub });
  const rows = await sql`select count(*)::int n from push_subscriptions where endpoint = ${dev.owner.sub.endpoint}`;
  check('subscribing the same device twice keeps one row', r.status === 200 && rows[0].n === 1);

  // ---- a new COD order reaches all three
  const cod = await codOrder();
  const gotAll = await waitFor(() => [dev.owner, dev.admin, dev.kitchen].every((d) => forOrder(d, cod.orderId).length >= 1));
  check('new COD order: owner, admin and kitchen devices all get a push', gotAll, `owner=${forOrder(dev.owner, cod.orderId).length} admin=${forOrder(dev.admin, cod.orderId).length} kitchen=${forOrder(dev.kitchen, cod.orderId).length}`);
  const [po, pa, pk] = [dev.owner, dev.admin, dev.kitchen].map((d) => forOrder(d, cod.orderId)[0]);
  if (po) {
    const v = checkVapid(po.headers.authorization);
    check('the push carries a valid VAPID signature for our key', v.ok, JSON.stringify({ sigOk: v.sigOk, keyMatches: v.keyMatches, claims: v.claims, why: v.why }));
    check('it is encrypted (aes128gcm) with TTL and high urgency', po.headers['content-encoding'] === 'aes128gcm' && Number(po.headers.ttl) > 0 && po.headers.urgency === 'high', JSON.stringify(po.headers));
    check('owner message: title, order number, delivery, item count, total', po.msg.title === 'New order' && po.msg.body.includes(cod.orderNumber) && /Delivery/.test(po.msg.body) && /2 items/.test(po.msg.body) && /Rs\./.test(po.msg.body), po.msg.body);
    check('owner message opens that order in the portal', po.msg.url === `/admin/orders?open=${cod.orderId}` && po.msg.tag === `order-${cod.orderId}`, JSON.stringify(po.msg));
  }
  if (pa) check('admin message includes the total', /Rs\./.test(pa.msg.body), pa.msg.body);
  if (pk) {
    check('kitchen message has NO money', !/Rs\./.test(pk.msg.body) && pk.msg.body.includes(cod.orderNumber), pk.msg.body);
    check('kitchen message opens the kitchen screen', pk.msg.url === '/admin/kitchen', pk.msg.url);
  }

  // ---- a prepaid order is silent until the customer pays, then rings owner/admin only
  const [origPay] = await sql`select value from shop_settings where key='payment'`;
  await sql`update shop_settings set value = ${sql.json({ ...origPay.value, bank: { enabled: true, bank_name: 'TEST BANK', account_title: 'TEST', account_number: '000', iban: '' } })} where key='payment'`;
  try {
    const pre = (await cust.req('POST', '/api/checkout', { customerName: 'Push Tester', customerPhone: '03001234567', items: [{ type: 'product', id: prod.id, quantity: 1 }], orderType: 'pickup', paymentMethod: 'bank_transfer' })).json;
    await sleep(3000);
    check('unpaid prepaid order: no push to anyone', pre.status === 'Payment Pending' && [dev.owner, dev.admin, dev.kitchen].every((d) => forOrder(d, pre.orderId).length === 0), `${pre.status}`);
    r = await cust.req('POST', `/api/orders/${pre.orderId}/payment`, { reference: 'PUSH123' });
    const gotPay = await waitFor(() => forOrder(dev.owner, pre.orderId).length >= 1 && forOrder(dev.admin, pre.orderId).length >= 1);
    await sleep(2000);
    check('payment submitted: owner and admin are pushed', r.status === 200 && gotPay);
    check('payment submitted: kitchen is NOT pushed (cannot verify payments)', forOrder(dev.kitchen, pre.orderId).length === 0);
    const pm = forOrder(dev.owner, pre.orderId)[0]?.msg;
    check('payment message says what to do', pm?.title === 'Payment to check' && /Bank Transfer/.test(pm.body) && /Rs\./.test(pm.body), JSON.stringify(pm));
    await cust.req('POST', `/api/orders/${pre.orderId}/cancel`, {}); // tidy up
  } finally {
    await sql`update shop_settings set value=${sql.json(origPay.value)} where key='payment'`;
  }

  // ---- the "send me a test" button
  const before = messagesFor(dev.owner).length;
  r = await owner.req('POST', '/api/admin/push/test');
  await waitFor(() => messagesFor(dev.owner).length > before, 6000);
  const last = messagesFor(dev.owner).at(-1);
  check('test button: sends one test notification to the owner\'s own device', r.status === 200 && r.json.sent === 1 && last?.msg.title === 'Test notification', r.text);
  check('test button: other people\'s devices are not touched', messagesFor(dev.admin).every((m) => m.msg.title !== 'Test notification'));
  r = await cust.req('POST', '/api/admin/push/test');
  check('test button: a customer cannot use it', r.status === 403);
  const lonely = `pushlonely${stamp}@example.com`;
  await sql`insert into profiles (email, full_name, role) values (${lonely}, 'Lonely', 'admin')`;
  const lonelyC = await staff(lonely);
  r = await lonelyC.req('POST', '/api/admin/push/test');
  check('test button: someone with no device gets a clear 404', r.status === 404 && /No device/i.test(r.json?.error || ''), r.text);
  await sql`update profiles set is_active=false where email=${lonely}`;

  // ---- a device can only be removed by its own person
  r = await adminC.req('DELETE', '/api/admin/push/subscribe', { endpoint: dev.kitchen.sub.endpoint });
  const k1 = await sql`select count(*)::int n from push_subscriptions where endpoint = ${dev.kitchen.sub.endpoint}`;
  check('someone else cannot remove your device', r.status === 200 && k1[0].n === 1);

  // ---- dead devices are cleaned up; flaky ones are kept
  behavior[dev.admin.name] = 410;
  behavior[dev.kitchen.name] = 500;
  const c2 = await codOrder();
  await waitFor(() => forOrder(dev.owner, c2.orderId).length >= 1 && received.some((x) => x.name === dev.admin.name && x.at > Date.now() - 6000));
  await sleep(1500);
  const adm = await sql`select count(*)::int n from push_subscriptions where endpoint = ${dev.admin.sub.endpoint}`;
  const kit = await sql`select count(*)::int n from push_subscriptions where endpoint = ${dev.kitchen.sub.endpoint}`;
  check('a device the push service says is gone (410) is removed', adm[0].n === 0);
  check('a temporary failure (500) keeps the device, and the order was not affected', kit[0].n === 1 && c2.status === 'Placed');
  check('other devices still got the push despite those failures', forOrder(dev.owner, c2.orderId).length >= 1);
  delete behavior[dev.kitchen.name];

  // ---- turning off, role changes
  r = await owner.req('DELETE', '/api/admin/push/subscribe', { endpoint: dev.owner.sub.endpoint });
  const o1 = await sql`select count(*)::int n from push_subscriptions where endpoint = ${dev.owner.sub.endpoint}`;
  const c3 = await codOrder();
  await waitFor(() => forOrder(dev.kitchen, c3.orderId).length >= 1);
  await sleep(1500);
  check('turning alerts off removes the device and it stops receiving', r.status === 200 && o1[0].n === 0 && forOrder(dev.owner, c3.orderId).length === 0);
  await sql`update profiles set role='customer' where email=${kitchenEmail}`;
  const c4 = await codOrder();
  await sleep(4000);
  check('staff access removed: that device stops receiving alerts', forOrder(dev.kitchen, c4.orderId).length === 0);
  await sql`update profiles set role='kitchen' where email=${kitchenEmail}`;

  // ---- a device that changes hands is re-linked to whoever is signed in
  r = await adminC.req('POST', '/api/admin/push/subscribe', { subscription: dev.kitchen.sub });
  const [link] = await sql`select p.email from push_subscriptions s join profiles p on p.id = s.profile_id where s.endpoint = ${dev.kitchen.sub.endpoint}`;
  check('re-subscribing a device re-links it to the person now signed in', r.status === 200 && link?.email === adminEmail, JSON.stringify(link));

  // ---- the service worker and manifest are served
  const sw = await fetch(`${BASE}/sw.js`);
  const swText = await sw.text();
  check('service worker is served as JavaScript and handles push + click', sw.status === 200 && /javascript/.test(sw.headers.get('content-type') || '') && /addEventListener\('push'/.test(swText) && /notificationclick/.test(swText));
  const mf = await fetch(`${BASE}/admin.webmanifest`);
  const mj = await mf.json().catch(() => null);
  check('install manifest is served and scoped to /admin/', mf.status === 200 && mj?.scope === '/admin/' && mj?.display === 'standalone' && mj.icons?.length >= 2);
  for (const icon of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/badge-96.png', '/icons/apple-touch-icon.png']) {
    const ir = await fetch(BASE + icon);
    check(`icon ${icon} is served as a PNG`, ir.status === 200 && ir.headers.get('content-type') === 'image/png');
  }
} finally {
  await cleanup();
}
done();

async function cleanup() {
  await sql`update profiles set is_active=false where email in (${adminEmail}, ${kitchenEmail})`;
  await sql`delete from push_subscriptions where endpoint like 'https://127.0.0.1:2828/push/%'`;
}

function done() {
  console.log(`\n${pass} passed, ${fail} failed`);
  mock?.close();
  sink.close();
  sql.end().finally(() => process.exit(fail ? 1 : 0));
}
