import { describe, expect, it } from 'vitest';
import { getBattlefieldRevealFrame } from '../src/systems/CameraFraming';

describe('battlefield reveal framing', () => {
  for (const worldWidth of [1920, 2560, 3200]) {
    it(`fills the viewport and keeps the flyover inside a ${worldWidth}px battlefield`, () => {
      const viewportWidth = 1280;
      const viewportHeight = 720;
      const worldHeight = 720;
      const frame = getBattlefieldRevealFrame(
        viewportWidth,
        viewportHeight,
        worldWidth,
        worldHeight,
      );
      const visibleWidth = viewportWidth / frame.zoom;
      const visibleHeight = viewportHeight / frame.zoom;

      expect(visibleWidth).toBeLessThanOrEqual(worldWidth);
      expect(visibleHeight).toBeLessThanOrEqual(worldHeight);
      expect(frame.startCenterX - visibleWidth / 2).toBeGreaterThanOrEqual(0);
      expect(frame.endCenterX + visibleWidth / 2).toBeLessThanOrEqual(worldWidth);
      expect(frame.endCenterX).toBeGreaterThan(frame.startCenterX);
      expect(frame.centerY).toBe(worldHeight / 2);
    });
  }
});
