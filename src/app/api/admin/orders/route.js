import { NextResponse } from 'next/server';
import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';

export const dynamic = 'force-dynamic';
const { orders, orderItems, notifications } = schema;

export async function GET(request) {
  const g = await requireStaff(request, ['owner', 'admin', 'kitchen']);
  if (g.error) return g.error;
  const sp = new URL(request.url).searchParams;
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
  const limit = 25;
  const conds = [];
  const q = sp.get('q')?.trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, '')}%`;
    conds.push(or(ilike(orders.orderNumber, like), ilike(orders.customerName, like), ilike(orders.customerPhone, like)));
  }
  if (sp.get('status')) conds.push(eq(orders.status, sp.get('status')));
  if (sp.get('type')) conds.push(eq(orders.orderType, sp.get('type')));
  if (sp.get('payment')) conds.push(eq(orders.paymentMethod, sp.get('payment')));
  if (sp.get('from')) conds.push(gte(orders.createdAt, new Date(sp.get('from'))));
  if (sp.get('to')) conds.push(lt(orders.createdAt, new Date(new Date(sp.get('to')).getTime() + 86400000)));
  const where = conds.length ? and(...conds) : undefined;

  const [{ n }] = await db.select({ n: sql`count(*)::int` }).from(orders).where(where);
  const rows = await db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).limit(limit).offset((page - 1) * limit);
  const items = rows.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, rows.map((r) => r.id))) : [];
  const notifs = rows.length ? await db.select().from(notifications).where(inArray(notifications.orderId, rows.map((r) => r.id))) : [];
  return NextResponse.json({
    total: n,
    page,
    pages: Math.max(1, Math.ceil(n / limit)),
    orders: rows.map((o) => ({
      ...o,
      subtotal: Number(o.subtotal), deliveryFee: Number(o.deliveryFee), discountAmount: Number(o.discountAmount), totalAmount: Number(o.totalAmount),
      trackingToken: undefined,
      notification: notifs.find((x) => x.orderId === o.id)?.status || null,
      items: items.filter((i) => i.orderId === o.id).map((i) => ({ title: i.itemTitle, quantity: i.quantity, notes: i.notes, unitPrice: Number(i.unitPrice) })),
    })),
  });
}
