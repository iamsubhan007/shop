import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server/guard';
import { buildReceiptPdf } from '@/lib/server/receipt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const g = await requireStaff(request, ['owner', 'admin']);
  if (g.error) return g.error;
  const { id } = await params;
  try {
    const pdf = await buildReceiptPdf(id);
    return new NextResponse(pdf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="order-${id}.pdf"`, 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }
}
