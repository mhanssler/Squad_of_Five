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
  { id: 'laser', name: 'Laser Trooper', weapon: 'Laser Rifle', description: 'Instant beam: pierces soldiers, burns thin cover', color: 0xff2d55, range: 'support' },
];

// The roster is laid out as role columns (Close | Mid x2 | Long | Support), three cards deep.
// Mid range splits into bullets (left) and explosives (right). The order below is column by column.
export const MENU_CLASS_GRID: { id: string; col: number; row: number }[] = [
  { id: 'shotgun', col: 0, row: 0 },
  { id: 'flamer', col: 0, row: 1 },
  { id: 'slug', col: 0, row: 2 },
  { id: 'rifle', col: 1, row: 0 },
  { id: 'smg', col: 1, row: 1 },
  { id: 'carbine', col: 1, row: 2 },
  { id: 'grenade', col: 2, row: 0 },
  { id: 'minigun', col: 2, row: 1 },
  { id: 'demo', col: 2, row: 2 },
  { id: 'sniper', col: 3, row: 0 },
  { id: 'rocket', col: 3, row: 1 },
  { id: 'mortar', col: 3, row: 2 },
  { id: 'pistol', col: 4, row: 0 },
  { id: 'laser', col: 4, row: 1 },
];

export const MENU_ORDERED_CLASS_IDS = MENU_CLASS_GRID.map(cell => cell.id);

export const MENU_ROLE_COLUMNS: { range: SoldierRange; label: string; cols: number[]; color: number }[] = [
  { range: 'close', label: 'CLOSE QUARTERS', cols: [0], color: 0xe0864f },
  { range: 'mid', label: 'MID RANGE', cols: [1, 2], color: 0xd8bd68 },
  { range: 'long', label: 'LONG RANGE', cols: [3], color: 0x6fb7d6 },
  { range: 'support', label: 'SPECIALISTS', cols: [4], color: 0x8fd49a },
];

export const MENU_CARD = {
  w: 156,
  h: 124,
  gapX: 8,
  gapY: 8,
  startX: 40,
  startY: 196,
};

/** Header strip above each role column. */
export function getMenuRoleHeaderRect(cols: number[]): { x: number; y: number; w: number; h: number } {
  const first = Math.min(...cols);
  const last = Math.max(...cols);
  return {
    x: MENU_CARD.startX + first * (MENU_CARD.w + MENU_CARD.gapX),
    y: 170,
    w: (last - first + 1) * MENU_CARD.w + (last - first) * MENU_CARD.gapX,
    h: 20,
  };
}

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
  const cell = MENU_CLASS_GRID[index];
  return {
    x: MENU_CARD.startX + cell.col * (MENU_CARD.w + MENU_CARD.gapX),
    y: MENU_CARD.startY + cell.row * (MENU_CARD.h + MENU_CARD.gapY),
    w: MENU_CARD.w,
    h: MENU_CARD.h,
  };
}

/** The "field intel" box fills the free slot at the bottom of the specialists column. */
export const MENU_INTEL_BOX: MenuLayoutBox = {
  id: 'intel',
  x: MENU_CARD.startX + 4 * (MENU_CARD.w + MENU_CARD.gapX),
  y: MENU_CARD.startY + 2 * (MENU_CARD.h + MENU_CARD.gapY),
  w: MENU_CARD.w,
  h: MENU_CARD.h,
  layer: 'classes',
};

export type MenuDirection = 'left' | 'right' | 'up' | 'down';

/**
 * Arrow-key navigation over the roster grid. Moves to the nearest card in that direction,
 * skipping unavailable cards (and whole unavailable columns). Stays put at the edges.
 */
export function getMenuNeighbourIndex(
  index: number,
  direction: MenuDirection,
  isAvailable: (id: string) => boolean = () => true,
): number {
  const from = MENU_CLASS_GRID[index];
  if (!from) return index;
  const cols = Math.max(...MENU_CLASS_GRID.map(c => c.col));

  if (direction === 'up' || direction === 'down') {
    const step = direction === 'down' ? 1 : -1;
    const column = MENU_CLASS_GRID
      .map((cell, i) => ({ ...cell, i }))
      .filter(cell => cell.col === from.col && isAvailable(cell.id))
      .filter(cell => (step > 0 ? cell.row > from.row : cell.row < from.row))
      .sort((a, b) => step * (a.row - b.row));
    return column[0]?.i ?? index;
  }

  const step = direction === 'right' ? 1 : -1;
  for (let col = from.col + step; col >= 0 && col <= cols; col += step) {
    const candidates = MENU_CLASS_GRID
      .map((cell, i) => ({ ...cell, i }))
      .filter(cell => cell.col === col && isAvailable(cell.id))
      .sort((a, b) => Math.abs(a.row - from.row) - Math.abs(b.row - from.row));
    if (candidates.length > 0) return candidates[0].i;
  }
  return index;
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
