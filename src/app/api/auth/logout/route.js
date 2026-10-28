import { NextResponse } from 'next/server';
import { expireAdminOtp } from '@/lib/otpStore';

export async function POST(request) {
  try {
    const { email } = await request.json();
    if (email) {
      expireAdminOtp(email);
    }
    return NextResponse.json({ success: true, message: 'Admin OTP session expired' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
