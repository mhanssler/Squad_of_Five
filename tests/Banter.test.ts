import { describe, expect, it } from 'vitest';
import { BANTER, emptyShotStats, pickLine, pickShotBanter } from '../src/systems/Banter';

const stats = (o: Partial<ReturnType<typeof emptyShotStats>>) => ({ ...emptyShotStats(), ...o });

describe('Banter', () => {
  it('fills in names', () => {
    const line = pickLine('allyDown', { name: 'Sarge' }, () => 0);
    expect(line).toBe('That was Sarge!');
  });

  it('has lines for every category', () => {
    for (const lines of Object.values(BANTER)) expect(lines.length).toBeGreaterThan(0);
  });

  it('taunts after a complete miss', () => {
    expect(pickShotBanter(stats({}))).toEqual({ shooter: 'miss', enemy: 'enemyTaunt', ally: null });
  });

  it('owns up to hitting a teammate', () => {
    expect(pickShotBanter(stats({ allyDamage: 20, enemyDamage: 30 })).shooter).toBe('teamHit');
    expect(pickShotBanter(stats({ allyKills: 1 })).shooter).toBe('teamKill');
  });

  it('laughs at self-hits only when no enemy was hurt', () => {
    expect(pickShotBanter(stats({ selfDamage: 10 })).shooter).toBe('selfHit');
    expect(pickShotBanter(stats({ selfDamage: 10, enemyDamage: 50 })).shooter).toBe('bigHit');
  });

  it('celebrates multi-kills and big hits', () => {
    expect(pickShotBanter(stats({ enemyKills: 2 })).shooter).toBe('multiKill');
    expect(pickShotBanter(stats({ enemyDamage: 60 })).shooter).toBe('bigHit');
    // A single kill's line is spoken at kill time, so nothing extra here.
    expect(pickShotBanter(stats({ enemyKills: 1, enemyDamage: 80 })).shooter).toBeNull();
  });
});
