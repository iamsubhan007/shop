import { NextResponse } from 'next/server';
import { clientIp, issueOtp, normalizeEmail, rateLimit } from '@/lib/server/auth';
import { sendLoginOtp } from '@/lib/email';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  if (!email) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });

  const ip = await clientIp();
  const [byIp, byEmail] = await Promise.all([rateLimit(`otp:ip:${ip}`, 20, 3600), rateLimit(`otp:email:${email}`, 6, 3600)]);
  if (!byIp.ok || !byEmail.ok) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': String((byIp.retryAfterS || byEmail.retryAfterS)) } });
  }

  const issued = await issueOtp(email);
  if (!issued.ok) {
    return NextResponse.json({ error: `Please wait ${issued.retryAfterS}s before requesting another code.`, retryAfterS: issued.retryAfterS }, { status: 429 });
  }
  const sent = await sendLoginOtp(email, issued.code);
  if (!sent.ok) {
    const msg = sent.reason === 'email_not_configured' ? 'Email sign-in is not configured on the server yet.' : 'We could not send the email. Please try again.';
    return NextResponse.json({ error: msg }, { status: 503 });
  }
  return NextResponse.json({ success: true, cooldownS: 60, hint: "Haven't received your code yet? Please check your Spam/Junk folder as well." });
}
