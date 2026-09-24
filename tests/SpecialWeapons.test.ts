import { describe, expect, it } from 'vitest';
import { rollSpecialWeapon, SPECIAL_WEAPON_IDS, SPECIAL_WEAPONS } from '../src/systems/SpecialWeapons';

describe('Special weapons', () => {
  it('rolls every weapon across the range', () => {
    const seen = new Set(SPECIAL_WEAPON_IDS.map((_, i) => rollSpecialWeapon(() => (i + 0.5) / SPECIAL_WEAPON_IDS.length)));
    expect(seen.size).toBe(SPECIAL_WEAPON_IDS.length);
  });

  it('pairs each projectile weapon with a behavior, and melee with none', () => {
    for (const def of Object.values(SPECIAL_WEAPONS)) {
      if (def.config) expect(def.behavior).not.toBeNull();
      else expect(def.behavior).toBeNull();
    }
  });

  it('teleporter never damages anyone', () => {
    expect(SPECIAL_WEAPONS.teleport.config?.damage).toBe(0);
    expect(SPECIAL_WEAPONS.teleport.config?.explosionRadius).toBe(0);
  });

  it('holy grenade out-blasts every other special', () => {
    const holy = SPECIAL_WEAPONS.holy.config!.explosionRadius;
    for (const def of Object.values(SPECIAL_WEAPONS)) {
      if (def.id !== 'holy' && def.config) expect(def.config.explosionRadius).toBeLessThan(holy);
    }
  });
});
