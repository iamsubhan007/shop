import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getSettings } from './settings';
import { PAYMENT_LABELS } from '@/lib/orderStatus';
import { buildReceiptPdf } from './receipt';

const { orders, orderItems, notifications } = schema;

export function whatsappConfigured() {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function buildOrderText(orderId) {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const lines = [
    `*NEW ORDER ${o.orderNumber}*`,
    new Date(o.createdAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' }),
    '',
    `Customer: ${o.customerName}`,
    `Phone: ${o.customerPhone}`,
    `Type: ${o.orderType === 'delivery' ? 'Home Delivery' : 'Pickup'}`,
    ...(o.orderType === 'delivery' ? [`Address: ${o.deliveryAddress}`, `Map: https://maps.google.com/?q=${o.deliveryLat},${o.deliveryLng}`] : []),
    '',
    ...items.map((i) => `${i.quantity} x ${i.itemTitle} - Rs. ${Number(i.subtotalPrice)}${i.notes ? ` (${i.notes})` : ''}`),
    '',
    `Subtotal: Rs. ${Number(o.subtotal)}`,
    ...(Number(o.discountAmount) ? [`Discount: -Rs. ${Number(o.discountAmount)}`] : []),
    ...(Number(o.deliveryFee) ? [`Delivery: Rs. ${Number(o.deliveryFee)}`] : []),
    `*Total: Rs. ${Number(o.totalAmount)}*`,
    `Payment: ${PAYMENT_LABELS[o.paymentMethod]} (${o.paymentStatus.replace('_', ' ')})`,
    ...(o.paymentReference ? [`Txn ref: ${o.paymentReference}`] : []),
    ...(o.specialInstructions ? ['', `Note: ${o.specialInstructions}`] : []),
  ];
  return lines.join('\n');
}

async function sendText(to, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(`${GRAPH()}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
      signal: ctl.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${json?.error?.message || 'error'}`);
    return json?.messages?.[0]?.id || null;
  } finally {
    clearTimeout(timer);
  }
}

const API_BASE = () => (process.env.WHATSAPP_API_BASE || 'https://graph.facebook.com/v21.0').replace(/\/$/, '');
const GRAPH = () => `${API_BASE()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}`;

async function sendPdf(to, orderId, orderNumber, signal) {
  const pdf = await buildReceiptPdf(orderId);
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'application/pdf');
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), `${orderNumber}.pdf`);
  const up = await fetch(`${GRAPH()}/media`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }, body: form, signal });
  const upJson = await up.json().catch(() => ({}));
  if (!up.ok || !upJson.id) throw new Error(`media upload ${up.status}: ${upJson?.error?.message || 'error'}`);
  const res = await fetch(`${GRAPH()}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'document', document: { id: upJson.id, filename: `${orderNumber}.pdf`, caption: `New order ${orderNumber}` } }),
    signal,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`send document ${res.status}: ${j?.error?.message || 'error'}`);
  return j?.messages?.[0]?.id || null;
}

/**
 * Sends the owner notification for an order exactly once. Safe to call repeatedly:
 * a row already 'sent' is skipped. Failures are recorded and never affect the order.
 */
export async function dispatchOrderNotification(orderId, { force = false } = {}) {
  // Automatic WhatsApp alerts are optional. Without the Cloud API credentials there is nothing to send, so do nothing:
  // no failed rows and no red errors in the portal. The portal offers "Share on WhatsApp" / "Copy order text" instead.
  if (!whatsappConfigured()) return;
  try {
    const [n] = await db
      .insert(notifications)
      .values({ orderId, channel: 'whatsapp', kind: 'order_created' })
      .onConflictDoUpdate({ target: [notifications.orderId, notifications.channel, notifications.kind], set: { orderId } })
      .returning();
    if (n.status === 'sent' && !force) return n;

    const settings = await getSettings();
    const to = (process.env.OWNER_WHATSAPP || settings.shop.whatsapp || '').replace(/\D/g, '');
    if (!to) throw new Error('Owner WhatsApp number missing');

    // Claim the row so concurrent calls don't double-send
    const claimed = await db
      .update(notifications)
      .set({ status: 'retrying', attempts: sql`${notifications.attempts} + 1` })
      .where(and(eq(notifications.id, n.id), sql`${notifications.status} <> 'retrying' OR ${notifications.createdAt} < now() - interval '2 minutes'`))
      .returning();
    if (!claimed.length) return;

    try {
      // Preferred: PDF receipt, hard 12 s budget. Anything slower or failing falls back to a plain text message.
      const [ord] = await db.select({ orderNumber: orders.orderNumber }).from(orders).where(eq(orders.id, orderId));
      let id = null;
      let note = null;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 12000);
      try {
        id = await sendPdf(to, orderId, ord.orderNumber, ctl.signal);
      } catch (pdfErr) {
        note = `PDF not delivered (${ctl.signal.aborted ? 'timed out after 12 s' : String(pdfErr.message).slice(0, 160)}); sent as text.`;
        id = await sendText(to, await buildOrderText(orderId));
      } finally {
        clearTimeout(timer);
      }
      await db.update(notifications).set({ status: 'sent', sentAt: new Date(), providerMessageId: id, lastError: note }).where(eq(notifications.id, n.id));
    } catch (err) {
      await db.update(notifications).set({ status: 'failed', lastError: String(err.message).slice(0, 300) }).where(eq(notifications.id, n.id));
    }
  } catch (e) {
    console.error('notification dispatch error', e.message);
  }
}
