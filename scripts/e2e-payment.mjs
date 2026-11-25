// E2E for confirming a payment without proof, payment reminders, and what the customer then sees. Also the database
// reconnect helpers. LOCAL ONLY (it places orders and creates accounts).
// The app needs SMTP_HOST=127.0.0.1 SMTP_PORT=2525 (this script runs the mail sink).
//   BASE=http://localhost:3100 DATABASE_URL=postgresql://...localhost... OWNER_EMAIL=owner@example.com node scripts/e2e-payment.mjs
import postgres from 'postgres';
import { startMailSink } from './mail-sink.mjs';
import { isTransientDbError, retryRead, serverlessDatabaseUrl } from '../src/lib/dbResilience.js';
import { reminderText, reminderWhatsappUrl } from '../src/lib/paymentReminder.js';

const BASE = process.env.BASE || 'http://localhost:3100';
const OWNER = process.env.OWNER_EMAIL || 'owner@example.com';
if (!/\/\/(localhost|127\.0\.0\.1)/.test(BASE) || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  throw new Error('Refusing to run: BASE and DATABASE_URL must both be local.');
}
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`); };

// ---------- database reconnect helpers (no server) ----------
const url = 'postgresql://postgres.abc:p%40ss@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';
check('on Vercel the session pooler port becomes the transaction pooler', serverlessDatabaseUrl(url, { VERCEL: '1' }) === url.replace(':5432/', ':6543/'));
check('elsewhere the address is left alone', serverlessDatabaseUrl(url, {}) === url);
check('other databases are left alone', serverlessDatabaseUrl('postgresql://u:p@db.example.com:5432/x', { VERCEL: '1' }).includes(':5432/'));
check('a full pool is recognised through a wrapping error', isTransientDbError(Object.assign(new Error('Failed query'), { cause: Object.assign(new Error('MaxClientsInSessionMode: max clients reached'), { code: 'XX000' }) })));
check('a wrong query is not retried', !isTransientDbError(Object.assign(new Error('relation "x" does not exist'), { code: '42P01' })));
let tries = 0;
const got = await retryRead(async () => { tries += 1; if (tries < 3) throw Object.assign(new Error('x'), { code: 'CONNECT_TIMEOUT' }); return 'ok'; }, { sleep: async () => {} });
check('a read is retried until the database answers', got === 'ok' && tries === 3);
tries = 0;
await retryRead(async () => { tries += 1; throw new Error('syntax error'); }, { sleep: async () => {} }).catch(() => {});
check('a real error is thrown at once', tries === 1);

// ---------- reminder wording ----------
const text = reminderText({ order: { customerName: 'Ali', orderNumber: 'HBT-1', totalAmount: '900.00', paymentMethod: 'jazzcash' }, shopName: 'Shop', payment: { jazzcash: { enabled: true, number: '03001234567', title: 'HBT' } }, orderUrl: 'https://s.example/orders/1' });
check('the reminder names the amount, the account, and asks for proof', /Rs\. 900/.test(text) && /03001234567/.test(text) && /proof of payment/.test(text) && /not received/.test(text) && text.includes('https://s.example/orders/1'), text);
check('WhatsApp link uses the country code', reminderWhatsappUrl('03001234567', 'hi') === 'https://wa.me/923001234567?text=hi');
check('no WhatsApp link without a usable number', reminderWhatsappUrl('', 'hi') === null);

// ---------- against the app ----------
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const sink = await startMailSink(2525);

class Client {
  jar = {};
  async req(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ') },
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
const signIn = async (client, email, staff) => {
  const base = staff ? '/api/auth/staff/otp' : '/api/auth/otp';
  const before = sink.count();
  await client.req('POST', `${base}/request`, { email });
  const code = await sink.codeFor(email, before);
  return client.req('POST', `${base}/verify`, { email, code });
};

const stamp = Date.now();
const [origPay] = await sql`select value from shop_settings where key='payment'`;
const [origShop] = await sql`select value from shop_settings where key='shop'`;
try {
  await sql`update shop_settings set value = ${sql.json({ ...origPay.value, bank: { enabled: true, bank_name: 'TEST BANK', account_title: 'TEST TITLE', account_number: '555000', iban: '' } })} where key='payment'`;
  await sql`update shop_settings set value = ${sql.json({ ...origShop.value, open_time: '00:00', close_time: '00:00' })} where key='shop'`;
  await sql`delete from rate_limits`;

  const custEmail = `pay${stamp}@example.com`;
  const cust = new Client();
  await signIn(cust, custEmail, false);
  await cust.req('PATCH', '/api/auth/me', { fullName: 'Pay Tester', phone: '03001234567' });
  const owner = new Client();
  check('owner signs in', (await signIn(owner, OWNER, true)).status === 200);
  const chefEmail = `chef${stamp}@example.com`;
  await owner.req('POST', '/api/admin/staff', { email: chefEmail, role: 'kitchen' });
  const chef = new Client();
  await signIn(chef, chefEmail, true);

  const prod = (await cust.req('GET', '/api/menu')).json.products.find((p) => p.available);
  const place = async (method = 'bank_transfer', extra = {}) => (await cust.req('POST', '/api/checkout', {
    customerName: 'Pay Tester', customerPhone: '03001234567', items: [{ type: 'product', id: prod.id, quantity: 1 }], orderType: 'pickup', paymentMethod: method, ...extra,
  })).json;
  const admin = (id, body, who = owner) => who.req('PATCH', `/api/admin/orders/${id}`, body);
  const view = async (id) => (await cust.req('GET', `/api/orders/${id}`)).json.order;
  const mails = () => sink.mailsTo(custEmail).length;

  // reminder on an order with no proof
  const a = await place();
  check('a transfer order starts as awaiting payment', a.status === 'Payment Pending', JSON.stringify(a));
  check('kitchen cannot confirm without proof', (await admin(a.orderId, { action: 'payment', decision: 'manual' }, chef)).status === 403);
  check('kitchen cannot send reminders', (await admin(a.orderId, { action: 'remind_payment' }, chef)).status === 403);
  check('a customer cannot confirm their own payment', (await admin(a.orderId, { action: 'payment', decision: 'manual' }, cust)).status === 403);
  let o = await view(a.orderId);
  check('before a reminder the form is open and there is no banner', o.canSubmitPayment === true && o.paymentReminderAt === null, JSON.stringify(o));
  const mailsBefore = mails();
  let r = await admin(a.orderId, { action: 'remind_payment' });
  await new Promise((x) => setTimeout(x, 600));
  check('owner sends a reminder', r.status === 200 && r.json.email === 'sent' && r.json.whatsappUrl.startsWith('https://wa.me/923001234567?text='), JSON.stringify(r.json));
  check('the reminder gives the account and asks for proof', /555000/.test(r.json.message) && /proof of payment/.test(r.json.message), r.json.message);
  check('the customer receives it by email', mails() === mailsBefore + 1, `${mailsBefore} -> ${mails()}`);
  o = await view(a.orderId);
  check('the customer order page shows the reminder', !!o.paymentReminderAt && o.canSubmitPayment === true);
  r = await admin(a.orderId, { action: 'remind_payment' });
  await new Promise((x) => setTimeout(x, 400));
  check('pressing again does not email twice', r.status === 200 && r.json.email === 'recent' && mails() === mailsBefore + 1, JSON.stringify(r.json));

  // customer answers, shop still cannot find the money, asks for proof again
  check('customer sends a transaction ID', (await cust.req('POST', `/api/orders/${a.orderId}/payment`, { reference: 'TX-1' })).status === 200);
  o = await view(a.orderId);
  check('answering clears the reminder and closes the form', o.status === 'Payment Verification' && o.paymentReminderAt === null && o.canSubmitPayment === false, JSON.stringify(o));
  check('without a reminder nothing more can be sent (as before)', (await cust.req('POST', `/api/orders/${a.orderId}/payment`, { reference: 'TX-2' })).status === 409);
  await sql`update order_status_history set created_at = created_at - interval '20 minutes' where order_id = ${a.orderId} and note = 'Payment reminder sent'`;
  await sql`update payment_submissions set submitted_at = submitted_at - interval '15 minutes' where order_id = ${a.orderId}`;
  r = await admin(a.orderId, { action: 'remind_payment' });
  check('owner can ask for proof of a submitted payment', r.status === 200 && r.json.email === 'sent', JSON.stringify(r.json));
  o = await view(a.orderId);
  check('the customer may now add proof', !!o.paymentReminderAt && o.canSubmitPayment === true, JSON.stringify(o));
  check('and does', (await cust.req('POST', `/api/orders/${a.orderId}/payment`, { reference: 'TX-2' })).status === 200);
  r = await admin(a.orderId, { action: 'payment', decision: 'verify' });
  check('verifying confirms the order', r.json.status === 'Confirmed' && r.json.paymentStatus === 'verified', JSON.stringify(r.json));
  const [{ n: left }] = await sql`select count(*)::int n from payment_submissions where order_id = ${a.orderId} and status = 'pending'`;
  check('every submission is settled together', left === 0);

  // confirm without any proof
  const b = await place();
  r = await admin(b.orderId, { action: 'payment', decision: 'manual' });
  check('owner confirms an order with no proof or transaction ID', r.status === 200 && r.json.status === 'Confirmed' && r.json.paymentStatus === 'verified', JSON.stringify(r.json));
  const [h] = await sql`select note from order_status_history where order_id = ${b.orderId} and to_status = 'Confirmed' order by created_at desc limit 1`;
  const [log] = await sql`select count(*)::int n from audit_logs where action = 'payment.verify_manual' and entity_id = ${b.orderNumber}`;
  check('it is recorded as confirmed without proof', h.note === 'Payment confirmed by staff without proof' && log.n === 1, h.note);
  check('confirming twice is refused', (await admin(b.orderId, { action: 'payment', decision: 'manual' })).status === 409);
  check('no reminder for a paid order', (await admin(b.orderId, { action: 'remind_payment' })).status === 409);
  o = await view(b.orderId);
  check('the customer no longer sees the form', o.canSubmitPayment === false && o.paymentReminderAt === null);
  check('the kitchen can now cook it', (await admin(b.orderId, { action: 'status', status: 'Cooking' }, chef)).status === 200);
  r = await admin(b.orderId, { action: 'eta', minutes: 20 });
  o = await view(b.orderId);
  check('a timer set by the owner reaches the customer', r.status === 200 && !!o.etaAt && o.status === 'Cooking', JSON.stringify(r.json));
  check('and the order completes', (await admin(b.orderId, { action: 'status', status: 'Completed' })).status === 200);

  // limits
  const c = await place();
  await admin(c.orderId, { action: 'status', status: 'Cancelled', note: 'test' });
  check('a cancelled order cannot be confirmed', (await admin(c.orderId, { action: 'payment', decision: 'manual' })).status === 409);
  const d = (await cust.req('POST', '/api/checkout', { customerName: 'Pay Tester', customerPhone: '03001234567', items: [{ type: 'product', id: prod.id, quantity: 1 }], orderType: 'delivery', paymentMethod: 'cod', deliveryAddress: 'Test 1', deliveryLat: origShop.value.lat, deliveryLng: origShop.value.lng })).json;
  check('cash on delivery has nothing to confirm', (await admin(d.orderId, { action: 'payment', decision: 'manual' })).status === 400, JSON.stringify(d));
  await admin(d.orderId, { action: 'status', status: 'Cancelled', note: 'test' });
  const e = await place('bank_transfer', { paymentReference: 'TX-9' });
  r = await admin(e.orderId, { action: 'payment', decision: 'reject', notes: 'not found' });
  check('rejecting still works', r.json.status === 'Payment Pending' && r.json.paymentStatus === 'rejected', JSON.stringify(r.json));
  r = await admin(e.orderId, { action: 'payment', decision: 'manual' });
  check('and a rejected payment can be confirmed once the money is seen', r.json.status === 'Confirmed' && r.json.paymentStatus === 'verified', JSON.stringify(r.json));

  await owner.req('DELETE', `/api/admin/staff/${(await sql`select id from profiles where email = ${chefEmail}`)[0].id}`);
} finally {
  await sql`update shop_settings set value = ${sql.json(origPay.value)} where key='payment'`;
  await sql`update shop_settings set value = ${sql.json(origShop.value)} where key='shop'`;
  await sql.end();
  sink.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
