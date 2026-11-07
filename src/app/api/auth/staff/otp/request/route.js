import { NextResponse } from 'next/server';
import { clientIp, findStaffByEmail, issueOtp, normalizeEmail, rateLimit, staffKey } from '@/lib/server/auth';
import { sendLoginOtp } from '@/lib/email';

// Always answers the same way so the form can't be used to discover which emails are staff.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  if (!email) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });

  const ip = await clientIp();
  const [a, b] = await Promise.all([rateLimit(`staffotp:ip:${ip}`, 15, 3600), rateLimit(`staffotp:email:${email}`, 6, 3600)]);
  if (!a.ok || !b.ok) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

  const generic = NextResponse.json({ success: true, cooldownS: 60 });
  const staff = await findStaffByEmail(email);
  if (!staff) return generic;

  const issued = await issueOtp(staffKey(email));
  if (!issued.ok) return NextResponse.json({ error: `Please wait ${issued.retryAfterS}s before requesting another code.`, retryAfterS: issued.retryAfterS }, { status: 429 });
  const sent = await sendLoginOtp(email, issued.code, 'staff');
  if (!sent.ok) return NextResponse.json({ error: sent.reason === 'email_not_configured' ? 'Email (SMTP) is not configured on the server.' : 'We could not send the email. Please try again.' }, { status: 503 });
  return generic;
}
