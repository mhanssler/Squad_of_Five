export type DeploymentSide = 'red' | 'blue';

export type DeploymentZone = {
  minX: number;
  maxX: number;
};

export function getDeploymentZone(worldWidth: number, side: DeploymentSide): DeploymentZone {
  const margin = Math.max(80, Math.floor(worldWidth * 0.035));
  const teamSpan = worldWidth * 0.25;

  return side === 'red'
    ? { minX: margin, maxX: margin + teamSpan }
    : { minX: worldWidth - margin - teamSpan, maxX: worldWidth - margin };
}

export function planTeamDropXs(
  worldWidth: number,
  count: number,
  side: DeploymentSide,
  random: () => number = Math.random,
): number[] {
  if (count <= 0) return [];

  const zone = getDeploymentZone(worldWidth, side);
  const segmentWidth = (zone.maxX - zone.minX) / count;

  return Array.from({ length: count }, (_, index) => {
    const segmentCenter = zone.minX + segmentWidth * (index + 0.5);
    const jitter = (random() - 0.5) * segmentWidth * 0.30;
    return Math.round(segmentCenter + jitter);
  });
}

export function adjustDropXsForTerrain(
  plannedXs: number[],
  zone: DeploymentZone,
  worldHeight: number,
  getSurfaceY: (x: number) => number,
): number[] {
  const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
  const segmentWidth = (zone.maxX - zone.minX) / Math.max(1, plannedXs.length);
  const minimumGap = segmentWidth * 0.62;
  const adjusted: number[] = [];

  plannedXs.forEach((preferredX, index) => {
    const remaining = plannedXs.length - index - 1;
    const minAllowed = adjusted.length > 0
      ? adjusted[adjusted.length - 1] + minimumGap
      : zone.minX;
    const maxAllowed = zone.maxX - remaining * minimumGap;
    const preferred = clamp(preferredX, minAllowed, maxAllowed);
    const candidates = [preferred];

    for (let x = Math.ceil(minAllowed); x <= Math.floor(maxAllowed); x += 4) {
      candidates.push(x);
    }

    const uniqueCandidates = [...new Set(candidates.map(x => Math.round(x)))]
      .map(x => {
        const surfaceSamples = [-14, -7, 0, 7, 14].map(offset => getSurfaceY(x + offset));
        const highest = Math.min(...surfaceSamples);
        const lowest = Math.max(...surfaceSamples);
        const spread = lowest - highest;
        const topPenalty = Math.max(0, 106 - highest);
        const bottomPenalty = Math.max(0, lowest - (worldHeight - 56));

        return {
          x,
          safe: topPenalty === 0 && bottomPenalty === 0 && spread <= 22,
          score: spread * 8 + (topPenalty + bottomPenalty) * 20 + Math.abs(x - preferred) * 0.08,
        };
      });

    const safeCandidate = uniqueCandidates
      .filter(candidate => candidate.safe)
      .sort((a, b) => Math.abs(a.x - preferred) - Math.abs(b.x - preferred))[0];
    const bestFallback = uniqueCandidates.sort((a, b) => a.score - b.score)[0];

    adjusted.push(Math.round((safeCandidate ?? bestFallback).x));
  });

  return adjusted;
}
