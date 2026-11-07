import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { audit } from '@/lib/server/audit';

const patch = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
  isPaused: z.boolean().optional(),
});

export async function PATCH(request, { params }) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const { id } = await params;
  const p = patch.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Invalid category details.' }, { status: 400 });
  const [row] = await db.update(schema.categories).set(p.data).where(eq(schema.categories.id, id)).returning();
  if (!row) return NextResponse.json({ error: 'Category not found.' }, { status: 404 });
  await audit(g.staff, 'category.update', 'category', id, null, p.data);
  return NextResponse.json({ category: row });
}

export async function DELETE(request, { params }) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const { id } = await params;
  const [{ n }] = await db.select({ n: sql`count(*)::int` }).from(schema.products).where(sql`${schema.products.categoryId} = ${id} and ${schema.products.deletedAt} is null`);
  if (n > 0) return NextResponse.json({ error: `This category still has ${n} product(s). Move or delete them first, or hide the category instead.` }, { status: 409 });
  const [row] = await db.delete(schema.categories).where(eq(schema.categories.id, id)).returning();
  if (!row) return NextResponse.json({ error: 'Category not found.' }, { status: 404 });
  await audit(g.staff, 'category.delete', 'category', id, { name: row.name }, null);
  return NextResponse.json({ success: true });
}
