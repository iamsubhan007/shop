// Persistent global in-memory OTP store for Node server sessions
if (!global._adminOtpStore) {
  global._adminOtpStore = new Map();
}

/**
 * Generate and store a 6-digit OTP for an email
 */
export function generateAndStoreOtp(email) {
  const normalizedEmail = email.toLowerCase().trim();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  global._adminOtpStore.set(normalizedEmail, {
    otp,
    expiresAt,
    verified: false,
    sessionToken: null,
  });

  return { otp, expiresAt };
}

/**
 * Verify submitted OTP for an email
 */
export function verifyAdminOtp(email, submittedOtp) {
  const normalizedEmail = email.toLowerCase().trim();
  const record = global._adminOtpStore.get(normalizedEmail);

  if (!record) {
    return { valid: false, reason: 'No verification code found. Please request a new one.' };
  }

  if (Date.now() > record.expiresAt) {
    global._adminOtpStore.delete(normalizedEmail);
    return { valid: false, reason: 'Verification code has expired. Please request a new one.' };
  }

  if (record.otp !== submittedOtp.trim()) {
    return { valid: false, reason: 'Invalid verification code. Please check and try again.' };
  }

  // Generate verified session token
  const sessionToken = `adm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  record.verified = true;
  record.sessionToken = sessionToken;
  global._adminOtpStore.set(normalizedEmail, record);

  return { valid: true, sessionToken };
}

/**
 * Check if session token or email is currently OTP verified
 */
export function isSuperAdminOtpVerified(email, sessionToken) {
  const normalizedEmail = email.toLowerCase().trim();
  const record = global._adminOtpStore.get(normalizedEmail);
  if (!record) return false;

  if (Date.now() > record.expiresAt) {
    global._adminOtpStore.delete(normalizedEmail);
    return false;
  }

  return record.verified && (sessionToken ? record.sessionToken === sessionToken : true);
}

/**
 * Expire and clear OTP immediately upon logout
 */
export function expireAdminOtp(email) {
  if (!email) return;
  const normalizedEmail = email.toLowerCase().trim();
  global._adminOtpStore.delete(normalizedEmail);
}
