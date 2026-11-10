import 'server-only';
import nodemailer from 'nodemailer';
import { buildOtpEmail } from './otpEmail';
import { resolveFrom } from './mailFrom';
import { readSmtpEnv, transportOptions } from './smtpConfig';

let transporter;
function getTransporter() {
  if (transporter !== undefined) return transporter;
  const cfg = readSmtpEnv();
  if (!cfg.user || !cfg.pass) return (transporter = null);
  transporter = nodemailer.createTransport(transportOptions(cfg));
  return transporter;
}

export const isEmailConfigured = () => !!getTransporter();

let warnedFrom = false;
function fromHeader() {
  const cfg = readSmtpEnv();
  const { name, address, rewritten } = resolveFrom({ user: cfg.user, host: cfg.host, from: cfg.from });
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
    // Enough to tell EAUTH (wrong login/app password) from ETIMEDOUT/ESOCKET (network) in Vercel > Logs. No secrets.
    console.error('SMTP send failed:', {
      code: err.code,
      responseCode: err.responseCode,
      command: err.command,
      response: String(err.response || err.message || '').split('\n')[0].slice(0, 200),
    });
    return { ok: false, reason: 'send_failed' };
  }
}
