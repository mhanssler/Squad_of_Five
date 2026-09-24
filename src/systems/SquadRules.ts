export type MapSize = 'small' | 'medium' | 'large';

export const SHORT_RANGE_CLASS_IDS = ['shotgun', 'flamer', 'slug'] as const;

const SHORT_RANGE_CLASS_SET = new Set<string>(SHORT_RANGE_CLASS_IDS);

export function isClassAvailableOnMap(classId: string, mapSize: MapSize): boolean {
  return mapSize === 'small' || !SHORT_RANGE_CLASS_SET.has(classId);
}

export function getAvailableClassIds(
  classIds: readonly string[],
  mapSize: MapSize,
): string[] {
  return classIds.filter(classId => isClassAvailableOnMap(classId, mapSize));
}

export function sanitizeSquadForMap(
  selected: readonly string[],
  mapSize: MapSize,
  fallbackOrder: readonly string[],
  squadSize: number = 5,
): string[] {
  const result: string[] = [];
  const addIfValid = (classId: string): void => {
    if (
      result.length < squadSize &&
      !result.includes(classId) &&
      isClassAvailableOnMap(classId, mapSize)
    ) {
      result.push(classId);
    }
  };

  selected.forEach(addIfValid);
  fallbackOrder.forEach(addIfValid);
  return result;
}

export function findNextAvailableClassIndex(
  classIds: readonly string[],
  currentIndex: number,
  direction: number,
  mapSize: MapSize,
): number {
  if (classIds.length === 0) return -1;

  const step = direction < 0 ? -1 : 1;
  for (let offset = 1; offset <= classIds.length; offset++) {
    const index = (currentIndex + step * offset + classIds.length) % classIds.length;
    if (isClassAvailableOnMap(classIds[index], mapSize)) return index;
  }

  return currentIndex;
}
