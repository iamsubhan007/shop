import { NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';

const body = z.object({ name: z.string().trim().min(2).max(60), sortOrder: z.coerce.number().int().optional() });
const slugify = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function GET(request) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  return NextResponse.json({ categories: await db.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder)) });
}

export async function POST(request) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const p = body.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Enter a category name.' }, { status: 400 });
  try {
    const [c] = await db.insert(schema.categories).values({ name: p.data.name, slug: slugify(p.data.name), sortOrder: p.data.sortOrder ?? 99 }).returning();
    await audit(g.staff, 'category.create', 'category', c.id, null, { name: c.name });
    return NextResponse.json({ category: c });
  } catch {
    return NextResponse.json({ error: 'A category with this name already exists.' }, { status: 409 });
  }
}
