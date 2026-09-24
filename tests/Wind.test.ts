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

describe('Wind in the shared ballistics step', () => {
  it('drifts a projectile downwind and leaves a calm shot untouched', async () => {
    const { advanceFlight, BALLISTIC_STEP } = await import('../src/systems/Ballistics');
    const config = { gravity: 0.7, drag: 0, bounce: 0, projectileSize: 8 };
    const air = () => false;
    let calm = { x: 0, y: 0, vx: 300, vy: -300, age: 0 };
    let windy = { ...calm };
    for (let i = 0; i < 120; i++) {
      calm = advanceFlight(calm, config, air, BALLISTIC_STEP).state;
      windy = advanceFlight(windy, config, air, BALLISTIC_STEP, 0, 100).state;
    }
    // One second at 100 px/s^2 is ~50px of drift; vertical motion is identical.
    expect(windy.x - calm.x).toBeGreaterThan(45);
    expect(windy.x - calm.x).toBeLessThan(55);
    expect(windy.y).toBeCloseTo(calm.y, 6);
  });

  it('honours a custom fuse for bouncing projectiles', async () => {
    const { advanceFlight, BALLISTIC_STEP } = await import('../src/systems/Ballistics');
    const air = () => false;
    const state = { x: 0, y: 0, vx: 0, vy: 0, age: 2.99 };
    const base = { gravity: 0, drag: 0, bounce: 0.5, projectileSize: 8 };
    expect(advanceFlight(state, base, air, BALLISTIC_STEP).ended).toBe(true); // default 2.5s fuse
    expect(advanceFlight(state, { ...base, fuse: 3.5 }, air, BALLISTIC_STEP).ended).toBe(false);
  });
});
