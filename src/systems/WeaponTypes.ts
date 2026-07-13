/**
 * Weapon definitions with realistic physics properties
 */

export enum WeaponType {
  RIFLE = 'rifle',
  GRENADE = 'grenade', 
  ROCKET = 'rocket',
  SHOTGUN = 'shotgun',
  SNIPER = 'sniper',
  MORTAR = 'mortar',
  FLAMER = 'flamer',
  PISTOL = 'pistol',
  SMG = 'smg',
  MINIGUN = 'minigun',
  CARBINE = 'carbine',
  SLUG = 'slug',
  DEMO = 'demo',
}

export interface WeaponConfig {
  name: string;
  type: WeaponType;
  damage: number;
  explosionRadius: number;
  projectileSpeed: number;
  gravity: number; // Gravity multiplier (1 = normal, 0 = none)
  drag: number; // Air resistance
  bounce: number;
  spreadAngle: number; // For shotgun pellets
  pelletCount: number; // For shotgun
  trailColor: number;
  projectileSize: number;
  description: string;
  weight: number; // Affects movement range (1 = light, 3 = heavy)
  mobilityBonus: number; // Extra movement for close-range weapons (0-1, adds percentage of base movement)
}

export const WEAPONS: Record<WeaponType, WeaponConfig> = {
  [WeaponType.RIFLE]: {
    name: 'Assault Rifle',
    type: WeaponType.RIFLE,
    damage: 12, // Increased damage per bullet
    explosionRadius: 14, // Larger hit radius - near misses count
    projectileSpeed: 1300, // Faster for flatter trajectory
    gravity: 0.12, // Even lower gravity
    drag: 0.003,
    bounce: 0,
    spreadAngle: 3, // Tighter spread
    pelletCount: 15, // Burst of 15 - snappy, resolves fast
    trailColor: 0xffff00,
    projectileSize: 3,
    description: 'Fast burst fire, moderate damage, good range',
    weight: 1.3, // Lighter
    mobilityBonus: 0.15, // Some mobility
  },
  
  [WeaponType.GRENADE]: {
    name: 'Grenade',
    type: WeaponType.GRENADE,
    damage: 55, // More damage
    explosionRadius: 90, // Larger blast
    projectileSpeed: 900, // Better range
    gravity: 0.7, // Slightly lower arc
    drag: 0.008,
    bounce: 0.5, // Bounces before exploding
    spreadAngle: 0,
    pelletCount: 1,
    trailColor: 0x44ff44,
    projectileSize: 8,
    description: 'Arcing throw, bounces before exploding, large blast',
    weight: 1.0, // Light - just carrying grenades
    mobilityBonus: 0.25, // Light equipment = good mobility
  },
  
  [WeaponType.ROCKET]: {
    name: 'Rocket Launcher',
    type: WeaponType.ROCKET,
    damage: 65,
    explosionRadius: 100,
    projectileSpeed: 850,
    gravity: 0.2, // Very flat trajectory
    drag: 0.001,
    bounce: 0,
    spreadAngle: 0,
    pelletCount: 1,
    trailColor: 0xff4400,
    projectileSize: 10,
    description: 'Fast, flat trajectory, massive blast radius',
    weight: 2.5, // Still heavy but less punishing
    mobilityBonus: 0.0,
  },
  
[WeaponType.SHOTGUN]: {
    name: 'Shotgun',
    type: WeaponType.SHOTGUN,
    damage: 35, // Per pellet
    explosionRadius: 8, // Pellet impact radius
    projectileSpeed: 1100,
    gravity: 0.15,
    drag: 0.02,
    bounce: 0,
    spreadAngle: 12, // Tighter spread for mid-range
    pelletCount: 6, // More pellets
    trailColor: 0xaaaaaa,
    projectileSize: 3,
    description: 'Tight spread effective to mid-range - ASSAULT SPRINT',
    weight: 1.8, // Lighter
    mobilityBonus: 0.95, // Close-range specialist
  },
  
  [WeaponType.SNIPER]: {
    name: 'Sniper Rifle',
    type: WeaponType.SNIPER,
    damage: 110,
    explosionRadius: 8, // Larger hit radius
    projectileSpeed: 2200,
    gravity: 0.03, // Nearly zero - laser straight
    drag: 0.0003,
    bounce: 0,
    spreadAngle: 0,
    pelletCount: 1,
    trailColor: 0x00ffff,
    projectileSize: 3,
    description: 'High damage, instant travel, nearly straight trajectory',
    weight: 2.2, // Lighter
    mobilityBonus: 0.0,
  },
  
[WeaponType.MORTAR]: {
    name: 'Mortar',
    type: WeaponType.MORTAR,
    damage: 95,
    explosionRadius: 110,
    projectileSpeed: 1100,
    gravity: 0.9, // High arc but faster
    drag: 0.004,
    bounce: 0,
    spreadAngle: 0,
    pelletCount: 1,
    trailColor: 0xff8800,
    projectileSize: 12,
    description: 'High arc indirect fire, massive blast, faster shell',
    weight: 1.3,
    mobilityBonus: 0.15,
  },
  
[WeaponType.FLAMER]: {
    name: 'Flamethrower',
    type: WeaponType.FLAMER,
    damage: 12, // Per particle
    explosionRadius: 18,
    projectileSpeed: 500,
    gravity: 0.3,
    drag: 0.04,
    bounce: 0,
    spreadAngle: 25, // Wider cone
    pelletCount: 10,
    trailColor: 0xff3300,
    projectileSize: 6,
    description: 'Wide cone of fire, longer reach - ASSAULT SPRINT',
    weight: 2.0, // Lighter
    mobilityBonus: 1.0,
  },
  
[WeaponType.PISTOL]: {
    name: 'Pistol',
    type: WeaponType.PISTOL,
    damage: 16,
    explosionRadius: 5,
    projectileSpeed: 1000,
    gravity: 0.2,
    drag: 0.008,
    bounce: 0,
    spreadAngle: 2, // Tight burst
    pelletCount: 8, // Sidearm burst
    trailColor: 0x00ff00,
    projectileSize: 3,
    description: 'Light sidearm, tight burst, extreme mobility, medic',
    weight: 0.7, // Lightest
    mobilityBonus: 0.85,
  },
  
[WeaponType.SMG]: {
    name: 'SMG',
    type: WeaponType.SMG,
    damage: 7, // Higher per bullet
    explosionRadius: 6,
    projectileSpeed: 1150,
    gravity: 0.18,
    drag: 0.006,
    bounce: 0,
    spreadAngle: 8, // Controlled spread
    pelletCount: 25, // Quick burst
    trailColor: 0x8888ff,
    projectileSize: 2,
    description: 'High volume burst, controlled spread - ASSAULT SPRINT',
    weight: 0.9, // Light
    mobilityBonus: 0.9,
  },
  
[WeaponType.MINIGUN]: {
    name: 'Minigun',
    type: WeaponType.MINIGUN,
    damage: 4, // Per bullet
    explosionRadius: 5,
    projectileSpeed: 1500,
    gravity: 0.1,
    drag: 0.002,
    bounce: 0,
    spreadAngle: 15, // Wide but usable spread
    pelletCount: 60, // Long sustained spray without tanking the framerate
    trailColor: 0x666666,
    projectileSize: 2,
    description: 'Sustained spray, wide area denial',
    weight: 3.5, // Heavy but not extreme
    mobilityBonus: 0.0,
  },

[WeaponType.CARBINE]: {
    name: 'Carbine',
    type: WeaponType.CARBINE,
    damage: 13,
    explosionRadius: 5,
    projectileSpeed: 1150,
    gravity: 0.15,
    drag: 0.005,
    bounce: 0,
    spreadAngle: 5,
    pelletCount: 12,
    trailColor: 0x99ffcc,
    projectileSize: 3,
    description: 'Mobile rifle burst, strong while advancing',
    weight: 1.0,
    mobilityBonus: 0.65,
  },

[WeaponType.SLUG]: {
    name: 'Slug Gun',
    type: WeaponType.SLUG,
    damage: 85,
    explosionRadius: 10,
    projectileSpeed: 1400,
    gravity: 0.12,
    drag: 0.008,
    bounce: 0,
    spreadAngle: 0,
    pelletCount: 1,
    trailColor: 0xffddaa,
    projectileSize: 5,
    description: 'High-velocity single shot, punches through cover',
    weight: 1.6,
    mobilityBonus: 0.75,
  },

  [WeaponType.DEMO]: {
    name: 'Demo Charge',
    type: WeaponType.DEMO,
    damage: 90,
    explosionRadius: 120,
    projectileSpeed: 600,
    gravity: 0.8,
    drag: 0.01,
    bounce: 0.3,
    spreadAngle: 0,
    pelletCount: 1,
    trailColor: 0xff66aa,
    projectileSize: 10,
    description: 'Short toss, massive crater, terrain destroyer',
    weight: 2.0,
    mobilityBonus: 0.4,
  },
};

// All available weapon types for squad selection
export const ALL_WEAPON_TYPES: WeaponType[] = [
  WeaponType.RIFLE,
  WeaponType.GRENADE,
  WeaponType.ROCKET,
  WeaponType.SHOTGUN,
  WeaponType.SNIPER,
  WeaponType.MORTAR,
  WeaponType.FLAMER,
  WeaponType.PISTOL,
  WeaponType.SMG,
  WeaponType.MINIGUN,
  WeaponType.CARBINE,
  WeaponType.SLUG,
  WeaponType.DEMO,
];

// Default squad weapons (fallback)
export const SQUAD_WEAPONS: WeaponType[] = [
  WeaponType.RIFLE,
  WeaponType.GRENADE,
  WeaponType.ROCKET,
  WeaponType.SHOTGUN,
  WeaponType.SNIPER,
];
