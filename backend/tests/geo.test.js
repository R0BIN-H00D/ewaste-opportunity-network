'use strict';
const { fuzzPoint, haversineKm } = require('../src/utils/geo');

describe('fuzzPoint (privacy, BR-08)', () => {
  const points = [
    [77.59, 12.97], // already on the 2-decimal grid (the case that used to leak the exact point)
    [77.5946, 12.9716],
    [-122.4194, 37.7749],
    [0, 0],
    [151.2093, -33.8688],
  ];

  it('never returns the exact point, is deterministic per seed, and stays within ~2 km', () => {
    for (const [i, coords] of points.entries()) {
      const exact = { type: 'Point', coordinates: coords };
      const a = fuzzPoint(exact, `listing-${i}`);
      expect(a).toEqual(fuzzPoint(exact, `listing-${i}`));
      expect(a.coordinates).not.toEqual(coords);
      expect(haversineKm(coords, a.coordinates)).toBeGreaterThan(0.05);
      expect(haversineKm(coords, a.coordinates)).toBeLessThan(2);
    }
  });

  it('different seeds give different public points', () => {
    const exact = { type: 'Point', coordinates: [77.5946, 12.9716] };
    expect(fuzzPoint(exact, 'a')).not.toEqual(fuzzPoint(exact, 'b'));
  });

  it('returns undefined for missing input', () => {
    expect(fuzzPoint(undefined)).toBeUndefined();
  });
});
