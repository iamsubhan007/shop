import { NextResponse } from 'next/server';
import { asc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { audit } from '@/lib/server/audit';
import { dealSchema, priceDeal } from '@/lib/server/deals';

export const dynamic = 'force-dynamic';
const { deals, dealItems } = schema;

export async function GET(request) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const rows = await db.select().from(deals).where(isNull(deals.deletedAt)).orderBy(asc(deals.createdAt));
  const parts = rows.length ? await db.select().from(dealItems).where(inArray(dealItems.dealId, rows.map((d) => d.id))) : [];
  return NextResponse.json({
    deals: rows.map((d) => ({ ...d, price: Number(d.price), originalPrice: d.originalPrice ? Number(d.originalPrice) : null, parts: parts.filter((p) => p.dealId === d.id).map((p) => ({ productId: p.productId, quantity: p.quantity })) })),
  });
}

export async function POST(request) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const parsed = dealSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Please check the deal details (name and price are required).' }, { status: 400 });
  const d = parsed.data;
  if (d.startsAt && d.endsAt && new Date(d.endsAt) <= new Date(d.startsAt)) return NextResponse.json({ error: 'The end date must be after the start date.' }, { status: 400 });
  const priced = await priceDeal(d.items, d.price);
  if (priced.error) return NextResponse.json({ error: priced.error }, { status: 400 });
  const row = await db.transaction(async (tx) => {
    const [deal] = await tx.insert(deals).values({
      title: d.title, description: d.description ?? null, price: String(d.price), originalPrice: priced.originalPrice != null ? String(priced.originalPrice) : null,
      imageUrl: d.imageUrl ?? null, badge: d.badge ?? null, items: priced.labels, startsAt: d.startsAt ? new Date(d.startsAt) : null, endsAt: d.endsAt ? new Date(d.endsAt) : null,
      isActive: d.isActive ?? true, isFeatured: d.isFeatured ?? false,
    }).returning();
    if (d.items?.length) await tx.insert(dealItems).values(d.items.map((i) => ({ dealId: deal.id, productId: i.productId, quantity: i.quantity })));
    return deal;
  });
  await audit(g.staff, 'deal.create', 'deal', row.id, null, { title: row.title, price: row.price });
  return NextResponse.json({ deal: row });
}
