import { NextResponse } from 'next/server';
import { getCustomer, rateLimit } from '@/lib/server/auth';
import { applyCoupon, OrderError } from '@/lib/server/orders';
import { db } from '@/db';

// Preview only (does not consume a use). The real check + discount happens again at checkout.
export async function POST(request) {
  const customer = await getCustomer();
  if (!customer) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const rl = await rateLimit(`coupon:${customer.id}`, 30, 600);
  if (!rl.ok) return NextResponse.json({ error: 'Too many tries. Please wait.' }, { status: 429 });
  const { code, subtotal } = await request.json().catch(() => ({}));
  try {
    const r = await applyCoupon(db, code, Number(subtotal) || 0, { consume: false });
    return NextResponse.json({ code: r.code, discount: r.discount });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: 'Could not check the coupon.' }, { status: 500 });
  }
}
