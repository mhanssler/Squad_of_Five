// Phaser-free menu data and layout helpers, kept separate so tests can audit layout
// without booting the browser-only Phaser runtime.

export interface SoldierClass {
  id: string;
  name: string;
  weapon: string;
  description: string;
  color: number;
}

export const SOLDIER_CLASSES: SoldierClass[] = [
  { id: 'rifle', name: 'Rifleman', weapon: 'Assault Rifle', description: 'Balanced fighter with fast, accurate shots', color: 0xffd700 },
  { id: 'grenade', name: 'Grenadier', weapon: 'Grenade', description: 'Lobbed explosives that bounce', color: 0x32cd32 },
  { id: 'rocket', name: 'Rocketeer', weapon: 'Rocket Launcher', description: 'Heavy explosives, large blast radius', color: 0xff6347 },
  { id: 'shotgun', name: 'Shotgunner', weapon: 'Shotgun', description: 'Spread fire, devastating up close', color: 0xc0c0c0 },
  { id: 'sniper', name: 'Sniper', weapon: 'Sniper Rifle', description: 'Long range, high damage precision', color: 0x00ced1 },
  { id: 'mortar', name: 'Mortar', weapon: 'Mortar', description: 'High arc indirect fire support', color: 0xffa500 },
  { id: 'flamer', name: 'Flamer', weapon: 'Flamethrower', description: 'Short range area denial', color: 0xff4500 },
  { id: 'pistol', name: 'Medic', weapon: 'Pistol', description: 'Light weapon, high mobility', color: 0x98fb98 },
  { id: 'smg', name: 'Scout', weapon: 'SMG', description: 'Fast movement, rapid fire', color: 0x87ceeb },
  { id: 'minigun', name: 'Heavy', weapon: 'Minigun', description: 'Slow but sustained firepower', color: 0xa9a9a9 },
  { id: 'carbine', name: 'Commando', weapon: 'Carbine', description: 'Mobile burst rifle for flanking', color: 0x99ffcc },
  { id: 'slug', name: 'Breacher', weapon: 'Slug Gun', description: 'Close-mid armor cracking shot', color: 0xffddaa },
  { id: 'demo', name: 'Saboteur', weapon: 'Demo Charge', description: 'Short toss terrain demolition', color: 0xff66aa },
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
  { id: 'title', x: 0, y: 18, w: 1280, h: 112, layer: 'title' },
  { id: 'team-indicator', x: 300, y: 126, w: 680, h: 34, layer: 'title' },
  { id: 'class-panel', x: 30, y: 165, w: 830, h: 440, layer: 'classes' },
  { id: 'battlefield-panel', x: 890, y: 165, w: 360, h: 470, layer: 'battlefield' },
  { id: 'random-button', x: 30, y: 645, w: 160, h: 40, layer: 'actions' },
  { id: 'selected-squad', x: 245, y: 615, w: 600, h: 100, layer: 'actions' },
  { id: 'start-button', x: 980, y: 640, w: 200, h: 50, layer: 'actions' },
];

export const MENU_OPTION_PERMUTATIONS = 3 * 4 * 2;

export function getMenuClassGridPosition(index: number): { x: number; y: number; w: number; h: number } {
  const cols = 4;
  const cardW = 190;
  const cardH = 76;
  const gapX = 14;
  const gapY = 14;
  const startX = 54;
  const startY = 215;
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
