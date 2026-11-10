// Builds the sign-in code email (subject, plain text, HTML). Pure function: no server-only imports, so it can be
// unit-tested and previewed on its own.
//
// Written for inbox placement, not decoration:
//  - multipart/alternative: a real plain-text part AND a well-formed HTML document with the same content
//  - no links, no images, no tracking pixels, no URL shorteners (the usual spam-score triggers)
//  - calm wording: no ALL CAPS, no exclamation marks, no urgency or promo words
//  - unique subject per message (code first, like Google/GitHub) so identical subjects don't collapse into one
//    conversation or look like bulk mail
//  - says why the email was sent and who sent it (name + place), and what to do if it wasn't the reader

export const BRAND = 'Haq Bahu Tandoor';
const PLACE = 'Model Town Extension, Lahore, Pakistan';
const TTL_MINUTES = 10;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function buildOtpEmail({ code, purpose = 'customer', ttlMinutes = TTL_MINUTES }) {
  const staff = purpose === 'staff';
  const label = staff ? 'staff sign-in code' : 'sign-in code';
  const subject = `${code} is your ${BRAND} ${label}`;

  // NOTE: keep the phrase "code is NNNNNN" in the text part. The local test mail sink reads codes with it.
  const text = [
    `Your ${BRAND} ${label} is ${code}`,
    '',
    `Enter this code to finish signing in. It expires in ${ttlMinutes} minutes and works once.`,
    '',
    "If you didn't ask for this code you can ignore this email. No one can sign in without it, and we will never ask you to share it by phone or message.",
    '',
    '--',
    BRAND,
    PLACE,
    '',
    'You received this because this email address was entered on the sign-in page.',
  ].join('\r\n');

  const c = esc(code);
  const l = esc(label);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(BRAND)} ${l}</title>
</head>
<body style="margin:0;padding:0;background:#f4efe8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4efe8;">Your ${l} is ${c}. It expires in ${ttlMinutes} minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4efe8;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;background:#ffffff;border:1px solid #e5e0d8;border-radius:12px;">
    <tr><td style="background:#2b1d14;color:#f6efe4;padding:16px 20px;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;text-align:center;border-radius:12px 12px 0 0;">${esc(BRAND)}</td></tr>
    <tr><td style="padding:26px 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#2b1d14;text-align:center;">
      Your ${l} is
    </td></tr>
    <tr><td align="center" style="padding:6px 24px 14px 24px;">
      <div style="font-family:Consolas,'Courier New',monospace;font-size:34px;line-height:40px;letter-spacing:8px;font-weight:bold;color:#b4451f;">${c}</div>
    </td></tr>
    <tr><td style="padding:0 24px 22px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:#4a3d33;text-align:center;">
      Enter this code to finish signing in. It expires in ${ttlMinutes} minutes and works once.
    </td></tr>
    <tr><td style="padding:16px 24px 0 24px;border-top:1px solid #eee7dd;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#6b5d52;text-align:center;">
      If you didn&#39;t ask for this code you can ignore this email. No one can sign in without it, and we will never ask you to share it by phone or message.
    </td></tr>
    <tr><td style="padding:14px 24px 20px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#8a7c70;text-align:center;">
      ${esc(BRAND)} &middot; ${esc(PLACE)}<br>You received this because this email address was entered on the sign-in page.
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}
