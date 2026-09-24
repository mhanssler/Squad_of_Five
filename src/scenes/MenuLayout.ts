import { type MapSize } from '../systems/SquadRules';

export type { MapSize } from '../systems/SquadRules';

// Phaser-free menu data and layout helpers, kept separate so tests can audit layout
// without booting the browser-only Phaser runtime.

export type SoldierRange = 'close' | 'mid' | 'long' | 'support';

export interface SoldierClass {
  id: string;
  name: string;
  weapon: string;
  description: string;
  color: number;
  range: SoldierRange;
}

const MAP_PIXEL_WIDTHS: Record<MapSize, number> = {
  small: 1920,
  medium: 2560,
  large: 3200,
};

export function getMapPixelWidth(size: MapSize): number {
  return MAP_PIXEL_WIDTHS[size];
}

export function getMapPreviewRect(size: MapSize): { x: number; y: number; w: number; h: number } {
  const h = 72;
  const w = Math.round(h * getMapPixelWidth(size) / 720);
  return {
    x: Math.round((372 - w) / 2),
    y: 404,
    w,
    h,
  };
}

export const SOLDIER_CLASSES: SoldierClass[] = [
  { id: 'rifle', name: 'Rifleman', weapon: 'Assault Rifle', description: 'Balanced fighter with fast, accurate shots', color: 0xffd700, range: 'mid' },
  { id: 'grenade', name: 'Grenadier', weapon: 'Grenade', description: 'Lobbed explosives that bounce', color: 0x32cd32, range: 'mid' },
  { id: 'rocket', name: 'Rocketeer', weapon: 'Rocket Launcher', description: 'Heavy explosives, large blast radius', color: 0xff6347, range: 'long' },
  { id: 'shotgun', name: 'Shotgunner', weapon: 'Shotgun', description: 'Spread fire, devastating up close', color: 0xc0c0c0, range: 'close' },
  { id: 'sniper', name: 'Sniper', weapon: 'Sniper Rifle', description: 'Long range, high damage precision', color: 0x00ced1, range: 'long' },
  { id: 'mortar', name: 'Mortar', weapon: 'Mortar', description: 'High arc indirect fire support', color: 0xffa500, range: 'long' },
  { id: 'flamer', name: 'Flamer', weapon: 'Flamethrower', description: 'Short range area denial', color: 0xff4500, range: 'close' },
  { id: 'pistol', name: 'Medic', weapon: 'Pistol', description: 'Light weapon, high mobility', color: 0x98fb98, range: 'support' },
  { id: 'smg', name: 'Scout', weapon: 'SMG', description: 'Fast movement, rapid fire', color: 0x87ceeb, range: 'mid' },
  { id: 'minigun', name: 'Heavy', weapon: 'Minigun', description: 'Slow but sustained firepower', color: 0xa9a9a9, range: 'mid' },
  { id: 'carbine', name: 'Commando', weapon: 'Carbine', description: 'Mobile burst rifle for flanking', color: 0x99ffcc, range: 'mid' },
  { id: 'slug', name: 'Breacher', weapon: 'Slug Gun', description: 'Close-mid armor cracking shot', color: 0xffddaa, range: 'close' },
  { id: 'demo', name: 'Saboteur', weapon: 'Demo Charge', description: 'Short toss terrain demolition', color: 0xff66aa, range: 'mid' },
];

export const MENU_ORDERED_CLASS_IDS = [
  'shotgun',
  'flamer',
  'slug',
  'pistol',
  'rifle',
  'smg',
  'carbine',
  'grenade',
  'minigun',
  'demo',
  'sniper',
  'rocket',
  'mortar',
];

export type MenuLayoutBox = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  layer: 'title' | 'classes' | 'battlefield' | 'actions';
};

export const MENU_LAYOUT_BOXES: MenuLayoutBox[] = [
  { id: 'title', x: 0, y: 0, w: 1280, h: 100, layer: 'title' },
  { id: 'team-indicator', x: 420, y: 18, w: 560, h: 64, layer: 'title' },
  { id: 'class-panel', x: 24, y: 112, w: 844, h: 488, layer: 'classes' },
  { id: 'battlefield-panel', x: 884, y: 112, w: 372, h: 488, layer: 'battlefield' },
  { id: 'random-button', x: 24, y: 616, w: 154, h: 76, layer: 'actions' },
  { id: 'selected-squad', x: 194, y: 616, w: 782, h: 76, layer: 'actions' },
  { id: 'start-button', x: 992, y: 616, w: 264, h: 76, layer: 'actions' },
];

export const MENU_OPTION_PERMUTATIONS = 3 * 4 * 2 * 2;

export function getMenuClassGridPosition(index: number): { x: number; y: number; w: number; h: number } {
  const cols = 4;
  const cardW = 198;
  const cardH = 96;
  const gapX = 10;
  const gapY = 8;
  const startX = 40;
  const startY = 174;
  const col = index % cols;
  const row = Math.floor(index / cols);

  return {
    x: startX + col * (cardW + gapX),
    y: startY + row * (cardH + gapY),
    w: cardW,
    h: cardH,
  };
}

export function getMenuClassCardBoxes(): MenuLayoutBox[] {
  return MENU_ORDERED_CLASS_IDS.map((id, index) => {
    const pos = getMenuClassGridPosition(index);
    return {
      id: `class-${id}`,
      x: pos.x,
      y: pos.y,
      w: pos.w,
      h: pos.h,
      layer: 'classes',
    };
  });
}
