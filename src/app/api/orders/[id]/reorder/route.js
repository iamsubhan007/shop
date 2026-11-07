import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCustomer } from '@/lib/server/auth';
import { productOrderable } from '@/lib/server/orders';

// Re-prices a past order with CURRENT menu data. Nothing is ordered; the client just fills the cart.
export async function POST(_req, { params }) {
  const { id } = await params;
  const customer = await getCustomer();
  if (!customer) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const [order] = await db.select().from(schema.orders).where(and(eq(schema.orders.id, id), eq(schema.orders.userId, customer.id)));
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id));
  const now = new Date();
  const out = [];
  for (const it of items) {
    if (it.productId) {
      const [row] = await db
        .select({ p: schema.products, paused: schema.categories.isPaused, active: schema.categories.isActive })
        .from(schema.products)
        .leftJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
        .where(eq(schema.products.id, it.productId));
      const ok = row && productOrderable({ ...row.p, categoryPaused: row.paused, categoryInactive: row.active === false }, now) && (!row.p.trackStock || row.p.stockQty >= it.quantity);
      out.push({ type: 'product', id: it.productId, title: it.itemTitle, quantity: it.quantity, oldPrice: Number(it.unitPrice), price: row ? Number(row.p.price) : null, imageUrl: row?.p.imageUrl || null, available: !!ok });
    } else if (it.dealId) {
      const [d] = await db.select().from(schema.deals).where(eq(schema.deals.id, it.dealId));
      const live = d && d.isActive && !d.deletedAt && (!d.startsAt || d.startsAt <= now) && (!d.endsAt || d.endsAt >= now);
      out.push({ type: 'deal', id: it.dealId, title: it.itemTitle, quantity: it.quantity, oldPrice: Number(it.unitPrice), price: d ? Number(d.price) : null, imageUrl: d?.imageUrl || null, available: !!live });
    } else {
      out.push({ type: 'product', id: null, title: it.itemTitle, quantity: it.quantity, oldPrice: Number(it.unitPrice), price: null, available: false });
    }
  }
  return NextResponse.json({ items: out.map((o) => ({ ...o, priceChanged: o.available && o.price !== o.oldPrice })) });
}
