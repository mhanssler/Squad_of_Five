import { WeaponConfig, WeaponType } from './WeaponTypes';

// One-shot weapons found in supply crates. A soldier carries at most one; Q arms it for the turn.

export type SpecialWeaponId = 'cluster' | 'holy' | 'teleport' | 'goat' | 'sledge';

/** How a special projectile behaves once it's in the air. */
export type SpecialBehavior = 'cluster' | 'holy' | 'teleport' | 'goat';

export interface SpecialWeaponDef {
  id: SpecialWeaponId;
  name: string;
  hint: string;
  color: number;
  /** Projectile config, or null for melee (sledgehammer). */
  config: WeaponConfig | null;
  behavior: SpecialBehavior | null;
}

const base = (overrides: Partial<WeaponConfig> & Pick<WeaponConfig, 'name' | 'type'>): WeaponConfig => ({
  damage: 50,
  explosionRadius: 80,
  projectileSpeed: 900,
  gravity: 0.7,
  drag: 0.008,
  bounce: 0,
  spreadAngle: 0,
  pelletCount: 1,
  trailColor: 0xffffff,
  projectileSize: 9,
  description: '',
  weight: 1,
  mobilityBonus: 0,
  ...overrides,
});

export const CLUSTER_BOMBLET_CONFIG: WeaponConfig = base({
  name: 'Bomblet',
  type: WeaponType.DEMO, // no in-flight whistle - six at once would be a racket
  damage: 26,
  explosionRadius: 38,
  projectileSpeed: 300,
  gravity: 0.9,
  trailColor: 0xffcc33,
  projectileSize: 5,
});

/** Number of bomblets a cluster bomb splits into. */
export const CLUSTER_BOMBLET_COUNT = 6;

/** Seconds from the throw before a holy grenade goes off (normal grenades: 2.5s). */
export const HOLY_FUSE_SECONDS = 3.5;

/** How long the goat walks before it blows up on its own. */
export const GOAT_MAX_WALK_MS = 6000;
export const GOAT_WALK_SPEED = 75;

export const SLEDGE_RANGE = 52;
export const SLEDGE_DAMAGE = 30;
export const SLEDGE_KNOCKBACK = 560;

export const SPECIAL_WEAPONS: Record<SpecialWeaponId, SpecialWeaponDef> = {
  cluster: {
    id: 'cluster',
    name: 'Cluster Bomb',
    hint: 'Splits into bomblets on impact',
    color: 0xffcc33,
    behavior: 'cluster',
    config: base({
      name: 'Cluster Bomb',
      type: WeaponType.MORTAR,
      damage: 35,
      explosionRadius: 55,
      projectileSpeed: 950,
      gravity: 0.8,
      trailColor: 0xffcc33,
      projectileSize: 10,
    }),
  },
  holy: {
    id: 'holy',
    name: 'Holy Grenade',
    hint: 'Bounces, then a truly enormous blast',
    color: 0xffee88,
    behavior: 'holy',
    config: base({
      name: 'Holy Grenade',
      type: WeaponType.GRENADE,
      damage: 95,
      explosionRadius: 170,
      projectileSpeed: 800,
      gravity: 0.75,
      bounce: 0.45,
      fuse: HOLY_FUSE_SECONDS,
      trailColor: 0xffee88,
      projectileSize: 11,
    }),
  },
  teleport: {
    id: 'teleport',
    name: 'Teleporter',
    hint: 'Throw the beacon - you appear where it lands',
    color: 0x66ffff,
    behavior: 'teleport',
    config: base({
      name: 'Teleporter',
      type: WeaponType.GRENADE,
      damage: 0,
      explosionRadius: 0,
      projectileSpeed: 1000,
      gravity: 0.7,
      trailColor: 0x66ffff,
      projectileSize: 8,
    }),
  },
  goat: {
    id: 'goat',
    name: 'Kamikaze Goat',
    hint: 'Walks forward and explodes (SPACE to detonate)',
    color: 0xffffff,
    behavior: 'goat',
    config: base({
      name: 'Kamikaze Goat',
      type: WeaponType.GRENADE,
      damage: 65,
      explosionRadius: 95,
      projectileSpeed: 500,
      gravity: 0.9,
      trailColor: 0xffffff,
      projectileSize: 14,
    }),
  },
  sledge: {
    id: 'sledge',
    name: 'Sledgehammer',
    hint: 'Melee smash with huge knockback',
    color: 0xcc8844,
    behavior: null,
    config: null,
  },
};

export const SPECIAL_WEAPON_IDS = Object.keys(SPECIAL_WEAPONS) as SpecialWeaponId[];

export function rollSpecialWeapon(rand: () => number = Math.random): SpecialWeaponId {
  return SPECIAL_WEAPON_IDS[Math.floor(rand() * SPECIAL_WEAPON_IDS.length)];
}
