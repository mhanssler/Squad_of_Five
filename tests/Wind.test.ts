import { describe, expect, it } from 'vitest';
import { getWindAccel, getWindFactor, isWindCalm, rollWind, WIND_MAX_ACCEL } from '../src/systems/Wind';
import { WeaponType } from '../src/systems/WeaponTypes';

const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('Wind', () => {
  it('never pushes bullets', () => {
    for (const t of [WeaponType.RIFLE, WeaponType.SNIPER, WeaponType.SMG, WeaponType.SHOTGUN, WeaponType.MINIGUN]) {
      expect(getWindFactor(t)).toBe(0);
      expect(getWindAccel(1, t)).toBe(0);
    }
  });

  it('pushes slow ordnance in the wind direction', () => {
    expect(getWindAccel(1, WeaponType.GRENADE)).toBe(WIND_MAX_ACCEL);
    expect(getWindAccel(-0.5, WeaponType.GRENADE)).toBe(-WIND_MAX_ACCEL / 2);
    expect(getWindAccel(1, WeaponType.ROCKET)).toBeGreaterThan(getWindAccel(1, WeaponType.GRENADE));
  });

  it('rolls calm, breeze and gale within [-1, 1]', () => {
    expect(rollWind(seq(0.05, 0.9))).toBe(0);
    const breeze = rollWind(seq(0.5, 0.2, 0.5));
    expect(breeze).toBeCloseTo(-0.4, 5);
    const gale = rollWind(seq(0.95, 0.9, 1 - 1e-9));
    expect(gale).toBeGreaterThanOrEqual(0.7);
    expect(gale).toBeLessThanOrEqual(1);
    for (let i = 0; i < 500; i++) {
      const w = rollWind();
      expect(Math.abs(w)).toBeLessThanOrEqual(1);
    }
  });

  it('treats tiny wind as calm', () => {
    expect(isWindCalm(0)).toBe(true);
    expect(isWindCalm(0.05)).toBe(true);
    expect(isWindCalm(-0.3)).toBe(false);
  });
});
