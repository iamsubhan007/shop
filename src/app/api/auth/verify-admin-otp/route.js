import { NextResponse } from 'next/server';
import { verifyAdminOtp } from '@/lib/otpStore';

export async function POST(request) {
  try {
    const { email, otp } = await request.json();

    if (!email || !otp) {
      return NextResponse.json({ error: 'Email and OTP code are required' }, { status: 400 });
    }

    const result = verifyAdminOtp(email, otp);

    if (!result.valid) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'OTP verified successfully',
      sessionToken: result.sessionToken,
    });
  } catch (err) {
    console.error('Error verifying admin OTP:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
