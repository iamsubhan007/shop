import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { changeOrderStatus, OrderError, reviewPayment } from '@/lib/server/orders';
import { buildOrderText, dispatchOrderNotification } from '@/lib/server/notify';
import { ORDER_STATUSES } from '@/lib/orderStatus';

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
  const { trackingToken, ...safe } = order;
  const canSeeMoney = g.staff.role !== 'kitchen';
  return NextResponse.json({
    order: { ...safe, items, history, payments: canSeeMoney ? payments : [], notification: notification || null, waText: await buildOrderText(id) },
  });
}

const patch = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status'), status: z.enum(ORDER_STATUSES), note: z.string().max(300).optional() }),
  z.object({ action: z.literal('payment'), decision: z.enum(['verify', 'reject']), notes: z.string().max(300).optional() }),
  z.object({ action: z.literal('retry_notification') }),
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
    if (g.staff.role === 'kitchen') return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
    if (body.action === 'payment') {
      const o = await reviewPayment(id, body.decision, g.staff, body.notes);
      return NextResponse.json({ success: true, status: o.status, paymentStatus: o.paymentStatus });
    }
    await dispatchOrderNotification(id, { force: true });
    const [n] = await db.select().from(schema.notifications).where(eq(schema.notifications.orderId, id));
    return NextResponse.json({ success: true, notification: n });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
