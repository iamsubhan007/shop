import { NextResponse } from 'next/server';
import { desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCustomer } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCustomer();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const rows = await db.select().from(schema.orders).where(eq(schema.orders.userId, user.id)).orderBy(desc(schema.orders.createdAt)).limit(100);
  const items = rows.length ? await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, rows.map((r) => r.id))) : [];
  return NextResponse.json({
    orders: rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      orderType: o.orderType,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      totalAmount: Number(o.totalAmount),
      createdAt: o.createdAt,
      items: items.filter((i) => i.orderId === o.id).map((i) => ({ title: i.itemTitle, quantity: i.quantity, unitPrice: Number(i.unitPrice) })),
    })),
  });
}
