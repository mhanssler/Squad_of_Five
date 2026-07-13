import { describe, it, expect } from 'vitest';
import { WeaponType, WEAPONS, ALL_WEAPON_TYPES, SQUAD_WEAPONS, WeaponConfig } from '../src/systems/WeaponTypes';

describe('WeaponTypes', () => {
  describe('WeaponType enum', () => {
    it('should have all expected weapon types', () => {
      expect(WeaponType.RIFLE).toBe('rifle');
      expect(WeaponType.GRENADE).toBe('grenade');
      expect(WeaponType.ROCKET).toBe('rocket');
      expect(WeaponType.SHOTGUN).toBe('shotgun');
      expect(WeaponType.SNIPER).toBe('sniper');
      expect(WeaponType.MORTAR).toBe('mortar');
      expect(WeaponType.FLAMER).toBe('flamer');
      expect(WeaponType.PISTOL).toBe('pistol');
      expect(WeaponType.SMG).toBe('smg');
      expect(WeaponType.MINIGUN).toBe('minigun');
      expect(WeaponType.CARBINE).toBe('carbine');
      expect(WeaponType.SLUG).toBe('slug');
      expect(WeaponType.DEMO).toBe('demo');
    });

    it('should have exactly 13 weapon types', () => {
      const weaponTypes = Object.values(WeaponType);
      expect(weaponTypes.length).toBe(13);
    });
  });

  describe('WEAPONS configuration', () => {
    it('should have a config for every weapon type', () => {
      for (const type of Object.values(WeaponType)) {
        expect(WEAPONS[type as WeaponType]).toBeDefined();
        expect(WEAPONS[type as WeaponType].type).toBe(type);
      }
    });

    it('should have valid damage values (positive numbers)', () => {
      for (const [type, config] of Object.entries(WEAPONS)) {
        expect(config.damage).toBeGreaterThan(0);
        expect(Number.isFinite(config.damage)).toBe(true);
      }
    });

    it('should have valid explosion radius (non-negative)', () => {
      for (const [type, config] of Object.entries(WEAPONS)) {
        expect(config.explosionRadius).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(config.explosionRadius)).toBe(true);
      }
    });

    it('should have valid projectile speed (positive)', () => {
      for (const [type, config] of Object.entries(WEAPONS)) {
        expect(config.projectileSpeed).toBeGreaterThan(0);
        expect(Number.isFinite(config.projectileSpeed)).toBe(true);
      }
    });

    it('should have gravity between 0 and 2', () => {
      for (const [type, config] of Object.entries(WEAPONS)) {
        expect(config.gravity).toBeGreaterThanOrEqual(0);
        expect(config.gravity).toBeLessThanOrEqual(2);
      }
    });

    it('should have valid weight values (positive)', () => {
      for (const [type, config] of Object.entries(WEAPONS)) {
        expect(config.weight).toBeGreaterThan(0);
        expect(Number.isFinite(config.weight)).toBe(true);
      }
    });

    it('should have valid mobility bonus values (0-1 range)', () => {
      for (const [type, config] of Object.entries(WEAPONS)) {
        expect(config.mobilityBonus).toBeGreaterThanOrEqual(0);
        expect(config.mobilityBonus).toBeLessThanOrEqual(1);
        expect(Number.isFinite(config.mobilityBonus)).toBe(true);
      }
    });

    it('should have pellet count (at least 1)', () => {
      for (const [type, config] of Object.entries(WEAPONS)) {
        expect(config.pelletCount).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(config.pelletCount)).toBe(true);
      }
    });

    it('should have spread angle only for multi-pellet weapons or flamer', () => {
      for (const [type, config] of Object.entries(WEAPONS)) {
        if (config.pelletCount === 1 && config.type !== WeaponType.FLAMER) {
          expect(config.spreadAngle).toBe(0);
        }
      }
    });

    it('shotgun should have multiple pellets', () => {
      expect(WEAPONS[WeaponType.SHOTGUN].pelletCount).toBeGreaterThan(1);
      expect(WEAPONS[WeaponType.SHOTGUN].spreadAngle).toBeGreaterThan(0);
    });

    it('sniper should have highest single-shot damage', () => {
      const sniperDamage = WEAPONS[WeaponType.SNIPER].damage;
      for (const [type, config] of Object.entries(WEAPONS)) {
        if (config.pelletCount === 1 && config.type !== WeaponType.SNIPER) {
          expect(sniperDamage).toBeGreaterThanOrEqual(config.damage);
        }
      }
    });

    it('sniper should have lowest gravity for flat trajectory', () => {
      const sniperGravity = WEAPONS[WeaponType.SNIPER].gravity;
      for (const [type, config] of Object.entries(WEAPONS)) {
        expect(sniperGravity).toBeLessThanOrEqual(config.gravity);
      }
    });

    it('mortar should have highest gravity for arcing shots', () => {
      const mortarGravity = WEAPONS[WeaponType.MORTAR].gravity;
      for (const [type, config] of Object.entries(WEAPONS)) {
        expect(mortarGravity).toBeGreaterThanOrEqual(config.gravity);
      }
    });

    it('minigun should be the heaviest weapon', () => {
      const minigunWeight = WEAPONS[WeaponType.MINIGUN].weight;
      for (const [type, config] of Object.entries(WEAPONS)) {
        expect(minigunWeight).toBeGreaterThanOrEqual(config.weight);
      }
    });

    it('pistol should be one of the lightest weapons', () => {
      const pistolWeight = WEAPONS[WeaponType.PISTOL].weight;
      expect(pistolWeight).toBeLessThanOrEqual(1);
    });

    it('close-range weapons should have higher mobility bonuses', () => {
      // Close range weapons get sprint bonuses
      const flamerBonus = WEAPONS[WeaponType.FLAMER].mobilityBonus;
      const shotgunBonus = WEAPONS[WeaponType.SHOTGUN].mobilityBonus;
      const smgBonus = WEAPONS[WeaponType.SMG].mobilityBonus;
      
      // Long range weapons should have lower/no bonuses
      const sniperBonus = WEAPONS[WeaponType.SNIPER].mobilityBonus;
      const mortarBonus = WEAPONS[WeaponType.MORTAR].mobilityBonus;
      const rocketBonus = WEAPONS[WeaponType.ROCKET].mobilityBonus;
      
      expect(flamerBonus).toBeGreaterThan(sniperBonus);
      expect(shotgunBonus).toBeGreaterThan(mortarBonus);
      expect(smgBonus).toBeGreaterThan(rocketBonus);
    });
  });

  describe('ALL_WEAPON_TYPES array', () => {
    it('should contain all weapon types', () => {
      const allTypes = Object.values(WeaponType);
      expect(ALL_WEAPON_TYPES.length).toBe(allTypes.length);
      for (const type of allTypes) {
        expect(ALL_WEAPON_TYPES).toContain(type);
      }
    });

    it('should not have duplicates', () => {
      const uniqueTypes = new Set(ALL_WEAPON_TYPES);
      expect(uniqueTypes.size).toBe(ALL_WEAPON_TYPES.length);
    });
  });

  describe('SQUAD_WEAPONS array', () => {
    it('should have exactly 5 weapons for a squad', () => {
      expect(SQUAD_WEAPONS.length).toBe(5);
    });

    it('should only contain valid weapon types', () => {
      for (const type of SQUAD_WEAPONS) {
        expect(Object.values(WeaponType)).toContain(type);
      }
    });

    it('should not have duplicates in default squad', () => {
      const uniqueTypes = new Set(SQUAD_WEAPONS);
      expect(uniqueTypes.size).toBe(SQUAD_WEAPONS.length);
    });
  });
});

describe('Weapon balance sanity checks', () => {
  it('bullet weapons should have low/no explosion radius', () => {
    const bulletWeapons = [
      WeaponType.RIFLE,
      WeaponType.SNIPER,
      WeaponType.PISTOL,
      WeaponType.SMG,
      WeaponType.MINIGUN,
      WeaponType.SHOTGUN,
      WeaponType.CARBINE,
      WeaponType.SLUG,
    ];
    for (const type of bulletWeapons) {
      expect(WEAPONS[type].explosionRadius).toBeLessThanOrEqual(20);
    }
  });

  it('explosive weapons should have larger explosion radius', () => {
    const explosiveWeapons = [WeaponType.GRENADE, WeaponType.ROCKET, WeaponType.MORTAR, WeaponType.DEMO];
    for (const type of explosiveWeapons) {
      expect(WEAPONS[type].explosionRadius).toBeGreaterThanOrEqual(50);
    }
  });

  it('heavier weapons should generally have more damage or utility', () => {
    // Minigun is heavy but does less damage per bullet - that's okay because it fires many
    const minigun = WEAPONS[WeaponType.MINIGUN];
    const totalMingunDamage = minigun.damage * minigun.pelletCount;
    expect(totalMingunDamage).toBeGreaterThanOrEqual(50);
  });
});
