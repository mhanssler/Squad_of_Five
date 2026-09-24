// Availability rules for the turn-ending abilities (Dig In, Medic Heal).
// Kept Phaser-free so the HUD and the key handlers share one source of truth and it can be unit tested.

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
}

export interface DigInState extends TurnActionState {
  /** Soldier has been standing on terrain (brief hops/slope flicker are tolerated by the caller). */
  isOnGround: boolean;
}

export interface HealState extends TurnActionState {
  isMedic: boolean;
  woundedAlliesInRange: number;
}

const READY: AbilityStatus = { ready: true, reason: 'READY' };

function turnActionBlocker(state: TurnActionState): string | null {
  if (state.hasFired) return 'Action used';
  if (state.isGrappling) return 'Grappling';
  if (state.isCharging) return 'Charging shot';
  if (state.isHowitzerMode) return 'Howitzer mode';
  if (state.isAirstrikeTargeting) return 'Targeting airstrike';
  return null;
}

export function getDigInStatus(state: DigInState): AbilityStatus {
  const blocker = turnActionBlocker(state);
  if (blocker) return { ready: false, reason: blocker };
  if (!state.isOnGround) return { ready: false, reason: 'Must be on the ground' };
  return READY;
}

export function getHealStatus(state: HealState): AbilityStatus {
  if (!state.isMedic) return { ready: false, reason: 'Medic only' };
  const blocker = turnActionBlocker(state);
  if (blocker) return { ready: false, reason: blocker };
  if (state.woundedAlliesInRange <= 0) return { ready: false, reason: 'No wounded ally in range' };
  return READY;
}
