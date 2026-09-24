import { describe, expect, it } from 'vitest';
import { getDigInStatus, getHealStatus, type DigInState, type HealState } from '../src/systems/Abilities';

const idleTurn = {
  hasFired: false,
  isCharging: false,
  isHowitzerMode: false,
  isAirstrikeTargeting: false,
  isGrappling: false,
};

const dig = (overrides: Partial<DigInState> = {}) => getDigInStatus({ ...idleTurn, isOnGround: true, ...overrides });
const heal = (overrides: Partial<HealState> = {}) =>
  getHealStatus({ ...idleTurn, isMedic: true, woundedAlliesInRange: 1, ...overrides });

describe('Dig In availability', () => {
  it('is ready for a grounded soldier who has not acted', () => {
    expect(dig()).toEqual({ ready: true, reason: 'READY' });
  });

  it.each([
    [{ hasFired: true }, 'Action used'],
    [{ isGrappling: true }, 'Grappling'],
    [{ isCharging: true }, 'Charging shot'],
    [{ isHowitzerMode: true }, 'Howitzer mode'],
    [{ isAirstrikeTargeting: true }, 'Targeting airstrike'],
    [{ isOnGround: false }, 'Must be on the ground'],
  ] as const)('is blocked by %o', (overrides, reason) => {
    expect(dig(overrides)).toEqual({ ready: false, reason });
  });
});

describe('Medic heal availability', () => {
  it('is ready for a medic with a wounded ally in range', () => {
    expect(heal().ready).toBe(true);
  });

  it('explains that only medics can heal, before any other reason', () => {
    expect(heal({ isMedic: false, hasFired: true })).toEqual({ ready: false, reason: 'Medic only' });
  });

  it('needs a wounded ally in range', () => {
    expect(heal({ woundedAlliesInRange: 0 })).toEqual({ ready: false, reason: 'No wounded ally in range' });
  });

  it('is blocked once the turn action is used', () => {
    expect(heal({ hasFired: true })).toEqual({ ready: false, reason: 'Action used' });
  });
});
