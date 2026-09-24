export const COVER_MOVEMENT_COST = 90;
export const COVER_EXPOSURE_MULTIPLIER = 0.4;

export function traceBlastExposure(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  isSolid: (x: number, y: number) => boolean,
): number {
  const distance = Math.hypot(targetX - startX, targetY - startY);
  if (distance < 12) return 1;
  const exposure = [-12, 0, 12].map(offset => {
    const endY = targetY + offset;
    const steps = Math.max(1, Math.ceil(Math.hypot(targetX - startX, endY - startY) * 2));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      // Ignore only the immediate impact skin, not a percentage of the entire ray.
      if (t * distance < 3 || (1 - t) * distance < 2) continue;
      if (isSolid(startX + (targetX - startX) * t, startY + (endY - startY) * t)) return COVER_EXPOSURE_MULTIPLIER;
    }
    return 1;
  });
  return Math.round(exposure.reduce((sum, value) => sum + value, 0) / exposure.length * 1000) / 1000;
}
