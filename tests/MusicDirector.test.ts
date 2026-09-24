import { describe, expect, it } from 'vitest';
import {
  getBattleBaselineIntensity,
  getMusicMovement,
  getMusicMovementCount,
  transposeFrequency,
  type MusicSection,
} from '../src/systems/MusicDirector';

describe('music movement rotation', () => {
  const sections: MusicSection[] = ['menu', 'maneuver', 'pressure', 'finale'];

  it('provides three distinct movements for every score state', () => {
    for (const section of sections) {
      expect(getMusicMovementCount(section)).toBe(3);
      const ids = Array.from({ length: 3 }, (_, index) => getMusicMovement(section, index).id);
      expect(new Set(ids).size).toBe(3);
    }
  });

  it('cycles movements without repeating consecutively and then changes variation', () => {
    const firstCycle = Array.from({ length: 3 }, (_, index) => getMusicMovement('maneuver', index));
    const nextCycle = Array.from({ length: 3 }, (_, index) => getMusicMovement('maneuver', index + 3));

    expect(firstCycle.map(plan => plan.id)).toEqual(nextCycle.map(plan => plan.id));
    expect(firstCycle.every(plan => plan.variation === 0)).toBe(true);
    expect(nextCycle.every(plan => plan.variation === 1)).toBe(true);
  });

  it('keeps every motif event inside its movement', () => {
    for (const section of sections) {
      for (let index = 0; index < getMusicMovementCount(section); index++) {
        const plan = getMusicMovement(section, index);
        expect(plan.motif.length).toBeGreaterThanOrEqual(5);
        for (const note of plan.motif) {
          expect(note.bar).toBeGreaterThanOrEqual(0);
          expect(note.bar).toBeLessThan(plan.bars);
          expect(note.beat).toBeGreaterThanOrEqual(0);
          expect(note.beat).toBeLessThan(4);
          expect(note.durationBeats).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('music dynamics and tuning', () => {
  it('raises the baseline as battle pressure increases', () => {
    expect(getBattleBaselineIntensity('maneuver')).toBeLessThan(getBattleBaselineIntensity('pressure'));
    expect(getBattleBaselineIntensity('pressure')).toBeLessThan(getBattleBaselineIntensity('finale'));
  });

  it('transposes by equal-tempered semitones', () => {
    expect(transposeFrequency(55, 0, 2)).toBeCloseTo(220);
    expect(transposeFrequency(55, 12)).toBeCloseTo(110);
    expect(transposeFrequency(55, 7)).toBeCloseTo(82.4069, 3);
  });
});
