export const MAX_DELIVERY_DISTANCE_KM = 5;

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Computes great-circle distance (Haversine) between two GPS points in kilometers.
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export function checkDeliveryRadius(
  storeLat: number,
  storeLng: number,
  targetLat: number,
  targetLng: number,
  maxKm: number = MAX_DELIVERY_DISTANCE_KM
): { ok: boolean; distanceKm: number } {
  const distanceKm = haversineDistanceKm(storeLat, storeLng, targetLat, targetLng);
  return {
    ok: distanceKm <= maxKm,
    distanceKm,
  };
}
