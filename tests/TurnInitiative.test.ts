import { describe, expect, it } from 'vitest';
import { Team, TurnManager } from '../src/systems/TurnManager';
import type { Soldier } from '../src/entities/Soldier';

describe('production round initiative', () => {
  it('alternates round starters without granting extra actions', () => {
    const red = { team: Team.RED, name: 'Red', isAlive: () => true } as Soldier;
    const blue = { team: Team.BLUE, name: 'Blue', isAlive: () => true } as Soldier;
    const turns = new TurnManager([red, blue]);
    expect(turns.getCurrentTeam()).toBe(Team.RED);
    turns.setCurrentSoldier(red); turns.nextTurn();
    expect(turns.getCurrentTeam()).toBe(Team.BLUE);
    turns.setCurrentSoldier(blue); turns.nextTurn();
    expect(turns.getTurnInfo().roundNumber).toBe(2);
    expect(turns.getCurrentTeam()).toBe(Team.BLUE);
    turns.setCurrentSoldier(blue); turns.nextTurn();
    turns.setCurrentSoldier(red); turns.nextTurn();
    expect(turns.getTurnInfo().roundNumber).toBe(3);
    expect(turns.getCurrentTeam()).toBe(Team.RED);
    turns.reset();
    expect(turns.getTurnInfo().roundNumber).toBe(1);
  });
});
