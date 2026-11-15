import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff } from '@/lib/server/guard';
import { OrderError } from '@/lib/server/orders';
import { deleteProofsBulk, proofStats } from '@/lib/server/proofs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const days = z.coerce.number().int().min(0).max(3650).default(0);

// Payment screenshots that can be deleted now: their orders are finished or the payment is already checked.
export async function GET(request) {
  const g = await requireStaff(request, ['owner', 'admin']);
  if (g.error) return g.error;
  const parsed = days.safeParse(new URL(request.url).searchParams.get('days') ?? 0);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid number of days.' }, { status: 400 });
  return NextResponse.json(await proofStats(parsed.data));
}

// Deletes one batch (up to 200 orders). The page calls it again while `remaining` is more than zero.
export async function POST(request) {
  const g = await requireStaff(request, ['owner', 'admin']);
  if (g.error) return g.error;
  const body = z.object({ days }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  try {
    return NextResponse.json({ success: true, ...(await deleteProofsBulk(g.staff, { days: body.data.days })) });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
