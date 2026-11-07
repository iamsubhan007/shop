import { NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';

export const dynamic = 'force-dynamic';

// Audit history: owner only.
export async function GET(request) {
  const g = await requireStaff(request, ['owner']);
  if (g.error) return g.error;
  const sp = new URL(request.url).searchParams;
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
  const where = sp.get('action') ? eq(schema.auditLogs.action, sp.get('action')) : undefined;
  const [{ n }] = await db.select({ n: sql`count(*)::int` }).from(schema.auditLogs).where(where);
  const rows = await db.select().from(schema.auditLogs).where(where).orderBy(desc(schema.auditLogs.createdAt)).limit(50).offset((page - 1) * 50);
  return NextResponse.json({ total: n, pages: Math.max(1, Math.ceil(n / 50)), logs: rows });
}
