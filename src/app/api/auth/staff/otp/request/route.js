import { NextResponse } from 'next/server';
import { clientIp, findStaffByEmail, issueOtp, normalizeEmail, rateLimit, staffKey } from '@/lib/server/auth';
import { sendLoginOtp } from '@/lib/email';
import { withErrorHandling } from '@/lib/server/withErrorHandling';

export const maxDuration = 30; // SMTP can be slow on a cold start; the default can be as low as 10 s on some Vercel plans

// Only active staff emails get a code. Anyone else is told so right away (the sign-in form stays on the email step)
// and no email is sent. This does reveal whether an address is a staff account; the per-IP and per-email
// limits below keep it from being used to probe addresses in bulk.
export const POST = withErrorHandling('staff.otp.request', async (request) => {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  if (!email) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });

  const ip = await clientIp();
  const [a, b] = await Promise.all([rateLimit(`staffotp:ip:${ip}`, 15, 3600), rateLimit(`staffotp:email:${email}`, 6, 3600)]);
  if (!a.ok || !b.ok) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

  const staff = await findStaffByEmail(email);
  if (!staff) {
    return NextResponse.json(
      { error: 'This email is not registered as staff. Check the address, or ask the owner to add you.', code: 'not_staff' },
      { status: 403 },
    );
  }

  const issued = await issueOtp(staffKey(email));
  if (!issued.ok) return NextResponse.json({ error: `Please wait ${issued.retryAfterS}s before requesting another code.`, retryAfterS: issued.retryAfterS }, { status: 429 });
  const sent = await sendLoginOtp(email, issued.code, 'staff');
  if (!sent.ok) return NextResponse.json({ error: sent.reason === 'email_not_configured' ? 'Email (SMTP) is not configured on the server.' : 'We could not send the email. Please try again.' }, { status: 503 });
  return NextResponse.json({ success: true, cooldownS: 60 });
});
