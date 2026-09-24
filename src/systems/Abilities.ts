// Availability rules for terrain and support actions (tunnel, cover, medic heal).
// Kept Phaser-free so the HUD, the preview and the key handlers share one source of truth.

export interface AbilityStatus {
  ready: boolean;
  /** Short reason shown in the HUD / on a blocked key press when not ready. */
  reason: string;
}

export interface TurnActionState {
  hasFired: boolean;
  isCharging: boolean;
  isHowitzerMode: boolean;
  isAirstrikeTargeting: boolean;
  isGrappling: boolean;
  /** A tunnel or cover build animation is still playing. */
  isBusy: boolean;
}

export interface TunnelState extends TurnActionState {
  /** Tunnels only exist in Operations mode. */
  isOperations: boolean;
  tunnelsUsed: number;
  maxTunnels: number;
  movementRemaining: number;
  movementCost: number;
}

export interface CoverState extends TurnActionState {
  coverUsed: boolean;
  movementRemaining: number;
  movementCost: number;
}

export interface HealState extends TurnActionState {
  isMedic: boolean;
  woundedAlliesInRange: number;
}

function turnActionBlocker(state: TurnActionState): string | null {
  if (state.hasFired) return 'Action used';
  if (state.isGrappling) return 'Grappling';
  if (state.isCharging) return 'Charging shot';
  if (state.isHowitzerMode) return 'Howitzer mode';
  if (state.isAirstrikeTargeting) return 'Targeting airstrike';
  if (state.isBusy) return 'Digging...';
  return null;
}

export function getTunnelStatus(state: TunnelState): AbilityStatus {
  if (!state.isOperations) return { ready: false, reason: 'Operations mode only' };
  const blocker = turnActionBlocker(state);
  if (blocker) return { ready: false, reason: blocker };
  if (state.tunnelsUsed >= state.maxTunnels) return { ready: false, reason: `Used ${state.maxTunnels}/${state.maxTunnels} this turn` };
  if (state.movementRemaining < state.movementCost) {
    return { ready: false, reason: `Needs ${state.movementCost} move (${Math.floor(state.movementRemaining)} left)` };
  }
  const left = state.maxTunnels - state.tunnelsUsed;
  return { ready: true, reason: `READY (${left} left, ${state.movementCost} move)` };
}

export function getCoverStatus(state: CoverState): AbilityStatus {
  const blocker = turnActionBlocker(state);
  if (blocker) return { ready: false, reason: blocker };
  if (state.coverUsed) return { ready: false, reason: 'Already built this turn' };
  if (state.movementRemaining < state.movementCost) {
    return { ready: false, reason: `Needs ${state.movementCost} move (${Math.floor(state.movementRemaining)} left)` };
  }
  return { ready: true, reason: `READY (${state.movementCost} move)` };
}

export function getHealStatus(state: HealState): AbilityStatus {
  if (!state.isMedic) return { ready: false, reason: 'Medic only' };
  const blocker = turnActionBlocker(state);
  if (blocker) return { ready: false, reason: blocker };
  if (state.woundedAlliesInRange <= 0) return { ready: false, reason: 'No wounded ally in range' };
  return { ready: true, reason: 'READY' };
}
