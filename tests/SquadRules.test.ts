import { describe, expect, it } from 'vitest';
import {
  findNextAvailableClassIndex,
  getAvailableClassIds,
  isClassAvailableOnMap,
  sanitizeSquadForMap,
} from '../src/systems/SquadRules';

describe('map-aware squad rules', () => {
  const classes = ['shotgun', 'rifle', 'flamer', 'sniper', 'slug', 'mortar', 'smg'];

  it('allows close-range classes only on Small maps', () => {
    for (const id of ['shotgun', 'flamer', 'slug']) {
      expect(isClassAvailableOnMap(id, 'small')).toBe(true);
      expect(isClassAvailableOnMap(id, 'medium')).toBe(false);
      expect(isClassAvailableOnMap(id, 'large')).toBe(false);
    }
    expect(isClassAvailableOnMap('rifle', 'large')).toBe(true);
  });

  it('filters random-selection pools for Medium and Large maps', () => {
    expect(getAvailableClassIds(classes, 'medium')).toEqual(['rifle', 'sniper', 'mortar', 'smg']);
    expect(getAvailableClassIds(classes, 'large')).toEqual(['rifle', 'sniper', 'mortar', 'smg']);
    expect(getAvailableClassIds(classes, 'small')).toEqual(classes);
  });

  it('repairs stale squads without duplicates', () => {
    expect(
      sanitizeSquadForMap(
        ['shotgun', 'rifle', 'flamer', 'rifle', 'slug'],
        'large',
        ['rifle', 'grenade', 'rocket', 'sniper', 'mortar', 'smg'],
      ),
    ).toEqual(['rifle', 'grenade', 'rocket', 'sniper', 'mortar']);
  });

  it('keyboard navigation skips unavailable cards', () => {
    expect(findNextAvailableClassIndex(classes, 6, 1, 'medium')).toBe(1);
    expect(findNextAvailableClassIndex(classes, 1, 1, 'medium')).toBe(3);
    expect(findNextAvailableClassIndex(classes, 3, -1, 'medium')).toBe(1);
    expect(findNextAvailableClassIndex(classes, 6, 1, 'small')).toBe(0);
  });
});
