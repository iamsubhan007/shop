import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { changeOrderStatus, OrderError, reviewPayment } from '@/lib/server/orders';
import { buildOrderText, dispatchOrderNotification, whatsappConfigured } from '@/lib/server/notify';
import { ORDER_STATUSES, isOrderAdmin } from '@/lib/orderStatus';
import { editOrderItems, setOrderDiscount, setOrderEta } from '@/lib/server/orderAdmin';
import { deleteOrderProofs } from '@/lib/server/proofs';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const g = await requireStaff(request, ['owner', 'admin', 'kitchen']);
  if (g.error) return g.error;
  const { id } = await params;
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id));
  const history = await db.select().from(schema.orderStatusHistory).where(eq(schema.orderStatusHistory.orderId, id)).orderBy(asc(schema.orderStatusHistory.createdAt));
  const payments = await db.select().from(schema.paymentSubmissions).where(eq(schema.paymentSubmissions.orderId, id));
  const [notification] = await db.select().from(schema.notifications).where(eq(schema.notifications.orderId, id));
  const [feedback] = await db.select().from(schema.orderFeedback).where(eq(schema.orderFeedback.orderId, id));
  const { trackingToken, ...safe } = order;
  const canSeeMoney = g.staff.role !== 'kitchen';
  return NextResponse.json({
    order: { ...safe, items, history, payments: canSeeMoney ? payments : [], notification: notification || null,
      feedback: feedback ? { rating: feedback.rating, comment: feedback.comment, updatedAt: feedback.updatedAt } : null, whatsappConfigured: whatsappConfigured(), waText: await buildOrderText(id) },
  });
}

const patch = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status'), status: z.enum(ORDER_STATUSES), note: z.string().max(300).optional() }),
  z.object({ action: z.literal('payment'), decision: z.enum(['verify', 'reject']), notes: z.string().max(300).optional() }),
  z.object({ action: z.literal('retry_notification') }),
  // Owner/admin only: include or exclude items (quantity 0 removes a line; add puts a product on the order).
  z.object({
    action: z.literal('items'),
    changes: z.array(z.object({ itemId: z.string().uuid(), quantity: z.coerce.number().int().min(0).max(50) })).max(60).default([]),
    add: z.array(z.object({ productId: z.string().uuid(), quantity: z.coerce.number().int().min(1).max(50) })).max(20).default([]),
    note: z.string().max(200).optional(),
  }),
  // Owner/admin only: a countdown the customer can see (minutes from now; null clears it).
  z.object({ action: z.literal('eta'), minutes: z.union([z.null(), z.coerce.number().int().min(1).max(480)]) }),
  // Owner/admin only: a discount on this order, at any step before it is finished (value 0 removes it).
  z.object({ action: z.literal('discount'), type: z.enum(['amount', 'percent']).default('amount'), value: z.coerce.number().min(0).max(1000000), note: z.string().max(200).optional() }),
  // Owner/admin only: delete the customer's payment screenshot to free storage (not while the payment awaits review).
  z.object({ action: z.literal('deleteProof') }),
]);

export async function PATCH(request, { params }) {
  const g = await requireStaff(request, ['owner', 'admin', 'kitchen']);
  if (g.error) return g.error;
  const { id } = await params;
  const parsed = patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const body = parsed.data;
  try {
    if (body.action === 'status') {
      const o = await changeOrderStatus(id, body.status, g.staff, { note: body.note, reason: body.note });
      return NextResponse.json({ success: true, status: o.status });
    }
    if (!isOrderAdmin(g.staff.role)) return NextResponse.json({ error: 'Not authorised.' }, { status: 403 }); // kitchen: status steps only
    if (body.action === 'payment') {
      const o = await reviewPayment(id, body.decision, g.staff, body.notes);
      return NextResponse.json({ success: true, status: o.status, paymentStatus: o.paymentStatus });
    }
    if (body.action === 'deleteProof') {
      const r = await deleteOrderProofs(id, g.staff);
      return NextResponse.json({ success: true, deleted: r.deleted });
    }
    if (body.action === 'items') {
      const r = await editOrderItems(id, g.staff, { changes: body.changes, add: body.add, note: body.note });
      return NextResponse.json({ success: true, totalAmount: r.total, previousTotal: r.oldTotal, paymentNote: r.paymentNote });
    }
    if (body.action === 'eta') {
      const r = await setOrderEta(id, g.staff, body.minutes);
      return NextResponse.json({ success: true, etaAt: r.etaAt });
    }
    if (body.action === 'discount') {
      const r = await setOrderDiscount(id, g.staff, { type: body.type, value: body.value, note: body.note });
      return NextResponse.json({ success: true, totalAmount: r.total, previousTotal: r.oldTotal, manualDiscount: r.manualDiscount, paymentNote: r.paymentNote });
    }
    if (!whatsappConfigured()) return NextResponse.json({ error: 'Automatic WhatsApp alerts are not set up. Use "Share on WhatsApp" instead.' }, { status: 409 });
    await dispatchOrderNotification(id, { force: true });
    const [n] = await db.select().from(schema.notifications).where(eq(schema.notifications.orderId, id));
    return NextResponse.json({ success: true, notification: n });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
