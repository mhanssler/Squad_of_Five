import { describe, expect, it } from 'vitest';
import {
  ALLIED_FACTIONS,
  AXIS_FACTIONS,
  FACTIONS,
  createFactionMatchup,
  getFaction,
  getFactionSpriteTextureKey,
  isAxisVsAllies,
} from '../src/systems/Factions';

function sequenceRandom(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

describe('faction matchups', () => {
  it('contains a broad Allied and Axis roster', () => {
    expect(ALLIED_FACTIONS).toHaveLength(4);
    expect(AXIS_FACTIONS).toHaveLength(3);
    expect(new Set(FACTIONS.map(faction => faction.id)).size).toBe(FACTIONS.length);
  });

  it('always creates an Axis versus Allies match', () => {
    for (let i = 0; i < 100; i++) {
      expect(isAxisVsAllies(createFactionMatchup(Math.random))).toBe(true);
    }
  });

  it('can place the Allied faction on either battlefield side', () => {
    const alliesRed = createFactionMatchup(sequenceRandom(0, 0, 0.1));
    const alliesBlue = createFactionMatchup(sequenceRandom(0, 0, 0.9));

    expect(getFaction(alliesRed.red).alliance).toBe('allies');
    expect(getFaction(alliesBlue.blue).alliance).toBe('allies');
  });

  it('can reach the final faction in each alliance list', () => {
    const matchup = createFactionMatchup(sequenceRandom(0.999, 0.999, 0.1));

    expect(matchup.red).toBe(ALLIED_FACTIONS[ALLIED_FACTIONS.length - 1].id);
    expect(matchup.blue).toBe(AXIS_FACTIONS[AXIS_FACTIONS.length - 1].id);
  });
});

describe('faction presentation data', () => {
  it('gives every faction five unique soldier names and a unique tag', () => {
    expect(new Set(FACTIONS.map(faction => faction.tag)).size).toBe(FACTIONS.length);

    FACTIONS.forEach(faction => {
      expect(faction.soldierNames).toHaveLength(5);
      expect(new Set(faction.soldierNames).size).toBe(5);
    });
  });

  it('aliases related weapon classes to their correct visual silhouette', () => {
    expect(getFactionSpriteTextureKey('united-states', 'carbine'))
      .toBe('soldier-united-states-rifle');
    expect(getFactionSpriteTextureKey('germany', 'slug'))
      .toBe('soldier-germany-shotgun');
    expect(getFactionSpriteTextureKey('japan', 'demo'))
      .toBe('soldier-japan-grenade');
  });
});
