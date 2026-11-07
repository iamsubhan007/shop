import { NextResponse } from 'next/server';
import { COOKIE_CUSTOMER, COOKIE_STAFF, destroySession } from '@/lib/server/auth';

export async function POST(request) {
  const { scope } = await request.json().catch(() => ({}));
  await destroySession(scope === 'staff' ? COOKIE_STAFF : COOKIE_CUSTOMER);
  return NextResponse.json({ success: true });
}
