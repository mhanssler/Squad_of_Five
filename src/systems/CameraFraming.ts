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
