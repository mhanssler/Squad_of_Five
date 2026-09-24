export type GameMode = 'basic' | 'expanded';

export const OPERATION_SCORE_TO_WIN = 7;
export const RELAY_CAPTURE_RADIUS = 82;
export const TUNNEL_MOVEMENT_COST = 72;
export const MAX_TUNNELS_PER_TURN = 2;

export type RelayControl = 'neutral' | 'red' | 'blue';

export interface TunnelPlan {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  radius: number;
  facing: -1 | 1;
}

export function getTunnelPlan(
  soldierX: number,
  soldierY: number,
  aimAngleDeg: number,
  worldWidth: number,
): TunnelPlan {
  const aimRad = aimAngleDeg * Math.PI / 180;
  const facing: -1 | 1 = Math.cos(aimRad) < 0 ? -1 : 1;
  const length = 92;
  const pitch = Math.max(-0.45, Math.min(0.45, Math.sin(aimRad))) * length;
  const startX = soldierX + facing * 12;

  return {
    startX,
    startY: soldierY + 9,
    endX: Math.max(28, Math.min(worldWidth - 28, startX + facing * length)),
    endY: soldierY + 9 + pitch,
    radius: 22,
    facing,
  };
}

export function resolveRelayControl(
  redDistances: number[],
  blueDistances: number[],
  captureRadius: number = RELAY_CAPTURE_RADIUS,
): RelayControl | 'contested' {
  const redPresent = redDistances.some(distance => distance <= captureRadius);
  const bluePresent = blueDistances.some(distance => distance <= captureRadius);

  if (redPresent && bluePresent) return 'contested';
  if (redPresent) return 'red';
  if (bluePresent) return 'blue';
  return 'neutral';
}

export function getModeLabel(mode: GameMode): string {
  return mode === 'expanded' ? 'OPERATIONS' : 'BASIC';
}
