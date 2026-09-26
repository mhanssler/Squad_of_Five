import { describe, expect, it } from 'vitest';
import { clampCameraScroll, getBattlefieldRevealFrame, getCameraScrollRange, getVisibleWorldStart } from '../src/systems/CameraFraming';

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

describe('camera pan range (right-drag / A-D / touch panning)', () => {
  // Every display scale the game can pick, every map width, desktop (1x) and phone (1.35x) turn zoom.
  const scales = [1, 1.5, 2, 2.5, 3];
  const worlds = [1920, 2560, 3200];
  const turnZooms = [0.3, 1, 1.35, 2];

  it('lets the camera reach both edges of the map, whatever the display scale', () => {
    for (const s of scales) {
      for (const world of worlds) {
        for (const tz of turnZooms) {
          const viewport = 1280 * s;
          const zoom = tz * s;
          const visible = viewport / zoom;
          const { min, max } = getCameraScrollRange(viewport, zoom, world);
          const label = `scale ${s}, world ${world}, zoom ${tz}`;
          if (visible < world) {
            expect(getVisibleWorldStart(min, viewport, zoom), label).toBeCloseTo(0, 6);
            expect(getVisibleWorldStart(max, viewport, zoom) + visible, label).toBeCloseTo(world, 6);
            // There is actually room to pan.
            expect(max - min, label).toBeCloseTo(world - visible, 6);
          } else {
            expect(max, label).toBe(min);
          }
        }
      }
    }
  });

  it('matches the old 0..(world - view) range at zoom 1', () => {
    expect(getCameraScrollRange(1280, 1, 2560)).toEqual({ min: 0, max: 1280 });
  });

  it('regression: at display scale 2 on a small map, dragging left still moves the camera', () => {
    const viewport = 2560;
    const zoom = 2;
    const { min, max } = getCameraScrollRange(viewport, zoom, 1920);
    // The old clamp only allowed scroll >= 0 here, which is the right-hand edge, so panning died.
    expect(min).toBe(-640);
    expect(max).toBe(0);
    expect(clampCameraScroll(-300, viewport, zoom, 1920)).toBe(-300);
    expect(clampCameraScroll(-5000, viewport, zoom, 1920)).toBe(-640);
    expect(clampCameraScroll(5000, viewport, zoom, 1920)).toBe(0);
  });
});
