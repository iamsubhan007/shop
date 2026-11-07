import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCustomer, getStaff, normalizePkPhone } from '@/lib/server/auth';

export async function GET(request) {
  const scope = new URL(request.url).searchParams.get('scope');
  if (scope === 'staff') {
    const s = await getStaff();
    return NextResponse.json({ user: s ? { id: s.id, email: s.email, fullName: s.fullName, role: s.role } : null });
  }
  const user = await getCustomer();
  return NextResponse.json({ user });
}

export async function PATCH(request) {
  const user = await getCustomer();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const fullName = String(body.fullName || '').trim().slice(0, 80);
  const phone = normalizePkPhone(body.phone);
  if (fullName.length < 2) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
  if (!phone) return NextResponse.json({ error: 'Enter a valid Pakistani mobile number, e.g. 03XXXXXXXXX.' }, { status: 400 });
  const [updated] = await db.update(schema.profiles).set({ fullName, phone, updatedAt: new Date() }).where(eq(schema.profiles.id, user.id)).returning();
  const { passwordHash, ...safe } = updated;
  return NextResponse.json({ user: safe });
}
