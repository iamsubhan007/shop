import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { REMINDER_NOTE, paymentUnconfirmed, reminderText, reminderWhatsappUrl } from '@/lib/paymentReminder';
import { sendStaffEmail } from '@/lib/email';
import { siteUrl } from '@/lib/seo';
import { OrderError, latestReminder } from './orders';
import { getSettings } from './settings';
import { audit } from './audit';

const { orders, orderStatusHistory } = schema;
const EMAIL_AGAIN_AFTER_MS = 10 * 60 * 1000; // pressing the button twice must not fill the customer's inbox

/** Owner/admin only (the caller checks): ask the customer to pay, or to send proof. */
export async function remindPayment(orderId, actor) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new OrderError('Order not found.', 'not_found', 404);
  if (!paymentUnconfirmed(order)) throw new OrderError('This order is not waiting for a payment.', 'not_allowed', 409);

  const settings = await getSettings();
  const text = reminderText({ order, shopName: settings.shop.name, payment: settings.payment, orderUrl: `${siteUrl()}/orders/${order.id}` });

  const last = await latestReminder(orderId);
  const recently = !!last && Date.now() - last.getTime() < EMAIL_AGAIN_AFTER_MS;
  if (!recently) {
    await db.insert(orderStatusHistory).values({ orderId, fromStatus: order.status, toStatus: order.status, changedBy: actor.id, note: REMINDER_NOTE });
    await audit(actor, 'payment.remind', 'order', order.orderNumber, null, { paymentStatus: order.paymentStatus });
  }
  let email = 'none';
  if (order.customerEmail) {
    if (recently) email = 'recent';
    else email = (await sendStaffEmail(order.customerEmail, { subject: `Payment for your order ${order.orderNumber}`, text })).ok ? 'sent' : 'failed';
  }
  return { message: text, whatsappUrl: reminderWhatsappUrl(order.customerPhone, text), email, emailTo: order.customerEmail };
}
