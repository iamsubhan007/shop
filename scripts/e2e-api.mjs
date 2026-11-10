// End-to-end API checks against a running dev server + local DB.
// Needs the app running with SMTP_HOST=127.0.0.1 SMTP_PORT=2525 (this script runs the mail sink on that port).
// Usage: BASE=http://localhost:3100 node --env-file=.env.local scripts/e2e-api.mjs
import postgres from 'postgres';
import { startMailSink } from './mail-sink.mjs';

const sink = await startMailSink(2525);

const BASE = process.env.BASE || 'http://localhost:3100';
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`); };

class Client {
  jar = {};
  async req(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: this.origin ?? BASE, Cookie: Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ') },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [kv] = c.split(';'); const i = kv.indexOf('=');
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(c) || v === '') delete this.jar[k]; else this.jar[k] = v;
    }
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json };
  }
}

const lastCode = (email) => sink.codeFor(email);

const email = `e2e${Date.now()}@example.com`;
const anon = new Client();
const cust = new Client();

// ---- settings: enable a prepaid method for the test, remember original
const [origPay] = await sql`select value from shop_settings where key='payment'`;
await sql`update shop_settings set value = ${sql.json({ ...origPay.value, bank: { enabled: true, bank_name: 'TEST BANK', account_title: 'TEST', account_number: '000', iban: '' } })} where key='payment'`;

// ---- auth
let r = await anon.req('POST', '/api/auth/otp/request', { email: 'not-an-email' });
check('OTP request rejects invalid email', r.status === 400);
r = await cust.req('POST', '/api/auth/otp/request', { email });
check('OTP request ok + spam hint, no code leaked', r.status === 200 && /Spam/.test(r.json.hint) && !JSON.stringify(r.json).match(/\d{6}/), JSON.stringify(r.json));
r = await cust.req('POST', '/api/auth/otp/request', { email });
check('OTP resend cooldown enforced', r.status === 429);
await new Promise((x) => setTimeout(x, 800));
const code = await lastCode(email);
check('dev log has code', /^\d{6}$/.test(code || ''), String(code));
r = await cust.req('POST', '/api/auth/otp/verify', { email, code: code === '000000' ? '111111' : '000000' });
check('wrong OTP rejected', r.status === 400);
r = await cust.req('POST', '/api/auth/otp/verify', { email, code });
check('correct OTP signs in', r.status === 200 && r.json.needsProfile === true, JSON.stringify(r.json));
check('session cookie is set', !!cust.jar.hbt_session);
r = await cust.req('POST', '/api/auth/otp/verify', { email, code });
check('OTP cannot be reused', r.status === 400);
r = await cust.req('PATCH', '/api/auth/me', { fullName: 'E2E Tester', phone: '12345' });
check('invalid phone rejected', r.status === 400);
r = await cust.req('PATCH', '/api/auth/me', { fullName: 'E2E Tester', phone: '+92 300 1234567' });
check('valid phone saved + normalized', r.status === 200 && r.json.user.phone === '03001234567', JSON.stringify(r.json));

// ---- delivery radius
const S = { lat: 31.4766319, lng: 74.3147178 };
r = await anon.req('POST', '/api/delivery/check', { latitude: S.lat + 0.0085, longitude: S.lng });
check('~945 m is eligible', r.json.eligible === true, JSON.stringify(r.json));
r = await anon.req('POST', '/api/delivery/check', { latitude: S.lat + 0.0095, longitude: S.lng });
check('~1056 m is NOT eligible', r.json.eligible === false, JSON.stringify(r.json));
r = await anon.req('POST', '/api/delivery/check', { latitude: 'abc', longitude: 1 });
check('bad coords rejected', r.status === 400);

// ---- checkout
const menu = (await anon.req('GET', '/api/menu')).json;
const prod = menu.products.find((p) => p.available);
const cheap = prod;
const base = { customerName: 'E2E Tester', customerPhone: '03001234567', items: [{ type: 'product', id: prod.id, quantity: 2 }] };
r = await anon.req('POST', '/api/checkout', { ...base, orderType: 'pickup', paymentMethod: 'bank_transfer' });
check('checkout requires sign-in', r.status === 401);
r = await cust.req('POST', '/api/checkout', { ...base, orderType: 'pickup', paymentMethod: 'cod' });
check('COD rejected for pickup', r.status === 400 && /delivery/i.test(r.json.error), JSON.stringify(r.json));
r = await cust.req('POST', '/api/checkout', { ...base, orderType: 'delivery', paymentMethod: 'cod', deliveryAddress: 'Far away', deliveryLat: S.lat + 0.0095, deliveryLng: S.lng });
check('delivery outside 1 km rejected (422)', r.status === 422 && r.json.code === 'outside_radius', JSON.stringify(r.json));
r = await cust.req('POST', '/api/checkout', { ...base, items: [{ type: 'product', id: prod.id, quantity: 2, price: 1 }], orderType: 'pickup', paymentMethod: 'bank_transfer' });
check('pickup bank transfer ok, awaiting payment', r.status === 200 && r.json.status === 'Payment Pending' && r.json.paymentStatus === 'pending', JSON.stringify(r.json));
check('client price ignored: total = db price x qty', r.json.totalAmount === prod.price * 2, `${r.json.totalAmount} vs ${prod.price * 2}`);
const pickupOrder = r.json;
const key = 'idem-' + Date.now();
r = await cust.req('POST', '/api/checkout', { ...base, orderType: 'delivery', paymentMethod: 'cod', deliveryAddress: 'House 1, N Block', deliveryLat: S.lat + 0.0085, deliveryLng: S.lng, idempotencyKey: key });
check('delivery within 1 km COD ok', r.status === 200 && r.json.status === 'Placed' && r.json.paymentStatus === 'cod_pending' && r.json.deliveryFee === 100, JSON.stringify(r.json));
const codOrder = r.json;
const r2 = await cust.req('POST', '/api/checkout', { ...base, orderType: 'delivery', paymentMethod: 'cod', deliveryAddress: 'House 1, N Block', deliveryLat: S.lat + 0.0085, deliveryLng: S.lng, idempotencyKey: key });
check('duplicate submit returns same order', r2.json.duplicate === true && r2.json.orderNumber === codOrder.orderNumber);
r = await cust.req('POST', '/api/checkout', { ...base, items: [{ type: 'product', id: prod.id, quantity: -3 }], orderType: 'pickup', paymentMethod: 'bank_transfer' });
check('negative quantity rejected', r.status === 400);
check('order number is human readable', /^HBT-\d{6}-\d{3}$/.test(codOrder.orderNumber), codOrder.orderNumber);

// ---- unavailable & stock
await sql`update products set is_sold_out=true where id=${prod.id}`;
r = await cust.req('POST', '/api/checkout', { ...base, orderType: 'pickup', paymentMethod: 'bank_transfer' });
check('sold-out item cannot be ordered', r.status === 409, JSON.stringify(r.json));
await sql`update products set is_sold_out=false, track_stock=true, stock_qty=3 where id=${prod.id}`;
r = await cust.req('POST', '/api/checkout', { ...base, items: [{ type: 'product', id: prod.id, quantity: 5 }], orderType: 'pickup', paymentMethod: 'bank_transfer' });
check('overselling blocked by stock', r.status === 409 && r.json.code === 'out_of_stock', JSON.stringify(r.json));
r = await cust.req('POST', '/api/checkout', { ...base, items: [{ type: 'product', id: prod.id, quantity: 3 }], orderType: 'pickup', paymentMethod: 'bank_transfer' });
const [{ stock_qty }] = await sql`select stock_qty from products where id=${prod.id}`;
check('stock reserved on order', r.status === 200 && stock_qty === 0, `${r.status} stock=${stock_qty}`);
const stockOrder = r.json;
r = await cust.req('POST', `/api/orders/${stockOrder.orderId}/cancel`, {});
const [{ stock_qty: s2 }] = await sql`select stock_qty from products where id=${prod.id}`;
check('customer can cancel unconfirmed order; stock restored', r.status === 200 && s2 === 3, `${r.status} stock=${s2}`);
await sql`update products set track_stock=false where id=${prod.id}`;

// ---- maintenance mode
const [origOrd] = await sql`select value from shop_settings where key='ordering'`;
await sql`update shop_settings set value=${sql.json({ open: false, notice: 'Closed for a break', reopen_at: null })} where key='ordering'`;
r = await cust.req('POST', '/api/checkout', { ...base, orderType: 'pickup', paymentMethod: 'bank_transfer' });
check('maintenance mode blocks new orders', r.status === 409 && r.json.code === 'ordering_closed');
await sql`update shop_settings set value=${sql.json(origOrd.value)} where key='ordering'`;

// ---- order access control
r = await anon.req('GET', `/api/orders/${codOrder.orderId}`);
check('anonymous cannot read order', r.status === 404);
r = await anon.req('GET', `/api/orders/${codOrder.orderId}?t=${codOrder.trackingToken}`);
check('tracking token grants read', r.status === 200 && r.json.order.items.length === 1);
const other = new Client();
const email2 = `e2eb${Date.now()}@example.com`;
await other.req('POST', '/api/auth/otp/request', { email: email2 }); await new Promise((x) => setTimeout(x, 800));
await other.req('POST', '/api/auth/otp/verify', { email: email2, code: await lastCode(email2) });
r = await other.req('GET', `/api/orders/${codOrder.orderId}`);
check("another customer cannot read someone's order", r.status === 404);
r = await other.req('POST', `/api/orders/${codOrder.orderId}/cancel`, {});
check("another customer cannot cancel someone's order", r.status === 404);
r = await cust.req('GET', '/api/orders/mine');
check('order history lists own orders', r.status === 200 && r.json.orders.length >= 2);

// ---- staff
const staff = new Client();
const OWNER = process.env.OWNER_EMAIL;
async function staffLogin(client, em) {
  const rq = await client.req('POST', '/api/auth/staff/otp/request', { email: em });
  if (rq.status !== 200) return rq;
  const code = await sink.codeFor(em);
  return client.req('POST', '/api/auth/staff/otp/verify', { email: em, code: code || '000000' });
}
const mailsBefore = sink.count();
r = await staff.req('POST', '/api/auth/staff/otp/request', { email: email });
const [{ n: staffOtpRows }] = await sql`select count(*)::int n from otp_codes where email = ${'staff:' + email}`;
check('non-staff email is rejected with a clear message, no code issued or emailed', r.status === 403 && r.json.code === 'not_staff' && /not registered as staff/i.test(r.json.error || '') && staffOtpRows === 0 && sink.count() === mailsBefore, JSON.stringify(r.json));
r = await staff.req('POST', '/api/auth/staff/otp/verify', { email: email, code: '123456' });
check('customer email cannot staff-login', r.status === 400);
r = await staff.req('POST', '/api/auth/staff/otp/request', { email: OWNER });
r = await staff.req('POST', '/api/auth/staff/otp/verify', { email: OWNER, code: '000000' });
check('wrong staff code rejected', r.status === 400);
await sql`delete from otp_codes where email = ${'staff:' + OWNER}`;
r = await staffLogin(staff, OWNER);
check('owner login via emailed code ok', r.status === 200 && !!staff.jar.hbt_staff, JSON.stringify(r.json));
r = await cust.req('GET', '/api/auth/me?scope=staff');
check('customer session is not a staff session', r.json.user === null);

// ---- staff management (owner only): add by email, sign in with an emailed code, change role, remove
const newStaff = `newstaff${Date.now()}@example.com`;
r = await staff.req('POST', '/api/admin/staff', { email: newStaff, fullName: 'New Admin', role: 'admin' });
check('owner can add a staff email', r.status === 201 && r.json.staff.role === 'admin' && r.json.staff.email === newStaff, JSON.stringify(r.json));
r = await staff.req('POST', '/api/admin/staff', { email: newStaff.toUpperCase(), role: 'admin' });
check('adding the same email again is rejected (409, case-insensitive)', r.status === 409, JSON.stringify(r.json));
r = await staff.req('POST', '/api/admin/staff', { email: 'not-an-email', role: 'admin' });
check('invalid staff email rejected', r.status === 400);
r = await staff.req('POST', '/api/admin/staff', { email: `x${Date.now()}@example.com`, role: 'owner' });
check('cannot grant the owner role from the panel', r.status === 400);
const newClient = new Client();
r = await staffLogin(newClient, newStaff);
check('added staff signs in with an emailed code', r.status === 200 && r.json.user?.role === 'admin' && !!newClient.jar.hbt_staff, JSON.stringify(r.json));
r = await newClient.req('GET', '/api/admin/staff');
check('admin role cannot list staff (owner only)', r.status === 403);
r = await newClient.req('POST', '/api/admin/staff', { email: `y${Date.now()}@example.com`, role: 'admin' });
check('admin role cannot add staff', r.status === 403);
r = await newClient.req('GET', '/api/admin/stats');
check('added admin can use the admin API', r.status === 200);
const staffList = await staff.req('GET', '/api/admin/staff');
const newRow = staffList.json.staff?.find((s) => s.email === newStaff);
const ownerRow = staffList.json.staff?.find((s) => s.role === 'owner');
check('owner sees the new member and the owner in the list', staffList.status === 200 && !!newRow && !!ownerRow);
r = await staff.req('PATCH', `/api/admin/staff/${newRow.id}`, { role: 'kitchen' });
check('owner can change role to kitchen', r.status === 200 && r.json.staff.role === 'kitchen');
r = await newClient.req('GET', '/api/admin/stats');
check('role change applies immediately (kitchen loses the dashboard)', r.status === 403);
r = await staff.req('PATCH', `/api/admin/staff/${ownerRow.id}`, { role: 'kitchen' });
check('owner account cannot be changed', r.status === 400);
r = await staff.req('DELETE', `/api/admin/staff/${ownerRow.id}`);
check('owner cannot remove their own access', r.status === 400);
const [custProfile] = await sql`select id from profiles where email = ${email}`;
r = await staff.req('POST', '/api/admin/staff', { email, role: 'kitchen' });
check('an existing customer can be made staff (same account kept)', r.status === 201 && r.json.staff.id === custProfile.id, JSON.stringify(r.json));
r = await staff.req('DELETE', `/api/admin/staff/${custProfile.id}`);
const [{ role: custRole }] = await sql`select role from profiles where id = ${custProfile.id}`;
check('removing access returns them to a normal customer', r.status === 200 && custRole === 'customer', custRole);
r = await staff.req('DELETE', `/api/admin/staff/${newRow.id}`);
check('owner can remove staff access', r.status === 200);
r = await newClient.req('GET', '/api/admin/kitchen');
check('removed staff is signed out of the admin API at once', r.status === 403);
r = await staff.req('POST', '/api/auth/staff/otp/request', { email: newStaff });
check('removed staff can no longer request a sign-in code', r.status === 403 && r.json.code === 'not_staff');
const staffAudit = await sql`select action from audit_logs where actor_email = ${OWNER} and entity_id = ${newRow.id}`;
check('staff changes are audited', ['staff.add', 'staff.role', 'staff.remove'].every((a) => staffAudit.some((x) => x.action === a)), JSON.stringify(staffAudit));


// ---- admin: authorization boundaries
r = await anon.req('GET', '/api/admin/orders');
check('admin API rejects anonymous', r.status === 403);
r = await cust.req('GET', '/api/admin/orders');
check('admin API rejects customer session', r.status === 403);
r = await anon.req('PATCH', `/api/admin/orders/${codOrder.orderId}`, { action: 'status', status: 'Confirmed' });
check('anonymous cannot change order status', r.status === 403);
staff.origin = 'https://evil.example';
r = await staff.req('PATCH', `/api/admin/orders/${codOrder.orderId}`, { action: 'status', status: 'Confirmed' });
check('cross-origin staff write blocked (CSRF)', r.status === 403);
staff.origin = BASE;

// ---- admin: payment verification + workflow
r = await staff.req('PATCH', `/api/admin/orders/${pickupOrder.orderId}`, { action: 'status', status: 'Confirmed' });
check('cannot confirm unpaid prepaid order', r.status === 409, JSON.stringify(r.json));
r = await cust.req('POST', `/api/orders/${pickupOrder.orderId}/payment`, { reference: 'TXN12345' });
check('customer submits payment reference', r.status === 200, JSON.stringify(r.json));
r = await staff.req('PATCH', `/api/admin/orders/${pickupOrder.orderId}`, { action: 'payment', decision: 'reject', notes: 'amount mismatch' });
check('admin rejects payment -> back to Payment Pending', r.status === 200 && r.json.status === 'Payment Pending' && r.json.paymentStatus === 'rejected', JSON.stringify(r.json));
await cust.req('POST', `/api/orders/${pickupOrder.orderId}/payment`, { reference: 'TXN67890' });
r = await staff.req('PATCH', `/api/admin/orders/${pickupOrder.orderId}`, { action: 'payment', decision: 'verify' });
check('admin verifies payment -> Confirmed', r.status === 200 && r.json.status === 'Confirmed' && r.json.paymentStatus === 'verified', JSON.stringify(r.json));
r = await staff.req('PATCH', `/api/admin/orders/${pickupOrder.orderId}`, { action: 'status', status: 'Out for Delivery' });
check('invalid transition rejected', r.status === 409);
r = await cust.req('POST', `/api/orders/${pickupOrder.orderId}/cancel`, {});
check('customer cannot cancel after confirmation', r.status === 409);

// kitchen staff: restricted
const kEmail = `kitchen${Date.now()}@example.com`;
await sql`insert into profiles (email, full_name, role) values (${kEmail}, 'Kitchen', 'kitchen')`;
const kitchen = new Client();
r = await staffLogin(kitchen, kEmail);
check('kitchen login ok', r.status === 200);
r = await kitchen.req('GET', '/api/admin/stats');
check('kitchen cannot see dashboard/money', r.status === 403);
r = await kitchen.req('GET', '/api/admin/settings');
check('kitchen cannot read settings', r.status === 403);
r = await kitchen.req('GET', '/api/admin/kitchen');
check('kitchen queue visible, no amounts', r.status === 200 && r.json.orders.every((o) => o.totalAmount === undefined) && r.json.orders.some((o) => o.id === pickupOrder.orderId));
r = await kitchen.req('PATCH', `/api/admin/orders/${pickupOrder.orderId}`, { action: 'status', status: 'Cooking' });
check('kitchen can start cooking', r.status === 200);
r = await kitchen.req('PATCH', `/api/admin/orders/${pickupOrder.orderId}`, { action: 'status', status: 'Cancelled', note: 'x' });
check('kitchen cannot cancel orders', r.status === 403);
r = await kitchen.req('PATCH', `/api/admin/orders/${pickupOrder.orderId}`, { action: 'payment', decision: 'verify' });
check('kitchen cannot review payments', r.status === 403);
r = await kitchen.req('PATCH', `/api/admin/orders/${pickupOrder.orderId}`, { action: 'status', status: 'Ready for Pickup' });
check('kitchen marks ready for pickup', r.status === 200);
r = await staff.req('PATCH', `/api/admin/orders/${pickupOrder.orderId}`, { action: 'status', status: 'Completed' });
check('admin completes pickup order', r.status === 200);

// COD flow: collected only after completion
r = await staff.req('PATCH', `/api/admin/orders/${codOrder.orderId}`, { action: 'status', status: 'Confirmed' });
check('COD order can be confirmed without payment verification', r.status === 200);
for (const st of ['Cooking', 'Out for Delivery', 'Completed']) await staff.req('PATCH', `/api/admin/orders/${codOrder.orderId}`, { action: 'status', status: st });
const [{ payment_status }] = await sql`select payment_status from orders where id=${codOrder.orderId}`;
check('COD marked collected only on completion', payment_status === 'cod_collected', payment_status);

// stats reconcile with DB
r = await staff.req('GET', '/api/admin/stats');
const [{ c }] = await sql`select coalesce(sum(total_amount),0)::float as c from orders where payment_status in ('verified','cod_collected') and status not in ('Cancelled','Rejected') and created_at > now() - interval '30 days'`;
check('dashboard collected revenue equals DB payment records', r.status === 200 && Math.abs(r.json.totals.collected - c) < 0.01, `${r.json.totals?.collected} vs ${c}`);

// audit trail
const audits = await sql`select action from audit_logs where actor_email = ${OWNER}`;
check('admin actions recorded in audit log', ['payment.verify', 'payment.reject', 'order.status'].every((a) => audits.some((x) => x.action === a)));

// product admin
r = await staff.req('PATCH', `/api/admin/products/${prod.id}`, { price: prod.price + 10 });
check('admin can change price', r.status === 200);
r = await staff.req('PATCH', `/api/admin/products/${prod.id}`, { price: prod.price, compareAtPrice: prod.price - 1 });
check('old price must exceed selling price', r.status === 400);
await staff.req('PATCH', `/api/admin/products/${prod.id}`, { price: prod.price });
const priceAudit = await sql`select 1 from audit_logs where action='product.price' and entity_id=${prod.id}`;
check('price change audited', priceAudit.length >= 1);
await sql`update profiles set is_active=false where email=${kEmail}`;
console.log(`\n${pass} passed, ${fail} failed`);
await sql`update shop_settings set value=${sql.json(origPay.value)} where key='payment'`;
await sql.end();
sink.close();
process.exit(fail ? 1 : 0);
