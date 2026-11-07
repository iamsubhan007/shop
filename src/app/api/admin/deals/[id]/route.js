import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { audit } from '@/lib/server/audit';
import { dealSchema, priceDeal } from '@/lib/server/deals';

const { deals, dealItems } = schema;

export async function PATCH(request, { params }) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const { id } = await params;
  const parsed = dealSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Please check the deal details.' }, { status: 400 });
  const d = parsed.data;
  const [before] = await db.select().from(deals).where(eq(deals.id, id));
  if (!before) return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });

  const startsAt = d.startsAt !== undefined ? d.startsAt : before.startsAt?.toISOString();
  const endsAt = d.endsAt !== undefined ? d.endsAt : before.endsAt?.toISOString();
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) return NextResponse.json({ error: 'The end date must be after the start date.' }, { status: 400 });

  const set = { updatedAt: new Date() };
  for (const k of ['title', 'description', 'imageUrl', 'badge', 'isActive', 'isFeatured']) if (d[k] !== undefined) set[k] = d[k];
  if (d.startsAt !== undefined) set.startsAt = d.startsAt ? new Date(d.startsAt) : null;
  if (d.endsAt !== undefined) set.endsAt = d.endsAt ? new Date(d.endsAt) : null;
  const price = d.price ?? Number(before.price);
  if (d.price !== undefined) set.price = String(d.price);
  if (d.items) {
    const priced = await priceDeal(d.items, price);
    if (priced.error) return NextResponse.json({ error: priced.error }, { status: 400 });
    set.originalPrice = priced.originalPrice != null ? String(priced.originalPrice) : null;
    set.items = priced.labels;
  }
  const row = await db.transaction(async (tx) => {
    const [r] = await tx.update(deals).set(set).where(eq(deals.id, id)).returning();
    if (d.items) {
      await tx.delete(dealItems).where(eq(dealItems.dealId, id));
      if (d.items.length) await tx.insert(dealItems).values(d.items.map((i) => ({ dealId: id, productId: i.productId, quantity: i.quantity })));
    }
    return r;
  });
  await audit(g.staff, 'deal.update', 'deal', id, { title: before.title, price: before.price, isActive: before.isActive }, { title: row.title, price: row.price, isActive: row.isActive });
  return NextResponse.json({ deal: row });
}

export async function DELETE(request, { params }) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const { id } = await params;
  const [row] = await db.update(deals).set({ deletedAt: new Date(), isActive: false }).where(eq(deals.id, id)).returning();
  if (!row) return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });
  await audit(g.staff, 'deal.delete', 'deal', id, { title: row.title }, null);
  return NextResponse.json({ success: true });
}
