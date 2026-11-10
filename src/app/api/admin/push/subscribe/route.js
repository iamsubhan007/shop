import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { pushConfigured } from '@/lib/server/push';

export const dynamic = 'force-dynamic';

const { pushSubscriptions } = schema;

const subscription = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith('https://'), 'Push endpoints are always https.'),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

/** Saves this device for new-order alerts. Re-posting the same device just re-links it to whoever is signed in. */
export async function POST(request) {
  const g = await requireStaff(request, ['owner', 'admin', 'kitchen']);
  if (g.error) return g.error;
  if (!pushConfigured()) return NextResponse.json({ error: 'Push notifications are not set up on the server yet.' }, { status: 409 });
  const p = z.object({ subscription }).safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'That does not look like a valid push subscription.' }, { status: 400 });
  const { endpoint, keys } = p.data.subscription;
  const ua = ((await headers()).get('user-agent') || '').slice(0, 250);
  await db
    .insert(pushSubscriptions)
    .values({ profileId: g.staff.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: ua })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { profileId: g.staff.id, p256dh: keys.p256dh, auth: keys.auth, userAgent: ua, lastSeenAt: new Date() } });
  return NextResponse.json({ success: true });
}

/** Turns alerts off for this device (only your own subscriptions can be removed). */
export async function DELETE(request) {
  const g = await requireStaff(request, ['owner', 'admin', 'kitchen']);
  if (g.error) return g.error;
  const p = z.object({ endpoint: z.string().url().max(1000) }).safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, p.data.endpoint), eq(pushSubscriptions.profileId, g.staff.id)));
  return NextResponse.json({ success: true });
}
