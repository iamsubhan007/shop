// E2E for: backups kept in file storage (not on the read-only serverless disk), the storage meter + warning emails,
// the report-from-a-backup builder checked against the live reports, and deleting customers' payment screenshots.
// Two modes (start the app to match; scripts/.. runner sets the env):
//   MODE=supabase  app started with SUPABASE_SERVICE_ROLE_KEY=test-key SUPABASE_URL=http://127.0.0.1:2727, and
//                  BACKUP_SYNC_TOKEN / CRON_SECRET (16+ chars). This script runs a mock of the Supabase Storage REST API.
//   MODE=disk      app started with no service key; STORAGE_DIR must be set for the app AND this script.
// Needs SMTP_HOST=127.0.0.1 SMTP_PORT=2525. LOCAL DATABASE ONLY (it creates and drops a fake `storage` schema).
// Usage: MODE=supabase BASE=http://localhost:3100 STORAGE_DIR=<dir> node --env-file=.env.local scripts/e2e-storage.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import postgres from 'postgres';
import { startMailSink } from './mail-sink.mjs';
import { buildReport, checkBackup } from '../src/lib/backupReport.js';

const BASE = process.env.BASE || 'http://localhost:3100';
const MODE = process.env.MODE || 'disk';
const STORAGE_DIR = process.env.STORAGE_DIR || 'storage';
if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '')) { console.log('Refusing to run: DATABASE_URL is not a local database.'); process.exit(2); }
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const sink = await startMailSink(2525);
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  ' + x}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const MB = 1048576;

// ---------- mock of the Supabase Storage REST API (only what the app uses) ----------
const objects = new Map(); // `${bucket}/${path}` -> { data, ct }
const buckets = new Set();
let mockMode = 'ok'; // ok | down
let signCalls = 0;
const mock = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (mockMode === 'down') return req.socket.destroy();
    const signedGet = req.method === 'GET' && p.startsWith('/storage/v1/object/sign/'); // the browser following a signed link carries no key
    if (!signedGet && req.headers.authorization !== 'Bearer test-key') return json(401, { statusCode: '403', error: 'Unauthorized', message: 'Invalid Compact JWS' });
    if (req.method === 'POST' && p === '/storage/v1/bucket') {
      const name = JSON.parse(body.toString()).name;
      if (buckets.has(name)) return json(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      buckets.add(name);
      return json(200, { name });
    }
    let m = p.match(/^\/storage\/v1\/object\/list\/([^/]+)$/);
    if (m && req.method === 'POST') {
      if (!buckets.has(m[1])) return json(404, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
      const { prefix = '', limit = 100, offset = 0 } = JSON.parse(body.toString() || '{}');
      const pre = prefix ? prefix.replace(/\/?$/, '/') : '';
      const seen = new Set();
      const out = [];
      for (const [key, o] of objects) {
        if (!key.startsWith(`${m[1]}/${pre}`)) continue;
        const rel = key.slice(`${m[1]}/${pre}`.length);
        if (rel.includes('/')) { const f = rel.split('/')[0]; if (!seen.has(f)) { seen.add(f); out.push({ name: f, id: null, metadata: null }); } }
        else out.push({ name: rel, id: key, metadata: { size: o.data.length, mimetype: o.ct } });
      }
      out.sort((a, b) => (a.name < b.name ? -1 : 1));
      return json(200, out.slice(offset, offset + limit));
    }
    m = p.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/);
    if (m && req.method === 'POST') {
      signCalls++;
      const key = `${m[1]}/${decodeURIComponent(m[2])}`;
      if (!objects.has(key)) return json(404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      return json(200, { signedURL: `/object/sign/${m[1]}/${m[2]}?token=tok123&download=${encodeURIComponent(JSON.parse(body.toString() || '{}').download || '')}` });
    }
    if (m && req.method === 'GET') { // the browser following the signed link (no Authorization needed in reality; the mock is lenient)
      const o = objects.get(`${m[1]}/${decodeURIComponent(m[2])}`);
      if (!o || u.searchParams.get('token') !== 'tok123') return json(404, { message: 'nope' });
      res.writeHead(200, { 'Content-Type': o.ct || 'application/octet-stream' });
      return res.end(o.data);
    }
    m = p.match(/^\/storage\/v1\/object\/([^/]+)$/);
    if (m && req.method === 'DELETE') {
      const { prefixes = [] } = JSON.parse(body.toString() || '{}');
      const gone = [];
      for (const pre of prefixes) if (objects.delete(`${m[1]}/${pre}`)) gone.push({ name: pre });
      return json(200, gone);
    }
    m = p.match(/^\/storage\/v1\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/);
    if (m && req.method === 'POST') {
      const key = `${m[1]}/${decodeURIComponent(m[2])}`;
      if (!buckets.has(m[1])) return json(404, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
      if (objects.has(key)) return json(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      let data = body;
      const ct = String(req.headers['content-type'] || '');
      if (ct.startsWith('multipart/form-data')) {
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
    json(404, { statusCode: '404', error: 'not_found', message: 'unknown route ' + req.method + ' ' + p });
  });
});
if (MODE === 'supabase') await new Promise((r) => mock.listen(2727, '127.0.0.1', r));

// ---------- clients ----------
class Client {
  jar = {};
  async raw(method, p, body, opts = {}) {
    const isForm = body instanceof FormData;
    const res = await fetch(BASE + p, { method, redirect: opts.redirect || 'follow', headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), Origin: BASE, Cookie: Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(opts.headers || {}) }, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
    for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v === '') delete this.jar[k]; else this.jar[k] = v; }
    return res;
  }
  async req(method, p, body, opts) { const res = await this.raw(method, p, body, opts); const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: res.status, json, text, res }; }
}
async function customer(email) {
  const c = new Client();
  await c.req('POST', '/api/auth/otp/request', { email });
  await c.req('POST', '/api/auth/otp/verify', { email, code: await sink.codeFor(email) });
  await c.req('PATCH', '/api/auth/me', { fullName: 'Storage Tester', phone: '03001234567' });
  return c;
}
async function staff(email) {
  const c = new Client();
  await c.req('POST', '/api/auth/staff/otp/request', { email });
  const r = await c.req('POST', '/api/auth/staff/otp/verify', { email, code: await sink.codeFor(email) });
  if (r.status !== 200) throw new Error(`staff login failed for ${email}: ${r.text}`);
  return c;
}
const decodeMail = (raw) => raw.replace(/\r?\n[ \t]/g, ' ').replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const subjectOf = (raw) => /^Subject: (.*)$/m.exec(decodeMail(raw))?.[1] || '';

// ---------- who is who ----------
const stamp = Date.now();
const adminEmail = `stadmin${stamp}@example.com`, kitchenEmail = `stkitchen${stamp}@example.com`, riderEmail = `strider${stamp}@example.com`;
await sql`insert into profiles (email, full_name, role) values (${adminEmail}, 'ST Admin', 'admin'), (${kitchenEmail}, 'ST Kitchen', 'kitchen'), (${riderEmail}, 'ST Rider', 'rider')`;
const OWNER = process.env.OWNER_EMAIL;
const anon = new Client();
const cust = await customer(`st${stamp}@example.com`);
const owner = await staff(OWNER);
const admin = await staff(adminEmail);
const kitchen = await staff(kitchenEmail);
const rider = await staff(riderEmail);

// ---------- things we change and must put back ----------
const keep = async (key) => (await sql`select value from shop_settings where key = ${key}`)[0]?.value;
const origBackup = await keep('backup'), origStorage = await keep('storage'), origAlert = await keep('storage_alert'), origPay = await keep('payment');
const setKey = (key, value) => sql`insert into shop_settings (key, value) values (${key}, ${sql.json(value)}) on conflict (key) do update set value = excluded.value`;
const restoreKey = (key, v) => (v === undefined ? sql`delete from shop_settings where key = ${key}` : setKey(key, v));
const hadStorageSchema = (await sql`select to_regclass('storage.objects') as t`)[0].t !== null;
let createdFake = false;
await setKey('payment', { ...origPay, bank: { enabled: true, bank_name: 'TEST BANK', account_title: 'TEST', account_number: '000', iban: '' } });

const menu = (await anon.req('GET', '/api/menu')).json;
const prod = menu.products.find((p) => p.available);
const freshLimits = () => sql`delete from rate_limits`; // LOCAL ONLY: the app limits checkouts/uploads per hour
const dbMB = async () => Number((await sql`select pg_database_size(current_database())::float8 as b`)[0].b) / MB; // straight from the database: asking the app would also trigger alerts
const setStorageSettings = (v) => setKey('storage', { db_limit_mb: 500, files_limit_mb: 1000000, warn_percent: 80, alerts: true, ...v });
const proofPath = (name) => path.join(STORAGE_DIR, 'proofs', name);
const proofExists = (name) => (MODE === 'supabase' ? objects.has(`hbt-files/proofs/${name}`) : fs.existsSync(proofPath(name)));
const backupFiles = () => (MODE === 'supabase' ? [...objects.keys()].filter((k) => k.startsWith('hbt-files-backups/')).map((k) => k.split('/')[1]).sort() : (fs.existsSync(path.join(STORAGE_DIR, 'backups')) ? fs.readdirSync(path.join(STORAGE_DIR, 'backups')).sort() : []));

async function placeOrder(extra = {}) {
  await freshLimits();
  const r = await cust.req('POST', '/api/checkout', { customerName: 'Storage Tester', customerPhone: '03001234567', items: [{ type: 'product', id: prod.id, quantity: 1 }], orderType: 'pickup', paymentMethod: 'bank_transfer', idempotencyKey: `st-${Date.now()}-${Math.random()}`, ...extra });
  if (r.status !== 200) throw new Error(`checkout failed: ${r.text}`);
  return r.json;
}
async function upload() {
  await freshLimits();
  const f = new FormData(); f.append('file', new File([Buffer.concat([PNG, Buffer.from(String(Math.random()))])], 'shot.png', { type: 'image/png' }));
  const r = await cust.req('POST', '/api/upload/proof', f);
  if (r.status !== 200) throw new Error(`upload failed: ${r.text}`);
  return r.json.file;
}
const submit = (orderId, proofFile) => cust.req('POST', `/api/orders/${orderId}/payment`, { reference: `TX-${Math.random().toString(36).slice(2, 8)}`, proofFile });
const patch = (c, id, body) => c.req('PATCH', `/api/admin/orders/${id}`, body);
const row = async (id) => (await sql`select payment_proof_url, payment_status, status from orders where id = ${id}`)[0];
const subProofs = async (id) => (await sql`select proof_image_url from payment_submissions where order_id = ${id} order by submitted_at`).map((x) => x.proof_image_url);

try {
  // =====================================================================================================
  console.log(`\n=== MODE=${MODE} ===\n--- backups are kept in file storage ---`);
  let r = await kitchen.req('GET', '/api/admin/backups');
  check('kitchen cannot list backups', r.status === 403);
  for (const [who, c] of [['rider', rider], ['customer', cust], ['anonymous', anon]]) { r = await c.req('GET', '/api/admin/backups'); check(`${who} cannot list backups`, r.status === 403, `${r.status}`); }
  r = await owner.req('POST', '/api/admin/backups');
  check('owner: "Back up now" succeeds and is recorded', r.status === 200 && r.json.backup.status === 'success' && /^hbt-backup-.*\.json\.gz$/.test(r.json.backup.filename), r.text);
  const b1 = r.json.backup;
  if (MODE === 'supabase') check('the file went to the private backups bucket (and not to the disk)', objects.has(`hbt-files-backups/${b1.filename}`) && !fs.existsSync(path.join(STORAGE_DIR, 'backups', b1.filename)), [...objects.keys()].join());
  else check('the file is on disk under STORAGE_DIR/backups', fs.existsSync(path.join(STORAGE_DIR, 'backups', b1.filename)));
  const ordersNow = (await sql`select count(*)::int n from orders`)[0].n;
  r = await owner.raw('GET', `/api/admin/backups/${b1.id}`);
  let buf = Buffer.from(await r.arrayBuffer());
  check('the download is the gzip file, as an attachment', r.status === 200 && /gzip/.test(r.headers.get('content-type')) && /attachment; filename="hbt-backup-/.test(r.headers.get('content-disposition')) && buf.length === b1.sizeBytes && buf[0] === 0x1f && buf[1] === 0x8b, `${r.status} ${buf.length}/${b1.sizeBytes}`);
  const data = JSON.parse(zlib.gunzipSync(buf).toString());
  check('it holds the business tables, including customer feedback, and every order', checkBackup(data) === null && Array.isArray(data.tables.order_feedback) && data.tables.orders.length === ordersNow, `${data.tables.orders.length} vs ${ordersNow}`);
  const [aud] = await sql`select actor_email from audit_logs where action = 'backup.download' and entity_id = ${b1.id}`;
  check('the download is in the audit log', aud?.actor_email === OWNER);

  r = await admin.req('GET', '/api/admin/backups');
  check('admin can list backups', r.status === 200 && r.json.backups.some((b) => b.id === b1.id), r.text.slice(0, 100));
  r = await admin.req('POST', '/api/admin/backups');
  check('admin can take a backup', r.status === 200 && r.json.backup.status === 'success', r.text);
  const b2 = r.json.backup;
  r = await admin.raw('GET', `/api/admin/backups/${b2.id}`);
  check('admin can download a backup', r.status === 200 && (await r.arrayBuffer()).byteLength === b2.sizeBytes);
  for (const [who, c] of [['kitchen', kitchen], ['rider', rider], ['customer', cust], ['anonymous', anon]]) {
    r = await c.req('GET', `/api/admin/backups/${b2.id}`);
    check(`${who} cannot download a backup`, r.status === 403, `${r.status}`);
    r = await c.req('POST', '/api/admin/backups');
    check(`${who} cannot start a backup`, r.status === 403, `${r.status}`);
  }
  r = await owner.req('GET', '/api/admin/backups/not-a-uuid');
  check('a malformed backup id is 404, not a crash', r.status === 404);

  // the same file through the PC sync endpoint
  const tok = { Authorization: `Bearer ${process.env.BACKUP_SYNC_TOKEN}` };
  r = await anon.req('GET', '/api/backup-sync', null, { headers: tok });
  check('PC sync tool lists the files', r.status === 200 && r.json.files.some((f) => f.name === b2.filename), r.text.slice(0, 120));
  r = await anon.raw('GET', `/api/backup-sync?file=${encodeURIComponent(b2.filename)}`, null, { headers: tok });
  check('PC sync tool can download from storage', r.status === 200 && (await r.arrayBuffer()).byteLength === b2.sizeBytes);
  r = await anon.req('GET', `/api/backup-sync?file=${encodeURIComponent('../../.env.local')}`, null, { headers: tok });
  check('PC sync still blocks path tricks', r.status === 400);

  // retention
  await setKey('backup', { ...origBackup, keep: 2 });
  let last;
  for (let i = 0; i < 3; i++) { await sleep(20); last = (await owner.req('POST', '/api/admin/backups')).json.backup; }
  const kept = backupFiles();
  check('only the newest 2 backup files are kept, newest included', kept.length === 2 && kept.includes(last.filename) && !kept.includes(b1.filename), kept.join());
  r = await owner.req('GET', `/api/admin/backups/${b1.id}`);
  check('a pruned backup says so clearly (404)', r.status === 404 && /no longer in storage/i.test(r.json?.error || ''), r.text);
  r = await admin.req('GET', '/api/admin/backups');
  const flags = Object.fromEntries(r.json.backups.map((b) => [b.id, b.available]));
  check('the list marks which backup files still exist (kept ones yes, pruned ones no), so the page hides dead links', flags[last.id] === true && flags[b1.id] === false && r.json.backups.filter((b) => b.available).length === backupFiles().length, JSON.stringify(flags));

  if (MODE === 'supabase') {
    await sql`update backups set size_bytes = ${5 * MB} where id = ${last.id}`;
    r = await owner.raw('GET', `/api/admin/backups/${last.id}`, null, { redirect: 'manual' });
    const loc = r.headers.get('location') || '';
    check('a big backup (over 4 MB) is handed over by a short-lived signed link', [301, 302, 307, 308].includes(r.status) && /\/object\/sign\/hbt-files-backups\//.test(loc) && /token=/.test(loc) && signCalls > 0, `${r.status} ${loc}`);
    const viaLink = await fetch(loc);
    check('and the link serves the real file', viaLink.status === 200 && (await viaLink.arrayBuffer()).byteLength > 100);
    await sql`update backups set size_bytes = ${last.sizeBytes} where id = ${last.id}`;

    const before = backupFiles().length;
    mockMode = 'down';
    r = await owner.req('POST', '/api/admin/backups');
    mockMode = 'ok';
    const [failed] = await sql`select status, error, filename from backups order by created_at desc limit 1`;
    check('if storage is unreachable the backup fails clearly and is recorded as failed', r.status === 500 && /Backup failed/.test(r.json?.error || '') && failed.status === 'failed' && !!failed.error && !failed.filename && backupFiles().length === before, `${r.status} ${r.text} ${JSON.stringify(failed)}`);
    r = await owner.req('POST', '/api/admin/backups');
    check('and the next backup works again', r.status === 200);
  }

  // =====================================================================================================
  console.log('\n--- report from a backup matches the live reports ---');
  const today = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
  // a few orders of known shapes today, so the comparison is not just empty days
  const cod = async () => { await freshLimits(); return (await cust.req('POST', '/api/checkout', { customerName: 'Storage Tester', customerPhone: '03001234567', items: [{ type: 'product', id: prod.id, quantity: 2 }], orderType: 'delivery', paymentMethod: 'cod', deliveryAddress: 'House 1, N Block', deliveryLat: 31.4766319 + 0.0085, deliveryLng: 74.3147178, idempotencyKey: `stc-${Math.random()}` })).json; };
  const c1 = await cod(), c2 = await cod(), c3 = await cod();
  for (const s of ['Confirmed', 'Cooking', 'Out for Delivery']) await patch(owner, c1.orderId, { action: 'status', status: s });
  await patch(owner, c1.orderId, { action: 'status', status: 'Completed' });
  await patch(owner, c2.orderId, { action: 'status', status: 'Cancelled', note: 'test' });
  await patch(owner, c3.orderId, { action: 'discount', type: 'amount', value: 50 });
  const fbOrder = c1.orderId;
  await cust.req('POST', `/api/orders/${fbOrder}/feedback`, { rating: 4, comment: 'Good' });
  r = await owner.req('POST', '/api/admin/backups');
  const bp = r.json.backup;
  r = await owner.raw('GET', `/api/admin/backups/${bp.id}`);
  const full = JSON.parse(zlib.gunzipSync(Buffer.from(await r.arrayBuffer())).toString());
  const rep = buildReport(full, { period: 'day', date: today });
  const live = (await owner.req('GET', `/api/admin/closing?date=${today}`)).json.report;
  const same = (k, a, b) => check(`today in the backup = live closing report: ${k}`, Math.abs(a - b) < 0.005, `${a} vs ${b}`);
  same('orders received', rep.summary.received, live.received);
  same('completed', rep.summary.completed, live.completed);
  same('cancelled / rejected', rep.summary.cancelled, live.cancelled);
  same('pickup', rep.summary.pickup, live.pickup);
  same('delivery', rep.summary.delivery, live.delivery);
  same('cash-on-delivery orders', rep.summary.codOrders, live.cod_orders);
  same('sales (gross)', rep.summary.gross, live.gross);
  same('discounts', rep.summary.discounts, live.discounts);
  same('bank transfers verified', rep.summary.bankVerified, live.bank_verified);
  same('COD collected', rep.summary.codCollected, live.cod_collected);
  same('total collected', rep.summary.collected, live.collected);
  same('pending payments', rep.summary.pendingPayments, live.pending_payments);
  same('outstanding COD', rep.summary.outstandingCod, live.outstanding_cod);
  const top = (rows) => JSON.stringify(rows.map((x) => [x.title, x.qty]).sort());
  check('today in the backup = live closing report: best sellers (item and quantity)', top(rep.bestSellers) === top(live.bestSellers), `${top(rep.bestSellers)} vs ${top(live.bestSellers)}`);
  const an = (await owner.req('GET', `/api/admin/analytics?from=${today}&to=${today}`)).json;
  const cats = (rows) => JSON.stringify(rows.map((x) => [x.category ?? x.title, x.qty, Math.round(x.revenue)]).sort());
  check('today in the backup = live analytics: category sales', cats(rep.categories) === cats(an.categories), `${cats(rep.categories)} vs ${cats(an.categories)}`);
  check('feedback of today\'s orders is in the backup report', rep.feedback.count >= 1 && rep.feedback.comments.some((c) => c.comment === 'Good'));
  const wk = buildReport(full, { period: 'week', date: today });
  check('the week and month reports contain today and add up', wk.summary.received >= rep.summary.received && wk.byDay.reduce((a, d) => a + d.sales, 0) === wk.summary.gross && buildReport(full, { period: 'month', date: today }).summary.received >= wk.summary.received);

  // =====================================================================================================
  console.log('\n--- how full is the plan ---');
  r = await owner.req('GET', '/api/admin/storage?fresh=1');
  const u0 = r.json?.usage;
  check('owner sees the usage: database size and limits', r.status === 200 && u0.database.bytes > 0 && u0.database.limitMb === Number(origStorage?.db_limit_mb ?? 500) && typeof u0.database.percent === 'number', r.text.slice(0, 200));
  r = await admin.req('GET', '/api/admin/storage');
  check('admin sees it too', r.status === 200 && !!r.json.usage);
  for (const [who, c] of [['kitchen', kitchen], ['rider', rider], ['customer', cust], ['anonymous', anon]]) { r = await c.req('GET', '/api/admin/storage'); check(`${who} cannot see storage usage`, r.status === 403, `${r.status}`); }

  if (MODE === 'disk') {
    const sizes = ['proofs', 'products', 'backups'].flatMap((d) => (fs.existsSync(path.join(STORAGE_DIR, d)) ? fs.readdirSync(path.join(STORAGE_DIR, d)).map((f) => fs.statSync(path.join(STORAGE_DIR, d, f)).size) : []));
    const u = (await owner.req('GET', '/api/admin/storage?fresh=1')).json.usage;
    check('disk mode: file usage is the sum of the files on disk, with a backups line', u.files.source === 'disk' && u.files.totalBytes === sizes.reduce((a, b) => a + b, 0) && u.files.folders.find((f) => f.key === 'backups').count === backupFiles().length, JSON.stringify(u.files));
  } else {
    check('this test database has no Supabase storage schema yet (so the API path is tested first)', !hadStorageSchema);
    const u = (await owner.req('GET', '/api/admin/storage?fresh=1')).json.usage;
    const bkBytes = [...objects].filter(([k]) => k.startsWith('hbt-files-backups/')).reduce((a, [, o]) => a + o.data.length, 0);
    const bk = u.files.folders.find((f) => f.key === 'backups');
    check('without storage.objects the meter adds up this app\'s buckets through the API (and says it is partial)', u.files.source === 'supabase-api' && u.files.partial === true && bk.count === backupFiles().length && bk.bytes === bkBytes && u.files.totalBytes >= bkBytes, JSON.stringify(u.files));
    // now a fake storage.objects like Supabase's, with another bucket in it too
    await sql`create schema if not exists storage`;
    await sql`create table storage.objects (bucket_id text, name text, metadata jsonb)`;
    createdFake = true;
    await sql`insert into storage.objects values ('hbt-files-backups', 'hbt-backup-x.json.gz', ${sql.json({ size: 2000 })}), ('hbt-files-backups', 'hbt-backup-y.json.gz', ${sql.json({ size: 3000 })}), ('hbt-files', 'proofs/a.png', ${sql.json({ size: 1000 })}), ('hbt-files', 'products/b.png', ${sql.json({ size: 4000 })}), ('avatars', 'x/y.png', ${sql.json({ size: 5000 })})`;
    const v = (await owner.req('GET', '/api/admin/storage?fresh=1')).json.usage;
    const f = (k) => v.files.folders.find((x) => x.key === k);
    check('with storage.objects the meter counts the whole project\'s storage, like the plan does', v.files.source === 'supabase' && v.files.partial === false && v.files.totalBytes === 15000 && f('backups').count === 2 && f('backups').bytes === 5000 && f('proofs').bytes === 1000 && f('products').bytes === 4000 && f('other').bytes === 5000, JSON.stringify(v.files));
    await sql`drop table storage.objects`;
    if (!hadStorageSchema) await sql`drop schema storage`;
    createdFake = false;
  }

  // ---- settings
  console.log('\n--- storage limits & alert settings ---');
  const put = (c, value) => c.req('PUT', '/api/admin/settings', { key: 'storage', value });
  r = await owner.req('GET', '/api/admin/settings');
  check('settings include the storage section with sensible defaults', r.status === 200 && r.json.settings.storage.warn_percent >= 50 && typeof r.json.settings.storage.alerts === 'boolean', JSON.stringify(r.json.settings?.storage));
  for (const [label, v] of [['a warning below 50%', { db_limit_mb: 500, files_limit_mb: 1024, warn_percent: 49, alerts: true }], ['a warning above 95%', { db_limit_mb: 500, files_limit_mb: 1024, warn_percent: 96, alerts: true }], ['a limit under 50 MB', { db_limit_mb: 10, files_limit_mb: 1024, warn_percent: 80, alerts: true }], ['alerts that are not on/off', { db_limit_mb: 500, files_limit_mb: 1024, warn_percent: 80, alerts: 'yes' }], ['nonsense', { db_limit_mb: 'lots' }]]) {
    r = await put(admin, v); check(`${label} is refused (400)`, r.status === 400, `${r.status} ${r.text}`);
  }
  r = await put(kitchen, { db_limit_mb: 500, files_limit_mb: 1024, warn_percent: 80, alerts: true });
  check('kitchen cannot change the limits', r.status === 403);
  r = await put(admin, { db_limit_mb: '600', files_limit_mb: 2048, warn_percent: '75', alerts: false });
  const saved = await keep('storage');
  check('admin can save limits and the warning percentage', r.status === 200 && Number(saved.db_limit_mb) === 600 && Number(saved.files_limit_mb) === 2048 && Number(saved.warn_percent) === 75 && saved.alerts === false, JSON.stringify(saved));
  r = await owner.req('PUT', '/api/admin/settings', { key: 'storage_alert', value: { level: 0 } });
  check('the alert memory row cannot be edited through the settings API', r.status === 400);

  // ---- warning emails
  console.log('\n--- warning emails to owner and admin ---');
  const mails = (e) => sink.mailsTo(e).filter((m) => /storage/i.test(subjectOf(m)));
  const recipients = async () => (await sql`select count(*)::int n from profiles where is_active and role in ('owner', 'admin')`)[0].n;
  const counts = () => ({ o: mails(OWNER).length, a: mails(adminEmail).length, k: sink.mailsTo(kitchenEmail).length, r: sink.mailsTo(riderEmail).length });
  const resetMemory = () => sql`delete from shop_settings where key = 'storage_alert'`;
  const check_ = () => owner.req('GET', '/api/admin/storage?fresh=1');
  // limit that makes the database about `pct` percent full right now
  const limitFor = async (pct) => Math.round(((await dbMB()) / (pct / 100)) * 100) / 100;

  await setStorageSettings({ db_limit_mb: 1 }); await resetMemory();
  let c0 = counts();
  r = await check_();
  check('far over the limit: the level is critical (3)', r.json.usage.level === 3 && r.json.usage.database.level === 3 && r.json.usage.files.level === 0, JSON.stringify(r.json.usage.database));
  await sleep(300);
  let c1_ = counts();
  check('one email to the owner and one to the admin', c1_.o === c0.o + 1 && c1_.a === c0.a + 1, JSON.stringify([c0, c1_]));
  const mailText = decodeMail(sink.mailsTo(OWNER).at(-1));
  check('the email says URGENT with the percentage, the numbers, what to do and a link to the page', /Subject: URGENT: shop storage is \d+% full/.test(mailText) && /Database \(orders, customers, menu\)/.test(mailText) && /Storage & Backups/.test(mailText) && mailText.includes(`${BASE}/admin/storage`), mailText.slice(0, 600));
  check('kitchen, rider and customers get nothing', c1_.k === c0.k && c1_.r === c0.r);
  await check_(); await check_(); await sleep(200);
  check('checking again at the same level does not email again', counts().o === c1_.o && counts().a === c1_.a);
  const [mem] = await sql`select value from shop_settings where key = 'storage_alert'`;
  check('the warning is remembered (level 3, time sent)', mem.value.level === 3 && !!mem.value.sent_at, JSON.stringify(mem));
  const [al] = await sql`select action, after from audit_logs where action = 'storage.alert' order by created_at desc limit 1`;
  check('and recorded in the audit log, with how many people were emailed', al?.after?.level === 3 && al.after.emailed === (await recipients()) && al.after.emailed >= 2, JSON.stringify(al));

  await resetMemory(); c0 = counts();
  await Promise.all([1, 2, 3, 4, 5, 6].map(() => check_()));
  await sleep(500);
  check('six screens checking at the same instant still send exactly one email each', counts().o === c0.o + 1 && counts().a === c0.a + 1, JSON.stringify([c0, counts()]));

  await sql`update shop_settings set value = ${sql.json({ level: 3, sent_at: new Date(Date.now() - 8 * 86400000).toISOString() })} where key = 'storage_alert'`;
  c0 = counts(); await check_(); await sleep(300);
  check('still full after a week: a reminder is sent', counts().o === c0.o + 1 && counts().a === c0.a + 1);
  await sql`update shop_settings set value = ${sql.json({ level: 3, sent_at: new Date(Date.now() - 2 * 86400000).toISOString() })} where key = 'storage_alert'`;
  c0 = counts(); await check_(); await sleep(200);
  check('...but not after only two days', counts().o === c0.o);

  // climbing: 85% -> 92.5% -> 97%
  await resetMemory();
  await setStorageSettings({ db_limit_mb: await limitFor(85) }); c0 = counts();
  r = await check_(); await sleep(300);
  check('about 85% full: first warning (level 1, "action needed soon")', r.json.usage.level === 1 && counts().o === c0.o + 1 && /action needed soon/.test(subjectOf(sink.mailsTo(OWNER).at(-1))), `${r.json.usage.level} ${subjectOf(sink.mailsTo(OWNER).at(-1))}`);
  await setStorageSettings({ db_limit_mb: await limitFor(92.5) }); c0 = counts();
  r = await check_(); await sleep(300);
  check('about 92% full: a stronger warning (level 2, "act now")', r.json.usage.level === 2 && counts().o === c0.o + 1 && /act now/.test(subjectOf(sink.mailsTo(OWNER).at(-1))), `${r.json.usage.level} ${subjectOf(sink.mailsTo(OWNER).at(-1))}`);
  await setStorageSettings({ db_limit_mb: await limitFor(97) }); c0 = counts();
  r = await check_(); await sleep(300);
  check('about 97% full: urgent (level 3)', r.json.usage.level === 3 && counts().o === c0.o + 1 && /^URGENT/.test(subjectOf(sink.mailsTo(OWNER).at(-1))), `${r.json.usage.level}`);

  await setStorageSettings({ db_limit_mb: await limitFor(85) }); c0 = counts();
  r = await check_(); await sleep(200);
  const [mem2] = await sql`select value from shop_settings where key = 'storage_alert'`;
  check('easing from 97% to 85% sends nothing, but remembers level 1 so a new climb warns again', r.json.usage.level === 1 && counts().o === c0.o && mem2.value.level === 1, JSON.stringify(mem2));
  await setStorageSettings({ db_limit_mb: 100000 }); c0 = counts();
  r = await check_();
  const [mem3] = await sql`select value from shop_settings where key = 'storage_alert'`;
  check('back under the warning: level 0, no email, memory reset', r.json.usage.level === 0 && counts().o === c0.o && mem3.value.level === 0, JSON.stringify(mem3));
  await setStorageSettings({ db_limit_mb: 1 }); c0 = counts(); await check_(); await sleep(300);
  check('and when it fills up again it warns again', counts().o === c0.o + 1);

  await setStorageSettings({ db_limit_mb: 1, alerts: false }); await resetMemory(); c0 = counts();
  r = await check_(); await sleep(200);
  check('alerts switched off: the meter still shows the level but no email goes out', r.json.usage.level === 3 && r.json.usage.alerts === false && counts().o === c0.o);
  await setStorageSettings({ db_limit_mb: 1, alerts: true });
  await check_(); await sleep(300);
  check('switching them on sends the warning at the next check', counts().o === c0.o + 1);

  if (process.env.CRON_SECRET) {
    await resetMemory(); c0 = counts();
    r = await anon.req('GET', '/api/cron/backup', null, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    await sleep(400);
    check('the scheduled-backup URL also runs the storage check (and sends the warning)', r.status === 200 && counts().o === c0.o + 1, `${r.status} ${r.text}`);
  }
  await setStorageSettings({});

  // =====================================================================================================
  console.log('\n--- deleting payment screenshots ---');
  const statsAt = async (d = 0) => (await admin.req('GET', `/api/admin/storage/proofs?days=${d}`)).json;
  for (const [who, c] of [['kitchen', kitchen], ['rider', rider], ['customer', cust], ['anonymous', anon]]) {
    r = await c.req('GET', '/api/admin/storage/proofs'); check(`${who} cannot see screenshot stats`, r.status === 403, `${r.status}`);
    r = await c.req('POST', '/api/admin/storage/proofs', { days: 0 }); check(`${who} cannot bulk-delete screenshots`, r.status === 403, `${r.status}`);
  }
  r = await admin.req('GET', '/api/admin/storage/proofs?days=-1'); check('a bad age is refused (400)', r.status === 400);
  r = await admin.req('POST', '/api/admin/storage/proofs', { days: 'x' }); check('a bad bulk request is refused (400)', r.status === 400);

  // one order with TWO screenshots: reject the first, customer sends a second
  const base0 = await statsAt(0);
  const o1 = await placeOrder();
  const f1 = await upload(), f2 = await upload();
  check('both uploads are in storage', proofExists(f1) && proofExists(f2));
  r = await submit(o1.orderId, f1);
  check('customer submits the first screenshot', r.status === 200, r.text);
  for (const [who, c] of [['kitchen', kitchen], ['rider', rider], ['customer', cust], ['anonymous', anon]]) {
    r = await patch(c, o1.orderId, { action: 'deleteProof' }); check(`${who} cannot delete a screenshot`, r.status === 403, `${r.status}`);
  }
  r = await patch(admin, o1.orderId, { action: 'deleteProof' });
  check('a screenshot waiting for the payment check cannot be deleted (409, clear message)', r.status === 409 && /Verify or reject/.test(r.json?.error || '') && proofExists(f1), r.text);
  let st = await statsAt(0);
  check('the stats count it as waiting for review, not deletable', st.waitingForReview === base0.waitingForReview + 1 && st.removable === base0.removable, JSON.stringify([base0, st]));
  r = await patch(admin, o1.orderId, { action: 'payment', decision: 'reject', notes: 'blurry' });
  check('admin rejects the payment', r.status === 200, r.text);
  r = await submit(o1.orderId, f2);
  check('customer sends a second screenshot', r.status === 200, r.text);
  r = await patch(admin, o1.orderId, { action: 'payment', decision: 'verify' });
  check('admin verifies the payment', r.status === 200, r.text);
  check('the order now points to the second screenshot and keeps the first in its payment history', (await row(o1.orderId)).payment_proof_url === f2 && JSON.stringify(await subProofs(o1.orderId)) === JSON.stringify([f1, f2]), JSON.stringify(await subProofs(o1.orderId)));
  r = await patch(admin, o1.orderId, { action: 'deleteProof' });
  check('now admin can delete: both pictures are removed (200)', r.status === 200 && r.json.deleted === 2, r.text);
  check('both files are gone from storage', !proofExists(f1) && !proofExists(f2));
  check('the order and its payment record stay; only the picture links are cleared', (await row(o1.orderId)).payment_proof_url === null && (await subProofs(o1.orderId)).every((x) => x === null) && (await row(o1.orderId)).payment_status === 'verified' && (await sql`select count(*)::int n from payment_submissions where order_id = ${o1.orderId}`)[0].n === 2);
  const [h] = await sql`select note, changed_by from order_status_history where order_id = ${o1.orderId} and note = 'Payment screenshot deleted'`;
  const [pa] = await sql`select actor_email from audit_logs where action = 'proof.delete' and entity_id = (select order_number from orders where id = ${o1.orderId})`;
  check('it is written in the order history and the audit log', !!h && pa?.actor_email === adminEmail);
  r = await patch(admin, o1.orderId, { action: 'deleteProof' });
  check('deleting again says there is nothing to delete (409)', r.status === 409 && /no payment screenshot/i.test(r.json?.error || ''));
  r = await cust.req('GET', `/api/orders/${o1.orderId}`);
  check('the customer\'s order no longer shows a screenshot', r.status === 200 && r.json.order.hasProof === false && !r.json.order.paymentProofUrl);
  r = await admin.req('GET', `/api/admin/orders/${o1.orderId}`);
  check('the admin order view has no screenshot either', r.json.order.paymentProofUrl === null && r.json.order.payments.every((p) => !p.proofImageUrl));
  r = await cust.req('GET', `/api/files/proof/${f1}`);
  check('the old picture link now gives 404', r.status === 404);

  if (MODE === 'supabase') {
    const o2 = await placeOrder(); const f3 = await upload();
    await submit(o2.orderId, f3); await patch(admin, o2.orderId, { action: 'payment', decision: 'verify' });
    mockMode = 'down';
    r = await patch(admin, o2.orderId, { action: 'deleteProof' });
    mockMode = 'ok';
    check('if storage is unreachable nothing is changed and the admin is told to retry (502)', r.status === 502 && /Nothing was changed/.test(r.json?.error || '') && (await row(o2.orderId)).payment_proof_url === f3 && proofExists(f3), `${r.status} ${r.text}`);
    r = await patch(admin, o2.orderId, { action: 'deleteProof' });
    check('and it works on retry', r.status === 200 && !proofExists(f3));
  }

  // bulk: one verified, one cancelled by the customer, one still waiting
  const b0 = await statsAt(0), b7 = await statsAt(7);
  const ob = [await placeOrder(), await placeOrder(), await placeOrder()];
  const fb = [await upload(), await upload(), await upload()];
  for (let i = 0; i < 3; i++) { r = await submit(ob[i].orderId, fb[i]); if (r.status !== 200) throw new Error(r.text); }
  await patch(admin, ob[0].orderId, { action: 'payment', decision: 'verify' });
  r = await cust.req('POST', `/api/orders/${ob[1].orderId}/cancel`, {});
  check('(setup) one verified, one cancelled by the customer, one waiting', r.status === 200 && (await row(ob[1].orderId)).status === 'Cancelled' && (await row(ob[2].orderId)).payment_status === 'submitted', r.text);
  st = await statsAt(0);
  check('stats: two more can be deleted, one more is waiting', st.removable === b0.removable + 2 && st.waitingForReview === b0.waitingForReview + 1, JSON.stringify([b0, st]));
  st = await statsAt(7);
  check('stats "older than 7 days" leave today\'s orders out', st.removable === b7.removable, JSON.stringify([b7, st]));
  r = await admin.req('POST', '/api/admin/storage/proofs', { days: 7 });
  check('deleting "older than 7 days" does not touch today\'s orders', r.status === 200 && proofExists(fb[0]) && proofExists(fb[1]), r.text);
  let total = 0; let rem = 1;
  for (let i = 0; i < 20 && rem; i++) { r = await admin.req('POST', '/api/admin/storage/proofs', { days: 0 }); if (r.status !== 200) break; total += r.json.cleaned; rem = r.json.remaining; }
  check('bulk delete works through the batches until none are left (200)', r.status === 200 && rem === 0 && total >= 2, `${r.status} ${r.text} total=${total}`);
  check('the verified and the cancelled order lost their pictures', !proofExists(fb[0]) && !proofExists(fb[1]) && (await row(ob[0].orderId)).payment_proof_url === null && (await row(ob[1].orderId)).payment_proof_url === null);
  check('the order waiting for a payment check kept its picture', proofExists(fb[2]) && (await row(ob[2].orderId)).payment_proof_url === fb[2]);
  st = await statsAt(0);
  check('afterwards nothing deletable is left, and the waiting one is still counted', st.removable === 0 && st.waitingForReview >= 1, JSON.stringify(st));
  const [bulkAudit] = await sql`select actor_email, after from audit_logs where action = 'proof.bulk_delete' order by created_at desc limit 1`;
  check('the bulk delete is in the audit log', bulkAudit?.actor_email === adminEmail && bulkAudit.after.orders >= 1);
  r = await admin.req('POST', '/api/admin/storage/proofs', { days: 0 });
  check('running it again is harmless (nothing to do)', r.status === 200 && r.json.cleaned === 0 && r.json.remaining === 0);
  // the waiting order can still be handled normally afterwards
  r = await patch(admin, ob[2].orderId, { action: 'payment', decision: 'verify' });
  check('the waiting order can still be verified, and then its screenshot deleted', r.status === 200 && (await patch(admin, ob[2].orderId, { action: 'deleteProof' })).status === 200 && !proofExists(fb[2]));

  // =====================================================================================================
  console.log('\n--- the page itself ---');
  for (const [who, c, want] of [['owner', owner, 200], ['admin', admin, 200]]) { r = await c.raw('GET', '/admin/storage', null, { redirect: 'manual' }); check(`${who} gets the Storage & Backups page`, r.status === want, `${r.status}`); }
  r = await kitchen.raw('GET', '/admin/storage', null, { redirect: 'manual' });
  check('kitchen is sent to the kitchen screen', [307, 308].includes(r.status) && /\/admin\/kitchen/.test(r.headers.get('location') || ''), `${r.status} ${r.headers.get('location')}`);
  r = await rider.raw('GET', '/admin/storage', null, { redirect: 'manual' });
  const riderBody = await r.text();
  check('a rider never gets the page: they are sent to the deliveries screen', ([307, 308].includes(r.status) && /\/admin\/rider/.test(r.headers.get('location') || '')) || (!riderBody.includes('How full is the plan?') && /\/admin\/rider/.test(riderBody)), `${r.status} ${r.headers.get('location')} ${riderBody.length}`);
  r = await anon.raw('GET', '/admin/storage', null, { redirect: 'manual' });
  check('someone signed out is sent to the staff sign-in', [307, 308].includes(r.status) && /\/admin\/login/.test(r.headers.get('location') || ''), `${r.status} ${r.headers.get('location')}`);
} finally {
  if (createdFake) { await sql`drop table if exists storage.objects`.catch(() => {}); if (!hadStorageSchema) await sql`drop schema if exists storage`.catch(() => {}); }
  await restoreKey('backup', origBackup); await restoreKey('storage', origStorage); await restoreKey('storage_alert', origAlert); await restoreKey('payment', origPay);
  await sql`update profiles set is_active = false where email in (${adminEmail}, ${kitchenEmail}, ${riderEmail})`;
}
console.log(`\n${pass} passed, ${fail} failed`);
sink.close();
mock.close();
sql.end().finally(() => process.exit(fail ? 1 : 0));
