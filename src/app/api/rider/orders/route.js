import { NextResponse } from 'next/server';
import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { riderView } from '@/lib/server/rider';

export const dynamic = 'force-dynamic';

const { orders, orderItems, orderStatusHistory } = schema;

/**
 * Rider screen data: delivery orders that are out for delivery, plus the ones this rider delivered in the last 24 h.
 * Only the trimmed riderView() fields are returned: never phone, email or payment references.
 */
export async function GET(request) {
  const g = await requireStaff(request, ['rider']);
  if (g.error) return g.error;

  const active = await db.select().from(orders).where(and(eq(orders.orderType, 'delivery'), eq(orders.status, 'Out for Delivery'))).orderBy(asc(orders.updatedAt));

  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const mine = await db
    .select({ orderId: orderStatusHistory.orderId, at: orderStatusHistory.createdAt })
    .from(orderStatusHistory)
    .where(and(eq(orderStatusHistory.changedBy, g.staff.id), eq(orderStatusHistory.toStatus, 'Completed'), gt(orderStatusHistory.createdAt, since)))
    .orderBy(desc(orderStatusHistory.createdAt))
    .limit(30);
  const recent = mine.length ? await db.select().from(orders).where(and(inArray(orders.id, mine.map((m) => m.orderId)), eq(orders.orderType, 'delivery'))) : [];

  const ids = [...active.map((o) => o.id), ...recent.map((o) => o.id)];
  const items = ids.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ids)) : [];
  const at = new Map(mine.map((m) => [m.orderId, m.at]));
  return NextResponse.json({
    now: Date.now(),
    active: active.map((o) => riderView(o, items.filter((i) => i.orderId === o.id))),
    recent: recent
      .map((o) => ({ ...riderView(o, items.filter((i) => i.orderId === o.id)), deliveredAt: at.get(o.id) }))
      .sort((a, b) => new Date(b.deliveredAt) - new Date(a.deliveredAt)),
  });
}
