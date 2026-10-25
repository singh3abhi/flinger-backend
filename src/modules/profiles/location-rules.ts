/**
 * Rules for accepting a GPS fix (docs/13, PUT /me/location). Location is GPS-only: there is no
 * manual city, so these checks are what stops people placing themselves somewhere else.
 */

/**
 * Rough box around India. It also covers slivers of neighbouring countries; a precise boundary
 * comes with the places dataset (discussion log D-01, D-24).
 */
export const SERVICE_AREA = { minLat: 6.5, maxLat: 37.2, minLon: 68.0, maxLon: 97.5 } as const;
/** Approximate location on iOS/Android is a few km; worse than this is not usable. */
export const MAX_ACCURACY_M = 10_000;
/** A fix older than this was not taken now. */
export const MAX_FIX_AGE_MS = 10 * 60 * 1000;
/** Allowed clock skew for fixes "from the future". */
export const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;
/** Faster than a plane between two fixes means one of them is fake. */
export const MAX_SPEED_KMH = 1000;
/** Moves shorter than this never count as impossible travel (GPS jitter, approximate location). */
const TRAVEL_CHECK_MIN_KM = 50;

export interface Fix {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  mocked: boolean;
  capturedAt: Date;
}

export interface PreviousFix {
  latitude: number;
  longitude: number;
  updatedAt: Date;
}

export type FixVerdict =
  | { kind: 'accept' }
  | {
      kind: 'reject';
      code:
        | 'LOCATION_MOCKED'
        | 'LOCATION_OUTSIDE_SERVICE_AREA'
        | 'LOCATION_TOO_INACCURATE'
        | 'LOCATION_STALE';
    }
  /** Looks spoofed: keep the previous location and flag the account, without telling the client why. */
  | { kind: 'ignore' };

const EARTH_RADIUS_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in km. */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Store only ~100 m precision: three decimals is ≈ 110 m of latitude. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function evaluateFix(
  fix: Fix,
  previous: PreviousFix | null,
  now: Date,
  options: { allowMocked?: boolean } = {},
): FixVerdict {
  if (fix.mocked && !options.allowMocked) return { kind: 'reject', code: 'LOCATION_MOCKED' };

  const { minLat, maxLat, minLon, maxLon } = SERVICE_AREA;
  if (
    fix.latitude < minLat ||
    fix.latitude > maxLat ||
    fix.longitude < minLon ||
    fix.longitude > maxLon
  ) {
    return { kind: 'reject', code: 'LOCATION_OUTSIDE_SERVICE_AREA' };
  }
  if (fix.accuracyMeters > MAX_ACCURACY_M)
    return { kind: 'reject', code: 'LOCATION_TOO_INACCURATE' };

  const age = now.getTime() - fix.capturedAt.getTime();
  if (age > MAX_FIX_AGE_MS || age < -MAX_CLOCK_SKEW_MS)
    return { kind: 'reject', code: 'LOCATION_STALE' };

  if (previous) {
    const km = distanceKm(previous, fix);
    const hours =
      Math.max(fix.capturedAt.getTime() - previous.updatedAt.getTime(), 60_000) / 3_600_000;
    if (km > TRAVEL_CHECK_MIN_KM && km / hours > MAX_SPEED_KMH) return { kind: 'ignore' };
  }
  return { kind: 'accept' };
}
