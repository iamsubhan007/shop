import { NextResponse } from 'next/server';
import { checkOtp, clientIp, createSession, findOrCreateCustomer, normalizeEmail, rateLimit } from '@/lib/server/auth';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const code = String(body.code || '').trim();
  if (!email || !/^\d{6}$/.test(code)) return NextResponse.json({ error: 'Enter the 6-digit code.' }, { status: 400 });

  const rl = await rateLimit(`otpv:${email}:${await clientIp()}`, 15, 900);
  if (!rl.ok) return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });

  const res = await checkOtp(email, code);
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });

  const customer = await findOrCreateCustomer(email);
  if (!customer) return NextResponse.json({ error: 'This account is disabled.' }, { status: 403 });
  await createSession(customer.id, 'customer');
  const { passwordHash, ...safe } = customer;
  return NextResponse.json({ success: true, user: safe, needsProfile: !customer.fullName || !customer.phone });
}
