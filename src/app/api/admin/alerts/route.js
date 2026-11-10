import { NextResponse } from 'next/server';
import { asc, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { NEEDS_ACCEPTANCE } from '@/lib/orderStatus';

export const dynamic = 'force-dynamic';

const { orders, orderItems } = schema;

/**
 * Orders waiting to be accepted, for the staff portal's alarm. The portal polls this; the alarm stays on for as
 * long as this list is not empty, i.e. until each order is accepted or cancelled by the customer.
 * Kitchen gets no money fields, and only the orders it is allowed to accept.
 */
export async function GET(request) {
  const g = await requireStaff(request, ['owner', 'admin', 'kitchen']);
  if (g.error) return g.error;
  const role = g.staff.role;
  const statuses = NEEDS_ACCEPTANCE[role] || [];
  if (!statuses.length) return NextResponse.json({ now: Date.now(), count: 0, orders: [] });

  const where = inArray(orders.status, statuses);
  const [{ n }] = await db.select({ n: sql`count(*)::int` }).from(orders).where(where);
  const rows = await db.select().from(orders).where(where).orderBy(asc(orders.createdAt)).limit(10);
  const items = rows.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, rows.map((r) => r.id))) : [];
  const money = role !== 'kitchen';
  return NextResponse.json({
    now: Date.now(),
    count: n,
    orders: rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      orderType: o.orderType,
      customerName: o.customerName,
      createdAt: o.createdAt,
      itemCount: items.filter((i) => i.orderId === o.id).reduce((a, i) => a + i.quantity, 0),
      ...(money ? { totalAmount: Number(o.totalAmount), paymentMethod: o.paymentMethod } : {}),
      // A new cash-on-delivery order can be accepted straight away. A prepaid one needs its payment checked first.
      canAccept: o.status === 'Placed',
    })),
  });
}
