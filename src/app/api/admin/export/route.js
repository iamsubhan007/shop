import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server/guard';
import { exportData, rangeFrom } from '@/lib/server/reports';
import { toCsv, toPdf, toXlsx } from '@/lib/server/exporters';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Exports contain customer data: owner/admin only, and every download is audited.
export async function GET(request) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const sp = new URL(request.url).searchParams;
  const type = sp.get('type');
  const format = sp.get('format');
  const range = rangeFrom(sp);
  if (!range || !['csv', 'xlsx', 'pdf'].includes(format)) return NextResponse.json({ error: 'Invalid export request.' }, { status: 400 });
  const data = await exportData(type, range);
  if (!data) return NextResponse.json({ error: 'Unknown report type.' }, { status: 400 });

  const subtitle = `Period: ${sp.get('from') || 'last 30 days'} to ${sp.get('to') || 'today'} · generated ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`;
  const name = `hbt-${type}-${new Date().toISOString().slice(0, 10)}.${format}`;
  let body, mime;
  if (format === 'csv') { body = toCsv(data); mime = 'text/csv; charset=utf-8'; }
  else if (format === 'xlsx') { body = await toXlsx(data, subtitle); mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; }
  else { body = await toPdf(data, subtitle); mime = 'application/pdf'; }
  await audit(g.staff, 'export', 'report', type, null, { format, rows: data.rows.length });
  return new NextResponse(body, { headers: { 'Content-Type': mime, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
}
