import { describe, expect, it } from 'vitest';
import { getClassStats, getMovementAllowance } from '../src/systems/ClassStats';
import { WeaponType } from '../src/systems/WeaponTypes';

describe('Class stats', () => {
  it('matches the in-game movement allowance formula', () => {
    // 320 / 3.5 = 91, no bonus, no floor.
    expect(getMovementAllowance(WeaponType.MINIGUN)).toBe(91);
    // 320 / 0.7 = 457 + 320 * 0.85 = 272.
    expect(getMovementAllowance(WeaponType.PISTOL)).toBe(729);
  });

  it('rates every class 1-5 and ranks the obvious extremes sensibly', () => {
    for (const type of Object.values(WeaponType)) {
      const stats = getClassStats(type, 'mid');
      for (const value of [stats.power, stats.reach, stats.mobility]) {
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(5);
      }
    }
    expect(getClassStats(WeaponType.MINIGUN, 'mid').mobility).toBe(1);
    expect(getClassStats(WeaponType.PISTOL, 'support').mobility).toBe(5);
    expect(getClassStats(WeaponType.SNIPER, 'long').reach).toBe(5);
    expect(getClassStats(WeaponType.SHOTGUN, 'close').reach).toBe(1);
  });
});
