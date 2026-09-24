import { describe, expect, it } from 'vitest';
import {
  findWalkableSurfaceY,
  pickGroundSurface,
  resolveGroundStep,
  smoothTerrainProfile,
} from '../src/systems/Locomotion';

describe('ground locomotion', () => {
  it('walks small slopes, blocks cliffs, and falls over larger drops', () => {
    expect(resolveGroundStep(100, 95)).toEqual({ kind: 'grounded', y: 95 });
    expect(resolveGroundStep(100, 93)).toEqual({ kind: 'blocked', y: 100 });
    expect(resolveGroundStep(100, 112)).toEqual({ kind: 'falling', y: 100 });
  });

  it('anchors a soldier to the center foot on slopes instead of rejecting the stride', () => {
    expect(pickGroundSurface([102, 111, 123])).toBe(111);
    expect(pickGroundSurface([102, null, 123])).toBe(123);
    expect(pickGroundSurface([null, null, null])).toBeNull();
  });

  it('smooths high-frequency terrain without changing profile length', () => {
    const jagged = [100, 110, 98, 112, 99, 108, 100];
    const smoothed = smoothTerrainProfile(jagged, 2, 2);
    const largestStep = (values: number[]) => Math.max(
      ...values.slice(1).map((value, index) => Math.abs(value - values[index])),
    );

    expect(smoothed).toHaveLength(jagged.length);
    expect(largestStep(smoothed)).toBeLessThan(largestStep(jagged));
    expect(Math.min(...smoothed)).toBeGreaterThanOrEqual(Math.min(...jagged));
    expect(Math.max(...smoothed)).toBeLessThanOrEqual(Math.max(...jagged));
  });

  it('finds cave floors without locking onto ceilings and recovers bounded landings', () => {
    const caveColumn = (y: number): boolean => (y >= 70 && y <= 84) || y >= 112;
    expect(findWalkableSurfaceY(104, 9, 16, 200, caveColumn)).toBe(112);

    const groundColumn = (y: number): boolean => y >= 100;
    expect(findWalkableSurfaceY(108, 9, 16, 200, groundColumn)).toBe(100);
    expect(findWalkableSurfaceY(120, 9, 16, 200, groundColumn)).toBeNull();
  });
});
