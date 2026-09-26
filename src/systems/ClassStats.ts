import { WEAPONS, WeaponType } from './WeaponTypes';

// Squad-screen stat ratings, worked out from the real weapon numbers so the bars stay honest
// when weapons are rebalanced. Phaser-free so it can be unit tested.

export const BASE_MOVEMENT_DISTANCE = 320;

/** Minimum movement allowance for light / assault classes (mirrors GameScene). */
export const CLOSE_RANGE_MOVEMENT_FLOOR: Partial<Record<WeaponType, number>> = {
  [WeaponType.FLAMER]: 360,
  [WeaponType.SHOTGUN]: 340,
  [WeaponType.SMG]: 390,
  [WeaponType.CARBINE]: 390,
  [WeaponType.PISTOL]: 380,
  [WeaponType.SLUG]: 340,
  [WeaponType.DEMO]: 300,
};

/** Pixels a fresh (non-veteran, unsuppressed) soldier with this weapon may walk per turn. */
export function getMovementAllowance(type: WeaponType): number {
  const weapon = WEAPONS[type];
  const base = Math.floor(BASE_MOVEMENT_DISTANCE / (weapon.weight || 1));
  const bonus = Math.floor(BASE_MOVEMENT_DISTANCE * (weapon.mobilityBonus || 0));
  return Math.max(base + bonus, CLOSE_RANGE_MOVEMENT_FLOOR[type] ?? 0);
}

/**
 * Blend of what a full volley can deal (discounted for spread), how hard a single hit lands,
 * and blast area - so a sniper round outranks a pistol burst and explosives get their due.
 */
export function getFirepower(type: WeaponType): number {
  const w = WEAPONS[type];
  const volley = (w.damage * w.pelletCount) / (1 + w.spreadAngle / 20);
  return volley * 0.5 + w.damage + w.explosionRadius * 0.5;
}

export type StatRating = 1 | 2 | 3 | 4 | 5;

export interface ClassStats {
  power: StatRating;
  reach: StatRating;
  mobility: StatRating;
  movePx: number;
  blast: number;
}

const REACH_BY_RANGE: Record<'close' | 'mid' | 'long' | 'support', StatRating> = {
  close: 1,
  support: 2,
  mid: 3,
  long: 5,
};

/** Classes whose reach isn't what their menu column suggests. */
const REACH_OVERRIDES: Partial<Record<WeaponType, StatRating>> = {
  // A specialist, but its beam crosses most of a map in a dead-straight line.
  [WeaponType.LASER]: 4,
};

function rate(value: number, min: number, max: number): StatRating {
  if (max <= min) return 3;
  const t = (value - min) / (max - min);
  return (1 + Math.round(Math.min(1, Math.max(0, t)) * 4)) as StatRating;
}

const ALL_TYPES = Object.values(WeaponType) as WeaponType[];
const firepowers = ALL_TYPES.map(getFirepower);
const moves = ALL_TYPES.map(getMovementAllowance);

export function getClassStats(type: WeaponType, range: 'close' | 'mid' | 'long' | 'support'): ClassStats {
  return {
    power: rate(getFirepower(type), Math.min(...firepowers), Math.max(...firepowers)),
    reach: REACH_OVERRIDES[type] ?? REACH_BY_RANGE[range],
    mobility: rate(getMovementAllowance(type), Math.min(...moves), Math.max(...moves)),
    movePx: getMovementAllowance(type),
    blast: WEAPONS[type].explosionRadius,
  };
}
