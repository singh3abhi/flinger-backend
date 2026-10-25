import { distanceKm, evaluateFix, roundCoordinate, type Fix } from './location-rules';

const NOW = new Date('2026-10-26T10:00:00Z');
const BENGALURU = { latitude: 12.9716, longitude: 77.5946 };
const MUMBAI = { latitude: 19.076, longitude: 72.8777 };

const fix = (over: Partial<Fix> = {}): Fix => ({
  ...BENGALURU,
  accuracyMeters: 30,
  mocked: false,
  capturedAt: new Date(NOW.getTime() - 5_000),
  ...over,
});

describe('location rules', () => {
  it('measures distance between cities', () => {
    expect(Math.round(distanceKm(BENGALURU, MUMBAI))).toBeGreaterThan(830);
    expect(Math.round(distanceKm(BENGALURU, MUMBAI))).toBeLessThan(860);
    expect(distanceKm(BENGALURU, BENGALURU)).toBe(0);
  });

  it('rounds to about 100 m', () => {
    expect(roundCoordinate(12.97164)).toBe(12.972);
    expect(roundCoordinate(77.59449)).toBe(77.594);
  });

  it('accepts a fresh, accurate fix in India', () => {
    expect(evaluateFix(fix(), null, NOW)).toEqual({ kind: 'accept' });
    // Approximate location (a few km) is fine (discussion log D-14).
    expect(evaluateFix(fix({ accuracyMeters: 3000 }), null, NOW)).toEqual({ kind: 'accept' });
  });

  it('rejects mocked, out-of-area, inaccurate and stale fixes', () => {
    const code = (f: Fix) => evaluateFix(f, null, NOW);
    expect(code(fix({ mocked: true }))).toEqual({ kind: 'reject', code: 'LOCATION_MOCKED' });
    expect(code(fix({ latitude: 51.5072, longitude: -0.1276 }))).toEqual({
      kind: 'reject',
      code: 'LOCATION_OUTSIDE_SERVICE_AREA',
    });
    expect(code(fix({ accuracyMeters: 25_000 }))).toEqual({
      kind: 'reject',
      code: 'LOCATION_TOO_INACCURATE',
    });
    expect(code(fix({ capturedAt: new Date(NOW.getTime() - 11 * 60_000) }))).toEqual({
      kind: 'reject',
      code: 'LOCATION_STALE',
    });
    expect(code(fix({ capturedAt: new Date(NOW.getTime() + 5 * 60_000) }))).toEqual({
      kind: 'reject',
      code: 'LOCATION_STALE',
    });
  });

  it('ignores impossible travel but allows a real flight or a local move', () => {
    const tenMinutesAgo = { ...BENGALURU, updatedAt: new Date(NOW.getTime() - 10 * 60_000) };
    // Bengaluru → Mumbai in 10 minutes: not possible.
    expect(evaluateFix(fix(MUMBAI), tenMinutesAgo, NOW)).toEqual({ kind: 'ignore' });
    // The same trip over 3 hours: a flight.
    const threeHoursAgo = { ...BENGALURU, updatedAt: new Date(NOW.getTime() - 3 * 3_600_000) };
    expect(evaluateFix(fix(MUMBAI), threeHoursAgo, NOW)).toEqual({ kind: 'accept' });
    // 20 km in a minute is GPS noise or approximate location, never flagged.
    expect(evaluateFix(fix({ latitude: 13.15 }), { ...BENGALURU, updatedAt: NOW }, NOW)).toEqual({
      kind: 'accept',
    });
  });
});
