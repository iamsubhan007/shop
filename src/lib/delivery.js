// Pure geo helpers (safe on client and server). The authoritative check runs on the server
// against shop coordinates and radius read from the database.

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const nums = [lat1, lng1, lat2, lng2].map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [a1, o1, a2, o2] = nums;
  if (Math.abs(a1) > 90 || Math.abs(a2) > 90 || Math.abs(o1) > 180 || Math.abs(o2) > 180) return null;
  const R = 6371008.8; // mean Earth radius, metres
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(a2 - a1);
  const dLng = toRad(o2 - o1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Delivery is allowed when distance <= radius (exactly at the radius qualifies). */
export function evaluateDelivery({ shop, radiusM, lat, lng }) {
  const d = haversineMeters(shop.lat, shop.lng, lat, lng);
  if (d === null) return { eligible: false, distanceM: null, radiusM, reason: 'invalid_coordinates' };
  const distanceM = Math.round(d * 10) / 10;
  return { eligible: distanceM <= radiusM, distanceM, radiusM, reason: distanceM <= radiusM ? 'within' : 'outside' };
}
