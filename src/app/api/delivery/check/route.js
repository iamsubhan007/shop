import { NextResponse } from 'next/server';
import { checkDeliveryEligibility, SHOP_COORDINATES, DEFAULT_MAX_RADIUS_KM } from '@/lib/delivery';

export async function POST(request) {
  try {
    const body = await request.json();
    const { latitude, longitude } = body;

    if (latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { error: 'Latitude and longitude coordinates are required' },
        { status: 400 }
      );
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(
        { error: 'Invalid geographical coordinates provided' },
        { status: 400 }
      );
    }

    const eligibility = checkDeliveryEligibility(lat, lng, DEFAULT_MAX_RADIUS_KM, SHOP_COORDINATES);

    return NextResponse.json({
      success: true,
      eligible: eligibility.eligible,
      distanceKm: eligibility.distanceKm,
      maxRadiusKm: eligibility.maxRadiusKm,
      deliveryFee: eligibility.deliveryFee,
      reason: eligibility.reason,
    });
  } catch (error) {
    console.error('Server error checking delivery radius:', error);
    return NextResponse.json(
      { error: 'Internal server error validating delivery location' },
      { status: 500 }
    );
  }
}
