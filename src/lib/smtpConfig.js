// Turns SMTP_* environment values into a nodemailer config. Pure function (no server-only import) so it is testable.
import { cleanEnv } from './env.js';

export function readSmtpEnv(e = process.env) {
  const host = (cleanEnv(e.SMTP_HOST) || 'smtp.gmail.com').toLowerCase();
  const isGmail = host.endsWith('gmail.com') || host.endsWith('googlemail.com');
  const user = cleanEnv(e.SMTP_USER);
  let pass = cleanEnv(e.SMTP_PASS);
  // Google shows an app password as four groups of four with spaces ("abcd efgh ijkl mnop"); the real value has none.
  if (isGmail) pass = pass.replace(/\s+/g, '');
  const port = parseInt(cleanEnv(e.SMTP_PORT) || '587', 10);
  return { host, port: Number.isFinite(port) ? port : 587, user, pass, from: cleanEnv(e.SMTP_FROM), isGmail };
}

export function transportOptions(c) {
  return {
    host: c.host,
    port: c.port,
    secure: c.port === 465,
    auth: { user: c.user, pass: c.pass },
    // Fail fast with a clear error code instead of hanging until the serverless function is killed.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}
