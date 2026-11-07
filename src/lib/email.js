import 'server-only';
import nodemailer from 'nodemailer';

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

/** Sends a sign-in code by SMTP. The code is never returned or logged. Returns { ok, reason }. */
export async function sendLoginOtp(email, code, purpose = 'customer') {
  const t = getTransporter();
  if (!t) return { ok: false, reason: 'email_not_configured' };
  const from = process.env.SMTP_FROM || `"Haq Bahu Tandoor" <${process.env.SMTP_USER}>`;
  const label = purpose === 'staff' ? 'staff sign-in code' : 'sign-in code';
  const html = `<div style="font-family:Arial,sans-serif;max-width:440px;margin:auto;border:1px solid #e5e0d8;border-radius:12px;overflow:hidden">
    <div style="background:#2b1d14;color:#f6efe4;padding:18px;text-align:center;font-weight:700;font-size:18px">Haq Bahu Tandoor</div>
    <div style="padding:24px;text-align:center;color:#2b1d14">
      <p style="margin:0 0 12px">Your ${label} is</p>
      <div style="font-size:34px;letter-spacing:8px;font-weight:800;color:#b4451f">${code}</div>
      <p style="font-size:12px;color:#6b5d52;margin:16px 0 0">It expires in 10 minutes. If you didn't request it, ignore this email.</p>
    </div></div>`;
  try {
    await t.sendMail({ from, to: email, subject: `Your Haq Bahu Tandoor ${label}`, html, text: `Your ${label} is ${code}. It expires in 10 minutes.` });
    return { ok: true };
  } catch (err) {
    console.error('SMTP send failed:', err.code || err.message);
    return { ok: false, reason: 'send_failed' };
  }
}
