import { NextResponse } from 'next/server';
import { asc, isNull } from 'drizzle-orm';
import { productSchema } from '@/lib/server/schemas';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const rows = await db.select().from(schema.products).where(isNull(schema.products.deletedAt)).orderBy(asc(schema.products.sortOrder), asc(schema.products.name));
  return NextResponse.json({ products: rows.map((p) => ({ ...p, price: Number(p.price), compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null })) });
}

export async function POST(request) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const parsed = productSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Please check the product details (name and price are required).' }, { status: 400 });
  const d = parsed.data;
  if (d.compareAtPrice != null && d.compareAtPrice <= d.price) return NextResponse.json({ error: 'The original price must be higher than the selling price.' }, { status: 400 });
  const [p] = await db.insert(schema.products).values({
    ...d,
    price: String(d.price),
    compareAtPrice: d.compareAtPrice != null ? String(d.compareAtPrice) : null,
    unavailableUntil: d.unavailableUntil ? new Date(d.unavailableUntil) : null,
  }).returning();
  await audit(g.staff, 'product.create', 'product', p.id, null, { name: p.name, price: p.price });
  return NextResponse.json({ product: p });
}
