import 'server-only';
import * as webpush from 'web-push'; // v4 is an ES module with named exports only (no default export)
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { cleanEnv } from '@/lib/env';
import { NEEDS_ACCEPTANCE, PAYMENT_LABELS } from '@/lib/orderStatus';

const { pushSubscriptions, profiles, orders, orderItems } = schema;

// Web Push for new-order alerts. It reaches owner/admin/kitchen devices even when the portal tab is closed.
// Needs a VAPID key pair (npm run push:keys) in VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, plus a contact in VAPID_SUBJECT
// ("mailto:you@example.com"); the contact defaults to OWNER_EMAIL / SMTP_USER. Without keys everything here is a no-op.
let state; // undefined = not read yet, null = not configured, object = ready
function config() {
  if (state !== undefined) return state;
  const publicKey = cleanEnv(process.env.VAPID_PUBLIC_KEY);
  const privateKey = cleanEnv(process.env.VAPID_PRIVATE_KEY);
  if (!publicKey || !privateKey) return (state = null);
  const email = cleanEnv(process.env.OWNER_EMAIL) || cleanEnv(process.env.SMTP_USER);
  const contact = cleanEnv(process.env.VAPID_SUBJECT) || (email ? `mailto:${email}` : '');
  if (!contact) { console.error('push: set VAPID_SUBJECT (for example mailto:you@example.com)'); return (state = null); }
  try {
    webpush.setVapidDetails(contact, publicKey, privateKey);
    return (state = { publicKey });
  } catch (e) {
    console.error('push: the VAPID settings are invalid:', e.message);
    return (state = null);
  }
}

export const pushConfigured = () => !!config();
export const pushPublicKey = () => config()?.publicKey || null;

const money = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString('en-PK')}`;

/** What the notification says. Kitchen never sees money; owner/admin do. */
export function payloadFor(order, itemCount, role) {
  const needsPaymentCheck = order.status === 'Payment Verification';
  const parts = [order.orderNumber, order.orderType === 'delivery' ? 'Delivery' : 'Pickup', `${itemCount} item${itemCount === 1 ? '' : 's'}`];
  if (needsPaymentCheck) parts.splice(1, 0, PAYMENT_LABELS[order.paymentMethod] || 'Payment');
  if (role !== 'kitchen') parts.push(money(order.totalAmount));
  return {
    title: needsPaymentCheck ? 'Payment to check' : 'New order',
    body: parts.join(' · '),
    tag: `order-${order.id}`, // one notification per order; a repeat replaces it instead of piling up
    url: role === 'kitchen' ? '/admin/kitchen' : `/admin/orders?open=${order.id}`,
    orderId: order.id,
  };
}

/** Sends a test notification to the devices of ONE staff member, so they can check alerts work on their phone/PC. */
export async function sendTestPush(profileId) {
  try {
    if (!config()) return { sent: 0, removed: 0, devices: 0 };
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.profileId, profileId));
    const body = JSON.stringify({ title: 'Test notification', body: 'Order alerts are working on this device.', tag: 'test', url: '/admin', orderId: null });
    const results = await Promise.allSettled(subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 300, urgency: 'high', timeout: 8000 })));
    const gone = subs.filter((_, i) => results[i].status === 'rejected' && [404, 410].includes(results[i].reason?.statusCode)).map((s) => s.id);
    if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
    return { sent: results.filter((r) => r.status === 'fulfilled').length, removed: gone.length, devices: subs.length };
  } catch (e) {
    console.error('push: test failed', e.message);
    return { sent: 0, removed: 0, devices: 0 };
  }
}

/**
 * Pushes an order to every subscribed device whose owner can act on it right now (same rule as the in-portal alarm:
 * a new COD order -> owner, admin, kitchen; a prepaid order whose payment was submitted -> owner, admin).
 * Never throws and never blocks an order. Devices the push service reports as gone (404/410) are removed.
 */
export async function notifyStaffOfOrder(orderId) {
  try {
    if (!config()) return { sent: 0, removed: 0 };
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) return { sent: 0, removed: 0 };
    const roles = Object.keys(NEEDS_ACCEPTANCE).filter((r) => NEEDS_ACCEPTANCE[r].includes(order.status));
    if (!roles.length) return { sent: 0, removed: 0 }; // e.g. a prepaid order still waiting for the customer to pay

    const items = await db.select({ q: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, orderId));
    const itemCount = items.reduce((a, i) => a + i.q, 0);
    const subs = await db
      .select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth, role: profiles.role })
      .from(pushSubscriptions)
      .innerJoin(profiles, eq(profiles.id, pushSubscriptions.profileId))
      .where(and(eq(profiles.isActive, true), inArray(profiles.role, roles)));

    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payloadFor(order, itemCount, s.role)), { TTL: 3600, urgency: 'high', timeout: 8000 }),
      ),
    );
    const gone = [];
    results.forEach((r, i) => {
      if (r.status !== 'rejected') return;
      const code = r.reason?.statusCode;
      if (code === 404 || code === 410) gone.push(subs[i].id);
      else console.error('push: send failed', { code, message: String(r.reason?.message || '').slice(0, 120) });
    });
    if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
    return { sent: results.filter((r) => r.status === 'fulfilled').length, removed: gone.length };
  } catch (e) {
    console.error('push: notify failed', e.message);
    return { sent: 0, removed: 0 };
  }
}
