import { NextResponse } from 'next/server';
import { and, asc, eq, or } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCustomer, getStaff } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

// Order details for tracking. Allowed for: the owning customer, staff, or the holder of the secret tracking token.
export async function GET(request, { params }) {
  const { id } = await params;
  const token = new URL(request.url).searchParams.get('t');
  const isUuid = /^[0-9a-f-]{36}$/i.test(id);
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(isUuid ? or(eq(schema.orders.id, id), eq(schema.orders.orderNumber, id)) : eq(schema.orders.orderNumber, id));
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

  const customer = await getCustomer();
  const staff = await getStaff();
  const allowed = staff || (customer && order.userId === customer.id) || (token && order.trackingToken === token);
  if (!allowed) return NextResponse.json({ error: 'Order not found.' }, { status: 404 }); // don't reveal existence

  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));
  const history = await db.select().from(schema.orderStatusHistory).where(eq(schema.orderStatusHistory.orderId, order.id)).orderBy(asc(schema.orderStatusHistory.createdAt));
  const { trackingToken, idempotencyKey, ...safe } = order;
  return NextResponse.json({
    order: {
      ...safe,
      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discountAmount),
      deliveryFee: Number(order.deliveryFee),
      totalAmount: Number(order.totalAmount),
      hasProof: !!order.paymentProofUrl,
      paymentProofUrl: staff || (customer && order.userId === customer.id) ? order.paymentProofUrl : null,
      items: items.map((i) => ({ id: i.id, title: i.itemTitle, quantity: i.quantity, unitPrice: Number(i.unitPrice), subtotal: Number(i.subtotalPrice), notes: i.notes, productId: i.productId, dealId: i.dealId })),
      history: history.map((h) => ({ from: h.fromStatus, to: h.toStatus, at: h.createdAt, note: staff ? h.note : null })),
    },
  });
}
