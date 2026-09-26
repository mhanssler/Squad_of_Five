import { describe, expect, it } from 'vitest';
import {
  getMapPixelWidth,
  getMapPreviewRect,
  getMenuClassCardBoxes,
  getMenuNeighbourIndex,
  getMenuRoleHeaderRect,
  MENU_CLASS_GRID,
  MENU_INTEL_BOX,
  MENU_ORDERED_CLASS_IDS,
  MENU_ROLE_COLUMNS,
  MENU_LAYOUT_BOXES,
  MENU_OPTION_PERMUTATIONS,
  SOLDIER_CLASSES,
  type MenuLayoutBox,
} from '../src/scenes/MenuLayout';

function overlaps(a: MenuLayoutBox, b: MenuLayoutBox): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

describe('Menu layout', () => {
  it('has one card box for every soldier class', () => {
    expect(getMenuClassCardBoxes()).toHaveLength(SOLDIER_CLASSES.length);
  });

  it('keeps all class cards inside the class panel without overlaps', () => {
    const classPanel = MENU_LAYOUT_BOXES.find(b => b.id === 'class-panel');
    expect(classPanel).toBeDefined();

    const cards = getMenuClassCardBoxes();
    for (const card of cards) {
      expect(card.x).toBeGreaterThanOrEqual(classPanel!.x);
      expect(card.y).toBeGreaterThanOrEqual(classPanel!.y);
      expect(card.x + card.w).toBeLessThanOrEqual(classPanel!.x + classPanel!.w);
      expect(card.y + card.h).toBeLessThanOrEqual(classPanel!.y + classPanel!.h);
    }

    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        expect(overlaps(cards[i], cards[j]), `${cards[i].id} overlaps ${cards[j].id}`).toBe(false);
      }
    }
  });

  it('keeps primary menu regions separated in every battlefield option permutation', () => {
    expect(MENU_OPTION_PERMUTATIONS).toBe(48);

    const visibleRegions = MENU_LAYOUT_BOXES.filter(box =>
      box.id !== 'title' &&
      box.id !== 'team-indicator'
    );

    for (let permutation = 0; permutation < MENU_OPTION_PERMUTATIONS; permutation++) {
      for (let i = 0; i < visibleRegions.length; i++) {
        for (let j = i + 1; j < visibleRegions.length; j++) {
          expect(
            overlaps(visibleRegions[i], visibleRegions[j]),
            `permutation ${permutation}: ${visibleRegions[i].id} overlaps ${visibleRegions[j].id}`
          ).toBe(false);
        }
      }
    }
  });

  it('keeps all audited regions within the 1280x720 title screen', () => {
    const boxes = [...MENU_LAYOUT_BOXES, ...getMenuClassCardBoxes()];

    for (const box of boxes) {
      expect(box.x, box.id).toBeGreaterThanOrEqual(0);
      expect(box.y, box.id).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w, box.id).toBeLessThanOrEqual(1280);
      expect(box.y + box.h, box.id).toBeLessThanOrEqual(720);
    }
  });

  it('renders every map preview at its real battlefield aspect ratio inside the panel', () => {
    for (const size of ['small', 'medium', 'large'] as const) {
      const rect = getMapPreviewRect(size);
      expect(rect.w / rect.h).toBeCloseTo(getMapPixelWidth(size) / 720, 2);
      expect(rect.x).toBeGreaterThanOrEqual(16);
      expect(rect.y).toBeGreaterThanOrEqual(404);
      expect(rect.x + rect.w).toBeLessThanOrEqual(356);
      expect(rect.y + rect.h).toBeLessThanOrEqual(476);
    }
  });

  it('places every class in the column of its range band', () => {
    expect(new Set(MENU_ORDERED_CLASS_IDS).size).toBe(SOLDIER_CLASSES.length);
    for (const soldier of SOLDIER_CLASSES) {
      const cell = MENU_CLASS_GRID.find(c => c.id === soldier.id);
      expect(cell, soldier.id).toBeDefined();
      const role = MENU_ROLE_COLUMNS.find(r => r.range === soldier.range)!;
      expect(role.cols, soldier.id).toContain(cell!.col);
    }
  });

  it('fits the intel box and role headers in the roster panel without covering cards', () => {
    const classPanel = MENU_LAYOUT_BOXES.find(b => b.id === 'class-panel')!;
    const cards = getMenuClassCardBoxes();
    const headers = MENU_ROLE_COLUMNS.map(r => ({ id: r.label, layer: 'classes' as const, ...getMenuRoleHeaderRect(r.cols) }));
    for (const box of [MENU_INTEL_BOX, ...headers]) {
      expect(box.x).toBeGreaterThanOrEqual(classPanel.x);
      expect(box.y).toBeGreaterThanOrEqual(classPanel.y + 48);
      expect(box.x + box.w).toBeLessThanOrEqual(classPanel.x + classPanel.w);
      expect(box.y + box.h).toBeLessThanOrEqual(classPanel.y + classPanel.h);
      for (const card of cards) {
        expect(overlaps(box, card), `${box.id} overlaps ${card.id}`).toBe(false);
      }
    }
  });

  it('navigates the roster grid spatially with the arrow keys', () => {
    const at = (id: string) => MENU_ORDERED_CLASS_IDS.indexOf(id);
    expect(getMenuNeighbourIndex(at('shotgun'), 'down')).toBe(at('flamer'));
    expect(getMenuNeighbourIndex(at('flamer'), 'right')).toBe(at('smg'));
    expect(getMenuNeighbourIndex(at('smg'), 'right')).toBe(at('minigun'));
    expect(getMenuNeighbourIndex(at('mortar'), 'right')).toBe(at('laser'));
    expect(getMenuNeighbourIndex(at('sniper'), 'right')).toBe(at('pistol'));
    expect(getMenuNeighbourIndex(at('pistol'), 'down')).toBe(at('laser'));
    expect(getMenuNeighbourIndex(at('laser'), 'down')).toBe(at('laser'));
    expect(getMenuNeighbourIndex(at('pistol'), 'left')).toBe(at('sniper'));
    expect(getMenuNeighbourIndex(at('shotgun'), 'up')).toBe(at('shotgun'));
    expect(getMenuNeighbourIndex(at('pistol'), 'right')).toBe(at('pistol'));
  });

  it('skips the close-range column when those classes are unavailable', () => {
    const at = (id: string) => MENU_ORDERED_CLASS_IDS.indexOf(id);
    const notClose = (id: string) => SOLDIER_CLASSES.find(s => s.id === id)!.range !== 'close';
    expect(getMenuNeighbourIndex(at('rifle'), 'left', notClose)).toBe(at('rifle'));
    expect(getMenuNeighbourIndex(at('carbine'), 'left', notClose)).toBe(at('carbine'));
  });
});
