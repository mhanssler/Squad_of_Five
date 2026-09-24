import { describe, expect, it } from 'vitest';
import { COVER_EXPOSURE_MULTIPLIER, traceBlastExposure } from '../src/systems/Cover';

describe('cover', () => {
  it('reduces exposure when solid terrain blocks the middle of the blast ray', () => {
    const exposure = traceBlastExposure(0, 50, 100, 50, x => x >= 38 && x <= 54);
    expect(exposure).toBe(COVER_EXPOSURE_MULTIPLIER);
  });

  it('does not mistake a surface at either endpoint for intervening cover', () => {
    const endpointTerrain = (x: number): boolean => x < 2 || x > 99;
    expect(traceBlastExposure(0, 50, 100, 50, endpointTerrain)).toBe(1);
    expect(traceBlastExposure(0, 50, 100, 50, () => false)).toBe(1);
  });

  it('gives partial protection when only lower body rays are covered', () => {
    const exposure = traceBlastExposure(0, 50, 100, 50, (x, y) => x > 45 && x < 55 && y > 52);
    expect(exposure).toBeGreaterThan(COVER_EXPOSURE_MULTIPLIER);
    expect(exposure).toBeLessThan(1);
  });

  it('does not ignore a wall merely because it is close to an endpoint', () => {
    expect(traceBlastExposure(0, 50, 100, 50, x => x >= 8 && x <= 9)).toBe(COVER_EXPOSURE_MULTIPLIER);
  });
});
