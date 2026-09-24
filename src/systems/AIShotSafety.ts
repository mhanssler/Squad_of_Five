export interface ShotUnit<T, TTeam = string> {
  value: T;
  x: number;
  y: number;
  team: TTeam;
}

export interface SegmentUnitHit<T, TTeam = string> {
  unit: ShotUnit<T, TTeam>;
  t: number;
  x: number;
  y: number;
}

export function findFirstUnitIntercept<T, TTeam>(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  units: readonly ShotUnit<T, TTeam>[],
  excludedValue: T | null,
  radius: number = 18,
): SegmentUnitHit<T, TTeam> | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const a = dx * dx + dy * dy;
  let firstHit: SegmentUnitHit<T, TTeam> | null = null;

  for (const unit of units) {
    if (unit.value === excludedValue) continue;
    if (
      unit.x < Math.min(x0, x1) - radius ||
      unit.x > Math.max(x0, x1) + radius ||
      unit.y < Math.min(y0, y1) - radius ||
      unit.y > Math.max(y0, y1) + radius
    ) {
      continue;
    }

    const fx = x0 - unit.x;
    const fy = y0 - unit.y;
    const c = fx * fx + fy * fy - radius * radius;
    let hitT: number | null = null;

    if (a < 0.0001) {
      if (c <= 0) hitT = 0;
    } else if (c <= 0) {
      hitT = 0;
    } else {
      const b = 2 * (fx * dx + fy * dy);
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const root = Math.sqrt(discriminant);
        const t1 = (-b - root) / (2 * a);
        const t2 = (-b + root) / (2 * a);
        if (t1 >= 0 && t1 <= 1) hitT = t1;
        else if (t2 >= 0 && t2 <= 1) hitT = t2;
      }
    }

    if (hitT === null || (firstHit && hitT >= firstHit.t)) continue;
    firstHit = {
      unit,
      t: hitT,
      x: x0 + dx * hitT,
      y: y0 + dy * hitT,
    };
  }

  return firstHit;
}

export function getHorizontalShotProgress(
  startX: number,
  targetX: number,
  impactX: number,
): number {
  const targetDelta = targetX - startX;
  if (Math.abs(targetDelta) < 0.0001) return 0;
  return Math.max(0, Math.min(1, (impactX - startX) / targetDelta));
}

export function getTerrainObstructionPenalty(
  progress: number,
  missDistance: number,
): number {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  if (clampedProgress >= 0.82) {
    return Math.round(Math.max(0, missDistance - 120) * 2);
  }

  const earlyFactor = 1 - clampedProgress;
  const routePenalty = 100 + earlyFactor * earlyFactor * 900;
  const missPenalty = Math.min(500, Math.max(0, missDistance) * 0.9);
  return Math.round(routePenalty + missPenalty);
}
