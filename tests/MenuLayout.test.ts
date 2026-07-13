import { describe, expect, it } from 'vitest';
import {
  getMenuClassCardBoxes,
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
    expect(MENU_OPTION_PERMUTATIONS).toBe(24);

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
});
