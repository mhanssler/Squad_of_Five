import { describe, expect, it } from 'vitest';
import { advanceFlight, BALLISTIC_STEP, createFlight, GRENADE_FUSE, sweepTerrain } from '../src/systems/Ballistics';
import { findFirstUnitIntercept } from '../src/systems/AIShotSafety';

const config = { gravity: 1, drag: 0.01, bounce: 0, projectileSize: 3 };
describe('shared ballistic simulation', () => {
  it('sweeps through a thin wall instead of skipping it', () => {
    const hit = sweepTerrain(0, 20, 100, 20, (x) => Math.floor(x) === 51);
    expect(hit?.x).toBeCloseTo(51);
    expect(hit?.nx).toBeLessThan(-0.9);
  });
  it('does not let a soldier behind terrain intercept a shot', () => {
    const start = createFlight(0, 20, 0, 100, 2200);
    const step = advanceFlight(start, config, x => x >= 10 && x <= 11);
    const hit = findFirstUnitIntercept(start.x, start.y, step.state.x, step.state.y,
      [{ value: 'enemy', team: 'blue', x: 32, y: 20 }], null);
    expect(step.ended).toBe(true);
    expect(hit).toBeNull();
  });
  it('uses the same trajectory at 30, 60, and 144 rendered frames per second', () => {
    const simulate = (fps: number) => {
      let state = createFlight(10, 20, -45, 80, 900), accumulator = 0;
      for (let frame = 0; frame < fps; frame++) {
        accumulator += 1 / fps;
        while (accumulator + 1e-9 >= BALLISTIC_STEP) {
          state = advanceFlight(state, config, () => false).state;
          accumulator -= BALLISTIC_STEP;
        }
      }
      return state;
    };
    expect(simulate(30)).toEqual(simulate(60));
    expect(simulate(144)).toEqual(simulate(60));
  });
  it('reflects off a vertical wall horizontally, not vertically', () => {
    const step = advanceFlight({ x: 9, y: 30, vx: 300, vy: 0, age: 0 }, { ...config, bounce: 0.5 }, x => x >= 10);
    expect(step.state.vx).toBeLessThan(0);
    expect(Math.abs(step.state.vy)).toBeLessThan(10);
    expect(step.ended).toBe(false);
  });
  it('settles on the floor and expires at its launch-based fuse', () => {
    let state = createFlight(20, 10, 0, 0, 900);
    let result;
    do {
      result = advanceFlight(state, { ...config, bounce: 0.5 }, (_x, y) => y >= 100);
      state = result.state;
    } while (!result.ended && state.age < 4);
    expect(state.age).toBeCloseTo(GRENADE_FUSE, 1);
    expect(state.y).toBeLessThan(100);
    expect(Math.abs(state.vy)).toBeLessThan(25);
  });
});
