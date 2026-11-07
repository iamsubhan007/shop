import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { audit } from '@/lib/server/audit';
import { productSchema } from '@/lib/server/schemas';

const patchSchema = productSchema.partial().extend({
  stockAdjust: z.object({ delta: z.coerce.number().int().min(-100000).max(100000), reason: z.string().trim().min(2).max(200) }).optional(),
});

export async function PATCH(request, { params }) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Please check the product details.' }, { status: 400 });
  const { stockAdjust, ...d } = parsed.data;

  const [before] = await db.select().from(schema.products).where(eq(schema.products.id, id));
  if (!before) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
  const newPrice = d.price ?? Number(before.price);
  const newCompare = d.compareAtPrice !== undefined ? d.compareAtPrice : before.compareAtPrice ? Number(before.compareAtPrice) : null;
  if (newCompare != null && newCompare <= newPrice) return NextResponse.json({ error: 'The original price must be higher than the selling price.' }, { status: 400 });

  const set = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    if (k === 'price') set.price = String(v);
    else if (k === 'compareAtPrice') set.compareAtPrice = v == null ? null : String(v);
    else if (k === 'unavailableUntil') set.unavailableUntil = v ? new Date(v) : null;
    else set[k] = v;
  }

  const updated = await db.transaction(async (tx) => {
    let row;
    if (stockAdjust) {
      [row] = await tx.update(schema.products).set({ ...set, stockQty: sql`greatest(0, ${schema.products.stockQty} + ${stockAdjust.delta})` }).where(eq(schema.products.id, id)).returning();
      await tx.insert(schema.stockMovements).values({ productId: id, delta: stockAdjust.delta, reason: stockAdjust.reason, actorId: g.staff.id });
      await audit(g.staff, 'inventory.adjust', 'product', id, { stockQty: before.stockQty }, { stockQty: row.stockQty, reason: stockAdjust.reason }, tx);
    } else {
      [row] = await tx.update(schema.products).set(set).where(eq(schema.products.id, id)).returning();
    }
    return row;
  });

  if (d.price !== undefined && Number(before.price) !== d.price) await audit(g.staff, 'product.price', 'product', id, { price: before.price }, { price: updated.price });
  const availKeys = ['isAvailable', 'isSoldOut', 'unavailableUntil'];
  if (availKeys.some((k) => d[k] !== undefined)) await audit(g.staff, 'product.availability', 'product', id, { isAvailable: before.isAvailable, isSoldOut: before.isSoldOut }, { isAvailable: updated.isAvailable, isSoldOut: updated.isSoldOut, unavailableUntil: updated.unavailableUntil });
  return NextResponse.json({ product: updated });
}

// Soft delete: historical orders keep their snapshots.
export async function DELETE(request, { params }) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const { id } = await params;
  const [row] = await db.update(schema.products).set({ deletedAt: new Date(), isAvailable: false }).where(eq(schema.products.id, id)).returning();
  if (!row) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
  await audit(g.staff, 'product.delete', 'product', id, { name: row.name }, null);
  return NextResponse.json({ success: true });
}
