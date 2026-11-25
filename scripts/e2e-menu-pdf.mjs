// E2E for the menu PDF: generated content, publishing an uploaded PDF, permissions, validation and fallback.
// LOCAL ONLY (it changes menu data and restores it). Run once per MODE against an app started to match:
//   MODE=disk      app without a Supabase key; give this script the app's STORAGE_DIR
//   MODE=supabase  app with SUPABASE_SERVICE_ROLE_KEY=test-key SUPABASE_URL=http://127.0.0.1:2727 (mock runs here)
// The app needs SMTP_HOST=127.0.0.1 SMTP_PORT=2525 (this script runs the mail sink).
//   MODE=disk BASE=http://localhost:3100 STORAGE_DIR=... DATABASE_URL=postgresql://...localhost... node scripts/e2e-menu-pdf.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import postgres from 'postgres';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { startMailSink } from './mail-sink.mjs';

const BASE = process.env.BASE || 'http://localhost:3100';
const MODE = process.env.MODE || 'disk';
const OWNER = process.env.E2E_OWNER || 'owner@example.com';
if (!/\/\/(localhost|127\.0\.0\.1)/.test(BASE) || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  throw new Error('Refusing to run: BASE and DATABASE_URL must both be local.');
}
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const sink = await startMailSink(2525);
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`); };

// ---------- mock of the Supabase Storage REST API (only what the menu PDF uses) ----------
const objects = new Map();
const buckets = {};
const mock = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let body = Buffer.concat(chunks);
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname).replace('/storage/v1', '');
    const cors = { 'Access-Control-Allow-Origin': '*' };
    const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json', ...cors }); res.end(JSON.stringify(o)); };
    const file = (key) => { const o = objects.get(key); if (!o) return json(404, { statusCode: '404', error: 'not_found', message: 'Object not found' }); res.writeHead(200, { 'Content-Type': 'application/pdf', ...cors }); res.end(o); };
    const unwrap = () => {
      const ct = String(req.headers['content-type'] || '');
      if (!ct.startsWith('multipart/form-data')) return body;
      const boundary = '--' + ct.split('boundary=')[1];
      const part = body.toString('latin1').split(boundary).find((s) => /filename=/.test(s)) || '';
      return Buffer.from(part.slice(part.indexOf('\r\n\r\n') + 4, part.length - 2), 'latin1');
    };
    // links that work without a key
    let m = p.match(/^\/object\/upload\/sign\/(.+)$/);
    if (m && req.method === 'PUT') { if (url.searchParams.get('token') !== 'up-token') return json(403, { message: 'bad token' }); objects.set(m[1], unwrap()); return json(200, { Key: m[1] }); }
    if (req.method === 'OPTIONS') { res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'PUT', 'Access-Control-Allow-Headers': 'content-type' }); return res.end(); }
    m = p.match(/^\/object\/sign\/(.+)$/);
    if (m && req.method === 'GET') return url.searchParams.get('token') === 'dl-token' ? file(m[1]) : json(403, { message: 'bad token' });
    if (req.headers.authorization !== 'Bearer test-key') return json(401, { statusCode: '403', message: 'Invalid key' });
    if (req.method === 'POST' && p === '/bucket') {
      const b = JSON.parse(body.toString() || '{}');
      if (buckets[b.id]) return json(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      buckets[b.id] = b; return json(200, { name: b.id });
    }
    m = p.match(/^\/object\/upload\/sign\/(.+)$/);
    if (m && req.method === 'POST') return json(200, { url: `/object/upload/sign/${m[1]}?token=up-token` });
    m = p.match(/^\/object\/sign\/(.+)$/);
    if (m && req.method === 'POST') return objects.has(m[1]) ? json(200, { signedURL: `/object/sign/${m[1]}?token=dl-token` }) : json(404, { statusCode: '404', message: 'Object not found' });
    m = p.match(/^\/object\/([^/]+)$/);
    if (m && req.method === 'DELETE') { for (const k of JSON.parse(body.toString()).prefixes || []) objects.delete(`${m[1]}/${k}`); return json(200, []); }
    m = p.match(/^\/object\/(?:authenticated\/)?([^/]+\/.+)$/);
    if (m && req.method === 'POST') { if (objects.has(m[1])) return json(400, { statusCode: '409', message: 'exists' }); objects.set(m[1], unwrap()); return json(200, { Key: m[1] }); }
    if (m && req.method === 'GET') return file(m[1]);
    json(404, { statusCode: '404', message: 'unknown route ' + req.method + ' ' + p });
  });
});
if (MODE === 'supabase') await new Promise((r) => mock.listen(2727, '127.0.0.1', r));
const MENU_BUCKET = `${process.env.SUPABASE_STORAGE_BUCKET || 'hbt-files'}-menu`;
const storedNames = () => (MODE === 'supabase'
  ? [...objects.keys()].filter((k) => k.startsWith(`${MENU_BUCKET}/`)).map((k) => k.split('/')[1])
  : fs.existsSync(path.join(process.env.STORAGE_DIR, 'menu-pdf')) ? fs.readdirSync(path.join(process.env.STORAGE_DIR, 'menu-pdf')) : []);
const removeStored = (name) => (MODE === 'supabase' ? objects.delete(`${MENU_BUCKET}/${name}`) : fs.unlinkSync(path.join(process.env.STORAGE_DIR, 'menu-pdf', name)));

// ---------- HTTP client ----------
class Client {
  jar = {};
  async req(method, p, body, { origin = BASE, redirect = 'manual', headers = {} } = {}) {
    const form = body instanceof FormData;
    const res = await fetch(p.startsWith('http') ? p : BASE + p, {
      method, redirect,
      headers: { ...(body && !form ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}), Cookie: Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '), ...headers },
      body: body ? (form ? body : JSON.stringify(body)) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v === '') delete this.jar[k]; else this.jar[k] = v; }
    const type = res.headers.get('content-type') || '';
    const buf = Buffer.from(await res.arrayBuffer());
    let json = null; if (type.includes('json')) { try { json = JSON.parse(buf.toString()); } catch {} }
    return { status: res.status, headers: res.headers, buf, json };
  }
}

async function textOf(buf) {
  const doc = await getDocument({ data: new Uint8Array(buf) }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) out += ' ' + (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ');
  return { pages: doc.numPages, text: out.replace(/\s+/g, ' ') };
}

const anon = new Client(), owner = new Client();
const download = () => anon.req('GET', '/api/menu/pdf', null, { origin: null, redirect: 'follow' });
const autoText = async () => textOf((await download()).buf);

await sql`delete from rate_limits where key like 'menupdf:%' or key like 'otp%' or key like 'staffotp%'`;
// Files already in storage before this run (a developer's own uploads) are neither counted nor removed.
const existing = new Set(storedNames());
const mine = () => storedNames().filter((n) => !existing.has(n));
const [savedState] = await sql`select value from shop_settings where key = 'menu_pdf'`;
const [savedShop] = await sql`select value from shop_settings where key = 'shop'`;
await sql`delete from shop_settings where key = 'menu_pdf'`;

async function signIn(client, email) {
  const seen = sink.count();
  await sql`delete from otp_codes where email = ${'staff:' + email}`;
  let r = await client.req('POST', '/api/auth/staff/otp/request', { email });
  if (r.status !== 200) throw new Error(`code request for ${email}: ${r.status} ${r.json?.error}`);
  r = await client.req('POST', '/api/auth/staff/otp/verify', { email, code: await sink.codeFor(email, seen) });
  if (r.status !== 200) throw new Error(`sign in ${email}: ${r.status} ${r.json?.error}`);
}
await signIn(owner, OWNER);

const counts = async () => JSON.stringify(await sql`select (select count(*) from products) p, (select count(*) from categories) c, (select count(*) from deals) d, (select md5(string_agg(id::text || price::text || coalesce(name,''), ',' order by id)) from products) h`);
const stamp = Date.now();
const cleanup = [];

try {
  // ---------- 1. the automatic menu ----------
  let r = await download();
  check('anyone can download the menu', r.status === 200 && r.buf.subarray(0, 5).toString() === '%PDF-', `${r.status} ${r.json?.error}`);
  check('it is generated automatically by default', r.headers.get('x-menu-source') === 'auto');
  check('never cached', /no-store/.test(r.headers.get('cache-control')), r.headers.get('cache-control'));
  check('downloads as a named file', /^attachment; filename="[\w-]+-Menu-\d{4}-\d\d-\d\d\.pdf"$/.test(r.headers.get('content-disposition') || ''), r.headers.get('content-disposition'));
  const menu = (await anon.req('GET', '/api/menu')).json;
  const live = menu.products.filter((p) => p.available);
  let doc = await textOf(r.buf);
  const absent = live.filter((p) => !doc.text.includes(p.name.replace(/\s+/g, ' ').trim()));
  check('every available item on the website is in the PDF', absent.length === 0, absent.slice(0, 3).map((p) => p.name).join(', '));
  check('restaurant details and website are printed', doc.text.includes(savedShop?.value.name || 'Haq Bahu') && /Page 1 of \d/.test(doc.text) && doc.text.includes('Generated'));

  const old = await anon.req('GET', '/Haq-Bahu-MENU.pdf', null, { origin: null });
  check('the old menu file address leads to the published menu', [307, 308].includes(old.status) && old.headers.get('location')?.endsWith('/api/menu/pdf'), `${old.status} ${old.headers.get('location')}`);

  // ---------- 2. admin changes show in the next download ----------
  const category = (await owner.req('POST', '/api/admin/categories', { name: `E2E Section ${stamp}` })).json.category;
  cleanup.push(() => sql`delete from categories where id = ${category.id}`);
  const created = (await owner.req('POST', '/api/admin/products', { name: `E2E Naan ${stamp}`, price: 321, categoryId: category.id, description: 'fresh test item' })).json.product;
  cleanup.unshift(() => sql`delete from products where id = ${created.id}`);
  doc = await autoText();
  check('a new item appears with its price', doc.text.includes(`E2E Naan ${stamp}`) && doc.text.includes('Rs. 321'));
  const patch = (body) => owner.req('PATCH', `/api/admin/products/${created.id}`, body);
  await patch({ price: 345, compareAtPrice: 400 });
  doc = await autoText();
  check('a price change appears, with the original price', doc.text.includes('Rs. 345') && doc.text.includes('Rs. 400') && !doc.text.includes('Rs. 321'));
  check('the website API shows the same price', (await anon.req('GET', '/api/menu')).json.products.find((p) => p.id === created.id)?.price === 345);
  for (const [label, off, on] of [['unavailable', { isAvailable: false }, { isAvailable: true }], ['sold out', { isSoldOut: true }, { isSoldOut: false }], ['unavailable until later', { unavailableUntil: new Date(Date.now() + 3600e3).toISOString() }, { unavailableUntil: null }]]) {
    await patch(off);
    check(`an item marked ${label} is left out`, !(await autoText()).text.includes(`E2E Naan ${stamp}`));
    await patch(on);
  }
  await owner.req('PATCH', `/api/admin/categories/${category.id}`, { isActive: false });
  doc = await autoText();
  check('a hidden category and its items are left out', !doc.text.includes(`E2E Section ${stamp}`) && !doc.text.includes(`E2E Naan ${stamp}`));
  await owner.req('PATCH', `/api/admin/categories/${category.id}`, { isActive: true, isPaused: true });
  check('a paused category is left out', !(await autoText()).text.includes(`E2E Naan ${stamp}`));
  await owner.req('PATCH', `/api/admin/categories/${category.id}`, { isPaused: false });

  // ---------- 3. deals ----------
  const dealRes = await owner.req('POST', '/api/admin/deals', { title: `E2E Deal ${stamp}`, price: 600, items: [{ productId: created.id, quantity: 2 }], badge: 'Test' });
  const deal = dealRes.json.deal;
  cleanup.unshift(async () => { await sql`delete from deal_items where deal_id = ${deal.id}`; await sql`delete from deals where id = ${deal.id}`; });
  doc = await autoText();
  check('an active deal is featured with its price and the original value', doc.text.includes(`E2E Deal ${stamp}`) && doc.text.includes('Rs. 600') && doc.text.includes('Rs. 690'), dealRes.json.error);
  const dealPatch = (body) => owner.req('PATCH', `/api/admin/deals/${deal.id}`, body);
  const hour = 3600e3;
  await dealPatch({ endsAt: new Date(Date.now() - hour).toISOString(), startsAt: new Date(Date.now() - 2 * hour).toISOString() });
  check('an expired deal is left out', !(await autoText()).text.includes(`E2E Deal ${stamp}`));
  await dealPatch({ startsAt: new Date(Date.now() + hour).toISOString(), endsAt: new Date(Date.now() + 2 * hour).toISOString() });
  check('a deal that has not started is left out', !(await autoText()).text.includes(`E2E Deal ${stamp}`));
  await dealPatch({ startsAt: null, endsAt: null, isActive: false });
  check('a switched-off deal is left out', !(await autoText()).text.includes(`E2E Deal ${stamp}`));

  // ---------- 4. optional details and long menus ----------
  const putShop = (value) => owner.req('PUT', '/api/admin/settings', { key: 'shop', value });
  const shop = (await owner.req('GET', '/api/admin/settings')).json.settings.shop;
  let put = await putShop({ ...shop, whatsapp: '923001234567', tagline: `Tagline ${stamp}`, phone: '', address: '' });
  doc = await autoText();
  // The tagline is letter-spaced, so the PDF text comes back with a space between letters.
  check('the tagline from Shop Settings is printed', put.status === 200 && doc.text.replace(/\s/g, '').toLowerCase().includes(`tagline${stamp}`), `${put.status} ${put.json?.error}`);
  check('missing phone and address are simply left out', !/Address/i.test(doc.text) && !doc.text.includes('undefined'));
  await sql`update shop_settings set value = ${sql.json(savedShop.value)} where key = 'shop'`;

  const many = await sql`insert into products (name, price, category_id, description) select 'E2E Bulk ' || ${String(stamp)} || ' no. ' || g, 100 + g, ${category.id}, 'A long enough description to take a couple of lines in a two column menu layout, number ' || g from generate_series(1, 90) g returning id`;
  cleanup.unshift(() => sql`delete from products where name like ${'E2E Bulk ' + stamp + '%'}`);
  doc = await autoText();
  check('a long menu runs over several numbered pages', doc.pages >= 3 && doc.text.includes(`Page ${doc.pages} of ${doc.pages}`) && doc.text.includes(`no. 90`), `${doc.pages} pages`);
  await sql`delete from products where id in ${sql(many.map((x) => x.id))}`;

  // ---------- 5. permissions ----------
  const before = await counts();
  const pdf = (label, size = 0) => Buffer.concat([Buffer.from(`%PDF-1.4\n% ${label} ${stamp}\n`), Buffer.alloc(size, 0x20), Buffer.from('\n%%EOF\n')]);
  const form = (bytes, name = 'menu.pdf', activate = false, type = 'application/pdf') => { const f = new FormData(); f.append('file', new Blob([bytes], { type }), name); f.append('activate', String(activate)); return f; };
  const upload = (client, ...args) => client.req('POST', '/api/admin/menu-pdf', form(...args));
  const customer = new Client();
  for (const [who, client] of [['a visitor', anon], ['a customer', customer]]) {
    const codes = [
      (await client.req('GET', '/api/admin/menu-pdf')).status,
      (await upload(client, pdf('x'), 'menu.pdf', true)).status,
      (await client.req('PATCH', '/api/admin/menu-pdf', { action: 'automatic' })).status,
      (await client.req('GET', '/api/admin/menu-pdf/preview')).status,
      (await client.req('POST', '/api/admin/menu-pdf/direct', { originalName: 'a.pdf', size: 10 })).status,
    ];
    check(`${who} cannot manage menu PDFs`, codes.every((c) => c === 403), codes.join());
  }
  for (const role of ['kitchen', 'rider', 'admin']) {
    const email = `e2e-pdf-${role}-${stamp}@example.com`;
    await owner.req('POST', '/api/admin/staff', { email, role });
    cleanup.push(() => sql`delete from profiles where email = ${email}`);
    const c = new Client();
    await signIn(c, email);
    const status = (await c.req('GET', '/api/admin/menu-pdf')).status;
    const up = (await upload(c, pdf(role))).status;
    if (role === 'admin') check('an admin can upload', status === 200 && up === 200, `${status} ${up}`);
    else check(`${role} staff cannot manage menu PDFs`, status === 403 && up === 403, `${status} ${up}`);
  }
  r = await owner.req('POST', '/api/admin/menu-pdf', form(pdf('x'), 'menu.pdf', true), { origin: 'https://evil.example' });
  check('an upload from another website is refused', r.status === 403);

  // ---------- 6. upload checks ----------
  const files0 = storedNames().length;
  for (const [label, bytes, name, type] of [
    ['a picture renamed to .pdf', Buffer.from('\x89PNG\r\n\x1a\n....%%EOF'), 'menu.pdf'],
    ['a cut-off file', Buffer.from('%PDF-1.7\nhalf a menu'), 'menu.pdf'],
    ['a file over 10 MB', pdf('big', 10 * 1024 * 1024), 'menu.pdf'],
    ['a name not ending in .pdf', pdf('x'), 'menu.html'],
    ['a wrong file type', pdf('x'), 'menu.pdf', 'text/html'],
  ]) {
    r = await upload(owner, bytes, name, true, type);
    check(`${label} is refused`, r.status === 400 && typeof r.json?.error === 'string', `${r.status} ${r.json?.error}`);
  }
  check('refused uploads store nothing and change nothing', storedNames().length === files0 && (await download()).headers.get('x-menu-source') === 'auto');

  // ---------- 7. upload, preview, publish, replace, revert ----------
  const first = pdf('first');
  r = await upload(owner, first, 'Eid Menu.pdf', false);
  check('upload without publishing', r.status === 200 && r.json.source === 'auto', `${r.status} ${r.json?.error}`);
  const firstId = r.json.id;
  check('customers still get the automatic menu', (await download()).headers.get('x-menu-source') === 'auto');
  const view = await owner.req('GET', `/api/admin/menu-pdf/files/${firstId}`, null, { redirect: 'follow' });
  check('the admin can preview it', view.status === 200 && view.buf.equals(first) && /^inline/.test(view.headers.get('content-disposition') || ''));
  check('an unpublished file is not reachable by others', (await anon.req('GET', `/api/admin/menu-pdf/files/${firstId}`)).status === 403);
  r = await owner.req('PATCH', '/api/admin/menu-pdf', { action: 'activate', id: firstId });
  check('publish it', r.status === 200 && r.json.source === 'custom' && r.json.activeId === firstId);
  r = await download();
  check('customers now download exactly that file', r.status === 200 && r.buf.equals(first) && r.headers.get('x-menu-source') === 'custom' && /no-store/.test(r.headers.get('cache-control') || ''));

  const second = pdf('second');
  r = await upload(owner, second, 'menu-v2.pdf', true);
  const secondId = r.json.id;
  check('replace it with a new one', r.status === 200 && (await download()).buf.equals(second));
  await upload(owner, Buffer.from('not a pdf'), 'menu-v3.pdf', true);
  check('a failed replacement leaves the published menu in place', (await download()).buf.equals(second));
  check('the published PDF cannot be deleted', (await owner.req('DELETE', `/api/admin/menu-pdf/files/${secondId}`)).status === 409);
  r = await owner.req('PATCH', '/api/admin/menu-pdf', { action: 'automatic' });
  check('switch back to automatic', r.status === 200 && r.json.source === 'auto' && (await download()).headers.get('x-menu-source') === 'auto');
  check('the uploaded files are kept', r.json.files.some((f) => f.id === secondId) && r.json.files.some((f) => f.id === firstId));
  const countBefore = storedNames().length;
  r = await owner.req('DELETE', `/api/admin/menu-pdf/files/${firstId}`);
  check('an unpublished PDF can be deleted, file and all', r.status === 200 && !r.json.files.some((f) => f.id === firstId) && storedNames().length === countBefore - 1);
  check('publishing an unknown id is refused', (await owner.req('PATCH', '/api/admin/menu-pdf', { action: 'activate', id: firstId })).status === 404);
  check('uploading PDFs never touched the menu records', (await counts()) === before);

  // ---------- 8. version limit, missing file, audit ----------
  await owner.req('PATCH', '/api/admin/menu-pdf', { action: 'activate', id: secondId });
  for (let i = 0; i < 6; i++) await upload(owner, pdf(`v${i}`), `v${i}.pdf`, false);
  r = await owner.req('GET', '/api/admin/menu-pdf');
  check('only the latest 5 uploads are kept, plus the published one', r.json.files.length <= 6 && r.json.files.some((f) => f.id === secondId && f.active) && mine().length === r.json.files.length, `${r.json.files.length} listed, ${mine().length} stored`);
  check('storage names are not exposed', !JSON.stringify(r.json).match(/[a-f0-9-]{36}\.pdf/));
  const publicSettings = (await anon.req('GET', '/api/settings')).json;
  check('public settings say nothing about uploaded PDFs', !('menu_pdf' in publicSettings));

  const [state] = await sql`select value from shop_settings where key = 'menu_pdf'`;
  removeStored(state.value.files.find((f) => f.id === secondId).name);
  r = await download();
  check('if the published file goes missing, customers still get a menu', r.status === 200 && r.headers.get('x-menu-source') === 'auto');
  check('and the admin is told', (await owner.req('GET', '/api/admin/menu-pdf')).json.activeFileMissing === true);
  const actions = (await sql`select distinct action from audit_logs where entity = 'menu_pdf' and created_at > now() - interval '5 minutes'`).map((x) => x.action).sort();
  check('changes are in the activity log', ['menu_pdf.activate', 'menu_pdf.automatic', 'menu_pdf.delete', 'menu_pdf.upload', 'menu_pdf.upload_activate'].every((a) => actions.includes(a)), actions.join());

  // ---------- 9. large files ----------
  const big = pdf('large', 6 * 1024 * 1024);
  if (MODE === 'supabase') {
    check('the bucket is private and limited to PDFs', buckets[MENU_BUCKET]?.public === false && buckets[MENU_BUCKET]?.allowed_mime_types?.join() === 'application/pdf', JSON.stringify(buckets[MENU_BUCKET]));
    let link = (await owner.req('POST', '/api/admin/menu-pdf/direct', { originalName: 'big.pdf', size: big.length })).json;
    check('a large upload gets a one-off storage link', typeof link?.uploadUrl === 'string' && !link.uploadUrl.includes('test-key'), JSON.stringify(link));
    await fetch(link.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: big });
    r = await owner.req('PUT', '/api/admin/menu-pdf/direct', { name: link.name, originalName: 'big.pdf', activate: true });
    check('it is checked, recorded and published', r.status === 200 && r.json.source === 'custom', `${r.status} ${r.json?.error}`);
    const hop = await anon.req('GET', '/api/menu/pdf', null, { origin: null });
    check('a large file is handed over by a short-lived link', hop.status === 302 && /token=dl-token/.test(hop.headers.get('location') || '') && /no-store/.test(hop.headers.get('cache-control') || ''), `${hop.status}`);
    check('which gives the same bytes', (await download()).buf.equals(big));
    link = (await owner.req('POST', '/api/admin/menu-pdf/direct', { originalName: 'bad.pdf', size: 100 })).json;
    await fetch(link.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: 'not a pdf' });
    r = await owner.req('PUT', '/api/admin/menu-pdf/direct', { name: link.name, originalName: 'bad.pdf', activate: true });
    check('a bad direct upload is refused and removed, the published menu stays', r.status === 400 && !storedNames().includes(link.name) && (await download()).buf.equals(big), `${r.status}`);
    check('another file name cannot be claimed', (await owner.req('PUT', '/api/admin/menu-pdf/direct', { name: '../secret.pdf', originalName: 'a.pdf', activate: true })).status === 400);
  } else {
    r = await upload(owner, big, 'big.pdf', true);
    check('a 6 MB PDF is accepted and published', r.status === 200 && (await download()).buf.equals(big), `${r.status} ${r.json?.error}`);
    check('direct upload is only offered with Supabase', (await owner.req('POST', '/api/admin/menu-pdf/direct', { originalName: 'a.pdf', size: 10 })).status === 409);
  }
  await owner.req('PATCH', '/api/admin/menu-pdf', { action: 'automatic' });

  // ---------- 10. rate limit ----------
  await sql`update rate_limits set count = 40, window_start = now() where key like 'menupdf:%'`;
  r = await download();
  check('one address cannot download without limit', r.status === 429 && /Too many/.test(r.json?.error), `${r.status}`);
} finally {
  for (const name of mine()) { try { removeStored(name); } catch {} }
  for (const undo of cleanup) await undo().catch((e) => console.log('cleanup:', e.message));
  if (savedShop) await sql`update shop_settings set value = ${sql.json(savedShop.value)} where key = 'shop'`;
  await sql`delete from shop_settings where key = 'menu_pdf'`;
  if (savedState) await sql`insert into shop_settings (key, value) values ('menu_pdf', ${sql.json(savedState.value)})`;
  await sql`delete from rate_limits where key like 'menupdf:%'`;
  await sql.end();
  sink.close();
  mock.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
