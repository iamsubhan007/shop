import { NextResponse } from 'next/server';
import { clientIp, rateLimit } from '@/lib/server/auth';
import { activeMenuResponse, NO_STORE } from '@/lib/server/menuPdf/source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // a cold start unpacks Chromium

/** Public: the menu PDF customers download from the website and the mobile app. */
export async function GET() {
  // Printing costs far more than a normal request, so one address cannot ask without limit.
  const limit = await rateLimit(`menupdf:${await clientIp()}`, 40, 600);
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many downloads. Please try again in a few minutes.' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(limit.retryAfterS) } });
  }
  try {
    return await activeMenuResponse();
  } catch (e) {
    console.error('menu pdf failed', e);
    return NextResponse.json({ error: 'The menu PDF could not be prepared right now. Please try again in a moment.' }, { status: 503, headers: NO_STORE });
  }
}
