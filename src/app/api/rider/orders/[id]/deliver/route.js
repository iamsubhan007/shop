import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { changeOrderStatus, OrderError } from '@/lib/server/orders';

export const dynamic = 'force-dynamic';

const body = z.object({ delivered: z.literal(true), paymentReceived: z.boolean().optional() });

/**
 * A rider confirms an order was handed over. For cash on delivery they must also confirm the cash was collected;
 * the order is then Completed and the payment recorded as collected (same as every other completed COD order).
 * Riders cannot do anything else to an order.
 */
export async function POST(request, { params }) {
  const g = await requireStaff(request, ['rider']);
  if (g.error) return g.error;
  const { id } = await params;
  const p = body.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Confirm that the order was delivered.' }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!order || order.orderType !== 'delivery') return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (order.status !== 'Out for Delivery') return NextResponse.json({ error: 'This order is not out for delivery.' }, { status: 409 });

  const cashDue = order.paymentMethod === 'cod' && order.paymentStatus === 'cod_pending';
  if (cashDue && !p.data.paymentReceived) {
    return NextResponse.json({ error: `Confirm that you collected Rs. ${Number(order.totalAmount)} in cash.` }, { status: 400 });
  }
  try {
    await changeOrderStatus(id, 'Completed', g.staff, { note: cashDue ? `Delivered by rider. Cash collected: Rs. ${Number(order.totalAmount)}` : 'Delivered by rider' });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('rider deliver failed', e);
    return NextResponse.json({ error: 'Could not save that. Please try again.' }, { status: 500 });
  }
}
