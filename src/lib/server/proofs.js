import 'server-only';
import { and, asc, eq, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { TERMINAL } from '@/lib/orderStatus';
import { OrderError } from './orders';
import { audit } from './audit';
import { removeImages } from './storageFiles';

// Owner/admin-only: remove customers' payment screenshots to free storage. Callers must have checked the role.
// A screenshot is evidence the admin has to look at while a payment waits for review, so it cannot be removed then
// (verify or reject first). Once the payment is verified, rejected, or the order is finished, it can go.
const { orders, paymentSubmissions, orderStatusHistory } = schema;
const DAY = 24 * 3600 * 1000;
const BATCH = 200;

export const proofDeletable = (order) => !(order.paymentStatus === 'submitted' && !TERMINAL.includes(order.status));

// SQL for "this order has a screenshot, and it may be removed", shared by the count and the delete.
const hasProof = sql`(${orders.paymentProofUrl} is not null or exists (select 1 from payment_submissions ps where ps.order_id = ${orders.id} and ps.proof_image_url is not null))`;
const removable = sql`not (${orders.paymentStatus} = 'submitted' and ${orders.status} not in ('Completed','Cancelled','Rejected'))`;
const olderThan = (days) => lt(orders.createdAt, new Date(Date.now() - Math.max(0, Number(days) || 0) * DAY));

/** Counts for the Storage page: screenshots that can go now (for orders older than `days`), and ones that must wait. */
export async function proofStats(days = 0) {
  const [a] = await db.select({ n: sql`count(*)::int` }).from(orders).where(and(hasProof, removable, olderThan(days)));
  const [b] = await db.select({ n: sql`count(*)::int` }).from(orders).where(and(hasProof, sql`not ${removable}`));
  return { removable: a.n, waitingForReview: b.n };
}

const filesOf = (order, subs) => [...new Set([order.paymentProofUrl, ...subs.map((s) => s.proofImageUrl)].filter(Boolean))];

/** Removes one order's payment screenshot(s) from storage and from the order. */
export async function deleteOrderProofs(orderId, actor) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new OrderError('Order not found.', 'not_found', 404);
  const subs = await db.select().from(paymentSubmissions).where(eq(paymentSubmissions.orderId, orderId));
  const files = filesOf(order, subs);
  if (!files.length) throw new OrderError('This order has no payment screenshot.', 'no_proof', 409);
  if (!proofDeletable(order)) throw new OrderError('Verify or reject this payment first, then you can delete its screenshot.', 'payment_pending', 409);

  // The file goes first: if storage fails nothing is changed, and a leftover pointer to a missing file is harmless.
  const r = await removeImages('proofs', files);
  if (!r.ok) throw new OrderError('The screenshot could not be removed from storage right now. Nothing was changed. Please try again.', 'storage_error', 502);

  await db.transaction(async (tx) => {
    await tx.update(orders).set({ paymentProofUrl: null }).where(and(eq(orders.id, orderId), inArray(orders.paymentProofUrl, files)));
    await tx.update(paymentSubmissions).set({ proofImageUrl: null }).where(and(eq(paymentSubmissions.orderId, orderId), inArray(paymentSubmissions.proofImageUrl, files)));
    await tx.insert(orderStatusHistory).values({ orderId, fromStatus: order.status, toStatus: order.status, changedBy: actor.id, note: 'Payment screenshot deleted' });
    await audit(actor, 'proof.delete', 'order', order.orderNumber, { screenshots: files.length }, null, tx);
  });
  return { deleted: files.length };
}

/**
 * Removes screenshots in batches (one request handles up to 200 orders, so it stays well inside a serverless time
 * limit). Returns how many orders were cleaned and how many are still left, so the page can keep going.
 */
export async function deleteProofsBulk(actor, { days = 0 } = {}) {
  const rows = await db.select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status, proof: orders.paymentProofUrl })
    .from(orders).where(and(hasProof, removable, olderThan(days))).orderBy(asc(orders.createdAt)).limit(BATCH);
  if (!rows.length) return { cleaned: 0, remaining: 0 };
  const ids = rows.map((o) => o.id);
  const subs = await db.select().from(paymentSubmissions).where(and(inArray(paymentSubmissions.orderId, ids), isNotNull(paymentSubmissions.proofImageUrl)));
  const files = [...new Set([...rows.map((o) => o.proof), ...subs.map((s) => s.proofImageUrl)].filter(Boolean))];

  const r = await removeImages('proofs', files);
  if (!r.ok) throw new OrderError('Screenshots could not be removed from storage right now. Nothing was changed. Please try again.', 'storage_error', 502);

  await db.transaction(async (tx) => {
    await tx.update(orders).set({ paymentProofUrl: null }).where(and(inArray(orders.id, ids), inArray(orders.paymentProofUrl, files)));
    await tx.update(paymentSubmissions).set({ proofImageUrl: null }).where(and(inArray(paymentSubmissions.orderId, ids), inArray(paymentSubmissions.proofImageUrl, files)));
    await tx.insert(orderStatusHistory).values(rows.map((o) => ({ orderId: o.id, fromStatus: o.status, toStatus: o.status, changedBy: actor.id, note: 'Payment screenshot deleted' })));
  });
  await audit(actor, 'proof.bulk_delete', 'order', null, { olderThanDays: Number(days) || 0 }, { orders: ids.length, files: files.length });
  const { removable: remaining } = await proofStats(days);
  return { cleaned: ids.length, remaining };
}
