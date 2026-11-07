import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCustomer } from '@/lib/server/auth';
import { changeOrderStatus, OrderError } from '@/lib/server/orders';

export async function POST(request, { params }) {
  const { id } = await params;
  const customer = await getCustomer();
  if (!customer) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const [order] = await db.select().from(schema.orders).where(and(eq(schema.orders.id, id), eq(schema.orders.userId, customer.id)));
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  try {
    await changeOrderStatus(order.id, 'Cancelled', null, { asCustomer: true, reason: String(body.reason || 'Cancelled by customer').slice(0, 200) });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: 'Could not cancel the order.' }, { status: 500 });
  }
}
