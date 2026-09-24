import { describe, expect, it } from 'vitest';
import { getPromotion, getRankForKills, RANKS } from '../src/systems/Veterancy';

describe('Veterancy', () => {
  it('ranks up at 1, 2 and 4 kills', () => {
    expect(getRankForKills(0).title).toBe('Recruit');
    expect(getRankForKills(1).title).toBe('Veteran');
    expect(getRankForKills(2).title).toBe('Elite');
    expect(getRankForKills(3).title).toBe('Elite');
    expect(getRankForKills(4).title).toBe('Hero');
    expect(getRankForKills(12).title).toBe('Hero');
  });

  it('only reports a promotion when the rank changes', () => {
    expect(getPromotion(0, 1)?.title).toBe('Veteran');
    expect(getPromotion(2, 3)).toBeNull();
    expect(getPromotion(3, 4)?.title).toBe('Hero');
  });

  it('gets strictly better with each rank', () => {
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].killsRequired).toBeGreaterThan(RANKS[i - 1].killsRequired);
      expect(RANKS[i].damageMultiplier).toBeGreaterThan(RANKS[i - 1].damageMultiplier);
      expect(RANKS[i].movementBonus).toBeGreaterThanOrEqual(RANKS[i - 1].movementBonus);
    }
  });
});
