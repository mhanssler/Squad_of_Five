export interface BattlefieldRevealFrame {
  zoom: number;
  startCenterX: number;
  endCenterX: number;
  centerY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getBattlefieldRevealFrame(
  viewportWidth: number,
  viewportHeight: number,
  worldWidth: number,
  worldHeight: number,
): BattlefieldRevealFrame {
  const safeViewportWidth = Math.max(1, viewportWidth);
  const safeViewportHeight = Math.max(1, viewportHeight);
  const safeWorldWidth = Math.max(1, worldWidth);
  const safeWorldHeight = Math.max(1, worldHeight);
  const zoom = Math.max(
    safeViewportWidth / safeWorldWidth,
    safeViewportHeight / safeWorldHeight,
  );
  const visibleWidth = safeViewportWidth / zoom;
  const visibleHeight = safeViewportHeight / zoom;
  const halfVisibleWidth = visibleWidth / 2;
  const halfVisibleHeight = visibleHeight / 2;

  return {
    zoom,
    startCenterX: clamp(safeWorldWidth * 0.22, halfVisibleWidth, safeWorldWidth - halfVisibleWidth),
    endCenterX: clamp(safeWorldWidth * 0.78, halfVisibleWidth, safeWorldWidth - halfVisibleWidth),
    centerY: clamp(safeWorldHeight / 2, halfVisibleHeight, safeWorldHeight - halfVisibleHeight),
  };
}

/**
 * Valid scroll range for a Phaser camera kept inside world bounds.
 *
 * Phaser zooms around the centre of the view, so at zoom z the left edge of what you see is
 * `scroll + (viewport - viewport / z) / 2`, not `scroll`. Clamping scroll to [0, world - view]
 * (correct only at zoom 1) fights the camera's own bounds once the display is scaled up for
 * crisp rendering, and on a small map it left right-drag panning stuck at one edge.
 * This mirrors Phaser's BaseCamera.clampX / clampY.
 */
export function getCameraScrollRange(
  viewportSize: number,
  zoom: number,
  worldSize: number,
  worldStart: number = 0,
): { min: number; max: number } {
  const visible = viewportSize / Math.max(0.0001, zoom);
  const min = worldStart + (visible - viewportSize) / 2;
  const max = Math.max(min, min + worldSize - visible);
  return { min, max };
}

export function clampCameraScroll(
  scroll: number,
  viewportSize: number,
  zoom: number,
  worldSize: number,
  worldStart: number = 0,
): number {
  const { min, max } = getCameraScrollRange(viewportSize, zoom, worldSize, worldStart);
  return clamp(scroll, min, max);
}

/** Left/top world edge currently visible for a given scroll (Phaser's worldView.x / .y). */
export function getVisibleWorldStart(scroll: number, viewportSize: number, zoom: number): number {
  return scroll + (viewportSize - viewportSize / Math.max(0.0001, zoom)) / 2;
}
