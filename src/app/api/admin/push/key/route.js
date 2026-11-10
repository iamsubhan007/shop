import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server/guard';
import { pushConfigured, pushPublicKey } from '@/lib/server/push';

export const dynamic = 'force-dynamic';

/** Tells the portal whether push is set up and gives it the public key the browser needs to subscribe. */
export async function GET(request) {
  const g = await requireStaff(request, ['owner', 'admin', 'kitchen']);
  if (g.error) return g.error;
  return NextResponse.json({ configured: pushConfigured(), publicKey: pushPublicKey() });
}
