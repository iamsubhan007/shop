// E2E for coupons, deals, exports, daily closing, analytics, audit, backups, receipts, loyalty.
// App must run with SMTP_HOST=127.0.0.1 SMTP_PORT=2525, CRON_SECRET and BACKUP_SYNC_TOKEN set.
// Usage: BASE=http://localhost:3100 node --env-file=.env.local scripts/e2e-phase2.mjs
import postgres from 'postgres';
import fs from 'node:fs';
import { startMailSink } from './mail-sink.mjs';

const BASE = process.env.BASE || 'http://localhost:3100';
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const sink = await startMailSink(2525);
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  ' + x}`); };

class Client {
  jar = {};
  async raw(method, path, body, headers = {}) {
    const res = await fetch(BASE + path, {
      method, headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); this.jar[kv.slice(0, i)] = kv.slice(i + 1); }
    return res;
  }
  async req(method, path, body, headers) {
    const res = await this.raw(method, path, body, headers);
    let json = null; try { json = await res.clone().json(); } catch {}
    return { status: res.status, json, res };
  }
}

async function customer(label) {
  const c = new Client(); const email = `p2${label}${Date.now()}@example.com`;
  await c.req('POST', '/api/auth/otp/request', { email });
  await c.req('POST', '/api/auth/otp/verify', { email, code: await sink.codeFor(email) });
  await c.req('PATCH', '/api/auth/me', { fullName: 'Phase2 Tester', phone: '03001112223' });
  return c;
}
async function staffLogin(email) {
  const c = new Client();
  await c.req('POST', '/api/auth/staff/otp/request', { email });
  const r = await c.req('POST', '/api/auth/staff/otp/verify', { email, code: await sink.codeFor(email) });
  return { c, r };
}

const OWNER = process.env.OWNER_EMAIL;
// Test hygiene: the previous suite just logged in as the owner, so clear the resend cooldown / rate counters.
await sql`delete from otp_codes where email like 'staff:%'`;
await sql`delete from rate_limits where key like 'staff%'`;
const { c: owner } = await staffLogin(OWNER);
const cust = await customer('a');
const S = { lat: 31.4766319, lng: 74.3147178 };
const menu = (await cust.req('GET', '/api/menu')).json;
const prods = menu.products.filter((p) => p.available);
const p1 = prods[0], p2 = prods[1];
const deliv = { orderType: 'delivery', paymentMethod: 'cod', deliveryAddress: 'House 2, N Block', deliveryLat: S.lat + 0.005, deliveryLng: S.lng };
let r;

// ---- coupons
const code = 'T' + Date.now().toString(36).toUpperCase();
r = await owner.req('POST', '/api/admin/coupons', { code, kind: 'percent', value: 150 });
check('percent coupon over 100 rejected', r.status === 400);
r = await owner.req('POST', '/api/admin/coupons', { code, kind: 'percent', value: 10, maxUses: 1 });
check('admin creates coupon', r.status === 200, JSON.stringify(r.json));
r = await cust.req('POST', '/api/coupons/validate', { code, subtotal: 1000 });
check('coupon preview = 10% of subtotal', r.status === 200 && r.json.discount === 100, JSON.stringify(r.json));
r = await cust.req('POST', '/api/coupons/validate', { code: 'NOPE123', subtotal: 1000 });
check('unknown coupon rejected', r.status === 400);
const base = { customerName: 'Phase2 Tester', customerPhone: '03001112223', items: [{ type: 'product', id: p1.id, quantity: 2 }], ...deliv };
r = await cust.req('POST', '/api/checkout', { ...base, couponCode: code });
const expectDisc = Math.round(p1.price * 2 * 0.1 * 100) / 100;
check('checkout applies coupon server-side', r.status === 200 && r.json.discountAmount === expectDisc && r.json.totalAmount === p1.price * 2 - expectDisc + 100, JSON.stringify(r.json));
const couponOrder = r.json;
r = await cust.req('POST', '/api/checkout', { ...base, couponCode: code });
check('coupon with max uses cannot be reused', r.status === 400 && r.json.code === 'bad_coupon', JSON.stringify(r.json));
r = await cust.req('POST', `/api/orders/${couponOrder.orderId}/cancel`, {});
const [{ used_count }] = await sql`select used_count from coupons where code=${code}`;
check('cancelling returns the coupon use', r.status === 200 && used_count === 0, `used=${used_count}`);
r = await cust.req('POST', '/api/checkout', { ...base, couponCode: code });
check('coupon usable again after cancel', r.status === 200);
await owner.req('PATCH', `/api/admin/coupons/${(await sql`select id from coupons where code=${code}`)[0].id}`, { isActive: false });
r = await cust.req('POST', '/api/coupons/validate', { code, subtotal: 1000 });
check('deactivated coupon rejected', r.status === 400);

// ---- deals
const value = p1.price + p2.price;
r = await owner.req('POST', '/api/admin/deals', { title: 'Bad Deal', price: value + 500, items: [{ productId: p1.id, quantity: 1 }, { productId: p2.id, quantity: 1 }] });
check('deal priced above items rejected', r.status === 400 && /higher/.test(r.json.error), JSON.stringify(r.json));
r = await owner.req('POST', '/api/admin/deals', { title: 'E2E Combo', price: value - 10, items: [{ productId: p1.id, quantity: 1 }, { productId: p2.id, quantity: 1 }] });
check('valid deal created with computed original price', r.status === 200 && Number(r.json.deal.originalPrice) === value, JSON.stringify(r.json));
const dealId = r.json.deal.id;
r = await cust.req('GET', '/api/menu');
check('deal visible to customers', r.json.deals.some((d) => d.id === dealId));
r = await cust.req('POST', '/api/checkout', { ...base, items: [{ type: 'deal', id: dealId, quantity: 1 }] });
check('deal can be ordered at deal price', r.status === 200 && r.json.subtotal === value - 10, JSON.stringify(r.json));
await owner.req('PATCH', `/api/admin/deals/${dealId}`, { endsAt: new Date(Date.now() - 1000).toISOString(), startsAt: new Date(Date.now() - 86400000).toISOString() });
r = await cust.req('POST', '/api/checkout', { ...base, items: [{ type: 'deal', id: dealId, quantity: 1 }] });
check('expired deal cannot be ordered', r.status === 409, JSON.stringify(r.json));
await owner.req('DELETE', `/api/admin/deals/${dealId}`);

// ---- loyalty + completed order for reports
await sql`update shop_settings set value = ${sql.json({ enabled: true, points_per_100: 10 })} where key='loyalty'`;
r = await cust.req('POST', '/api/checkout', { ...base, items: [{ type: 'product', id: p2.id, quantity: 4 }] });
const loyal = r.json;
for (const st of ['Confirmed', 'Cooking', 'Out for Delivery', 'Completed']) await owner.req('PATCH', `/api/admin/orders/${loyal.orderId}`, { action: 'status', status: st });
const [prof] = await sql`select loyalty_points from profiles where id = (select user_id from orders where id=${loyal.orderId})`;
check('loyalty points credited on completion', prof.loyalty_points === Math.floor(loyal.subtotal / 100 * 10), `${prof.loyalty_points} vs ${Math.floor(loyal.subtotal / 100 * 10)}`);
await sql`update shop_settings set value = ${sql.json({ enabled: false, points_per_100: 0 })} where key='loyalty'`;

// ---- receipt pdf
r = await owner.raw('GET', `/api/admin/orders/${loyal.orderId}/receipt`);
const pdf = Buffer.from(await r.arrayBuffer());
check('order receipt PDF generated', r.status === 200 && pdf.subarray(0, 4).toString() === '%PDF', `${r.status}`);
r = await cust.req('GET', `/api/admin/orders/${loyal.orderId}/receipt`);
check('customer cannot fetch admin receipt', r.status === 403);

// ---- daily closing reconciles with DB
const day = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
r = await owner.req('GET', `/api/admin/closing?date=${day}`);
const rep = r.json.report;
const [db1] = await sql`
  select count(*)::int n,
   coalesce(sum(total_amount) filter (where payment_status in ('verified','cod_collected') and status not in ('Cancelled','Rejected')),0)::float collected,
   coalesce(sum(total_amount) filter (where payment_status = 'cod_pending' and status not in ('Cancelled','Rejected')),0)::float outstanding,
   count(*) filter (where status in ('Cancelled','Rejected'))::int cancelled
  from orders where created_at >= ${new Date(`${day}T00:00:00+05:00`)} and created_at < ${new Date(new Date(`${day}T00:00:00+05:00`).getTime() + 86400000)}`;
check('closing: order counts match DB', rep.received === db1.n && rep.cancelled === db1.cancelled, JSON.stringify({ rep: rep.received, db: db1.n }));
check('closing: collected matches payment records', Math.abs(rep.collected - db1.collected) < 0.01, `${rep.collected} vs ${db1.collected}`);
check('closing: outstanding COD excludes collected/cancelled', Math.abs(rep.outstanding_cod - db1.outstanding) < 0.01, `${rep.outstanding_cod} vs ${db1.outstanding}`);
check('closing: collected = verified methods + COD collected', Math.abs(rep.collected - (rep.bank_verified + rep.jazzcash_verified + rep.easypaisa_verified + rep.cod_collected)) < 0.01);
check('closing: pending money is NOT in collected', rep.collected + rep.pending_payments + rep.outstanding_cod <= rep.gross + 0.01);
r = await owner.req('GET', `/api/admin/closing?date=bad`);
check('closing rejects bad date', r.status === 400);
r = await owner.raw('GET', `/api/admin/closing?date=${day}&format=pdf`);
check('closing PDF', r.status === 200 && Buffer.from(await r.arrayBuffer()).subarray(0, 4).toString() === '%PDF');
r = await owner.req('POST', '/api/admin/closing', { date: day });
check('closing a day saves summary', r.status === 200);
const before = await sql`select count(*)::int n from orders`;
r = await owner.req('PATCH', `/api/admin/orders/${couponOrder.orderId}`, { action: 'status', status: 'Cancelled', note: 'x' });
check('closed day does not lock orders (409 only for workflow reasons)', r.status !== 500);

// ---- analytics
r = await owner.req('GET', '/api/admin/analytics');
const sold = await sql`select coalesce(sum(oi.quantity),0)::int q from order_items oi join orders o on o.id=oi.order_id where o.status not in ('Cancelled','Rejected') and o.created_at > now() - interval '31 days'`;
check('analytics uses real order items', r.status === 200 && r.json.comparison.current.qty === sold[0].q, `${r.json?.comparison?.current?.qty} vs ${sold[0].q}`);
check('analytics has category + comparison data', Array.isArray(r.json.categories) && r.json.comparison.previous !== undefined);

// ---- exports
const types = ['orders', 'customers', 'revenue', 'payments', 'products'];
for (const t of types) {
  const csv = await owner.raw('GET', `/api/admin/export?type=${t}&format=csv`);
  const text = await csv.text();
  check(`export ${t} csv`, csv.status === 200 && text.includes(',') && /text\/csv/.test(csv.headers.get('content-type')));
}
r = await owner.raw('GET', '/api/admin/export?type=orders&format=xlsx');
check('export xlsx is a real Excel file', r.status === 200 && Buffer.from(await r.arrayBuffer()).subarray(0, 2).toString() === 'PK');
r = await owner.raw('GET', '/api/admin/export?type=revenue&format=pdf');
check('export pdf', r.status === 200 && Buffer.from(await r.arrayBuffer()).subarray(0, 4).toString() === '%PDF');
r = await owner.req('GET', '/api/admin/export?type=orders&format=exe');
check('export rejects unknown format', r.status === 400);
r = await cust.req('GET', '/api/admin/export?type=customers&format=csv');
check('customer cannot export data', r.status === 403);
// csv injection
await sql`update orders set customer_name = '=HYPERLINK("http://x")' where id=${loyal.orderId}`;
const inj = await (await owner.raw('GET', '/api/admin/export?type=orders&format=csv')).text();
check('CSV neutralises formula injection', inj.includes(`'=HYPERLINK`) && !/(^|,)=HYPERLINK/m.test(inj));
await sql`update orders set customer_name = 'Phase2 Tester' where id=${loyal.orderId}`;

// ---- audit + backups (owner only)
r = await owner.req('GET', '/api/admin/audit');
check('owner reads audit history', r.status === 200 && r.json.logs.some((l) => l.action === 'coupon.create') && r.json.logs.some((l) => l.action === 'day.close'));
r = await cust.req('GET', '/api/admin/audit');
check('customer cannot read audit', r.status === 403);
const kEmail = `k2${Date.now()}@example.com`;
await sql`insert into profiles (email, full_name, role) values (${kEmail}, 'K', 'kitchen')`;
const { c: kit } = await staffLogin(kEmail);
r = await kit.req('GET', '/api/admin/audit');
check('kitchen cannot read audit', r.status === 403);
r = await kit.req('POST', '/api/admin/backups', {});
check('kitchen cannot trigger backup', r.status === 403);
r = await kit.req('GET', '/api/admin/customers');
check('kitchen cannot see customers', r.status === 403);

r = await owner.req('POST', '/api/admin/backups', {});
check('manual backup succeeds', r.status === 200 && r.json.backup.status === 'success', JSON.stringify(r.json));
const bid = r.json.backup.id;
r = await owner.raw('GET', `/api/admin/backups/${bid}`);
const gz = Buffer.from(await r.arrayBuffer());
check('backup downloads as gzip', r.status === 200 && gz[0] === 0x1f && gz[1] === 0x8b);
r = await owner.req('GET', '/api/admin/backups');
check('backup history lists it', r.json.backups.some((b) => b.id === bid && b.status === 'success'));
r = await cust.req('GET', '/api/admin/backups');
check('customer cannot list backups', r.status === 403);
r = await new Client().req('GET', '/api/cron/backup');
check('cron endpoint rejects missing token', r.status === 401);
r = await new Client().req('GET', '/api/cron/backup?force=1', null, { Authorization: 'Bearer wrong-wrong-wrong-wrong' });
check('cron endpoint rejects wrong token', r.status === 401);
r = await new Client().req('GET', '/api/cron/backup?force=1', null, { Authorization: `Bearer ${process.env.CRON_SECRET}` });
check('scheduled backup runs via cron token', r.status === 200 && r.json.ok === true, JSON.stringify(r.json));
const sync = { Authorization: `Bearer ${process.env.BACKUP_SYNC_TOKEN}` };
r = await new Client().req('GET', '/api/backup-sync');
check('sync endpoint rejects no token', r.status === 401);
r = await new Client().req('GET', '/api/backup-sync', null, sync);
check('sync token lists backups', r.status === 200 && r.json.files.length >= 2);
const fname = r.json.files[0].name;
r = await new Client().raw('GET', `/api/backup-sync?file=${encodeURIComponent(fname)}`, null, sync);
check('sync token downloads a backup', r.status === 200 && (await r.arrayBuffer()).byteLength > 100);
r = await new Client().req('GET', `/api/backup-sync?file=${encodeURIComponent('../../.env.local')}`, null, sync);
check('sync endpoint blocks path traversal', r.status === 400);
const audits = await sql`select action from audit_logs where action in ('backup.run','backup.download','export')`;
check('backups and exports are audited', ['backup.run', 'backup.download', 'export'].every((a) => audits.some((x) => x.action === a)));

// ---- inventory movement history + low stock
await owner.req('PATCH', `/api/admin/products/${p1.id}`, { trackStock: true, stockQty: 0 });
r = await owner.req('PATCH', `/api/admin/products/${p1.id}`, { stockAdjust: { delta: 20, reason: 'new delivery' } });
const [mv] = await sql`select delta, reason from stock_movements where product_id=${p1.id} order by created_at desc limit 1`;
check('stock adjustment recorded with reason', r.status === 200 && mv.delta === 20 && mv.reason === 'new delivery');
r = await owner.req('PATCH', `/api/admin/products/${p1.id}`, { stockAdjust: { delta: -1000, reason: 'oops' } });
const [{ stock_qty }] = await sql`select stock_qty from products where id=${p1.id}`;
check('stock can never go negative', stock_qty === 0, String(stock_qty));
await sql`update products set track_stock=false, stock_qty=0 where id=${p1.id}`;

console.log(`\n${pass} passed, ${fail} failed`);
await sql`update profiles set is_active=false where email=${kEmail}`;
await sql.end(); sink.close();
process.exit(fail ? 1 : 0);
