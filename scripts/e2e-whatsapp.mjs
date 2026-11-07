// Tests owner WhatsApp notifications against a local MOCK of the WhatsApp Cloud API (no real credentials needed).
// App must run with: WHATSAPP_TOKEN=test-token WHATSAPP_PHONE_NUMBER_ID=12345 WHATSAPP_API_BASE=http://127.0.0.1:2626 OWNER_WHATSAPP=923001234567
// Usage: BASE=http://localhost:3100 node --env-file=.env.local scripts/e2e-whatsapp.mjs
import http from 'node:http';
import postgres from 'postgres';
import { startMailSink } from './mail-sink.mjs';

const BASE = process.env.BASE || 'http://localhost:3100';
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const sink = await startMailSink(2525);
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  ' + x}`); };

// ---- mock WhatsApp Cloud API
let mode = 'ok'; // ok | media_500 | media_hang | all_fail
const calls = [];
const mock = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const entry = { url: req.url, auth: req.headers.authorization, type: null, bytes: body.length };
    if (req.url.endsWith('/media')) {
      entry.kind = 'media';
      calls.push(entry);
      if (mode === 'media_hang') return; // never answers
      if (mode === 'media_500' || mode === 'all_fail') { res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'media boom' } })); }
      res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ id: 'MEDIA1' }));
    }
    if (req.url.endsWith('/messages')) {
      const j = JSON.parse(body.toString() || '{}');
      entry.kind = j.type; entry.to = j.to; entry.text = j.text?.body; entry.docId = j.document?.id;
      calls.push(entry);
      if (mode === 'all_fail') { res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'send boom' } })); }
      res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ messages: [{ id: `wamid.${calls.length}` }] }));
    }
    res.writeHead(404); res.end();
  });
});
await new Promise((r) => mock.listen(2626, '127.0.0.1', r));

class Client {
  jar = {};
  async req(method, path, body) {
    const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); this.jar[kv.slice(0, i)] = kv.slice(i + 1); }
    return { status: res.status, json: await res.json().catch(() => null) };
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(orderId, pred, ms = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (!orderId) break;
    const [n] = await sql`select * from notifications where order_id = ${orderId}`;
    if (n && pred(n)) return n;
    await sleep(300);
  }
  return (await sql`select * from notifications where order_id = ${orderId}`)[0];
}

// Test hygiene: earlier suites used this IP's hourly OTP allowance.
await sql`delete from rate_limits where key like 'otp%'`;
const email = `wa${Date.now()}@example.com`;
const cust = new Client();
await cust.req('POST', '/api/auth/otp/request', { email });
await cust.req('POST', '/api/auth/otp/verify', { email, code: await sink.codeFor(email) });
await cust.req('PATCH', '/api/auth/me', { fullName: 'WA Tester', phone: '03004445556' });
const menu = (await cust.req('GET', '/api/menu')).json;
const prod = menu.products.find((p) => p.available);
const S = { lat: 31.4766319, lng: 74.3147178 };
const place = async () => {
  const t0 = Date.now();
  const r = await cust.req('POST', '/api/checkout', { customerName: 'WA Tester', customerPhone: '03004445556', orderType: 'delivery', paymentMethod: 'cod', deliveryAddress: 'House 3', deliveryLat: S.lat + 0.004, deliveryLng: S.lng, items: [{ type: 'product', id: prod.id, quantity: 1 }], idempotencyKey: 'wa-' + Math.random().toString(36).slice(2) });
  return { ...r, ms: Date.now() - t0 };
};

// 1. happy path: PDF receipt
mode = 'ok'; calls.length = 0;
let o = await place();
check('order created', o.status === 200, JSON.stringify(o.json));
let n = await waitFor(o.json.orderId, (x) => x.status === 'sent');
check('PDF path: notification sent via official API', n?.status === 'sent' && !!n.provider_message_id && !n.last_error, JSON.stringify(n));
check('PDF uploaded then sent as document to owner number', calls.some((c) => c.kind === 'media' && c.bytes > 1000) && calls.some((c) => c.kind === 'document' && c.docId === 'MEDIA1' && c.to === '923001234567'), JSON.stringify(calls));
check('API token sent as bearer', calls.every((c) => c.auth === 'Bearer test-token'));
check('no text message when PDF worked', !calls.some((c) => c.kind === 'text'));

// 2. PDF fails fast -> text fallback
mode = 'media_500'; calls.length = 0;
o = await place();
n = await waitFor(o.json.orderId, (x) => x.status === 'sent');
const txt = calls.find((c) => c.kind === 'text');
check('media failure -> text fallback delivered', n?.status === 'sent' && !!txt && /NEW ORDER/.test(txt.text) && txt.text.includes(o.json.orderNumber), JSON.stringify({ n, calls }));
check('fallback is recorded for the admin', /PDF not delivered/.test(n?.last_error || ''), n?.last_error);

// 3. PDF hangs -> after 12 s fall back to text; the customer is never kept waiting
mode = 'media_hang'; calls.length = 0;
o = await place();
check('customer response is fast even if WhatsApp hangs (<4 s)', o.status === 200 && o.ms < 4000, `${o.ms} ms`);
const t0 = Date.now();
n = await waitFor(o.json.orderId, (x) => x.status === 'sent', 30000);
const took = (Date.now() - t0) / 1000;
check('hung PDF -> text fallback after ~12 s (10-15 s window)', n?.status === 'sent' && took >= 10 && took <= 16 && calls.some((c) => c.kind === 'text'), `${took}s ${JSON.stringify(n)}`);
check('timeout reason recorded', /timed out/.test(n?.last_error || ''), n?.last_error);

// 4. everything fails -> order still exists, failure visible, retry works, no duplicate sends afterwards
mode = 'all_fail'; calls.length = 0;
o = await place();
n = await waitFor(o.json.orderId, (x) => x.status === 'failed');
const [ord] = await sql`select status from orders where id = ${o.json.orderId}`;
check('WhatsApp outage does not cancel the order', o.status === 200 && ord.status === 'Placed');
check('failure recorded with error, no secrets', n?.status === 'failed' && /boom/.test(n.last_error || '') && !/test-token/.test(n.last_error || ''), JSON.stringify(n));

// admin retry
await sql`delete from otp_codes where email like 'staff:%'`; await sql`delete from rate_limits where key like 'staff%'`;
const owner = new Client();
await owner.req('POST', '/api/auth/staff/otp/request', { email: process.env.OWNER_EMAIL });
await owner.req('POST', '/api/auth/staff/otp/verify', { email: process.env.OWNER_EMAIL, code: await sink.codeFor(process.env.OWNER_EMAIL) });
mode = 'ok'; calls.length = 0;
let r = await owner.req('PATCH', `/api/admin/orders/${o.json.orderId}`, { action: 'retry_notification' });
check('admin retry delivers the notification', r.status === 200 && r.json.notification.status === 'sent', JSON.stringify(r.json));
r = await owner.req('GET', `/api/admin/orders/${o.json.orderId}`);
check('admin sees notification status + copy-text fallback', r.json.order.notification.status === 'sent' && /NEW ORDER/.test(r.json.order.waText));

// 5. no duplicate: re-submitting the same idempotency key does not re-notify
mode = 'ok'; calls.length = 0;
const key = 'dup-' + Date.now();
const body = { customerName: 'WA Tester', customerPhone: '03004445556', orderType: 'pickup', paymentMethod: 'bank_transfer', items: [{ type: 'product', id: prod.id, quantity: 1 }], idempotencyKey: key };
await sql`update shop_settings set value = jsonb_set(value, '{bank,enabled}', 'true') where key='payment'`;
const a = await cust.req('POST', '/api/checkout', body);
await waitFor(a.json.orderId, (x) => x.status === 'sent');
const sentBefore = calls.filter((c) => c.kind === 'document').length;
const b = await cust.req('POST', '/api/checkout', body);
await sleep(2500);
check('duplicate submission returns same order and sends nothing new', b.json.duplicate === true && b.json.orderNumber === a.json.orderNumber && calls.filter((c) => c.kind === 'document').length === sentBefore, JSON.stringify({ sentBefore, now: calls.filter((c) => c.kind === 'document').length }));
const cnt = await sql`select count(*)::int n from notifications where order_id = ${a.json.orderId}`;
check('exactly one notification row per order', cnt[0].n === 1);
await sql`update shop_settings set value = jsonb_set(value, '{bank,enabled}', 'false') where key='payment'`;

console.log(`\n${pass} passed, ${fail} failed`);
mock.close(); sink.close(); await sql.end();
process.exit(fail ? 1 : 0);
