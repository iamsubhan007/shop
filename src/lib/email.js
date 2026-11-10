import 'server-only';
import nodemailer from 'nodemailer';
import { buildOtpEmail } from './otpEmail';
import { resolveFrom } from './mailFrom';

let transporter;
function getTransporter() {
  if (transporter !== undefined) return transporter;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return (transporter = null);
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporter;
}

export const isEmailConfigured = () => !!getTransporter();

let warnedFrom = false;
function fromHeader() {
  const { name, address, rewritten } = resolveFrom({ user: process.env.SMTP_USER, host: process.env.SMTP_HOST, from: process.env.SMTP_FROM });
  if (rewritten && !warnedFrom) {
    warnedFrom = true;
    console.warn('SMTP_FROM address differs from SMTP_USER; Gmail only sends as the logged-in account, so SMTP_USER is used as the sender.');
  }
  return { name, address };
}

/** Sends a sign-in code by SMTP. The code is never returned or logged. Returns { ok, reason }. */
export async function sendLoginOtp(email, code, purpose = 'customer') {
  const t = getTransporter();
  if (!t) return { ok: false, reason: 'email_not_configured' };
  const { subject, text, html } = buildOtpEmail({ code, purpose });
  try {
    await t.sendMail({
      from: fromHeader(),
      to: email,
      subject,
      text,
      html,
      // Marks it as an automatic transactional message (RFC 3834) and stops out-of-office replies. No bulk or
      // unsubscribe headers on purpose: those make a one-off sign-in code look like marketing mail.
      headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'OOF, AutoReply' },
    });
    return { ok: true };
  } catch (err) {
    console.error('SMTP send failed:', err.code || err.message);
    return { ok: false, reason: 'send_failed' };
  }
}
