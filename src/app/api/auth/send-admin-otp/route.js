import { NextResponse } from 'next/server';
import { generateAndStoreOtp } from '@/lib/otpStore';
import { sendAdminOtpEmail } from '@/lib/email';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const supabase = createAdminClient();

    if (!supabase) {
      return NextResponse.json({ error: 'Supabase client not available' }, { status: 500 });
    }

    // 1. Verify user exists and credentials if password provided
    const { data: listData } = await supabase.auth.admin.listUsers();
    const user = (listData?.users || []).find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    if (!user) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const role = user.user_metadata?.role || '';
    const isSuperAdmin = normalizedEmail === 'bsubhan542@gmail.com' || role === 'super_admin';
    const isAdmin = isSuperAdmin || role === 'admin';

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized: Only Super Admin and Admins require OTP verification.' },
        { status: 403 }
      );
    }

    // 2. Generate and store fresh OTP
    const { otp, expiresAt } = generateAndStoreOtp(normalizedEmail);

    // 3. Dispatch OTP via SMTP email
    const emailResult = await sendAdminOtpEmail(normalizedEmail, otp);

    return NextResponse.json({
      success: true,
      message: `Verification code sent to ${normalizedEmail}`,
      expiresAt,
      // In development/test mode without SMTP keys, include debug hint
      method: emailResult.method,
    });
  } catch (err) {
    console.error('Error sending admin OTP:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
