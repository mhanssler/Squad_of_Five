import { describe, expect, it } from 'vitest';
import { shouldDeformTerrainOnImpact } from '../src/systems/ImpactRules';

describe('impact terrain deformation', () => {
  it('never cuts terrain for direct-fire bullets', () => {
    expect(shouldDeformTerrainOnImpact(5, true)).toBe(false);
    expect(shouldDeformTerrainOnImpact(6, true)).toBe(false);
    expect(shouldDeformTerrainOnImpact(14, true)).toBe(false);
  });

  it('preserves the existing minimum radius for explosive craters', () => {
    expect(shouldDeformTerrainOnImpact(5, false)).toBe(false);
    expect(shouldDeformTerrainOnImpact(6, false)).toBe(true);
    expect(shouldDeformTerrainOnImpact(90, false)).toBe(true);
  });
});
