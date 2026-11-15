// E2E for: delivery on/off + delivery hours, the Rider role (and what a rider can never see), owner/admin-only order
// powers (cancel / complete / edit items / delete old orders), the order timer, the order discount, customer feedback.
// App must run with SMTP_HOST=127.0.0.1 SMTP_PORT=2525 and STORAGE_DIR set (this script checks proof files on disk).
// Usage: BASE=http://localhost:3000 STORAGE_DIR=<dir> node --env-file=.env.local scripts/e2e-rider.mjs
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { startMailSink } from './mail-sink.mjs';

const BASE = process.env.BASE || 'http://localhost:3000';
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const sink = await startMailSink(2525);
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  ' + x}`); };

class Client {
  jar = {};
  async raw(method, p, body) {
    const isForm = body instanceof FormData;
    const res = await fetch(BASE + p, { method, headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), Origin: BASE, Cookie: Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
    for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v === '') delete this.jar[k]; else this.jar[k] = v; }
    return res;
  }
  async req(method, p, body) { const res = await this.raw(method, p, body); const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: res.status, json, text }; }
}
async function customer(email, name = 'Rider Tester') {
  const c = new Client();
  await c.req('POST', '/api/auth/otp/request', { email });
  await c.req('POST', '/api/auth/otp/verify', { email, code: await sink.codeFor(email) });
  await c.req('PATCH', '/api/auth/me', { fullName: name, phone: '03001234567' });
  return c;
}
async function staff(email) {
  const c = new Client();
  await c.req('POST', '/api/auth/staff/otp/request', { email });
  const r = await c.req('POST', '/api/auth/staff/otp/verify', { email, code: await sink.codeFor(email) });
  if (r.status !== 200) throw new Error(`staff login failed for ${email}: ${r.text}`);
  return { c, user: r.json.user };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- who is who ----------
const stamp = Date.now();
const custEmail = `rt${stamp}@example.com`;
const adminEmail = `rtadmin${stamp}@example.com`, kitchenEmail = `rtkitchen${stamp}@example.com`, riderEmail = `rtrider${stamp}@example.com`;
await sql`insert into profiles (email, full_name, role) values (${adminEmail}, 'RT Admin', 'admin'), (${kitchenEmail}, 'RT Kitchen', 'kitchen')`;
const anon = new Client();
const cust = await customer(custEmail);
const other = await customer(`rtb${stamp}@example.com`, 'Other Customer');
const { c: owner } = await staff(process.env.OWNER_EMAIL);
const { c: admin } = await staff(adminEmail);
const { c: kitchen } = await staff(kitchenEmail);

// ---------- test data + settings we will restore ----------
const menu = (await anon.req('GET', '/api/menu')).json;
const [prod, prod2] = menu.products.filter((p) => p.available);
const [origProd] = await sql`select track_stock, stock_qty from products where id = ${prod.id}`;
const [origDel] = await sql`select value from shop_settings where key = 'delivery'`;
const [origPay] = await sql`select value from shop_settings where key = 'payment'`;
await sql`update products set track_stock = true, stock_qty = 100 where id = ${prod.id}`;
await sql`update shop_settings set value = ${sql.json({ ...origPay.value, bank: { enabled: true, bank_name: 'TEST BANK', account_title: 'TEST', account_number: '000', iban: '' } })} where key='payment'`;
const S = { lat: 31.4766319, lng: 74.3147178 };
const stockOf = async (id) => (await sql`select stock_qty from products where id = ${id}`)[0].stock_qty;
let rider, riderC;

try {
  // =====================================================================================================
  console.log('\n--- delivery on/off and delivery hours ---');
  const pk = (offsetMin) => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(Date.now() + offsetMin * 60000)); return `${p.find((x) => x.type === 'hour').value}:${p.find((x) => x.type === 'minute').value}`; };
  const cur = (await admin.req('GET', '/api/admin/settings')).json.settings.delivery;
  const putDelivery = (patch) => admin.req('PUT', '/api/admin/settings', { key: 'delivery', value: { enabled: cur.enabled, radius_m: cur.radius_m, fee: cur.fee, free_over: cur.free_over, min_order: cur.min_order, hours_enabled: false, start_time: '11:00', end_time: '23:00', ...patch } });
  // the app allows 15 checkouts per 10 minutes per customer; this test places more, so clear that LOCAL counter first
const freshLimit = () => sql`delete from rate_limits where key like 'checkout:%'`;
const deliveryOrder = async (extra = {}) => (await freshLimit(), cust).req('POST', '/api/checkout', { customerName: 'Rider Tester', customerPhone: '03001234567', items: [{ type: 'product', id: prod.id, quantity: 2 }], orderType: 'delivery', paymentMethod: 'cod', deliveryAddress: 'House 1, N Block, Model Town', deliveryLat: S.lat + 0.0085, deliveryLng: S.lng, idempotencyKey: `rt-${Date.now()}-${Math.random()}`, ...extra });
  const pickupOrder = async (extra = {}) => (await freshLimit(), cust).req('POST', '/api/checkout', { customerName: 'Rider Tester', customerPhone: '03001234567', items: [{ type: 'product', id: prod.id, quantity: 1 }], orderType: 'pickup', paymentMethod: 'bank_transfer', idempotencyKey: `rtp-${Date.now()}-${Math.random()}`, ...extra });

  let r = await anon.req('GET', '/api/settings');
  check('by default delivery hours are off and delivery is available', r.json.delivery.hours_enabled === false && r.json.deliveryState.available === true, r.text.slice(0, 200));
  r = await putDelivery({ hours_enabled: true, start_time: pk(120), end_time: pk(180) });
  check('admin sets delivery hours that do not include right now', r.status === 200, r.text);
  r = await anon.req('GET', '/api/settings');
  check('public settings report delivery as closed, with a clear message', r.json.deliveryState.available === false && r.json.deliveryState.reason === 'hours' && /Home delivery is available/.test(r.json.deliveryState.notice) && r.json.delivery.hours_enabled === true, r.text.slice(0, 250));
  r = await anon.req('POST', '/api/delivery/check', { latitude: S.lat + 0.0085, longitude: S.lng });
  check('location check says not eligible because of the hours', r.json.eligible === false && r.json.deliveryHoursClosed === true && /Home delivery is available/.test(r.json.message), r.text);
  r = await deliveryOrder();
  check('delivery checkout is refused outside delivery hours (409 delivery_hours)', r.status === 409 && r.json.code === 'delivery_hours', r.text);
  r = await pickupOrder();
  check('pickup still works outside delivery hours', r.status === 200 && r.json.status === 'Payment Pending', r.text);
  await cust.req('POST', `/api/orders/${r.json.orderId}/cancel`, {});

  r = await putDelivery({ hours_enabled: true, start_time: pk(-60), end_time: pk(60) });
  r = await anon.req('GET', '/api/settings');
  check('inside the hours, delivery is available again', r.json.deliveryState.available === true);
  r = await deliveryOrder();
  check('delivery checkout works inside the hours', r.status === 200 && r.json.status === 'Placed', r.text);
  await owner.req('PATCH', `/api/admin/orders/${r.json.orderId}`, { action: 'status', status: 'Cancelled', note: 'test cleanup' });

  r = await putDelivery({ hours_enabled: true, start_time: pk(0), end_time: pk(0) });
  check('same start and end time is rejected (400)', r.status === 400, r.text);
  r = await putDelivery({ hours_enabled: true, start_time: '25:00', end_time: '10:00' });
  check('a bad time is rejected (400)', r.status === 400, r.text);
  r = await kitchen.req('PUT', '/api/admin/settings', { key: 'delivery', value: { enabled: true, radius_m: 1000, fee: 0, free_over: 0, min_order: 0 } });
  check('kitchen cannot change delivery settings', r.status === 403);
  r = await putDelivery({ enabled: false });
  r = await deliveryOrder();
  check('delivery switched off: checkout says so (409 delivery_disabled), message unchanged', r.status === 409 && r.json.code === 'delivery_disabled' && r.json.error === 'Home delivery is currently unavailable. Please choose pickup.', r.text);
  await putDelivery({ enabled: cur.enabled, hours_enabled: false });
  r = await deliveryOrder();
  check('back to normal: delivery works again', r.status === 200, r.text);
  const baseOrder = r.json; // a COD delivery order used below
  await owner.req('PATCH', `/api/admin/orders/${baseOrder.orderId}`, { action: 'status', status: 'Cancelled', note: 'test cleanup' });

  // =====================================================================================================
  console.log('\n--- staff access: adding a rider ---');
  r = await owner.req('POST', '/api/admin/staff', { email: riderEmail, fullName: 'Test Rider', role: 'rider' });
  check('owner adds a rider', r.status === 201 && r.json.staff.role === 'rider', r.text);
  r = await admin.req('POST', '/api/admin/staff', { email: `x${stamp}@example.com`, role: 'rider' });
  check('admin cannot add staff (owner only)', r.status === 403);
  r = await owner.req('POST', '/api/admin/staff', { email: `y${stamp}@example.com`, role: 'owner' });
  check('the owner role still cannot be granted', r.status === 400);
  r = await owner.req('GET', '/api/admin/staff');
  check('the rider is listed with role rider', r.json.staff.some((s) => s.email === riderEmail && s.role === 'rider'));
  ({ c: riderC, user: rider } = await staff(riderEmail));
  check('the rider signs in with an emailed code', rider.role === 'rider' && !!riderC.jar.hbt_staff, JSON.stringify(rider));

  // =====================================================================================================
  console.log('\n--- what a rider can and cannot reach ---');
  const forbidden = [['GET', '/api/admin/orders'], ['GET', '/api/admin/stats'], ['GET', '/api/admin/customers'], ['GET', '/api/admin/settings'], ['GET', '/api/admin/kitchen'], ['GET', '/api/admin/alerts'], ['GET', '/api/admin/staff'], ['GET', '/api/admin/products'], ['GET', '/api/admin/push/key'], ['GET', '/api/admin/audit'], ['GET', '/api/admin/analytics'], ['GET', '/api/admin/coupons']];
  for (const [m, p] of forbidden) { r = await riderC.req(m, p); check(`rider is refused: ${m} ${p}`, r.status === 403, `${r.status}`); }
  r = await riderC.req('POST', '/api/admin/orders/delete', { ids: ['00000000-0000-0000-0000-000000000000'] });
  check('rider cannot delete orders', r.status === 403);
  for (const who of [['anonymous', anon], ['customer', cust], ['owner', owner], ['admin', admin], ['kitchen', kitchen]]) {
    r = await who[1].req('GET', '/api/rider/orders');
    check(`${who[0]} cannot use the rider endpoint`, r.status === 403, `${r.status}`);
  }
  r = await riderC.req('GET', '/api/auth/me?scope=staff');
  check('rider session reports role rider', r.json.user?.role === 'rider');

  // =====================================================================================================
  console.log('\n--- a delivery from kitchen to rider ---');
  const mk = (await deliveryOrder()).json;
  const toOut = async (id) => { for (const s of ['Confirmed', 'Cooking', 'Out for Delivery']) { const x = await owner.req('PATCH', `/api/admin/orders/${id}`, { action: 'status', status: s }); if (x.status !== 200) return x; } return { status: 200 }; };
  r = await riderC.req('GET', '/api/rider/orders');
  check('a new order is not on the rider list yet', !r.json.active.some((o) => o.id === mk.orderId));
  r = await riderC.req('GET', `/api/orders/${mk.orderId}`);
  check("rider cannot read a customer's full order through the tracking route (404)", r.status === 404, `${r.status}`);
  r = await riderC.req('GET', `/api/files/proof/${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}.png`);
  check('rider cannot fetch payment proofs', r.status === 404);
  r = await riderC.req('PATCH', `/api/admin/orders/${mk.orderId}`, { action: 'status', status: 'Confirmed' });
  check('rider cannot move an order through the admin route', r.status === 403);
  r = await riderC.req('POST', `/api/rider/orders/${mk.orderId}/deliver`, { delivered: true, paymentReceived: true });
  check('rider cannot confirm an order that is not out for delivery yet (409)', r.status === 409, r.text);
  check('the owner moves it Confirmed, Cooking, Out for Delivery', (await toOut(mk.orderId)).status === 200);

  r = await riderC.req('GET', '/api/rider/orders');
  const mine = r.json.active.find((o) => o.id === mk.orderId);
  check('it now appears on the rider list', !!mine, r.text.slice(0, 200));
  if (mine) {
    check('rider sees order number, customer NAME, address, map position, items and the bill',
      mine.orderNumber === mk.orderNumber && mine.customerName === 'Rider Tester' && /Model Town/.test(mine.address) && typeof mine.lat === 'number' && typeof mine.lng === 'number'
      && mine.items.length === 1 && mine.items[0].quantity === 2 && mine.totalAmount === mk.totalAmount && mine.subtotal > 0, JSON.stringify(mine).slice(0, 300));
    check('rider is told to collect the cash (COD) and how much', mine.collectCash === true && mine.amountToCollect === mine.totalAmount);
    const allowed = ['id', 'orderNumber', 'status', 'placedAt', 'customerName', 'address', 'lat', 'lng', 'distanceM', 'specialInstructions', 'items', 'subtotal', 'discountAmount', 'deliveryFee', 'totalAmount', 'paymentMethod', 'paymentStatus', 'collectCash', 'amountToCollect'];
    check('the rider view contains ONLY the allowed fields (allow-list)', JSON.stringify(Object.keys(mine).sort()) === JSON.stringify([...allowed].sort()), Object.keys(mine).filter((k) => !allowed.includes(k)).join(','));
    const raw = JSON.stringify(r.json);
    check('NO phone number, email, tracking token or customer id anywhere in the rider response', !raw.includes('03001234567') && !raw.includes(custEmail) && !/customerPhone|customerEmail|trackingToken|userId|paymentReference|paymentProofUrl/.test(raw), raw.slice(0, 200));
  }
  r = await riderC.req('POST', `/api/rider/orders/${mk.orderId}/deliver`, { delivered: true });
  check('cash order: delivering without confirming the cash is refused (400)', r.status === 400 && /cash/i.test(r.json?.error || ''), r.text);
  r = await riderC.req('POST', `/api/rider/orders/${mk.orderId}/deliver`, { delivered: false, paymentReceived: true });
  check('"delivered: false" is refused (400)', r.status === 400);
  r = await riderC.req('POST', `/api/rider/orders/00000000-0000-0000-0000-000000000000/deliver`, { delivered: true, paymentReceived: true });
  check('an unknown order is 404', r.status === 404);
  r = await riderC.req('POST', `/api/rider/orders/not-a-uuid/deliver`, { delivered: true, paymentReceived: true });
  check('a malformed id is 404', r.status === 404);
  r = await cust.req('POST', `/api/rider/orders/${mk.orderId}/deliver`, { delivered: true, paymentReceived: true });
  check('a customer cannot use the deliver endpoint', r.status === 403);
  r = await riderC.req('POST', `/api/rider/orders/${mk.orderId}/deliver`, { delivered: true, paymentReceived: true });
  check('rider confirms delivery and cash received (200)', r.status === 200, r.text);
  const [done] = await sql`select status, payment_status from orders where id = ${mk.orderId}`;
  check('order is Completed and the cash is recorded as collected', done.status === 'Completed' && done.payment_status === 'cod_collected', JSON.stringify(done));
  const [hist] = await sql`select changed_by, note from order_status_history where order_id = ${mk.orderId} and to_status = 'Completed'`;
  check('the history says the rider delivered it, with their id', hist.changed_by === rider.id && /Delivered by rider/.test(hist.note) && /Cash collected/.test(hist.note), JSON.stringify(hist));
  const [aud] = await sql`select actor_email from audit_logs where action = 'order.status' and entity_id = ${mk.orderNumber} order by created_at desc limit 1`;
  check('the delivery is in the audit log under the rider', aud?.actor_email === riderEmail);
  r = await riderC.req('GET', '/api/rider/orders');
  check('it leaves the active list and shows under "delivered by you"', !r.json.active.some((o) => o.id === mk.orderId) && r.json.recent.some((o) => o.id === mk.orderId));
  r = await riderC.req('POST', `/api/rider/orders/${mk.orderId}/deliver`, { delivered: true, paymentReceived: true });
  check('delivering the same order twice is refused (409)', r.status === 409);

  // prepaid delivery: nothing to collect
  const pre = (await deliveryOrder({ paymentMethod: 'bank_transfer', paymentReference: 'RT-TXN-1' })).json;
  check('prepaid delivery order is waiting for the payment check', pre.status === 'Payment Verification', JSON.stringify(pre));
  await owner.req('PATCH', `/api/admin/orders/${pre.orderId}`, { action: 'payment', decision: 'verify' });
  await owner.req('PATCH', `/api/admin/orders/${pre.orderId}`, { action: 'status', status: 'Cooking' });
  await owner.req('PATCH', `/api/admin/orders/${pre.orderId}`, { action: 'status', status: 'Out for Delivery' });
  r = await riderC.req('GET', '/api/rider/orders');
  const pv = r.json.active.find((o) => o.id === pre.orderId);
  check('prepaid order: rider sees "nothing to collect"', pv && pv.collectCash === false && pv.amountToCollect === 0);
  r = await riderC.req('POST', `/api/rider/orders/${pre.orderId}/deliver`, { delivered: true });
  const [preDone] = await sql`select status, payment_status from orders where id = ${pre.orderId}`;
  check('prepaid order: delivering needs no cash confirmation and the payment stays verified', r.status === 200 && preDone.status === 'Completed' && preDone.payment_status === 'verified', JSON.stringify(preDone));

  // a pickup order is never the rider's business
  const pk1 = (await pickupOrder({ paymentReference: 'RT-PK-1' })).json;
  await owner.req('PATCH', `/api/admin/orders/${pk1.orderId}`, { action: 'payment', decision: 'verify' });
  await owner.req('PATCH', `/api/admin/orders/${pk1.orderId}`, { action: 'status', status: 'Cooking' });
  await owner.req('PATCH', `/api/admin/orders/${pk1.orderId}`, { action: 'status', status: 'Ready for Pickup' });
  r = await riderC.req('GET', '/api/rider/orders');
  check('a pickup order never appears for the rider', !r.json.active.some((o) => o.id === pk1.orderId));
  r = await riderC.req('POST', `/api/rider/orders/${pk1.orderId}/deliver`, { delivered: true, paymentReceived: true });
  check('and the rider cannot complete a pickup order (404)', r.status === 404);
  r = await kitchen.req('PATCH', `/api/admin/orders/${pk1.orderId}`, { action: 'status', status: 'Completed' });
  check('kitchen still hands over pickup orders as before (unchanged feature)', r.status === 200, r.text);

  // =====================================================================================================
  console.log('\n--- owner / admin powers: cancel, complete, edit items ---');
  const cancelMe = (await deliveryOrder()).json;
  const s1 = await stockOf(prod.id);
  r = await kitchen.req('PATCH', `/api/admin/orders/${cancelMe.orderId}`, { action: 'status', status: 'Cancelled', note: 'x' });
  check('kitchen cannot cancel', r.status === 403);
  r = await riderC.req('PATCH', `/api/admin/orders/${cancelMe.orderId}`, { action: 'status', status: 'Cancelled', note: 'x' });
  check('rider cannot cancel', r.status === 403);
  r = await owner.req('PATCH', `/api/admin/orders/${cancelMe.orderId}`, { action: 'status', status: 'Cancelled' });
  check('cancelling needs a reason (400)', r.status === 400 && /reason/i.test(r.json?.error || ''), r.text);
  r = await owner.req('PATCH', `/api/admin/orders/${cancelMe.orderId}`, { action: 'status', status: 'Rejected', note: 'x' });
  check('nobody rejects orders: owner gets 403', r.status === 403);
  r = await admin.req('PATCH', `/api/admin/orders/${cancelMe.orderId}`, { action: 'status', status: 'Cancelled', note: 'Customer called to cancel' });
  check('admin cancels an order with a reason', r.status === 200, r.text);
  const [cx] = await sql`select status, cancel_reason from orders where id = ${cancelMe.orderId}`;
  check('status and reason are saved, and stock is put back', cx.status === 'Cancelled' && /called/.test(cx.cancel_reason) && (await stockOf(prod.id)) === s1 + 2, `${JSON.stringify(cx)} stock ${await stockOf(prod.id)} vs ${s1 + 2}`);
  r = await owner.req('PATCH', `/api/admin/orders/${cancelMe.orderId}`, { action: 'status', status: 'Completed' });
  check('a cancelled order cannot be completed afterwards', r.status !== 200, `${r.status}`);

  const forceMe = (await deliveryOrder()).json;
  await owner.req('PATCH', `/api/admin/orders/${forceMe.orderId}`, { action: 'status', status: 'Confirmed' });
  r = await kitchen.req('PATCH', `/api/admin/orders/${forceMe.orderId}`, { action: 'status', status: 'Completed' });
  check('kitchen cannot force an order to Completed from Confirmed (403)', r.status === 403);
  r = await admin.req('PATCH', `/api/admin/orders/${forceMe.orderId}`, { action: 'status', status: 'Completed', note: 'Customer collected it themselves' });
  const [fm] = await sql`select status, payment_status from orders where id = ${forceMe.orderId}`;
  check('admin can set an order to Completed from any step (COD cash recorded)', r.status === 200 && fm.status === 'Completed' && fm.payment_status === 'cod_collected', `${r.text} ${JSON.stringify(fm)}`);
  const unpaid = (await pickupOrder()).json;
  r = await admin.req('PATCH', `/api/admin/orders/${unpaid.orderId}`, { action: 'status', status: 'Completed' });
  check('an unpaid prepaid order cannot be forced to Completed (409)', r.status === 409 && /Verify the payment/.test(r.json?.error || ''), r.text);
  r = await owner.req('PATCH', `/api/admin/orders/${unpaid.orderId}`, { action: 'status', status: 'Cancelled', note: 'test cleanup' });
  check('owner can cancel it too (with a reason)', r.status === 200);

  // ---- edit items
  const ed = (await deliveryOrder()).json; // prod x2, delivery fee 100
  const [edRow] = await sql`select subtotal, delivery_fee, total_amount from orders where id = ${ed.orderId}`;
  const items0 = (await owner.req('GET', `/api/admin/orders/${ed.orderId}`)).json.order.items;
  const base = Number(menu.products.find((p) => p.id === prod.id).price);
  const base2 = Number(menu.products.find((p) => p.id === prod2.id).price);
  const sBefore = await stockOf(prod.id);
  for (const [who, c] of [['kitchen', kitchen], ['rider', riderC], ['customer', cust], ['anonymous', anon]]) {
    r = await c.req('PATCH', `/api/admin/orders/${ed.orderId}`, { action: 'items', changes: [{ itemId: items0[0].id, quantity: 1 }] });
    check(`${who} cannot edit items (403)`, r.status === 403, `${r.status}`);
  }
  r = await owner.req('PATCH', `/api/admin/orders/${ed.orderId}`, { action: 'items', changes: [{ itemId: items0[0].id, quantity: 3 }], add: [{ productId: prod2.id, quantity: 1 }], note: 'Customer asked for one more' });
  const expectTotal = Math.round((3 * base + base2 + Number(edRow.delivery_fee)) * 100) / 100;
  check('owner changes a quantity and adds an item: total is recalculated exactly', r.status === 200 && r.json.totalAmount === expectTotal && r.json.previousTotal === Number(edRow.total_amount), `${r.text} expected ${expectTotal}`);
  check('COD: the rider/cash note says how much to collect now', /Cash to collect is now/.test(r.json?.paymentNote || ''), r.text);
  check('stock for the tracked item follows the change (one more taken)', (await stockOf(prod.id)) === sBefore - 1, `${await stockOf(prod.id)} vs ${sBefore - 1}`);
  const edDetail = (await owner.req('GET', `/api/admin/orders/${ed.orderId}`)).json.order;
  check('the order now lists the new quantities and the added item', edDetail.items.some((i) => i.id === items0[0].id && i.quantity === 3) && edDetail.items.some((i) => i.itemTitle === prod2.name && i.quantity === 1) && Number(edDetail.totalAmount) === expectTotal, JSON.stringify(edDetail.items));
  check('the change is written to the order history', edDetail.history.some((h) => /Items changed/.test(h.note || '') && /added 1 x/.test(h.note || '')));
  const [al] = await sql`select actor_email from audit_logs where action = 'order.items' and entity_id = ${ed.orderNumber}`;
  check('and to the audit log', !!al);
  const added = edDetail.items.find((i) => i.itemTitle === prod2.name);
  r = await admin.req('PATCH', `/api/admin/orders/${ed.orderId}`, { action: 'items', changes: [{ itemId: added.id, quantity: 0 }] });
  check('admin removes the added item again: total goes back', r.status === 200 && r.json.totalAmount === Math.round((3 * base + Number(edRow.delivery_fee)) * 100) / 100, r.text);
  r = await owner.req('PATCH', `/api/admin/orders/${ed.orderId}`, { action: 'items', changes: [{ itemId: items0[0].id, quantity: 0 }] });
  check('removing every item is refused (cancel the order instead)', r.status === 400 && /at least one item/i.test(r.json?.error || ''), r.text);
  r = await owner.req('PATCH', `/api/admin/orders/${ed.orderId}`, { action: 'items', changes: [{ itemId: '11111111-1111-4111-8111-111111111111', quantity: 1 }] });
  check('an item that is not in the order is refused (400)', r.status === 400);
  r = await owner.req('PATCH', `/api/admin/orders/${ed.orderId}`, { action: 'items', changes: [{ itemId: items0[0].id, quantity: 51 }] });
  check('an absurd quantity is refused (400)', r.status === 400);
  await sql`update products set stock_qty = 1 where id = ${prod.id}`;
  r = await owner.req('PATCH', `/api/admin/orders/${ed.orderId}`, { action: 'items', changes: [{ itemId: items0[0].id, quantity: 9 }] });
  check('not enough stock for a bigger quantity is refused (409) and nothing changes', r.status === 409 && (await stockOf(prod.id)) === 1, r.text);
  await sql`update products set stock_qty = 100 where id = ${prod.id}`;

  // ---- discount, timer
  console.log('\n--- order discount (even after confirmation) and the order timer ---');
  await owner.req('PATCH', `/api/admin/orders/${ed.orderId}`, { action: 'status', status: 'Confirmed' });
  const [dRow] = await sql`select subtotal, total_amount from orders where id = ${ed.orderId}`;
  for (const [who, c] of [['kitchen', kitchen], ['rider', riderC], ['customer', cust], ['anonymous', anon]]) {
    r = await c.req('PATCH', `/api/admin/orders/${ed.orderId}`, { action: 'discount', type: 'amount', value: 50 });
    check(`${who} cannot give a discount (403)`, r.status === 403, `${r.status}`);
  }
  r = await admin.req('PATCH', `/api/admin/orders/${ed.orderId}`, { action: 'discount', type: 'amount', value: 100, note: 'Loyal customer' });
  const t1 = Math.round((Number(dRow.total_amount) - 100) * 100) / 100;
  check('admin gives Rs. 100 off AFTER the order was confirmed: total drops by 100', r.status === 200 && r.json.totalAmount === t1 && r.json.manualDiscount === 100, r.text);
  const [d1] = await sql`select discount_amount, manual_discount, total_amount from orders where id = ${ed.orderId}`;
  check('stored as discount + manual discount, total updated', Number(d1.discount_amount) === 100 && Number(d1.manual_discount) === 100 && Number(d1.total_amount) === t1, JSON.stringify(d1));
  r = await cust.req('GET', `/api/orders/${ed.orderId}`);
  check('the customer\'s bill shows the discount and the new total', r.json.order.discountAmount === 100 && r.json.order.totalAmount === t1);
  r = await admin.req('PATCH', `/api/admin/orders/${ed.orderId}`, { action: 'discount', type: 'percent', value: 10 });
  const pctOff = Math.round(Number(dRow.subtotal) * 10) / 100;
  check('a percentage discount replaces the previous one (10% of the items)', r.status === 200 && r.json.manualDiscount === pctOff && r.json.totalAmount === Math.round((Number(dRow.total_amount) - pctOff) * 100) / 100, r.text);
  r = await admin.req('PATCH', `/api/admin/orders/${ed.orderId}`, { action: 'discount', type: 'amount', value: Number(dRow.subtotal) + 1 });
  check('a discount bigger than the items is refused (400)', r.status === 400 && /cannot be more than/.test(r.json?.error || ''), r.text);
  r = await admin.req('PATCH', `/api/admin/orders/${ed.orderId}`, { action: 'discount', type: 'percent', value: 101 });
  check('more than 100% is refused (400)', r.status === 400);
  r = await admin.req('PATCH', `/api/admin/orders/${ed.orderId}`, { action: 'discount', type: 'amount', value: -5 });
  check('a negative discount is refused (400)', r.status === 400);
  r = await owner.req('PATCH', `/api/admin/orders/${ed.orderId}`, { action: 'items', changes: [{ itemId: items0[0].id, quantity: 2 }] });
  const [d2] = await sql`select subtotal, discount_amount, manual_discount, total_amount from orders where id = ${ed.orderId}`;
  check('editing items afterwards keeps the admin discount (and caps it sensibly)', r.status === 200 && Number(d2.manual_discount) === pctOff && Math.abs(Number(d2.total_amount) - (Number(d2.subtotal) - Number(d2.discount_amount) + Number(edRow.delivery_fee))) < 0.01, JSON.stringify(d2));
  r = await admin.req('PATCH', `/api/admin/orders/${ed.orderId}`, { action: 'discount', type: 'amount', value: 0 });
  const [d3] = await sql`select discount_amount, manual_discount from orders where id = ${ed.orderId}`;
  check('value 0 removes the admin discount', r.status === 200 && Number(d3.discount_amount) === 0 && Number(d3.manual_discount) === 0, JSON.stringify(d3));
  const [dh] = await sql`select count(*)::int n from order_status_history where order_id = ${ed.orderId} and note like 'Admin discount%'`;
  const [da] = await sql`select count(*)::int n from audit_logs where action = 'order.discount' and entity_id = ${ed.orderNumber}`;
  check('every discount change is in the order history and the audit log', dh.n >= 3 && da.n >= 3, `${dh.n}/${da.n}`);

  // pickup + already-paid prepaid order: the refund note
  const pp = (await pickupOrder({ paymentReference: 'RT-PAID-1' })).json;
  await owner.req('PATCH', `/api/admin/orders/${pp.orderId}`, { action: 'payment', decision: 'verify' });
  r = await owner.req('PATCH', `/api/admin/orders/${pp.orderId}`, { action: 'discount', type: 'amount', value: 50 });
  check('a pickup order can be discounted too, and a paid order gets a refund note', r.status === 200 && /already paid/.test(r.json.paymentNote || '') && /Refund Rs\. 50/.test(r.json.paymentNote || ''), r.text);
  r = await riderC.req('GET', '/api/rider/orders');
  await owner.req('PATCH', `/api/admin/orders/${pp.orderId}`, { action: 'status', status: 'Completed' });
  r = await owner.req('PATCH', `/api/admin/orders/${pp.orderId}`, { action: 'discount', type: 'amount', value: 10 });
  check('a finished order cannot be discounted (409)', r.status === 409);

  // the rider collects the DISCOUNTED amount
  const rd = (await deliveryOrder()).json;
  await toOut(rd.orderId);
  await owner.req('PATCH', `/api/admin/orders/${rd.orderId}`, { action: 'discount', type: 'amount', value: 40 });
  r = await riderC.req('GET', '/api/rider/orders');
  const rdv = r.json.active.find((o) => o.id === rd.orderId);
  check('the rider sees the discount and collects the reduced total', rdv && rdv.discountAmount === 40 && rdv.amountToCollect === Math.round((rd.totalAmount - 40) * 100) / 100, JSON.stringify(rdv));
  await riderC.req('POST', `/api/rider/orders/${rd.orderId}/deliver`, { delivered: true, paymentReceived: true });

  // ---- timer
  const tm = (await deliveryOrder()).json;
  await owner.req('PATCH', `/api/admin/orders/${tm.orderId}`, { action: 'status', status: 'Confirmed' });
  for (const [who, c] of [['kitchen', kitchen], ['rider', riderC], ['customer', cust], ['anonymous', anon]]) {
    r = await c.req('PATCH', `/api/admin/orders/${tm.orderId}`, { action: 'eta', minutes: 20 });
    check(`${who} cannot set a timer (403)`, r.status === 403, `${r.status}`);
  }
  r = await admin.req('PATCH', `/api/admin/orders/${tm.orderId}`, { action: 'eta', minutes: 25 });
  const left = r.status === 200 ? (new Date(r.json.etaAt).getTime() - Date.now()) / 60000 : -1;
  check('admin sets a 25 minute timer', r.status === 200 && left > 24 && left <= 25.1, r.text);
  r = await cust.req('GET', `/api/orders/${tm.orderId}`);
  check('the customer can see when it is due (to show the time left)', !!r.json.order.etaAt && Math.abs((new Date(r.json.order.etaAt).getTime() - Date.now()) / 60000 - 25) < 1.5, r.text.slice(0, 200));
  r = await kitchen.req('GET', '/api/admin/kitchen');
  check('the kitchen board gets the timer too (and still no money)', !!r.json.orders.find((o) => o.id === tm.orderId)?.etaAt && r.json.orders.every((o) => o.totalAmount === undefined));
  r = await admin.req('PATCH', `/api/admin/orders/${tm.orderId}`, { action: 'eta', minutes: 0 });
  check('0 minutes is refused (400)', r.status === 400);
  r = await admin.req('PATCH', `/api/admin/orders/${tm.orderId}`, { action: 'eta', minutes: 481 });
  check('more than 8 hours is refused (400)', r.status === 400);
  r = await admin.req('PATCH', `/api/admin/orders/${tm.orderId}`, { action: 'eta', minutes: null });
  const [tc] = await sql`select eta_at from orders where id = ${tm.orderId}`;
  check('the timer can be cleared', r.status === 200 && tc.eta_at === null);
  await admin.req('PATCH', `/api/admin/orders/${tm.orderId}`, { action: 'eta', minutes: 15 });
  const [th] = await sql`select count(*)::int n from order_status_history where order_id = ${tm.orderId} and note like 'Timer%'`;
  check('timer changes are in the history', th.n === 3, `${th.n}`);

  // ---- feedback (also uses this order once it is completed)
  console.log('\n--- customer feedback ---');
  r = await cust.req('POST', `/api/orders/${tm.orderId}/feedback`, { rating: 5 });
  check('feedback before the order is completed is refused (409)', r.status === 409, r.text);
  r = await anon.req('POST', `/api/orders/${tm.orderId}/feedback`, { rating: 5 });
  check('anonymous cannot leave feedback (401)', r.status === 401);
  await admin.req('PATCH', `/api/admin/orders/${tm.orderId}`, { action: 'status', status: 'Completed', note: 'done' });
  r = await admin.req('PATCH', `/api/admin/orders/${tm.orderId}`, { action: 'eta', minutes: 10 });
  check('a finished order cannot get a timer (409)', r.status === 409);
  r = await other.req('POST', `/api/orders/${tm.orderId}/feedback`, { rating: 5 });
  check("another customer cannot rate someone else's order (404)", r.status === 404);
  for (const bad of [{ rating: 0 }, { rating: 6 }, { rating: 'x' }, {}, { rating: 4, comment: 'x'.repeat(501) }]) {
    r = await cust.req('POST', `/api/orders/${tm.orderId}/feedback`, bad);
    check(`invalid feedback ${JSON.stringify(bad).slice(0, 40)} is refused (400)`, r.status === 400, `${r.status}`);
  }
  r = await cust.req('POST', `/api/orders/${tm.orderId}/feedback`, { rating: 5, comment: 'Hot and on time. Thank you!' });
  check('the customer rates a completed order', r.status === 200 && r.json.feedback.rating === 5, r.text);
  r = await cust.req('POST', `/api/orders/${tm.orderId}/feedback`, { rating: 3, comment: '  Changed my mind  ' });
  const [{ n: fbRows }] = await sql`select count(*)::int n from order_feedback where order_id = ${tm.orderId}`;
  check('sending again edits it (still one feedback per order)', r.status === 200 && fbRows === 1 && r.json.feedback.comment === 'Changed my mind');
  r = await cust.req('GET', `/api/orders/${tm.orderId}`);
  check('the customer sees their own feedback on the order', r.json.order.feedback?.rating === 3);
  r = await anon.req('GET', `/api/orders/${tm.orderId}?t=${tm.trackingToken}`);
  check('a tracking-link holder does not see the feedback', r.status === 200 && r.json.order.feedback === null);
  r = await owner.req('GET', `/api/admin/orders/${tm.orderId}`);
  check('owner/admin see the rating and comment on the order', r.json.order.feedback?.rating === 3 && r.json.order.feedback.comment === 'Changed my mind');
  r = await owner.req('GET', '/api/admin/orders?q=' + encodeURIComponent(tm.orderNumber));
  check('and a star rating in the orders list', r.json.orders.find((o) => o.id === tm.orderId)?.feedbackRating === 3);
  r = await riderC.req('GET', `/api/admin/orders/${tm.orderId}`);
  check('a rider cannot see feedback (403)', r.status === 403);

  // =====================================================================================================
  console.log('\n--- deleting old orders (owner/admin only) ---');
  const { c: owner2 } = { c: owner };
  const finished = [tm.orderId, forceMe.orderId, cancelMe.orderId];
  const live = (await deliveryOrder()).json;
  for (const [who, c] of [['kitchen', kitchen], ['rider', riderC], ['customer', cust], ['anonymous', anon]]) {
    r = await c.req('POST', '/api/admin/orders/delete', { ids: [cancelMe.orderId] });
    check(`${who} cannot delete orders (403)`, r.status === 403, `${r.status}`);
  }
  r = await owner2.req('POST', '/api/admin/orders/delete', { ids: [] });
  check('deleting nothing is a 400', r.status === 400);
  r = await owner2.req('POST', '/api/admin/orders/delete', { ids: ['nope'] });
  check('a malformed id is a 400', r.status === 400);
  r = await owner2.req('POST', '/api/admin/orders/delete', { ids: [cancelMe.orderId, live.orderId] });
  const [still] = await sql`select count(*)::int n from orders where id in (${cancelMe.orderId}, ${live.orderId})`;
  check('an order still in progress blocks the whole request (409) and nothing is deleted', r.status === 409 && still.n === 2 && /Only completed, cancelled or rejected/.test(r.json?.error || ''), r.text);

  // a finished order with a payment screenshot, so we can see the file go too
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData(); form.append('file', new File([png], 'shot.png', { type: 'image/png' }));
  const up = await cust.req('POST', '/api/upload/proof', form);
  const proofName = up.json?.file;
  const withProof = (await pickupOrder({ paymentReference: 'RT-DEL-1', paymentProofFile: proofName })).json;
  const proofPath = path.join(process.env.STORAGE_DIR || 'storage', 'proofs', String(proofName));
  const existedBefore = fs.existsSync(proofPath);
  await cust.req('POST', `/api/orders/${withProof.orderId}/cancel`, {}); // the customer cancels: now it is finished
  const [ordRow] = await sql`select order_number from orders where id = ${tm.orderId}`;
  const [sm] = await sql`select count(*)::int n from stock_movements where order_id = ${cancelMe.orderId}`;
  const [oi] = await sql`select count(*)::int n from order_items where order_id = ${cancelMe.orderId}`;
  const [fbn] = await sql`select count(*)::int n from order_feedback where order_id = ${tm.orderId}`;
  const ids = [...finished, withProof.orderId];
  r = await admin.req('POST', '/api/admin/orders/delete', { ids });
  check('admin deletes finished orders (completed, cancelled, customer-cancelled)', r.status === 200 && r.json.deleted === 4, r.text);
  const [gone] = await sql`select count(*)::int n from orders where id = any(${ids})`;
  const [oi2] = await sql`select count(*)::int n from order_items where order_id = any(${ids})`;
  const [fb2] = await sql`select count(*)::int n from order_feedback where order_id = any(${ids})`;
  const [hs2] = await sql`select count(*)::int n from order_status_history where order_id = any(${ids})`;
  const [ps2] = await sql`select count(*)::int n from payment_submissions where order_id = any(${ids})`;
  check('the orders and everything attached (items, history, payments, feedback) are gone', gone.n === 0 && oi2.n === 0 && fb2.n === 0 && hs2.n === 0 && ps2.n === 0 && oi.n > 0 && fbn.n === 1, JSON.stringify({ gone, oi2, fb2, hs2, ps2 }));
  const [smAfter] = await sql`select count(*)::int n from stock_movements where reason like ${'Order ' + cancelMe.orderNumber + '%'} and order_id is null`;
  check('stock history is kept (it just no longer points at the deleted order)', sm.n > 0 && smAfter.n === sm.n, `${sm.n} vs ${smAfter.n}`);
  check('the payment screenshot file was removed too', existedBefore && !fs.existsSync(proofPath), `existed=${existedBefore} nowExists=${fs.existsSync(proofPath)}`);
  const del = await sql`select action, entity_id from audit_logs where action = 'order.delete' and entity_id in (${cancelMe.orderNumber}, ${forceMe.orderNumber}, ${ordRow.order_number})`;
  check('each deletion is in the audit log', del.length === 3, `${del.length}`);
  r = await owner.req('GET', '/api/admin/orders?q=' + encodeURIComponent(cancelMe.orderNumber));
  check('they no longer show in the orders list', r.json.orders.length === 0);
  r = await admin.req('POST', '/api/admin/orders/delete', { ids: [cancelMe.orderId] });
  check('deleting an already-deleted order is harmless (0 deleted)', r.status === 200 && r.json.deleted === 0);
  // Order numbers are "highest number issued today + 1", so deleting earlier orders must never make a new order clash.
  const maxBefore = (await sql`select coalesce(max(substring(order_number from '[0-9]+$')::int), 0)::int n from orders where order_number like ${'HBT-' + live.orderNumber.split('-')[1] + '-%'}`)[0].n;
  r = await pickupOrder();
  const [{ n: sameNo }] = await sql`select count(*)::int n from orders where order_number = ${r.json?.orderNumber || ''}`;
  check('after deleting earlier orders, a new order still gets a free number (no clash)', r.status === 200 && sameNo === 1 && Number(r.json.orderNumber.split('-')[2]) === maxBefore + 1, `${r.status} ${r.text} maxBefore=${maxBefore}`);
  await cust.req('POST', `/api/orders/${r.json.orderId}/cancel`, {});
  await owner.req('PATCH', `/api/admin/orders/${live.orderId}`, { action: 'status', status: 'Cancelled', note: 'test cleanup' });

  // =====================================================================================================
  console.log('\n--- removing the rider ---');
  r = await owner.req('GET', '/api/admin/staff');
  const rid = r.json.staff.find((s) => s.email === riderEmail).id;
  r = await owner.req('DELETE', `/api/admin/staff/${rid}`);
  check('owner removes rider access', r.status === 200);
  r = await riderC.req('GET', '/api/rider/orders');
  check('the rider is locked out of the rider endpoint immediately', r.status === 403);
  r = await riderC.req('GET', '/api/auth/me?scope=staff');
  check('and their staff session is gone', r.json.user === null);
} finally {
  // restore everything this script touched
  await sql`update products set track_stock = ${origProd.track_stock}, stock_qty = ${origProd.stock_qty} where id = ${prod.id}`;
  if (origDel) await sql`update shop_settings set value = ${sql.json(origDel.value)} where key = 'delivery'`; else await sql`delete from shop_settings where key = 'delivery'`;
  await sql`update shop_settings set value = ${sql.json(origPay.value)} where key = 'payment'`;
  await sql`update profiles set is_active = false where email in (${adminEmail}, ${kitchenEmail}, ${riderEmail})`;
}
console.log(`\n${pass} passed, ${fail} failed`);
sink.close();
sql.end().finally(() => process.exit(fail ? 1 : 0));
