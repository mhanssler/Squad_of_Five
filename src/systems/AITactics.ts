export type AIMoveStopReason =
  | 'goal'
  | 'budget'
  | 'blocked'
  | 'cliff'
  | 'bounds'
  | 'timeout'
  | 'cancelled';

export interface AIMoveOutcome {
  reason: AIMoveStopReason;
  distanceMoved: number;
  requestedDistance: number;
}

export interface SpacedDestinationOptions {
  originX: number;
  goalX: number;
  preferredX: number;
  worldWidth: number;
  squadIndex: number;
  allyXs: readonly number[];
  minimumSpacing?: number;
  margin?: number;
}

export interface AIRecoveryOptions {
  reason: AIMoveStopReason;
  distanceMoved: number;
  requestedDistance: number;
  expandedMode: boolean;
  movementRemaining: number;
  tunnelMovementCost: number;
  tunnelsRemaining: number;
  canTunnel: boolean;
  grapplesRemaining: number;
  hasGrappleDestination: boolean;
}

export type AIRecoveryAction = 'tunnel' | 'grapple' | 'none';

export interface AIGrappleCandidate {
  x: number;
  y: number;
  pathClear: boolean;
  bodyClear: boolean;
  stableLanding: boolean;
}

export interface GrappleDestinationOptions {
  originX: number;
  originY: number;
  goalX: number;
  worldWidth: number;
  allyXs: readonly number[];
  candidates: readonly AIGrappleCandidate[];
  maxRange?: number;
}

export interface AIAreaTargetUnit {
  x: number;
  allegiance: 'friendly' | 'enemy';
}

export interface AIAreaStrikePlan {
  x: number;
  enemyHits: number;
  friendlyHits: number;
  score: number;
}

const FORMATION_LANES = [0, -1, 1, -2, 2] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function chooseSpacedDestinationX(options: SpacedDestinationOptions): number {
  const {
    originX,
    goalX,
    preferredX,
    worldWidth,
    squadIndex,
    allyXs,
    minimumSpacing = 76,
    margin = 28,
  } = options;
  const direction = Math.sign(goalX - originX) || 1;
  const intendedProgress = Math.max(0, (preferredX - originX) * direction);
  const preferredLane = FORMATION_LANES[
    ((squadIndex % FORMATION_LANES.length) + FORMATION_LANES.length) %
      FORMATION_LANES.length
  ];
  const laneWidth = minimumSpacing * 0.92;

  const candidates = FORMATION_LANES
    .map(lane => clamp(preferredX + lane * laneWidth, margin, worldWidth - margin))
    .filter((candidate, index, values) => values.indexOf(candidate) === index)
    .filter(candidate => {
      if (intendedProgress < 8) return true;
      return (candidate - originX) * direction >= 8;
    });

  if (candidates.length === 0) {
    return clamp(preferredX, margin, worldWidth - margin);
  }

  let bestX = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const offsetFromPreferred = candidate - preferredX;
    const candidateLane = offsetFromPreferred / laneWidth;
    let score =
      Math.abs(offsetFromPreferred) * 0.7 +
      Math.abs(candidateLane - preferredLane) * 12;

    for (const allyX of allyXs) {
      const gap = Math.abs(candidate - allyX);
      if (gap < minimumSpacing) {
        score += (minimumSpacing - gap) * 10;
      }
      if (gap < 28) {
        score += 700;
      }
    }

    const progress = Math.max(0, (candidate - originX) * direction);
    score -= Math.min(progress, intendedProgress + laneWidth) * 0.06;

    if (score < bestScore) {
      bestScore = score;
      bestX = candidate;
    }
  }

  return bestX;
}

export function chooseAIRecoveryAction(options: AIRecoveryOptions): AIRecoveryAction {
  const requestedDistance = Math.max(1, options.requestedDistance);
  const progressRatio = options.distanceMoved / requestedDistance;
  const stalled =
    options.reason === 'blocked' ||
    (options.reason === 'timeout' && progressRatio < 0.45);

  if (
    stalled &&
    options.expandedMode &&
    options.canTunnel &&
    options.tunnelsRemaining > 0 &&
    options.movementRemaining >= options.tunnelMovementCost
  ) {
    return 'tunnel';
  }

  if (
    (stalled || options.reason === 'cliff') &&
    options.grapplesRemaining > 0 &&
    options.hasGrappleDestination
  ) {
    return 'grapple';
  }

  return 'none';
}

export function chooseAIGrappleDestination(
  options: GrappleDestinationOptions,
): AIGrappleCandidate | null {
  const maxRange = options.maxRange ?? 380;
  const direction = Math.sign(options.goalX - options.originX) || 1;
  let best: AIGrappleCandidate | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of options.candidates) {
    if (!candidate.pathClear || !candidate.bodyClear) continue;
    if (candidate.x < 24 || candidate.x > options.worldWidth - 24) continue;

    const dx = candidate.x - options.originX;
    const dy = candidate.y - options.originY;
    const distance = Math.hypot(dx, dy);
    const progress = dx * direction;
    if (distance < 70 || distance > maxRange || progress < 36) continue;

    let score =
      Math.abs(options.goalX - candidate.x) * 0.42 +
      distance * 0.05 +
      Math.abs(dy) * 0.08 +
      (candidate.stableLanding ? 0 : 90);

    for (const allyX of options.allyXs) {
      const gap = Math.abs(candidate.x - allyX);
      if (gap < 76) score += (76 - gap) * 7;
    }

    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

export function chooseAIAreaStrikeTargetX(
  units: readonly AIAreaTargetUnit[],
  worldWidth: number,
  footprintRadius: number = 150,
): AIAreaStrikePlan | null {
  const enemies = units.filter(unit => unit.allegiance === 'enemy');
  if (enemies.length === 0) return null;

  const candidates = enemies.flatMap((enemy, index) => [
    enemy.x,
    ...enemies.slice(index + 1).map(other => (enemy.x + other.x) / 2),
  ]);

  let best: AIAreaStrikePlan | null = null;
  for (const rawX of candidates) {
    const x = clamp(rawX, 60, worldWidth - 60);
    let enemyHits = 0;
    let friendlyHits = 0;
    let score = 0;

    for (const unit of units) {
      const distance = Math.abs(unit.x - x);
      if (distance > footprintRadius) continue;
      const exposure = 1 - distance / footprintRadius;
      if (unit.allegiance === 'enemy') {
        enemyHits++;
        score += 2 + exposure;
      } else {
        friendlyHits++;
        score -= 6 + exposure * 2;
      }
    }

    const plan = { x, enemyHits, friendlyHits, score };
    if (
      !best ||
      plan.score > best.score ||
      (plan.score === best.score && plan.enemyHits > best.enemyHits)
    ) {
      best = plan;
    }
  }

  return best;
}
