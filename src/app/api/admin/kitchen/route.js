import { NextResponse } from 'next/server';
import { asc, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';

export const dynamic = 'force-dynamic';

// Kitchen view: no customer money or payment data.
export async function GET(request) {
  const g = await requireStaff(request, ['owner', 'admin', 'kitchen']);
  if (g.error) return g.error;
  const rows = await db
    .select()
    .from(schema.orders)
    .where(inArray(schema.orders.status, ['Placed', 'Confirmed', 'Cooking', 'Ready for Pickup', 'Out for Delivery']))
    .orderBy(asc(schema.orders.createdAt));
  const items = rows.length ? await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, rows.map((r) => r.id))) : [];
  return NextResponse.json({
    now: Date.now(),
    orders: rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      orderType: o.orderType,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      customerName: o.customerName,
      specialInstructions: o.specialInstructions,
      createdAt: o.createdAt,
      items: items.filter((i) => i.orderId === o.id).map((i) => ({ title: i.itemTitle, quantity: i.quantity, notes: i.notes })),
    })),
  });
}
