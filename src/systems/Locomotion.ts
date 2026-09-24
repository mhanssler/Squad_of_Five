export type GroundStepKind = 'grounded' | 'blocked' | 'falling';

export interface GroundStepResolution {
  kind: GroundStepKind;
  y: number;
}

export function pickGroundSurface(
  footSurfaces: ReadonlyArray<number | null>,
): number | null {
  if (footSurfaces.length === 0) return null;

  const centerSurface = footSurfaces[Math.floor(footSurfaces.length / 2)];
  if (centerSurface !== null && centerSurface !== undefined) return centerSurface;

  const available = footSurfaces
    .filter((surface): surface is number => surface !== null)
    .sort((a, b) => a - b);
  if (available.length === 0) return null;

  return available[Math.floor(available.length / 2)];
}

export function findWalkableSurfaceY(
  referenceFootY: number,
  maxUp: number,
  maxDown: number,
  height: number,
  isSolid: (y: number) => boolean,
): number | null {
  const startY = Math.max(1, Math.floor(referenceFootY - maxUp));
  const endY = Math.min(height - 1, Math.ceil(referenceFootY + maxDown));
  const footY = Math.max(1, Math.min(height - 1, Math.floor(referenceFootY)));

  if (isSolid(footY)) {
    let top = footY;
    while (top > 0 && footY - top <= maxDown && isSolid(top - 1)) top--;
    if (!isSolid(top - 1) && footY - top <= maxDown) return top;
  }

  let previousSolid = isSolid(startY - 1);
  for (let y = startY; y <= endY; y++) {
    const solid = isSolid(y);
    if (solid && !previousSolid) return y;
    previousSolid = solid;
  }

  return null;
}

export function resolveGroundStep(
  currentY: number,
  targetY: number,
  maxStepUp: number = 6,
  maxStepDown: number = 11,
): GroundStepResolution {
  const delta = targetY - currentY;

  if (delta < -maxStepUp) return { kind: 'blocked', y: currentY };
  if (delta > maxStepDown) return { kind: 'falling', y: currentY };
  return { kind: 'grounded', y: targetY };
}

export function smoothTerrainProfile(
  values: number[],
  radius: number = 3,
  passes: number = 2,
): number[] {
  if (values.length < 3 || radius <= 0 || passes <= 0) return [...values];

  let current = [...values];
  const safeRadius = Math.max(1, Math.floor(radius));

  for (let pass = 0; pass < Math.floor(passes); pass++) {
    const next = new Array<number>(current.length);
    for (let i = 0; i < current.length; i++) {
      let weightedSum = 0;
      let totalWeight = 0;
      for (let offset = -safeRadius; offset <= safeRadius; offset++) {
        const index = Math.max(0, Math.min(current.length - 1, i + offset));
        const weight = safeRadius + 1 - Math.abs(offset);
        weightedSum += current[index] * weight;
        totalWeight += weight;
      }
      next[i] = weightedSum / totalWeight;
    }
    current = next;
  }

  return current;
}
