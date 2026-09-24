import { describe, expect, it } from 'vitest';
import {
  getCoverStatus,
  getHealStatus,
  getTunnelStatus,
  type CoverState,
  type HealState,
  type TunnelState,
} from '../src/systems/Abilities';

const idleTurn = {
  hasFired: false,
  isCharging: false,
  isHowitzerMode: false,
  isAirstrikeTargeting: false,
  isGrappling: false,
  isBusy: false,
};

const tunnel = (o: Partial<TunnelState> = {}) => getTunnelStatus({
  ...idleTurn, isOperations: true, tunnelsUsed: 0, maxTunnels: 2, movementRemaining: 200, movementCost: 72, ...o,
});
const cover = (o: Partial<CoverState> = {}) => getCoverStatus({
  ...idleTurn, coverUsed: false, movementRemaining: 200, movementCost: 90, ...o,
});
const heal = (o: Partial<HealState> = {}) => getHealStatus({ ...idleTurn, isMedic: true, woundedAlliesInRange: 1, ...o });

describe('Tunnel availability', () => {
  it('is ready with movement and tunnels left, and says how many remain', () => {
    expect(tunnel()).toEqual({ ready: true, reason: 'READY (2 left, 72 move)' });
    expect(tunnel({ tunnelsUsed: 1 }).reason).toBe('READY (1 left, 72 move)');
  });

  it('only exists in Operations mode', () => {
    expect(tunnel({ isOperations: false })).toEqual({ ready: false, reason: 'Operations mode only' });
  });

  it('explains the per-turn cap', () => {
    expect(tunnel({ tunnelsUsed: 2 })).toEqual({ ready: false, reason: 'Used 2/2 this turn' });
  });

  it('explains a movement shortfall with the numbers', () => {
    expect(tunnel({ movementRemaining: 40.7 })).toEqual({ ready: false, reason: 'Needs 72 move (40 left)' });
  });

  it.each([
    [{ hasFired: true }, 'Action used'],
    [{ isGrappling: true }, 'Grappling'],
    [{ isCharging: true }, 'Charging shot'],
    [{ isHowitzerMode: true }, 'Howitzer mode'],
    [{ isAirstrikeTargeting: true }, 'Targeting airstrike'],
    [{ isBusy: true }, 'Digging...'],
  ] as const)('is blocked by %o', (overrides, reason) => {
    expect(tunnel(overrides)).toEqual({ ready: false, reason });
  });
});

describe('Cover availability', () => {
  it('is ready once per turn with enough movement', () => {
    expect(cover()).toEqual({ ready: true, reason: 'READY (90 move)' });
    expect(cover({ coverUsed: true })).toEqual({ ready: false, reason: 'Already built this turn' });
  });

  it('explains a movement shortfall', () => {
    expect(cover({ movementRemaining: 10 })).toEqual({ ready: false, reason: 'Needs 90 move (10 left)' });
  });

  it('is blocked once the attack is used', () => {
    expect(cover({ hasFired: true })).toEqual({ ready: false, reason: 'Action used' });
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
});
