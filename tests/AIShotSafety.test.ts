import { describe, expect, it } from 'vitest';
import {
  findFirstUnitIntercept,
  getHorizontalShotProgress,
  getTerrainObstructionPenalty,
  type ShotUnit,
} from '../src/systems/AIShotSafety';

type TestUnit = { id: string };
type TestTeam = 'red' | 'blue';

function unit(id: string, x: number, y: number, team: TestTeam): ShotUnit<TestUnit, TestTeam> {
  return { value: { id }, x, y, team };
}

describe('AI shot safety', () => {
  it('finds an ally directly in front of the target', () => {
    const ally = unit('ally', 40, 0, 'blue');
    const enemy = unit('enemy', 90, 0, 'red');
    const hit = findFirstUnitIntercept(0, 0, 120, 0, [enemy, ally], null, 10);

    expect(hit?.unit.value.id).toBe('ally');
    expect(hit?.x).toBeCloseTo(30);
  });

  it('selects the nearest geometric intercept regardless of array order', () => {
    const farEnemy = unit('far', 90, 0, 'red');
    const nearEnemy = unit('near', 35, 0, 'red');
    const hit = findFirstUnitIntercept(0, 0, 120, 0, [farEnemy, nearEnemy], null, 8);

    expect(hit?.unit.value.id).toBe('near');
  });

  it('ignores units outside the projectile corridor and the shooter', () => {
    const shooter = unit('shooter', 0, 0, 'blue');
    const offPath = unit('off-path', 50, 25, 'red');
    const hit = findFirstUnitIntercept(
      0,
      0,
      100,
      0,
      [shooter, offPath],
      shooter.value,
      10,
    );

    expect(hit).toBeNull();
  });

  it('heavily penalizes terrain struck early in the route', () => {
    const earlyProgress = getHorizontalShotProgress(0, 1000, 160);
    const nearProgress = getHorizontalShotProgress(0, 1000, 900);

    expect(earlyProgress).toBeCloseTo(0.16);
    expect(nearProgress).toBeCloseTo(0.9);
    expect(getTerrainObstructionPenalty(earlyProgress, 700)).toBeGreaterThan(1000);
    expect(getTerrainObstructionPenalty(nearProgress, 80)).toBe(0);
    expect(getTerrainObstructionPenalty(nearProgress, 400)).toBeGreaterThan(500);
  });
});
