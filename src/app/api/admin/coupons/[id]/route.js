import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { audit } from '@/lib/server/audit';

export async function PATCH(request, { params }) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const { id } = await params;
  const p = z.object({ isActive: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const [c] = await db.update(schema.coupons).set({ isActive: p.data.isActive }).where(eq(schema.coupons.id, id)).returning();
  if (!c) return NextResponse.json({ error: 'Coupon not found.' }, { status: 404 });
  await audit(g.staff, 'coupon.toggle', 'coupon', id, null, { isActive: c.isActive });
  return NextResponse.json({ coupon: c });
}
