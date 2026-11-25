// "We have not received your payment" reminders: when one is allowed and what it says. Pure functions, so the
// server, the admin page and tests agree.
import { PAYMENT_LABELS, TERMINAL } from './orderStatus.js';

/** The history line that records a reminder; the customer's order page looks for it. */
export const REMINDER_NOTE = 'Payment reminder sent';

/** A transfer the shop has not confirmed yet, on an order that is still running. */
export function paymentUnconfirmed(order) {
  return !!order && order.paymentMethod !== 'cod' && !TERMINAL.includes(order.status) && ['pending', 'rejected', 'submitted'].includes(order.paymentStatus);
}

const accountLines = (method, payment) => {
  const a = payment?.[method === 'bank_transfer' ? 'bank' : method];
  if (!a?.enabled) return [];
  return (method === 'bank_transfer'
    ? [a.bank_name, a.account_title && `Account title: ${a.account_title}`, a.account_number && `Account number: ${a.account_number}`, a.iban && `IBAN: ${a.iban}`]
    : [a.number && `${PAYMENT_LABELS[method]} number: ${a.number}`, a.title && `Account title: ${a.title}`]
  ).filter(Boolean);
};

export function reminderText({ order, shopName, payment, orderUrl }) {
  const accounts = accountLines(order.paymentMethod, payment);
  return [
    `Hello ${order.customerName}, this is ${shopName} about your order ${order.orderNumber}.`,
    `We have not received your payment of Rs. ${Number(order.totalAmount)} (${PAYMENT_LABELS[order.paymentMethod]}) yet.`,
    ...(accounts.length ? ['', 'Please send it to:', ...accounts] : []),
    '',
    'If you have already sent it, please send us a proof of payment (a screenshot or the transaction ID), because we have not received it yet.',
    ...(orderUrl ? [`You can add it on your order page: ${orderUrl}`] : []),
  ].join('\n');
}

/** Pakistani mobile 03XXXXXXXXX -> wa.me link with the message filled in; null if the number is unusable. */
export function reminderWhatsappUrl(phone, text) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = `92${d.slice(1)}`;
  return d.length >= 10 ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : null;
}
