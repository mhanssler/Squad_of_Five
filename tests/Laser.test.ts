import { describe, expect, it } from 'vitest';
import { LASER_BURN_DEPTH, LASER_RANGE, traceLaser } from '../src/systems/Laser';

const open = () => false;

describe('laser beam', () => {
  it('travels perfectly straight to full range in the open', () => {
    const trace = traceLaser({ x: 0, y: 100, angle: 0, isSolid: open });
    expect(trace.endX).toBeCloseTo(LASER_RANGE, 0);
    expect(trace.endY).toBe(100);
    expect(trace.burns).toEqual([]);
    expect(trace.stoppedInTerrain).toBe(false);
  });

  it('pierces every soldier on its line, nearest first, and misses ones off the line', () => {
    const targets = [{ x: 600, y: 5 }, { x: 200, y: -4 }, { x: 400, y: 80 }];
    const trace = traceLaser({ x: 0, y: 0, angle: 0, isSolid: open, targets });
    expect(trace.hits).toEqual([1, 0]);
  });

  it('burns through a thin wall and keeps going', () => {
    // A 40px wall between x=300 and x=340.
    const wall = (x: number) => x >= 300 && x < 340;
    const targets = [{ x: 500, y: 0 }];
    const trace = traceLaser({ x: 0, y: 0, angle: 0, isSolid: wall, targets });
    expect(trace.hits).toEqual([0]);
    expect(trace.burns).toHaveLength(1);
    expect(trace.burns[0].x0).toBeCloseTo(300, 0);
    expect(trace.burns[0].x1).toBeCloseTo(340, 0);
    expect(trace.stoppedInTerrain).toBe(false);
  });

  it('is stopped by terrain deeper than its burn depth', () => {
    const hill = (x: number) => x >= 300;
    const targets = [{ x: 300 + LASER_BURN_DEPTH + 60, y: 0 }];
    const trace = traceLaser({ x: 0, y: 0, angle: 0, isSolid: hill, targets });
    expect(trace.stoppedInTerrain).toBe(true);
    expect(trace.hits).toEqual([]);
    expect(trace.endX).toBeLessThanOrEqual(300 + LASER_BURN_DEPTH + 2);
    expect(trace.burned).toBe(LASER_BURN_DEPTH);
  });

  it('respects the aim angle (screen coordinates: positive is down)', () => {
    const trace = traceLaser({ x: 0, y: 0, angle: 90, isSolid: open, range: 100 });
    expect(trace.endX).toBeCloseTo(0, 6);
    expect(trace.endY).toBeCloseTo(100, 6);
  });

  it('stops at the edge of the world', () => {
    const trace = traceLaser({ x: 0, y: 0, angle: 0, isSolid: open, inBounds: x => x < 250 });
    expect(trace.endX).toBeLessThan(250);
  });
});
