import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';

const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, 'Code: 3-30 letters/numbers'),
  kind: z.enum(['percent', 'fixed']),
  value: z.coerce.number().min(1).max(100000),
  minOrder: z.coerce.number().min(0).default(0),
  maxUses: z.coerce.number().int().min(1).nullish(),
  startsAt: z.string().datetime().nullish(),
  endsAt: z.string().datetime().nullish(),
}).refine((c) => c.kind !== 'percent' || c.value <= 100, { message: 'Percent discount cannot exceed 100.' });

export async function GET(request) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const rows = await db.select().from(schema.coupons).orderBy(desc(schema.coupons.createdAt));
  return NextResponse.json({ coupons: rows.map((c) => ({ ...c, value: Number(c.value), minOrder: Number(c.minOrder) })) });
}

export async function POST(request) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const p = couponSchema.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message || 'Please check the coupon.' }, { status: 400 });
  const d = p.data;
  try {
    const [c] = await db.insert(schema.coupons).values({ code: d.code, kind: d.kind, value: String(d.value), minOrder: String(d.minOrder), maxUses: d.maxUses ?? null, startsAt: d.startsAt ? new Date(d.startsAt) : null, endsAt: d.endsAt ? new Date(d.endsAt) : null }).returning();
    await audit(g.staff, 'coupon.create', 'coupon', c.id, null, { code: c.code, kind: c.kind, value: c.value });
    return NextResponse.json({ coupon: c });
  } catch {
    return NextResponse.json({ error: 'That coupon code already exists.' }, { status: 409 });
  }
}
