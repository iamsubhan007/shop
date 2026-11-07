import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/server/settings';
import { evaluateDelivery } from '@/lib/delivery';
import { clientIp, rateLimit } from '@/lib/server/auth';

export async function POST(request) {
  const rl = await rateLimit(`dcheck:${await clientIp()}`, 120, 600);
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const s = await getSettings();
  const r = evaluateDelivery({ shop: s.shop, radiusM: Number(s.delivery.radius_m), lat: body.latitude, lng: body.longitude });
  if (r.reason === 'invalid_coordinates') return NextResponse.json({ error: 'Invalid coordinates.' }, { status: 400 });
  return NextResponse.json({
    eligible: r.eligible && !!s.delivery.enabled,
    deliveryDisabled: !s.delivery.enabled,
    distanceM: Math.round(r.distanceM),
    radiusM: r.radiusM,
    deliveryFee: Number(s.delivery.fee),
    message: r.eligible
      ? `Great news! You are ${Math.round(r.distanceM)} m from us, so delivery is available.`
      : `You are ${Math.round(r.distanceM)} m away. Delivery covers ${r.radiusM} m around our shop, but you can still order for pickup.`,
  });
}
