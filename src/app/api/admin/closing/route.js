import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { closingReport } from '@/lib/server/reports';
import { closingPdf } from '@/lib/server/exporters';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const today = () => new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);

export async function GET(request) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const sp = new URL(request.url).searchParams;
  const day = sp.get('date') || today();
  const report = await closingReport(day);
  if (!report) return NextResponse.json({ error: 'Invalid date.' }, { status: 400 });
  const [closed] = await db.select().from(schema.businessDays).where(eq(schema.businessDays.day, day));
  report.closed = closed ? { closedAt: closed.closedAt, note: closed.note } : null;
  if (sp.get('format') === 'pdf') {
    return new NextResponse(await closingPdf(report), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="hbt-closing-${day}.pdf"`, 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ report });
}

// Closing records a snapshot only. Orders stay editable; nothing is locked or deleted.
export async function POST(request) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const { date, note } = await request.json().catch(() => ({}));
  const day = date || today();
  const report = await closingReport(day);
  if (!report) return NextResponse.json({ error: 'Invalid date.' }, { status: 400 });
  await db.insert(schema.businessDays).values({ day, closedBy: g.staff.id, summary: report, note: note?.slice(0, 300) || null })
    .onConflictDoUpdate({ target: schema.businessDays.day, set: { closedBy: g.staff.id, closedAt: new Date(), summary: report, note: note?.slice(0, 300) || null } });
  await audit(g.staff, 'day.close', 'business_day', day, null, { collected: report.collected, orders: report.received });
  return NextResponse.json({ success: true, report });
}
