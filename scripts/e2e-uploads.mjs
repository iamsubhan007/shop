// E2E for image uploads (payment proofs + product images). Run once per MODE against an app started to match:
//   MODE=supabase  app started with SUPABASE_SERVICE_ROLE_KEY=test-key SUPABASE_URL=http://127.0.0.1:2727
//                  (this script runs a mock of the Supabase Storage REST API on that port)
//   MODE=disk      app started with no service key (local disk; set STORAGE_DIR for this script too)
//   MODE=vercel    app started with VERCEL=1 and no service key / STORAGE_DIR (serverless: no usable disk)
// Usage: MODE=supabase BASE=http://localhost:3000 node --env-file=.env.local scripts/e2e-uploads.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { startMailSink } from './mail-sink.mjs';

const BASE = process.env.BASE || 'http://localhost:3000';
const MODE = process.env.MODE || 'supabase';
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const sink = await startMailSink(2525);
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  ' + x}`); };

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// ---- mock of the Supabase Storage REST API (only what the app uses)
const objects = new Map();
let mode = 'ok'; // ok | down | auth_fail
let bucketCalls = 0, bucketExists = false, lastAuth = null;
const mock = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const p = new URL(req.url, 'http://x').pathname;
    const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (mode === 'down') return req.socket.destroy();
    lastAuth = req.headers.authorization;
    if (mode === 'auth_fail' || lastAuth !== 'Bearer test-key') return json(401, { statusCode: '403', error: 'Unauthorized', message: 'Invalid Compact JWS' });
    if (req.method === 'POST' && p === '/storage/v1/bucket') {
      bucketCalls++;
      if (bucketExists) return json(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      bucketExists = true;
      return json(200, { name: 'hbt-files' });
    }
    const m = p.match(/^\/storage\/v1\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/);
    if (m && req.method === 'POST') {
      const key = `${m[1]}/${decodeURIComponent(m[2])}`;
      if (objects.has(key)) return json(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      let data = body;
      const ct = String(req.headers['content-type'] || '');
      if (ct.startsWith('multipart/form-data')) { // storage-js wraps Blobs in multipart; unwrap the file part
        const boundary = '--' + ct.split('boundary=')[1];
        const part = body.toString('latin1').split(boundary).find((s) => /filename=/.test(s)) || '';
        const start = part.indexOf('\r\n\r\n') + 4;
        data = Buffer.from(part.slice(start, part.length - 2), 'latin1');
      }
      objects.set(key, { data, ct });
      return json(200, { Key: key, Id: key });
    }
    if (m && req.method === 'GET') {
      const o = objects.get(`${m[1]}/${decodeURIComponent(m[2])}`);
      if (!o) return json(404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      res.writeHead(200, { 'Content-Type': o.ct || 'application/octet-stream' });
      return res.end(o.data);
    }
    json(404, { statusCode: '404', error: 'not_found', message: 'unknown route ' + p });
  });
});
if (MODE === 'supabase') await new Promise((r) => mock.listen(2727, '127.0.0.1', r));

class Client {
  jar = {};
  async raw(method, p, body, headers = {}) {
    const isForm = body instanceof FormData;
    const res = await fetch(BASE + p, {
      method,
      headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), Origin: BASE, Cookie: Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '), ...headers },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v === '') delete this.jar[k]; else this.jar[k] = v; }
    return res;
  }
  async req(method, p, body) { const res = await this.raw(method, p, body); let json = null; const text = await res.clone().text(); try { json = JSON.parse(text); } catch {} return { status: res.status, json, text, res }; }
}
const form = (buf, name = 'shot.png', type = 'image/png') => { const f = new FormData(); f.append('file', new File([buf], name, { type })); return f; };

async function signInCustomer(email) {
  const c = new Client();
  await c.req('POST', '/api/auth/otp/request', { email });
  await c.req('POST', '/api/auth/otp/verify', { email, code: await sink.codeFor(email) });
  await c.req('PATCH', '/api/auth/me', { fullName: 'Upload Tester', phone: '03001234567' });
  return c;
}
async function signInStaff(email) {
  const c = new Client();
  await c.req('POST', '/api/auth/staff/otp/request', { email });
  const r = await c.req('POST', '/api/auth/staff/otp/verify', { email, code: await sink.codeFor(email) });
  return { c, r };
}

const stamp = Date.now();
const anon = new Client();
const cust = await signInCustomer(`up${stamp}@example.com`);
const other = await signInCustomer(`upb${stamp}@example.com`);

console.log(`\n=== uploads, MODE=${MODE} ===`);
let r = await anon.req('POST', '/api/upload/proof', form(PNG));
check('anonymous upload is refused (401)', r.status === 401);
r = await cust.req('POST', '/api/upload/proof', form(Buffer.from('this is not an image at all'), 'x.png', 'image/png'));
check('a non-image is rejected even if it is named .png (400, clear message)', r.status === 400 && /JPG, PNG or WebP/.test(r.json?.error || ''), r.text);
r = await cust.req('POST', '/api/upload/proof', form(Buffer.concat([PNG, Buffer.alloc(5.2 * 1024 * 1024)])));
check('an over-5 MB image is rejected with a clear message', r.status === 400 && /too large/i.test(r.json?.error || ''), `${r.status} ${r.text.slice(0, 80)}`);

if (MODE === 'vercel') {
  r = await cust.req('POST', '/api/upload/proof', form(PNG));
  check('VERCEL, nothing configured: clear 503 JSON message, not a bare 500', r.status === 503 && /not available/i.test(r.json?.error || '') && /transaction ID/i.test(r.json?.error || ''), `${r.status} ${r.text.slice(0, 120)}`);
  const own = await signInStaff(process.env.OWNER_EMAIL);
  r = await own.c.req('POST', '/api/admin/upload', form(PNG));
  check('VERCEL, nothing configured: admin product upload also gives a clear 503', r.status === 503 && !!r.json?.error && !/transaction ID/i.test(r.json.error), `${r.status} ${r.text.slice(0, 120)}`);
  report();
  await new Promise(() => {}); // report() ends the process
}

// a prepaid order so the proof has an owner (access control is tested against it)
const [origPay] = await sql`select value from shop_settings where key='payment'`;
await sql`update shop_settings set value = ${sql.json({ ...origPay.value, bank: { enabled: true, bank_name: 'TEST BANK', account_title: 'TEST', account_number: '000', iban: '' } })} where key='payment'`;
try {
  const prod = (await anon.req('GET', '/api/menu')).json.products.find((p) => p.available);
  const order = (await cust.req('POST', '/api/checkout', { customerName: 'Upload Tester', customerPhone: '03001234567', items: [{ type: 'product', id: prod.id, quantity: 1 }], orderType: 'pickup', paymentMethod: 'bank_transfer' })).json;

  // ---- payment proof upload
  r = await cust.req('POST', '/api/upload/proof', form(PNG));
  check('customer uploads a payment screenshot (200 + file id)', r.status === 200 && /^[a-f0-9-]{36}\.png$/.test(r.json?.file || ''), `${r.status} ${r.text.slice(0, 120)}`);
  const proof = r.json?.file;
  if (MODE === 'supabase') {
    check('stored in the private bucket under proofs/, not on disk', objects.has(`hbt-files/proofs/${proof}`) && Buffer.compare(objects.get(`hbt-files/proofs/${proof}`).data, PNG) === 0);
    check('authenticated with the service key', lastAuth === 'Bearer test-key');
    check('bucket is created once and reused', bucketCalls === 1, `bucket calls: ${bucketCalls}`);
  } else {
    const onDisk = fs.existsSync(path.join(process.env.STORAGE_DIR || 'storage', 'proofs', proof));
    check('stored on the local disk (STORAGE_DIR)', onDisk);
  }
  r = await cust.req('POST', `/api/orders/${order.orderId}/payment`, { proofFile: proof });
  check('the proof can be attached to the order payment', r.status === 200, `${r.status} ${r.text.slice(0, 120)}`);

  // ---- who may view the proof
  const own = await signInStaff(process.env.OWNER_EMAIL);
  const viewers = [['the customer who owns the order', cust, 200], ['owner', own.c, 200], ['another customer', other, 404], ['anonymous visitor', anon, 404]];
  for (const [who, client, want] of viewers) {
    const res = await client.raw('GET', `/api/files/proof/${proof}`);
    const ok = res.status === want && (want !== 200 || (res.headers.get('content-type') === 'image/png' && Buffer.compare(Buffer.from(await res.arrayBuffer()), PNG) === 0));
    check(`proof visible to ${who}? expect ${want === 200 ? 'yes (same bytes)' : 'no (404)'}`, ok, `got ${res.status}`);
  }
  r = await cust.req('GET', `/api/files/proof/${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}.png`);
  check('a proof that does not exist gives 404', r.status === 404);

  // ---- product / deal picture (public once uploaded)
  r = await own.c.req('POST', '/api/admin/upload', form(PNG));
  check('owner uploads a product picture', r.status === 200 && /^\/api\/files\/product\/[a-f0-9-]{36}\.png$/.test(r.json?.url || ''), `${r.status} ${r.text.slice(0, 120)}`);
  const pic = r.json?.url;
  const picRes = await anon.raw('GET', pic);
  check('the product picture is public and cached for a year', picRes.status === 200 && /immutable/.test(picRes.headers.get('cache-control') || '') && Buffer.compare(Buffer.from(await picRes.arrayBuffer()), PNG) === 0);
  r = await cust.req('POST', '/api/admin/upload', form(PNG));
  check('a customer cannot upload product pictures', r.status === 403);

  // ---- storage trouble must never become a bare 500
  if (MODE === 'supabase') {
    mode = 'down';
    r = await cust.req('POST', '/api/upload/proof', form(PNG));
    check('storage unreachable: clear 503 JSON, and it suggests the transaction ID', r.status === 503 && /could not save/i.test(r.json?.error || '') && /transaction ID/i.test(r.json?.error || ''), `${r.status} ${r.text.slice(0, 120)}`);
    r = await own.c.req('POST', '/api/admin/upload', form(PNG));
    check('storage unreachable: product upload gives a clear 503 too', r.status === 503 && !!r.json?.error, `${r.status} ${r.text.slice(0, 120)}`);
    mode = 'auth_fail';
    r = await cust.req('POST', '/api/upload/proof', form(PNG));
    check('wrong service key: clear 503 JSON, no secret leaked', r.status === 503 && !/test-key|jwt|jws/i.test(r.text), `${r.status} ${r.text.slice(0, 120)}`);
    const dl = await cust.raw('GET', `/api/files/proof/${proof}`);
    check('wrong service key on read: 404, not a crash', dl.status === 404);
    mode = 'ok';
    r = await cust.req('POST', '/api/upload/proof', form(PNG));
    check('storage back up: uploads work again without a restart', r.status === 200, `${r.status} ${r.text.slice(0, 120)}`);
  }
} finally {
  await sql`update shop_settings set value=${sql.json(origPay.value)} where key='payment'`;
}
report();

function report() {
  console.log(`\n${pass} passed, ${fail} failed`);
  mock.close();
  sink.close();
  sql.end().finally(() => process.exit(fail ? 1 : 0));
}
