import { describe, expect, it } from 'vitest';
import {
  advanceChargePower,
  getAimAssistProfile,
  getAimReadout,
  getLocalPointerAimAngle,
  resolveKeyboardChargeInput,
} from '../src/systems/AimControls';

describe('soldier-centered aiming', () => {
  it('uses pointer direction rather than pointer distance', () => {
    expect(getLocalPointerAimAngle(200, 0, 100, 100)).toBeCloseTo(-45);
    expect(getLocalPointerAimAngle(1100, -900, 100, 100)).toBeCloseTo(-45);
    expect(getLocalPointerAimAngle(0, 200, 100, 100)).toBeCloseTo(135);
  });

  it('ignores unstable movement inside the local deadzone', () => {
    expect(getLocalPointerAimAngle(110, 110, 100, 100, 20)).toBeNull();
    expect(getLocalPointerAimAngle(121, 100, 100, 100, 20)).toBe(0);
  });

  it('formats elevation consistently on either facing', () => {
    expect(getAimReadout(-45).direction).toBe('R');
    expect(getAimReadout(-45).elevation).toBeCloseTo(45);
    expect(getAimReadout(-135).direction).toBe('L');
    expect(getAimReadout(-135).elevation).toBeCloseTo(45);
    expect(getAimReadout(30).direction).toBe('R');
    expect(getAimReadout(30).elevation).toBeCloseTo(-30);
  });
});

describe('Worms-style power charge', () => {
  it('moves upward once and clamps at full power', () => {
    expect(advanceChargePower(10, 1, 32)).toBe(42);
    expect(advanceChargePower(90, 1, 32)).toBe(100);
    expect(advanceChargePower(100, 1, 32)).toBe(100);
  });

  it('does not reverse or advance for negative elapsed time', () => {
    expect(advanceChargePower(60, -1, 32)).toBe(60);
  });

  it('ignores a Space key still held from character selection', () => {
    expect(resolveKeyboardChargeInput({
      wasCharging: false,
      keyIsDown: true,
      keyJustDown: false,
      keyJustUp: false,
      canCharge: true,
      contextMatches: false,
    })).toEqual({
      startCharge: false,
      continueCharge: false,
      fireOnRelease: false,
      nextCharging: false,
    });
  });

  it('fires only after a fresh press and a release in the same turn', () => {
    const pressed = resolveKeyboardChargeInput({
      wasCharging: false,
      keyIsDown: true,
      keyJustDown: true,
      keyJustUp: false,
      canCharge: true,
      contextMatches: false,
    });
    const released = resolveKeyboardChargeInput({
      wasCharging: pressed.nextCharging,
      keyIsDown: false,
      keyJustDown: false,
      keyJustUp: true,
      canCharge: true,
      contextMatches: true,
    });
    const staleRelease = resolveKeyboardChargeInput({
      wasCharging: true,
      keyIsDown: false,
      keyJustDown: false,
      keyJustUp: true,
      canCharge: true,
      contextMatches: false,
    });

    expect(pressed.startCharge).toBe(true);
    expect(pressed.nextCharging).toBe(true);
    expect(released.fireOnRelease).toBe(true);
    expect(released.nextCharging).toBe(false);
    expect(staleRelease.fireOnRelease).toBe(false);
  });
});

describe('distance-based aim assistance', () => {
  it('keeps the exact guide in Basic mode', () => {
    expect(getAimAssistProfile(2400, 'basic').exactImpact).toBe(true);
  });

  it('keeps nearby shots precise and widens the long-range bracket', () => {
    const near = getAimAssistProfile(400, 'expanded');
    const medium = getAimAssistProfile(900, 'expanded');
    const far = getAimAssistProfile(1800, 'expanded');

    expect(near.exactImpact).toBe(true);
    expect(medium.exactImpact).toBe(false);
    expect(far.uncertaintyRadius).toBeGreaterThan(medium.uncertaintyRadius);
    expect(far.dotStride).toBeGreaterThan(medium.dotStride);
    expect(far.alphaFloor).toBeLessThan(medium.alphaFloor);
  });
});
