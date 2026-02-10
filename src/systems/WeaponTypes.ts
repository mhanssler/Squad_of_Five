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
    damage: 8, // Lower damage per bullet
    explosionRadius: 3, // Tiny bullet impact
    projectileSpeed: 1200, // Increased for cross-map range
    gravity: 0.2, // Lower gravity for flatter trajectory
    drag: 0.005,
    bounce: 0,
    spreadAngle: 4, // Slight spread for burst
    pelletCount: 30, // 30 round burst
    trailColor: 0xffff00,
    projectileSize: 3,
    description: 'Fast burst fire with moderate damage',
    weight: 1.5, // Medium-light
    mobilityBonus: 0.0, // Standard mobility
  },
  
  [WeaponType.GRENADE]: {
    name: 'Grenade',
    type: WeaponType.GRENADE,
    damage: 45,
    explosionRadius: 70,
    projectileSpeed: 800, // Increased for better range
    gravity: 0.8, // Slightly lower for longer throws
    drag: 0.01,
    bounce: 0.5, // Bounces before exploding
    spreadAngle: 0,
    pelletCount: 1,
    trailColor: 0x44ff44,
    projectileSize: 8,
    description: 'Arcing throw, bounces before exploding',
    weight: 1.0, // Light - just carrying grenades
    mobilityBonus: 0.25, // Light equipment = good mobility
  },
  
  [WeaponType.ROCKET]: {
    name: 'Rocket Launcher',
    type: WeaponType.ROCKET,
    damage: 50,
    explosionRadius: 80,
    projectileSpeed: 700, // Increased for cross-map
    gravity: 0.3, // Lower gravity for longer range
    drag: 0.002,
    bounce: 0,
    spreadAngle: 0,
    pelletCount: 1,
    trailColor: 0xff4400,
    projectileSize: 10,
    description: 'Powerful explosive with large blast radius',
    weight: 3.0, // Heavy - rocket launcher is bulky
    mobilityBonus: 0.0, // Heavy weapon, no bonus
  },
  
  [WeaponType.SHOTGUN]: {
    name: 'Shotgun',
    type: WeaponType.SHOTGUN,
    damage: 30, // Per pellet - high damage up close
    explosionRadius: 5, // Small pellet impact
    projectileSpeed: 1000, // Increased
    gravity: 0.25,
    drag: 0.03, // Less drag for better range
    bounce: 0,
    spreadAngle: 15, // Degrees of spread
    pelletCount: 5,
    trailColor: 0xaaaaaa,
    projectileSize: 3,
    description: 'Multiple pellets in a spread pattern - SPRINT BONUS',
    weight: 2.0, // Medium
    mobilityBonus: 0.75, // Close-range specialist - high mobility bonus!
  },
  
  [WeaponType.SNIPER]: {
    name: 'Sniper Rifle',
    type: WeaponType.SNIPER,
    damage: 100,
    explosionRadius: 3, // Tiny bullet impact
    projectileSpeed: 2000, // Very fast
    gravity: 0.05, // Nearly zero - laser straight
    drag: 0.0005,
    bounce: 0,
    spreadAngle: 0,
    pelletCount: 1,
    trailColor: 0x00ffff,
    projectileSize: 3,
    description: 'High damage, fast, nearly straight trajectory',
    weight: 2.5, // Medium-heavy - long rifle
    mobilityBonus: 0.0, // Requires careful positioning
  },
  
  [WeaponType.MORTAR]: {
    name: 'Mortar',
    type: WeaponType.MORTAR,
    damage: 85,
    explosionRadius: 90,
    // Longer range for indirect fire (requested).
    projectileSpeed: 1000,
    gravity: 1.0, // Very high arc (highest)
    drag: 0.005,
    bounce: 0,
    spreadAngle: 0,
    pelletCount: 1,
    trailColor: 0xff8800,
    projectileSize: 12,
    description: 'High arc indirect fire, huge blast',
    weight: 1.5, //  heavy
    mobilityBonus: 0.0, // Indirect-fire support, low mobility
  },
  
  [WeaponType.FLAMER]: {
    name: 'Flamethrower',
    type: WeaponType.FLAMER,
    damage: 8, // Per flame particle
    explosionRadius: 15,
    projectileSpeed: 400,
    gravity: 0.4,
    drag: 0.05,
    bounce: 0,
    spreadAngle: 20, // Wide spread
    pelletCount: 8, // Multiple flame particles
    trailColor: 0xff3300,
    projectileSize: 6,
    description: 'Short range flame burst - SPRINT BONUS',
    weight: 2.5,
    mobilityBonus: 0.8, // Close-range specialist - needs to get close!
  },
  
  [WeaponType.PISTOL]: {
    name: 'Pistol',
    type: WeaponType.PISTOL,
    damage: 15,
    explosionRadius: 3, // Tiny bullet impact
    projectileSpeed: 900,
    gravity: 0.3,
    drag: 0.01,
    bounce: 0,
    spreadAngle: 3, // Slight spread for rapid fire
    pelletCount: 10, // 10 round burst
    trailColor: 0x00ff00,
    projectileSize: 3,
    description: 'Light sidearm, extreme mobility',
    weight: 0.8, // Very light - medic can move fast
    mobilityBonus: 0.5, // Light weapon = good mobility
  },
  
  [WeaponType.SMG]: {
    name: 'SMG',
    type: WeaponType.SMG,
    damage: 4, // Low damage per bullet
    explosionRadius: 3, // Tiny bullet impact
    projectileSpeed: 1100,
    gravity: 0.25,
    drag: 0.008,
    bounce: 0,
    spreadAngle: 10, // Moderate spread
    pelletCount: 40, // 40 round burst
    trailColor: 0x8888ff,
    projectileSize: 2,
    description: 'Rapid burst fire - SPRINT BONUS',
    weight: 1.0, // Light
    mobilityBonus: 0.6, // Close-range specialist
  },
  
  [WeaponType.MINIGUN]: {
    name: 'Minigun',
    type: WeaponType.MINIGUN,
    damage: 1, // Per bullet - high volume, low damage
    explosionRadius: 3, // Tiny impact
    projectileSpeed: 1400,
    gravity: 0.15,
    drag: 0.003,
    bounce: 0,
    spreadAngle: 18, // Wide spray
    pelletCount: 100, // 100 rounds per burst
    trailColor: 0x666666,
    projectileSize: 2,
    description: 'Sustained spray of bullets',
    weight: 4.0, // Extremely heavy
    mobilityBonus: 0.0, // Too heavy to sprint
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
];

// Default squad weapons (fallback)
export const SQUAD_WEAPONS: WeaponType[] = [
  WeaponType.RIFLE,
  WeaponType.GRENADE,
  WeaponType.ROCKET,
  WeaponType.SHOTGUN,
  WeaponType.SNIPER,
];
