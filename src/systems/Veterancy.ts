// Soldiers who get kills earn ranks with small bonuses, which makes keeping them alive matter.

export interface Rank {
  level: number;
  title: string;
  stars: string;
  killsRequired: number;
  /** Multiplier applied to all damage this soldier deals. */
  damageMultiplier: number;
  /** Extra movement as a fraction of the soldier's normal movement. */
  movementBonus: number;
  /** Armor granted once, on reaching this rank. */
  promotionArmor: number;
}

export const RANKS: readonly Rank[] = [
  { level: 0, title: 'Recruit', stars: '', killsRequired: 0, damageMultiplier: 1, movementBonus: 0, promotionArmor: 0 },
  { level: 1, title: 'Veteran', stars: '★', killsRequired: 1, damageMultiplier: 1.1, movementBonus: 0, promotionArmor: 0 },
  { level: 2, title: 'Elite', stars: '★★', killsRequired: 2, damageMultiplier: 1.2, movementBonus: 0.15, promotionArmor: 0 },
  { level: 3, title: 'Hero', stars: '★★★', killsRequired: 4, damageMultiplier: 1.3, movementBonus: 0.25, promotionArmor: 30 },
];

export function getRankForKills(kills: number): Rank {
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (kills >= r.killsRequired) rank = r;
  }
  return rank;
}

/** The rank reached by going from `killsBefore` to `killsAfter`, or null if no promotion happened. */
export function getPromotion(killsBefore: number, killsAfter: number): Rank | null {
  const before = getRankForKills(killsBefore);
  const after = getRankForKills(killsAfter);
  return after.level > before.level ? after : null;
}
