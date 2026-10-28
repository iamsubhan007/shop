import nodemailer from 'nodemailer';

/**
 * Configure SMTP transporter using environment variables.
 * Supports standard SMTP (Gmail, Outlook, SendGrid, Amazon SES, Mailtrap, etc.)
 */
export function getMailTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
}

/**
 * Send 6-digit Super Admin OTP verification email
 */
export async function sendAdminOtpEmail(email, otp) {
  const transporter = getMailTransporter();
  const fromAddress = process.env.SMTP_FROM || `"Haq Bahu Naan Shop" <${process.env.SMTP_USER || 'no-reply@haqbahu.pk'}>`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 24px; color: #18181b; }
        .card { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e4e4e7; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .header { background: #b91c1c; padding: 24px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
        .header p { margin: 4px 0 0; font-size: 12px; opacity: 0.9; }
        .body { padding: 32px 24px; text-align: center; }
        .body h2 { font-size: 16px; margin: 0 0 8px; color: #18181b; }
        .body p { font-size: 13px; color: #71717a; margin: 0 0 24px; line-height: 1.5; }
        .otp-box { background: #fef2f2; border: 2px dashed #dc2626; border-radius: 12px; padding: 18px; margin: 0 auto 24px; display: inline-block; }
        .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #991b1b; }
        .expiry { font-size: 11px; color: #a1a1aa; margin: 0; }
        .footer { background: #fafafa; padding: 16px 24px; text-align: center; font-size: 11px; color: #a1a1aa; border-top: 1px solid #f4f4f5; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>HAQ BAHU NAAN SHOP</h1>
          <p>Super Admin Security Verification</p>
        </div>
        <div class="body">
          <h2>Two-Factor Admin Login Code</h2>
          <p>A login attempt was made for the Super Admin account (<strong>${email}</strong>). Use the one-time code below to complete your authentication:</p>
          
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
          </div>
          
          <p class="expiry">This code will expire in 10 minutes or immediately upon session logout. Do not share this code with anyone.</p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Haq Bahu Naan Shop, Model Town, Lahore. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  // Always log OTP prominently to server console so development/testing is smooth
  console.log('\n======================================================');
  console.log(`🔐 [ADMIN 2FA OTP] Super Admin (${email})`);
  console.log(`👉 VERIFICATION CODE: ${otp}`);
  console.log(`⏰ EXPIRES IN: 10 minutes`);
  console.log('======================================================\n');

  if (!transporter) {
    console.warn('⚠️ SMTP credentials not set in .env.local (SMTP_USER, SMTP_PASS). OTP was logged to console above.');
    return { success: true, method: 'console_logged', otp };
  }

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: `Your Admin Verification Code: ${otp} - Haq Bahu Naan Shop`,
      html,
    });
    console.log(`✅ SMTP email sent successfully to ${email}. MessageId: ${info.messageId}`);
    return { success: true, method: 'smtp_sent', messageId: info.messageId };
  } catch (err) {
    console.error('❌ SMTP send error:', err.message);
    return { success: true, method: 'console_fallback', error: err.message, otp };
  }
}
