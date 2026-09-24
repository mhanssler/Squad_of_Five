export type AimAssistMode = 'basic' | 'expanded';

export type AimAssistProfile = {
  exactImpact: boolean;
  uncertaintyRadius: number;
  dotStride: number;
  alphaFloor: number;
};

export type KeyboardChargeInput = {
  wasCharging: boolean;
  keyIsDown: boolean;
  keyJustDown: boolean;
  keyJustUp: boolean;
  canCharge: boolean;
  contextMatches: boolean;
};

export type KeyboardChargeIntent = {
  startCharge: boolean;
  continueCharge: boolean;
  fireOnRelease: boolean;
  nextCharging: boolean;
};

function normalizeDegrees(angle: number): number {
  return ((angle + 180) % 360 + 360) % 360 - 180;
}

export function getLocalPointerAimAngle(
  pointerX: number,
  pointerY: number,
  originScreenX: number,
  originScreenY: number,
  deadzone = 28,
): number | null {
  const dx = pointerX - originScreenX;
  const dy = pointerY - originScreenY;
  if (Math.hypot(dx, dy) < Math.max(0, deadzone)) return null;
  return normalizeDegrees(Math.atan2(dy, dx) * (180 / Math.PI));
}

export function advanceChargePower(
  currentPower: number,
  dt: number,
  chargePerSecond: number,
  minPower = 10,
  maxPower = 100,
): number {
  const low = Math.min(minPower, maxPower);
  const high = Math.max(minPower, maxPower);
  const safePower = Math.min(high, Math.max(low, currentPower));
  const safeDt = Math.max(0, dt);
  const safeRate = Math.max(0, chargePerSecond);
  return Math.min(high, safePower + safeRate * safeDt);
}

export function resolveKeyboardChargeInput(
  input: KeyboardChargeInput,
): KeyboardChargeIntent {
  const startCharge =
    input.canCharge &&
    !input.wasCharging &&
    input.keyJustDown;
  const activeCharge =
    input.canCharge &&
    (input.wasCharging || startCharge);
  const fireOnRelease =
    activeCharge &&
    input.keyJustUp &&
    input.contextMatches;
  const continueCharge =
    activeCharge &&
    input.keyIsDown &&
    !input.keyJustUp;

  return {
    startCharge,
    continueCharge,
    fireOnRelease,
    nextCharging: continueCharge,
  };
}

export function getAimReadout(angle: number): { elevation: number; direction: 'L' | 'R' } {
  const radians = normalizeDegrees(angle) * (Math.PI / 180);
  return {
    elevation: Math.atan2(-Math.sin(radians), Math.abs(Math.cos(radians))) * (180 / Math.PI),
    direction: Math.cos(radians) >= 0 ? 'R' : 'L',
  };
}

export function getAimAssistProfile(horizontalRange: number, mode: AimAssistMode): AimAssistProfile {
  if (mode === 'basic') {
    return {
      exactImpact: true,
      uncertaintyRadius: 0,
      dotStride: 1,
      alphaFloor: 0.3,
    };
  }

  const range = Math.max(0, horizontalRange);
  if (range <= 560) {
    return {
      exactImpact: true,
      uncertaintyRadius: 0,
      dotStride: 1,
      alphaFloor: 0.28,
    };
  }

  const difficulty = Math.min(1, (range - 560) / 1200);
  return {
    exactImpact: false,
    uncertaintyRadius: Math.round(14 + difficulty * 22),
    dotStride: difficulty < 0.35 ? 1 : difficulty < 0.75 ? 2 : 3,
    alphaFloor: 0.22 - difficulty * 0.12,
  };
}
