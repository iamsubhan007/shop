import { initialShopSettings } from './data/initialData';

// Shop coordinates for Haq Bahu Naan Shop (Model Town Link Rd, Lahore)
export const SHOP_COORDINATES = {
  lat: initialShopSettings.latitude, // 31.4828
  lng: initialShopSettings.longitude, // 74.3168
};

export const DEFAULT_MAX_RADIUS_KM = initialShopSettings.max_delivery_radius_km; // 3.0 km
export const DEFAULT_DELIVERY_FEE = initialShopSettings.delivery_fee_rs; // Rs. 100

/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula (returned in kilometers).
 */
export function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  if (
    lat1 === undefined || lon1 === undefined ||
    lat2 === undefined || lon2 === undefined ||
    isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)
  ) {
    return null;
  }

  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 100) / 100; // Round to 2 decimal places
}

/**
 * Validates whether customer coordinates are within allowed delivery radius
 */
export function checkDeliveryEligibility(customerLat, customerLng, maxRadiusKm = DEFAULT_MAX_RADIUS_KM, shopCoords = SHOP_COORDINATES) {
  const distance = calculateHaversineDistanceKm(
    shopCoords.lat,
    shopCoords.lng,
    customerLat,
    customerLng
  );

  if (distance === null) {
    return {
      eligible: false,
      distanceKm: null,
      maxRadiusKm,
      reason: 'Invalid or missing coordinates',
    };
  }

  const isEligible = distance <= maxRadiusKm;

  return {
    eligible: isEligible,
    distanceKm: distance,
    maxRadiusKm,
    deliveryFee: DEFAULT_DELIVERY_FEE,
    reason: isEligible
      ? `Within delivery range (${distance} km away)`
      : `Your location (${distance} km away) is outside our ${maxRadiusKm} km delivery zone. You can still place an order for Pickup!`,
  };
}
