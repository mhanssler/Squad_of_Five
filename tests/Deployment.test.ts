import { describe, expect, it } from 'vitest';
import { adjustDropXsForTerrain, getDeploymentZone, planTeamDropXs } from '../src/systems/Deployment';

describe('paratrooper deployment', () => {
  for (const width of [1920, 2560, 3200]) {
    it(`stratifies both squads across separate quarter-map zones at ${width}px`, () => {
      const rolls = [0, 1, 0, 1, 0];
      let rollIndex = 0;
      const random = (): number => rolls[rollIndex++ % rolls.length];
      const redZone = getDeploymentZone(width, 'red');
      const blueZone = getDeploymentZone(width, 'blue');
      const red = planTeamDropXs(width, 5, 'red', random);
      const blue = planTeamDropXs(width, 5, 'blue', random);

      for (const x of red) expect(x).toBeGreaterThanOrEqual(redZone.minX);
      for (const x of red) expect(x).toBeLessThanOrEqual(redZone.maxX);
      for (const x of blue) expect(x).toBeGreaterThanOrEqual(blueZone.minX);
      for (const x of blue) expect(x).toBeLessThanOrEqual(blueZone.maxX);

      expect(redZone.maxX - redZone.minX).toBeCloseTo(width * 0.25);
      expect(blueZone.maxX - blueZone.minX).toBeCloseTo(width * 0.25);
      expect(redZone.maxX).toBeLessThan(blueZone.minX);

      const minimumGap = width * 0.25 / 5 * 0.69;
      for (const team of [red, blue]) {
        for (let i = 1; i < team.length; i++) {
          expect(team[i] - team[i - 1]).toBeGreaterThanOrEqual(minimumGap);
        }
      }
    });
  }

  it('preserves minimum spacing even when every preferred landing spot is unsafe', () => {
    const width = 1920;
    const zone = getDeploymentZone(width, 'red');
    const planned = planTeamDropXs(width, 5, 'red', () => 0.5);
    const adjusted = adjustDropXsForTerrain(planned, zone, 720, () => 70);
    const minimumGap = (zone.maxX - zone.minX) / 5 * 0.62;

    for (let i = 1; i < adjusted.length; i++) {
      expect(adjusted[i] - adjusted[i - 1]).toBeGreaterThanOrEqual(Math.floor(minimumGap));
    }
  });

  it('searches the full available zone for walkable ground before accepting a steep fallback', () => {
    const adjusted = adjustDropXsForTerrain(
      [40],
      { minX: 0, maxX: 200 },
      720,
      x => x >= 140 ? 300 : 100 + x * 2,
    );

    expect(adjusted[0]).toBeGreaterThanOrEqual(154);
  });
});
