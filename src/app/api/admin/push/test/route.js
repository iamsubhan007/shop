import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server/guard';
import { pushConfigured, sendTestPush } from '@/lib/server/push';
import { rateLimit } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/** "Send me a test notification": only to the signed-in person's own devices. */
export async function POST(request) {
  const g = await requireStaff(request, ['owner', 'admin', 'kitchen']);
  if (g.error) return g.error;
  if (!pushConfigured()) return NextResponse.json({ error: 'Push notifications are not set up on the server yet.' }, { status: 409 });
  const rl = await rateLimit(`pushtest:${g.staff.id}`, 10, 600);
  if (!rl.ok) return NextResponse.json({ error: 'Too many tests. Try again in a few minutes.' }, { status: 429 });
  const r = await sendTestPush(g.staff.id);
  if (!r.devices) return NextResponse.json({ error: 'No device is turned on for alerts yet.' }, { status: 404 });
  return NextResponse.json({ success: true, ...r });
}
