import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { checkOtp, clientIp, createSession, findStaffByEmail, normalizeEmail, rateLimit, staffKey } from '@/lib/server/auth';
import { audit } from '@/lib/server/audit';
import { withErrorHandling } from '@/lib/server/withErrorHandling';

export const POST = withErrorHandling('staff.otp.verify', async (request) => {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const code = String(body.code || '').trim();
  const fail = (msg = 'Incorrect or expired code.') => NextResponse.json({ error: msg }, { status: 400 });
  if (!email || !/^\d{6}$/.test(code)) return fail('Enter the 6-digit code.');

  const rl = await rateLimit(`staffv:${email}:${await clientIp()}`, 10, 900);
  if (!rl.ok) return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });

  const staff = await findStaffByEmail(email);
  if (!staff) return fail();
  const res = await checkOtp(staffKey(email), code);
  if (!res.ok) return fail(res.reason);

  await db.update(schema.profiles).set({ lastLoginAt: new Date() }).where(eq(schema.profiles.id, staff.id));
  await createSession(staff.id, 'staff');
  await audit(staff, 'staff.login', 'profile', staff.id);
  return NextResponse.json({ success: true, user: { id: staff.id, email: staff.email, fullName: staff.fullName, role: staff.role } });
});
