import { WeaponType } from './WeaponTypes';

// Wind pushes slow, heavy ordnance sideways. It changes every turn, so the same shot never works twice.

/** Horizontal acceleration (px/s^2) at full wind strength for a weapon with factor 1. */
export const WIND_MAX_ACCEL = 170;

/** Wind values closer to zero than this count as calm (HUD shows "CALM", full aim preview). */
export const WIND_CALM_THRESHOLD = 0.08;

/**
 * How long (seconds of flight) the aim preview is drawn for wind-affected weapons when it's windy.
 * The rest of the arc is up to the player to judge.
 */
export const WIND_PREVIEW_SECONDS = 0.9;

// How strongly each weapon is pushed. Bullets are too fast to matter.
const WIND_FACTORS: Partial<Record<WeaponType, number>> = {
  [WeaponType.GRENADE]: 1,
  [WeaponType.ROCKET]: 1.15,
  [WeaponType.MORTAR]: 1,
  [WeaponType.DEMO]: 0.8,
  [WeaponType.FLAMER]: 0.5,
};

export function getWindFactor(type: WeaponType): number {
  return WIND_FACTORS[type] ?? 0;
}

/** Horizontal acceleration for a projectile of `type` under `wind` (-1 = full left, 1 = full right). */
export function getWindAccel(wind: number, type: WeaponType): number {
  return wind * WIND_MAX_ACCEL * getWindFactor(type);
}

export function isWindCalm(wind: number): boolean {
  return Math.abs(wind) < WIND_CALM_THRESHOLD;
}

/**
 * Roll a new wind value in [-1, 1]. Mostly moderate, occasionally calm or a gale.
 * `rand` returns [0, 1) and is injectable for tests.
 */
export function rollWind(rand: () => number = Math.random): number {
  const r = rand();
  const direction = rand() < 0.5 ? -1 : 1;
  let strength: number;
  if (r < 0.12) strength = 0; // calm
  else if (r < 0.85) strength = 0.15 + rand() * 0.5; // breeze
  else strength = 0.7 + rand() * 0.3; // gale
  return Math.round(direction * strength * 100) / 100;
}
