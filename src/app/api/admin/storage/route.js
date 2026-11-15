import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server/guard';
import { checkStorageAndAlert } from '@/lib/server/storageUsage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// How full the hosting plan is. Owner and admin only. Every call also sends the "storage is filling up" email when a new
// warning level was reached (see storageUsage.js), so simply having the admin panel open keeps the check running.
export async function GET(request) {
  const g = await requireStaff(request, ['owner', 'admin']);
  if (g.error) return g.error;
  const url = new URL(request.url);
  const { usage } = await checkStorageAndAlert({ origin: url.origin, fresh: url.searchParams.get('fresh') === '1' });
  if (!usage) return NextResponse.json({ error: 'Could not measure storage right now.' }, { status: 503 });
  return NextResponse.json({ usage });
}
