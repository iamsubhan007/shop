import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server/guard';
import { analytics, rangeFrom } from '@/lib/server/reports';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const g = await requireStaff(request);
  if (g.error) return g.error;
  const range = rangeFrom(new URL(request.url).searchParams);
  if (!range) return NextResponse.json({ error: 'Invalid date range.' }, { status: 400 });
  return NextResponse.json(await analytics(range));
}
